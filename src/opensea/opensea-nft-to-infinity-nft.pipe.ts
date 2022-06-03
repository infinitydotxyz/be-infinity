import { TokenStandard } from '@infinityxyz/lib/types/core';
import { ChainId } from '@infinityxyz/lib/types/core/ChainId';
import { Injectable } from '@nestjs/common/decorators/core/injectable.decorator';
import { PipeTransform } from '@nestjs/common/interfaces/features/pipe-transform.interface';
import { NftDto } from '@infinityxyz/lib/types/dto/collections/nfts';
import { NftsService } from 'collections/nfts/nfts.service';
import { OpenseaAsset } from './opensea.types';

@Injectable()
export class OpenseaNftToInfinityNft
  implements PipeTransform<{ openseaNft: OpenseaAsset; chainId: ChainId }[], Promise<Array<NftDto | null>>>
{
  constructor(private nftsService: NftsService) {}

  async transform(openseaNfts: { openseaNft: OpenseaAsset; chainId: ChainId }[]): Promise<Array<NftDto | null>> {
    const nftRefProps = openseaNfts.map((item) => {
      return {
        address: item.openseaNft.asset_contract.address,
        chainId: item.chainId,
        tokenId: item.openseaNft.token_id
      };
    });
    const nfts = await this.nftsService.getNfts(nftRefProps);

    return nfts.map((nftDto, index) => {
      const { openseaNft: openseaNft, chainId } = openseaNfts[index];
      const tokenId = openseaNft.token_id;
      const metadata = nftDto?.metadata;
      if (!('metadata' in openseaNft)) {
        return nftDto || null;
      }
      if (!metadata) {
        return null;
      }

      return {
        ...nftDto,
        hasBlueCheck: nftDto?.hasBlueCheck ?? false,
        collectionAddress: openseaNft.asset_contract.address,
        chainId: chainId,
        slug: nftDto?.slug ?? '',
        tokenId: tokenId,
        minter: nftDto?.minter ?? '',
        mintedAt: nftDto?.mintedAt ?? NaN,
        mintTxHash: nftDto?.mintTxHash ?? '',
        mintPrice: nftDto?.mintPrice ?? NaN,
        metadata,
        numTraitTypes: nftDto?.numTraitTypes ?? metadata?.attributes?.length ?? 0,
        updatedAt: nftDto?.updatedAt ?? NaN,
        tokenUri: nftDto?.tokenUri ?? openseaNft.token_metadata ?? '',
        rarityRank: nftDto?.rarityRank ?? NaN,
        rarityScore: nftDto?.rarityScore ?? NaN,
        image: {
          url: (nftDto?.image?.url || openseaNft?.image_url) ?? '',
          originalUrl: (nftDto?.image?.originalUrl || openseaNft?.image_original_url) ?? '',
          updatedAt: nftDto?.image?.updatedAt ?? NaN
        },
        state: nftDto?.state ?? undefined,
        tokenStandard: openseaNft.asset_contract.schema_name as TokenStandard
      };
    });
  }
}
