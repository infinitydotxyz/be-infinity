import { ApiProperty, PickType } from '@nestjs/swagger';
import { IsString, IsNumber } from 'class-validator';

export class UserFavoriteCollectionDto {
  @ApiProperty()
  @IsString()
  collectionChainId: string;

  @ApiProperty()
  @IsString()
  collectionAddress: string;

  @ApiProperty()
  @IsNumber()
  votedAt: number;
}

export class FavoriteCollectionEntryDto extends PickType(UserFavoriteCollectionDto, [
  'collectionChainId',
  'collectionAddress'
]) {
  @ApiProperty()
  @IsNumber()
  lastUpdatedAt: number;

  @ApiProperty()
  @IsNumber()
  numFavorites: number;
}
