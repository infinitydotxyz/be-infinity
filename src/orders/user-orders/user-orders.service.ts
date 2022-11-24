import { OBOrderItem, OBOrderStatus, OrderDirection, ChainId } from '@infinityxyz/lib/types/core';
import { UserOrderCollectionsQueryDto, OrderItemsOrderBy } from '@infinityxyz/lib/types/dto';
import { firestoreConstants, getSearchFriendlyString, getEndCode } from '@infinityxyz/lib/utils';
import { Injectable } from '@nestjs/common';
import { ContractService } from 'ethereum/contract.service';
import { FirebaseService } from 'firebase/firebase.service';
import FirestoreBatchHandler from 'firebase/firestore-batch-handler';
import { BaseOrdersService } from 'orders/base-orders/base-orders.service';
import { CursorService } from 'pagination/cursor.service';
import { ParsedUserId } from 'user/parser/parsed-user-id';

interface UserNonce {
  nonce: number;
  userAddress: string;
  chainId: ChainId;
  contractAddress: string;
  fillability: 'fillable' | 'cancelled' | 'filled';
}

@Injectable()
export class UserOrdersService extends BaseOrdersService {
  constructor(
    firebaseService: FirebaseService,
    cursorService: CursorService,
    protected contractService: ContractService
  ) {
    super(firebaseService, cursorService);
  }

  public async getNonce(userId: string, chainId: ChainId): Promise<number> {
    let deprecatedNonce = 0;
    if (chainId === ChainId.Mainnet || chainId === ChainId.Goerli) {
      deprecatedNonce = await this.getDeprecatedNonce(userId);
    }
    const exchange = this.contractService.getExchangeAddress(chainId);
    const userRef = this.firebaseService.firestore.collection(firestoreConstants.USERS_COLL).doc(userId);
    const minNonceQuery = userRef
      .collection('userNonces')
      .where('contractAddress', '==', exchange)
      .where('chainId', '==', chainId)
      .orderBy('nonce', 'desc')
      .limit(1) as FirebaseFirestore.Query<UserNonce>;
    const minUserNonce = await minNonceQuery.get();
    const minNonce = minUserNonce.docs[0]?.data()?.nonce ?? 0;

    return Math.max(minNonce, deprecatedNonce) + 1;
  }

  public async claimNonce(userId: string, chainId: ChainId, nonce: number): Promise<number> {
    const exchange = this.contractService.getExchangeAddress(chainId);
    const userRef = this.firebaseService.firestore.collection(firestoreConstants.USERS_COLL).doc(userId);
    const result = await this.firebaseService.firestore.runTransaction(async (txn) => {
      const nonceRef = userRef.collection('userNonces').doc(`${nonce}:${chainId}:${exchange}`);
      const deprecatedNonce = await this.getDeprecatedNonce(userId, txn);

      if (nonce <= deprecatedNonce) {
        throw new Error('Nonce already claimed');
      }

      const nextNonceDoc = await nonceRef.get();

      if (nextNonceDoc.exists) {
        throw new Error('Nonce already claimed');
      }

      const nextNonceData: UserNonce = {
        nonce,
        userAddress: userId,
        contractAddress: exchange,
        fillability: 'fillable',
        chainId
      };

      txn.set(nonceRef, nextNonceData);

      return nextNonceData;
    });

    return result.nonce;
  }

  public async updateNonceFillability(
    userId: string,
    chainId: ChainId,
    nonces: number[],
    fillability: UserNonce['fillability']
  ) {
    const exchange = this.contractService.getExchangeAddress(chainId);
    const userRef = this.firebaseService.firestore.collection(firestoreConstants.USERS_COLL).doc(userId);
    const batchHandler = new FirestoreBatchHandler(this.firebaseService);
    for (const nonce of nonces) {
      const userNonce: UserNonce = {
        nonce,
        userAddress: userId,
        chainId,
        contractAddress: exchange,
        fillability
      };

      const ref = userRef
        .collection('userNonces')
        .doc(`${nonce}:${chainId}:${exchange}`) as FirebaseFirestore.DocumentReference<UserNonce>;
      await batchHandler.addAsync(ref, userNonce, { merge: true });
    }

    await batchHandler.flush();
  }

  public async getDeprecatedNonce(userId: string, txn?: FirebaseFirestore.Transaction): Promise<number> {
    const userDocRef = this.firebaseService.firestore.collection(firestoreConstants.USERS_COLL).doc(userId);
    let userDoc;
    if (txn) {
      userDoc = await txn.get(userDocRef);
    } else {
      userDoc = await userDocRef.get();
    }
    const user = userDoc.data() ?? { address: userId };
    const nonce = parseInt(user.orderNonce ?? 0, 10);

    return nonce;
  }

  public async getUserOrderCollections(
    reqQuery: UserOrderCollectionsQueryDto,
    user?: ParsedUserId
  ): Promise<{ data: OBOrderItem[]; hasNextPage: boolean; cursor: string }> {
    let firestoreQuery: FirebaseFirestore.Query<FirebaseFirestore.DocumentData> =
      this.firebaseService.firestore.collectionGroup(firestoreConstants.ORDER_ITEMS_SUB_COLL);

    // ordering and pagination
    type Cursor = Record<OrderItemsOrderBy, number>;
    const cursor = this.cursorService.decodeCursorToObject<Cursor>(reqQuery.cursor);

    firestoreQuery = firestoreQuery.where('orderStatus', '==', OBOrderStatus.ValidActive);

    if (user?.userAddress) {
      firestoreQuery = firestoreQuery.where('makerAddress', '==', user.userAddress); // search for orders made by user
    }

    if (reqQuery.collectionName) {
      const startsWith = getSearchFriendlyString(reqQuery.collectionName);
      const endCode = getEndCode(startsWith);

      if (startsWith && endCode) {
        firestoreQuery = firestoreQuery.where('collectionSlug', '>=', startsWith).where('collectionSlug', '<', endCode);
        firestoreQuery = firestoreQuery.orderBy(OrderItemsOrderBy.CollectionSlug, OrderDirection.Ascending);
      }
    } else {
      // default order by startTimeMs desc
      firestoreQuery = firestoreQuery.orderBy(OrderItemsOrderBy.StartTime, OrderDirection.Descending);
      const startAfterValue = cursor[OrderItemsOrderBy.StartTime];
      if (startAfterValue) {
        firestoreQuery = firestoreQuery.startAfter(startAfterValue);
      }
    }

    // limit
    firestoreQuery = firestoreQuery.limit(reqQuery.limit + 1); // +1 to check if there are more results

    // query firestore
    const data = (await firestoreQuery.get()).docs;

    const hasNextPage = data.length > reqQuery.limit;
    if (hasNextPage) {
      data.pop();
    }

    const cursorObj: Cursor = {} as Cursor;
    const lastItem = data[data.length - 1];
    if (lastItem) {
      for (const orderBy of Object.values(OrderItemsOrderBy)) {
        cursorObj[orderBy] = lastItem.get(orderBy);
      }
    }
    const nextCursor = this.cursorService.encodeCursor(cursorObj);

    const collections = data.map((doc) => {
      return {
        chainId: doc.get('chainId') as ChainId,
        collectionName: doc.get('collectionName'),
        collectionSlug: doc.get('collectionSlug'),
        collectionAddress: doc.get('collectionAddress'),
        collectionImage: doc.get('collectionImage'),
        hasBlueCheck: doc.get('hasBlueCheck')
      } as OBOrderItem;
    });
    return {
      data: collections,
      cursor: nextCursor,
      hasNextPage
    };
  }
}
