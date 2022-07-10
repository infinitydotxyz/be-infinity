import { CuratedCollectionDto } from '@infinityxyz/lib/types/dto/collections/curation/curated-collections.dto';
import { UserProfileDto } from '@infinityxyz/lib/types/dto/user';
import { firestoreConstants } from '@infinityxyz/lib/utils';
import { Injectable } from '@nestjs/common';
import { ParsedCollectionId } from 'collections/collection-id.pipe';
import { StakerContractService } from 'ethereum/contracts/staker.contract.service';
import { TokenContractService } from 'ethereum/contracts/token.contract.service';
import { FirebaseService } from 'firebase/firebase.service';
import { ParsedUserId } from 'user/parser/parsed-user-id';

@Injectable()
export class CurationService {
  constructor(
    private firebaseService: FirebaseService,
    private stakerContractService: StakerContractService,
    private tokenContractService: TokenContractService
  ) {}

  /**
   * Vote on a specific NFT collection.
   *
   * User votes are stored in the `collections` collection
   * and the total amount of votes is stored in the `users` collection for quick reads.
   */
  async vote({
    parsedCollectionId,
    user,
    votes
  }: {
    parsedCollectionId: ParsedCollectionId;
    user: ParsedUserId;
    votes: number;
  }) {
    const collection = (await parsedCollectionId.ref.get()).data();

    const incrementVotes = this.firebaseService.firestoreNamespace.FieldValue.increment(votes);

    let batch = this.firebaseService.firestore.batch();

    // write to 'curators' sub-collection
    const curatorDocRef = parsedCollectionId.ref
      .collection(firestoreConstants.COLLECTION_CURATORS_COLL)
      .doc(user.ref.id);
    batch.set(
      curatorDocRef,
      {
        votes: incrementVotes as any,
        userAddress: user.userAddress,
        userChainId: user.userChainId,
        timestamp: Date.now(),
        address: collection?.address || parsedCollectionId.address,
        chainId: collection?.chainId || parsedCollectionId.chainId,
        name: collection?.metadata?.name,
        profileImage: collection?.metadata?.profileImage,
        slug: collection?.slug,
        // TODO: APRs
        fees: 0,
        feesAPR: 0
      } as CuratedCollectionDto,
      { merge: true }
    );

    // write to 'collections' collection
    batch.set(parsedCollectionId.ref, { numCuratorVotes: incrementVotes as any }, { merge: true });

    // write to 'users' collection
    const userData = { totalCuratedVotes: incrementVotes } as any;
    if (!(await curatorDocRef.get()).exists) {
      userData.totalCurated = this.firebaseService.firestoreNamespace.FieldValue.increment(1);
    }
    batch.set(user.ref, userData, { merge: true });

    await batch.commit();

    batch = this.firebaseService.firestore.batch();

    // TODO: not sure how scalable this is, but the only alternative I can think of is multiple reads of each parent collection while fetching 'my curated collections' on /user/:userId/curated ¯\_(ツ)_/¯
    (await parsedCollectionId.ref.collection(firestoreConstants.COLLECTION_CURATORS_COLL).get()).docs.forEach((doc) => {
      batch.set(doc.ref, { numCuratorVotes: incrementVotes }, { merge: true });
    });

    await batch.commit();
  }

  /**
   * Returns the total number of availale votes.
   * Based on the balance read from the contract and database records.
   */
  async getAvailableVotes(user: ParsedUserId): Promise<number> {
    // available votes according to contract
    const contractVotes = await this.stakerContractService.getPower(user);

    // available votes according to record in database
    const { totalCuratedVotes: dbVotes } = await this.getUserCurationInfo(user);

    // actual available votes
    const availableVotes = contractVotes - dbVotes;

    return availableVotes > 0 ? availableVotes : 0;
  }

  async getTotalStaked(user: ParsedUserId) {
    return this.stakerContractService.getTotalStaked(user);
  }

  async getTokenBalance(user: ParsedUserId) {
    return this.tokenContractService.getTokenBalance(user);
  }

  /**
   * Find a specific user-curated collection.
   */
  async findUserCurated(
    user: Omit<ParsedUserId, 'ref'>,
    collection: Omit<ParsedCollectionId, 'ref'>
  ): Promise<CuratedCollectionDto | null> {
    const snap = await this.firebaseService.firestore
      .collectionGroup(firestoreConstants.COLLECTION_CURATORS_COLL)
      .where('userAddress', '==', user.userAddress)
      .where('userChainId', '==', user.userChainId)
      .where('address', '==', collection.address)
      .where('chainId', '==', collection.chainId)
      .limit(1)
      .get();

    const doc = snap.docs[0];

    if (!doc?.exists) {
      return null;
    }

    return doc.data() as CuratedCollectionDto;
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
