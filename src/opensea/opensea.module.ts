import { Module } from '@nestjs/common';
import { CollectionsModule } from 'collections/collections.module';
import { OpenseaNftToInfinityNft } from './opensea-nft-to-infinity-nft.pipe';
import { OpenseaService } from './opensea.service';

@Module({
  providers: [OpenseaService, OpenseaNftToInfinityNft],
  imports: [CollectionsModule],
  exports: [OpenseaService, OpenseaNftToInfinityNft]
})
export class OpenseaModule {}
