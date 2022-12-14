import { Module } from '@nestjs/common';
import { BackfillModule } from 'backfill/backfill.module';
import { EthereumModule } from 'ethereum/ethereum.module';
import { PaginationModule } from 'pagination/pagination.module';
import { ReservoirModule } from 'reservoir/reservoir.module';
import { StatsModule } from 'stats/stats.module';
import { TwitterModule } from 'twitter/twitter.module';
import { OrdersModule } from 'v2/orders/orders.module';
import { ZoraModule } from 'zora/zora.module';
import { AttributesController } from './attributes/attributes.controller';
import { AttributesService } from './attributes/attributes.service';
import { CollectionsController } from './collections.controller';
import CollectionsService from './collections.service';
import { CurationController } from './curation/curation.controller';
import { CurationService } from './curation/curation.service';
import { NftsController } from './nfts/nfts.controller';
import { NftsService } from './nfts/nfts.service';

@Module({
  imports: [
    StatsModule,
    TwitterModule,
    ZoraModule,
    ReservoirModule,
    PaginationModule,
    EthereumModule,
    BackfillModule,
    OrdersModule
  ],
  providers: [CollectionsService, NftsService, AttributesService, CurationService],
  controllers: [CollectionsController, NftsController, AttributesController, CurationController],
  exports: [CollectionsService, NftsService, AttributesService, CurationService]
})
export class CollectionsModule {}
