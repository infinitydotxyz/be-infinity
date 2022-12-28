import { ChainId, OrderDirection } from '@infinityxyz/lib/types/core';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional } from 'class-validator';
import { parseIntTransformer } from 'common/transformers/parse-int.transformer';

export enum OrderBy {
  CreatedAt = 'createdAt'
}

export enum OrderSide {
  Sell = 'sell',
  Buy = 'buy'
}

export class BulkOrderQuery {
  @ApiProperty({
    description: 'Chain ID of orders to get',
    enum: ChainId
  })
  @IsEnum(ChainId)
  chainId: ChainId;

  @ApiProperty({
    description: 'Property to order results by'
  })
  @IsEnum(OrderBy)
  orderBy: OrderBy;

  @ApiProperty({
    description: 'Direction to order results in'
  })
  @IsEnum(OrderDirection)
  orderDirection: OrderDirection;

  @ApiPropertyOptional({
    description: 'Get orders created after this timestamp (in ms)'
  })
  createdAfter?: number;

  @ApiPropertyOptional({
    description: 'Get orders created before this timestamp (in ms)'
  })
  createdBefore?: number;

  @ApiProperty({
    description: 'Number of results to get. Max of 250. Defaults to 50'
  })
  @IsNumber()
  @IsOptional()
  @Transform(parseIntTransformer({ max: 250, optional: true, default: 50 }))
  limit: number;

  @ApiProperty({
    description: 'Order side to filter by',
    enum: OrderSide
  })
  @IsEnum(OrderSide)
  side: OrderSide;

  @ApiPropertyOptional({
    description: 'Cursor to start after'
  })
  @IsOptional()
  cursor?: string;
}
