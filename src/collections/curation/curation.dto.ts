import { CuratedCollection } from '@infinityxyz/lib/types/core';
import { ApiProperty } from '@nestjs/swagger';

export default class CuratedCollectionDto implements CuratedCollection {
  @ApiProperty()
  collectionAddress: string;

  @ApiProperty()
  collectionChainId: string;

  @ApiProperty()
  userAddress: string;

  @ApiProperty()
  userChainId: string;

  @ApiProperty()
  votes: number;

  @ApiProperty()
  fees: number;

  @ApiProperty()
  feesAPR: number;
}
