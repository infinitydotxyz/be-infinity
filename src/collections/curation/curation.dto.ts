import { OrderDirection } from '@infinityxyz/lib/types/core';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { parseIntTransformer } from 'common/transformers/parse-int.transformer';

// TODO: move these to lib

export class CurationVoteDto {
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(1)
  @ApiProperty({ description: 'The number of votes to put into this collection', example: 10 })
  votes: number;
}

export enum CuratedCollectionsOrderBy {
  Votes = 'votes',
  AprHighToLow = 'apr_high_to_low',
  AprLowToHigh = 'apr_low_to_high'
}

export class CuratedCollectionsQuery {
  @ApiProperty({ enum: CuratedCollectionsOrderBy })
  @IsEnum(CuratedCollectionsOrderBy)
  orderBy: CuratedCollectionsOrderBy;

  @ApiProperty({ enum: OrderDirection })
  @IsEnum(OrderDirection)
  orderDirection: OrderDirection;

  @ApiProperty()
  @IsNumber()
  @Min(1)
  @Transform(parseIntTransformer())
  limit: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cursor?: string;
}
