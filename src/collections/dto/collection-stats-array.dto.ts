import { Collection } from '@infinityxyz/lib/types/core';
import { ApiProperty } from '@nestjs/swagger';

export class CollectionStatsArrayDto {
  @ApiProperty({ description: 'Array of collection data' })
  data: Collection[];
}
