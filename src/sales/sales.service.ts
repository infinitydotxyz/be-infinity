import { NftSale, SaleSource } from '@infinityxyz/lib/types/core';
import { NftSalesResponseDto } from '@infinityxyz/lib/types/dto/sales';
import { firestoreConstants } from '@infinityxyz/lib/utils';
import { Injectable } from '@nestjs/common';
import { FirebaseService } from '../firebase/firebase.service';
import { CursorService } from '../pagination/cursor.service';

@Injectable()
export default class SalesService {
  constructor(private firebaseService: FirebaseService, private cursorService: CursorService) {}

  public async getInfinitySales(cursor: string, limit: number): Promise<NftSalesResponseDto> {
    try {
      const salesCollectionRef = this.firebaseService.firestore.collection(firestoreConstants.SALES_COLL);
      let timestampCursor = this.cursorService.decodeCursorToNumber(cursor);
      if (!timestampCursor || isNaN(timestampCursor)) {
        timestampCursor = Date.now();
      }
      const query = salesCollectionRef
        .where('source', '==', SaleSource.Infinity)
        .orderBy('timestamp', 'desc')
        .startAfter(timestampCursor)
        .limit(limit + 1);

      const results = (await query.get()).docs;
      const hasNextPage = results.length > limit;
      if (hasNextPage) {
        results.pop();
      }
      const nextCursor = hasNextPage
        ? this.cursorService.encodeCursor(results[results.length - 1].data().timestamp)
        : undefined;

      const sales = results.map((doc) => doc.data() as NftSale);

      return {
        data: sales,
        cursor: nextCursor,
        hasNextPage
      };
    } catch (err) {
      console.error('Failed to fetch infinity sales', err);
      throw err;
    }
  }
}
