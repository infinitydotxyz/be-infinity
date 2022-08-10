import { NftActivityFiltersDto } from '@infinityxyz/lib/types/dto/collections/nfts';
import { firestoreConstants } from '@infinityxyz/lib/utils';
import { Injectable } from '@nestjs/common';
import { FirebaseService } from 'firebase/firebase.service';
import { FirestoreDistributedCounter } from 'firebase/firestore-counter';
import { CursorService } from 'pagination/cursor.service';
import { typeToActivity } from 'utils/activity';
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
    const events = eventTypes?.filter((item) => !!item);

    let activityQuery = this.firebaseService.firestore
      .collection(firestoreConstants.FEED_COLL)
      .where('type', 'in', events)
      .orderBy('timestamp', 'desc');

    activityQuery = activityQuery.limit(filter.limit); // +1 to check if there are more events

    if (filter.cursor) {
      const decodedCursor = this.paginationService.decodeCursorToNumber(filter.cursor);
      activityQuery = activityQuery.startAfter(decodedCursor);
    }

    const results = await activityQuery.get();

    const activities: FirebaseFirestore.DocumentData[] = [];

    results.docs.forEach((snap) => {
      const item = snap.data();

      const activity = typeToActivity(item, snap.id);

      // return activity;
      if (activity) {
        activities.push(activity);
      }
    });

    const hasNextPage = results.docs.length > filter.limit;

    if (hasNextPage) {
      activities.pop(); // Remove item used for pagination
    }

    const rawCursor = `${activities?.[activities?.length - 1]?.timestamp ?? ''}`;
    const cursor = this.paginationService.encodeCursor(rawCursor);

    return {
      data: activities,
      hasNextPage,
      cursor
    };
  }
}
