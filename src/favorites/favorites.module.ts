import { Module } from '@nestjs/common';
import { ApiUserModule } from 'api-user/api-user.module';
import { EthereumModule } from 'ethereum/ethereum.module';
import { PaginationModule } from 'pagination/pagination.module';

import { RewardsModule } from 'rewards/rewards.module';
import { FavoritesController } from './favorites.controller';
import { FavoritesService } from './favorites.service';

@Module({
  providers: [FavoritesService],
  controllers: [FavoritesController],
  imports: [EthereumModule, RewardsModule, PaginationModule, ApiUserModule]
})
export class FavoritesModule {}
