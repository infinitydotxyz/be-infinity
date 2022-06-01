import { Collection } from '@infinityxyz/lib/types/core';
import { ApiProperty } from '@nestjs/swagger';

export class CollectionStatsArrayDto {
  @ApiProperty({ description: 'Array of collection data' })
  data!: Collection[];

  @ApiProperty({ description: 'Cursor that can be used to get the next page' })
  cursor!: string;

  @ApiProperty({ description: 'Whether there are more results available' })
  hasNextPage!: boolean;
}
