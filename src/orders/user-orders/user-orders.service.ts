import { OBOrderItem, OBOrderStatus, OrderDirection, ChainId } from '@infinityxyz/lib/types/core';
import { UserOrderCollectionsQueryDto, OrderItemsOrderBy } from '@infinityxyz/lib/types/dto';
import { firestoreConstants, getSearchFriendlyString, getEndCode, trimLowerCase } from '@infinityxyz/lib/utils';
import { Injectable } from '@nestjs/common';
import { FirebaseService } from 'firebase/firebase.service';
import { BaseOrdersService } from 'orders/base-orders/base-orders.service';
import { CursorService } from 'pagination/cursor.service';
import { ParsedUserId } from 'user/parser/parsed-user-id';

@Injectable()
export class UserOrdersService extends BaseOrdersService {
  constructor(firebaseService: FirebaseService, cursorService: CursorService) {
    super(firebaseService, cursorService);
  }

  public async getOrderNonce(userId: string): Promise<number> {
    try {
      const user = trimLowerCase(userId);
      const userDocRef = this.firebaseService.firestore.collection(firestoreConstants.USERS_COLL).doc(user);
      const updatedNonce = await this.firebaseService.firestore.runTransaction(async (t) => {
        const userDoc = await t.get(userDocRef);
        // todo: use a user dto or type?
        const userDocData = userDoc.data() || { address: user };
        const nonce = parseInt(userDocData.orderNonce ?? 0) + 1;
        const minOrderNonce = parseInt(userDocData.minOrderNonce ?? 0) + 1;
        const newNonce = nonce > minOrderNonce ? nonce : minOrderNonce;
        userDocData.orderNonce = newNonce;
        t.set(userDocRef, userDocData, { merge: true });
        return newNonce;
      });
      return updatedNonce;
    } catch (e) {
      console.error('Failed to get order nonce for user', userId);
      throw e;
    }
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
