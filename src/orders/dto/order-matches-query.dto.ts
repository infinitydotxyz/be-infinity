import { OrderDirection } from '@infinityxyz/lib/types/core';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';
import { parseIntTransformer } from 'common/transformers/parse-int.transformer';

export enum OrderMatchesOrderBy {
  Timestamp = 'timestamp'
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
