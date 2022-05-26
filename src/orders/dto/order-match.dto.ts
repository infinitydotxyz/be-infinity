import { FirestoreOrderMatch, FirestoreOrderItemMatch } from '@infinityxyz/lib/types/core';
import { ApiProperty } from '@nestjs/swagger';

export class OrderMatchDto {
  @ApiProperty({
    description: 'The order match'
  })
  orderMatch: FirestoreOrderMatch;

  @ApiProperty({
    description: 'The matches in the order'
    // type: [FirestoreOrderItemMatch] // TODO
  })
  matches: FirestoreOrderItemMatch[];
}
