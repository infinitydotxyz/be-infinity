import { ChainId } from '@infinityxyz/lib/types/core';
import { ApiProperty } from '@nestjs/swagger';

export class FavoritedCollectionDto {
  /**
   * Collection address.
   */
  @ApiProperty()
  address: string;

  /**
   * Collection chain id .
   */
  @ApiProperty({
    enum: ChainId
  })
  chainId: string;
}
