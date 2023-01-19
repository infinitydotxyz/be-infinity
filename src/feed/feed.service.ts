import { NftActivityFiltersDto } from '@infinityxyz/lib/types/dto/collections/nfts';
import { Injectable } from '@nestjs/common';
import { FirebaseService } from 'firebase/firebase.service';
import { CursorService } from 'pagination/cursor.service';
import { getNftActivity } from 'utils/activity';

@Injectable()
export class FeedService {
  constructor(private firebaseService: FirebaseService, private paginationService: CursorService) {}

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
