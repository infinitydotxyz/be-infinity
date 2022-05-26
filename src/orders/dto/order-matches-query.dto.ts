import { OrderDirection } from '@infinityxyz/lib/types/core';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsEthereumAddress, IsNumber, IsNumberString, IsOptional, IsString } from 'class-validator';
import { normalizeAddressTransformer } from 'common/transformers/normalize-address.transformer';
import { parseIntTransformer } from 'common/transformers/parse-int.transformer';

export enum OrderMatchesOrderBy {
  Timestamp = 'timestamp',
  CreatedAt = 'createdAt'
}

export class OrderMatchesQueryDto {
  @ApiPropertyOptional({
    description: 'Cursor to start after'
  })
  @IsString()
  @IsOptional()
  cursor?: string;

  @ApiProperty({
    description: 'Number of results to get. Max of 50'
  })
  @IsNumber()
  @Transform(parseIntTransformer({ max: 50 }))
  limit: number;

  @ApiPropertyOptional({
    description: 'Collection Address'
  })
  @IsEthereumAddress({
    message: 'Invalid address'
  })
  @Transform(normalizeAddressTransformer)
  @IsOptional()
  collectionAddress?: string;

  @ApiPropertyOptional({
    description: 'Token id'
  })
  @IsNumberString()
  @IsOptional()
  tokenId?: string;

  @ApiPropertyOptional({
    description: 'Parameter to order results by',
    enum: OrderMatchesOrderBy
  })
  @IsOptional()
  @IsEnum(OrderMatchesOrderBy)
  orderBy?: OrderMatchesOrderBy;

  @ApiPropertyOptional({
    description: 'Direction to order results by',
    enum: OrderDirection
  })
  @IsOptional()
  @IsEnum(OrderDirection)
  orderDirection?: OrderDirection;
}
