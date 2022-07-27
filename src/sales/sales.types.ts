import { NftSale } from '@infinityxyz/lib/types/core';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNumber, IsOptional, IsString } from 'class-validator';
import { parseIntTransformer } from 'common/transformers/parse-int.transformer';

export class SalesResponse {
  data: NftSale[];
  cursor: string | undefined;
  hasNextPage: boolean;
}

export class InfinitySalesQueryDto {
  @ApiPropertyOptional({
    description: 'Cursor for pagination'
  })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({
    description: 'The number of sales to return. Max 100'
  })
  @IsOptional()
  @IsNumber()
  @Transform(parseIntTransformer({ max: 100 }))
  limit?: number;
}
