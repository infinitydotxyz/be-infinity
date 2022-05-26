import { FirestoreOrderMatch } from '@infinityxyz/lib/types/core';
import { ApiProperty } from '@nestjs/swagger';

export class OrderMatchDto {
  @ApiProperty({
    description: 'The order match'
  })
  match: FirestoreOrderMatch;
}
