import { firestoreConstants } from '@infinityxyz/lib/utils';
import { Injectable } from '@nestjs/common';
import { FirebaseService } from 'firebase/firebase.service';
import { FirestoreDistributedCounter } from 'firebase/firestore-counter';
import { IncrementQuery, LikedLock } from './feed.types';

@Injectable()
export class FeedService {
  constructor(private firebaseService: FirebaseService) {}

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
}
