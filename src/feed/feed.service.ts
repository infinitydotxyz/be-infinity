import { NftActivityFiltersDto } from '@infinityxyz/lib/types/dto/collections/nfts';
import { firestoreConstants } from '@infinityxyz/lib/utils';
import { Injectable } from '@nestjs/common';
import { FirebaseService } from 'firebase/firebase.service';
import { FirestoreDistributedCounter } from 'firebase/firestore-counter';
import { CursorService } from 'pagination/cursor.service';
import { getNftActivity } from 'utils/activity';
import { IncrementQuery, LikedLock } from './feed.types';

@Injectable()
export class FeedService {
  constructor(private firebaseService: FirebaseService, private paginationService: CursorService) {}

  public async incrementLikes(query: IncrementQuery) {
    const likeLockRef = this.firebaseService.firestore
      .collection(firestoreConstants.FEED_COLL)
      .doc(query.eventId)
      .collection('likeLocks')
      .doc(query.userAddress);

    const likeLock = await likeLockRef.get();
    const lockData = likeLock.data() as LikedLock;

    if (!lockData) {
      await likeLockRef.set({ liked: query.liked } as LikedLock);

      this.incrementLikesCounter(query.liked ? 1 : -1, query.eventId);
    } else {
      if (lockData.liked !== query.liked) {
        await likeLockRef.set({ liked: query.liked } as LikedLock);

        this.incrementLikesCounter(query.liked ? 2 : -2, query.eventId);
      }
    }
  }

  private incrementLikesCounter(increment: number, docId: string) {
    const docRef = this.firebaseService.firestore.collection(firestoreConstants.FEED_COLL).doc(docId);

    const numLikes = new FirestoreDistributedCounter(docRef, 'likes');

    numLikes.incrementBy(increment);
  }

  async getActivity(filter: NftActivityFiltersDto) {
    const eventTypes = typeof filter.eventType === 'string' ? [filter.eventType] : filter.eventType;
    let events = eventTypes?.filter((item) => !!item);

    // slice because firestore 'IN' query can only support 10 items
    events = events && events.length > 10 ? events.slice(0, 10) : events;

    return getNftActivity({
      firestore: this.firebaseService.firestore,
      paginationService: this.paginationService,
      limit: filter.limit,
      events: events,
      cursor: filter.cursor,
      source: filter.source
    });
  }
}
