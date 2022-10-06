import { RaffleQueryDto } from '@infinityxyz/lib/types/dto';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional } from 'class-validator';
import { IsEnumArray } from 'common/decorators/is-enum-array.decorator';

export enum RaffleQueryState {
  Active = 'active',
  Inactive = 'inactive',
  Complete = 'complete'
}

export class RafflesQueryDto extends RaffleQueryDto {
  @ApiPropertyOptional({
    description: 'The state of the raffles to get',
    type: [RaffleQueryState]
  })
  @IsOptional()
  @IsEnumArray(RaffleQueryState)
  states?: RaffleQueryState[];
}
