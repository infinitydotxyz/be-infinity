import { CuratedCollection } from '@infinityxyz/lib/types/core/CuratedCollection';
import { UserProfileDto } from '@infinityxyz/lib/types/dto/user';
import { firestoreConstants } from '@infinityxyz/lib/utils';
import { Injectable } from '@nestjs/common';
import { ParsedCollectionId } from 'collections/collection-id.pipe';
import { StakerContractService } from 'ethereum/contracts/staker.contract.service';
import { FirebaseService } from 'firebase/firebase.service';
import { ParsedUserId } from 'user/parser/parsed-user-id';

@Injectable()
export class CurationService {
  constructor(private firebaseService: FirebaseService, private tokenContractService: StakerContractService) {}

  /**
   * Vote on a specific NFT collection.
   *
   * User votes are stored in the `collections` collection
   * and the total amount of votes is stored in the `users` collection for quick reads.
   */
  async vote({ collection, user, votes }: { collection: ParsedCollectionId; user: ParsedUserId; votes: number }) {
    const incrementVotes = this.firebaseService.firestoreNamespace.FieldValue.increment(votes);

    const batch = this.firebaseService.firestore.batch();

    // write to 'curators' sub-collection
    const curatorDocRef = collection.ref.collection(firestoreConstants.COLLECTION_CURATORS_COLL).doc(user.ref.id);
    const userData = { totalCuratedVotes: incrementVotes } as any;
    if (!(await curatorDocRef.get()).exists) {
      userData.totalCurated = this.firebaseService.firestoreNamespace.FieldValue.increment(1);
    }
    batch.set(user.ref, userData, { merge: true });

    // write to 'collections' collection
    batch.set(collection.ref, { numCuratorVotes: incrementVotes as any }, { merge: true });
    batch.set(
      curatorDocRef,
      {
        votes: incrementVotes,
        userAddress: user.userAddress,
        userChainId: user.userChainId,
        collectionAddress: collection.address,
        collectionChainId: collection.chainId
      },
      { merge: true }
    );

    return batch.commit();
  }

  /**
   * Returns the total number of availale votes.
   * Based on the balance read from the contract and database records.
   */
  async getAvailableVotes(user: ParsedUserId): Promise<number> {
    // available votes according to contract
    const contractVotes = await this.tokenContractService.getPower(user);

    // available votes according to record in database
    const { totalCuratedVotes: dbVotes } = await this.getUserCurationInfo(user);

    // actual available votes
    const availableVotes = contractVotes - dbVotes;

    return availableVotes > 0 ? availableVotes : 0;
  }

  /**
   * Find a specific user-curated collection.
   */
  async findUserCurated(
    user: Omit<ParsedUserId, 'ref'>,
    collection: Omit<ParsedCollectionId, 'ref'>
  ): Promise<CuratedCollection | null> {
    const snap = await this.firebaseService.firestore
      .collectionGroup(firestoreConstants.COLLECTION_CURATORS_COLL)
      .where('userAddress', '==', user.userAddress)
      .where('userChainId', '==', user.userChainId)
      .where('collectionAddress', '==', collection.address)
      .where('collectionChainId', '==', collection.chainId)
      .limit(1)
      .get();

    const doc = snap.docs[0];

    if (!doc?.exists) {
      return null;
    }

    return doc.data() as CuratedCollection;
  }

  /**
   * Returns information about a specific user's curated collections
   * such as the total amount of curated collections, total votes (on all collections).
   * @param user
   * @returns
   */
  async getUserCurationInfo(user: ParsedUserId): Promise<Pick<UserProfileDto, 'totalCurated' | 'totalCuratedVotes'>> {
    const snap = await user.ref.get();

    return {
      totalCurated: snap.get('totalCurated') || 0,
      totalCuratedVotes: snap.get('totalCuratedVotes') || 0
    };
  }
}
