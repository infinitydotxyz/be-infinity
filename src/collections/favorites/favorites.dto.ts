import { ChainId } from '@infinityxyz/lib/types/core';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class FavoriteCollectionDto {
  @ApiProperty()
  @IsString()
  collection: string;

  @ApiPropertyOptional({
    enum: ChainId
  })
  @IsOptional()
  @IsEnum(ChainId)
  chainId?: ChainId;
}
