import { BigNumber } from '@ethersproject/bignumber/lib/bignumber';
import { TokenStandard } from '@infinityxyz/lib/types/core';
import { ChainId } from '@infinityxyz/lib/types/core/ChainId';
import { NftDto } from '@infinityxyz/lib/types/dto/collections/nfts';
import { AlchemyNft, AlchemyNftWithMetadata } from '@infinityxyz/lib/types/services/alchemy';
import { Injectable } from '@nestjs/common/decorators/core/injectable.decorator';
import { PipeTransform } from '@nestjs/common/interfaces/features/pipe-transform.interface';
import { NftsService } from '../../collections/nfts/nfts.service';

@Injectable()
export class AlchemyNftToInfinityNft
  implements PipeTransform<{ alchemyNft: AlchemyNft; chainId: ChainId }[], Promise<Array<NftDto | null>>>
{
  constructor(private nftsService: NftsService) {}

  simpleTransform(alchemyNfts: { alchemyNft: AlchemyNft; chainId: ChainId }[]): Array<NftDto | null> {
    return alchemyNfts.map((nft, index) => {
      const { alchemyNft, chainId } = alchemyNfts[index] ?? {};
      const alchemyNftWithMetadata = alchemyNft as AlchemyNftWithMetadata;
      const tokenId = BigNumber.from(alchemyNftWithMetadata.id.tokenId).toBigInt().toString();
      const metadata = alchemyNftWithMetadata.metadata;

      return {
        collectionAddress: alchemyNft.contract.address,
        chainId,
        tokenId,
        metadata,
        numTraitTypes: metadata?.attributes?.length ?? 0,
        updatedAt: NaN,
        tokenUri: alchemyNftWithMetadata.tokenUri?.raw ?? '',
        image: {
          url: (alchemyNftWithMetadata?.media?.[0]?.gateway || alchemyNftWithMetadata?.metadata?.image) ?? '',
          originalUrl: (alchemyNftWithMetadata?.media?.[0]?.raw || alchemyNftWithMetadata?.metadata?.image) ?? '',
          updatedAt: NaN
        },
        state: undefined,
        tokenStandard: alchemyNftWithMetadata.id.tokenMetadata.tokenType
      };
    });
  }

  async transform(alchemyNfts: { alchemyNft: AlchemyNft; chainId: ChainId }[]): Promise<Array<NftDto | null>> {
    const nftRefProps = alchemyNfts.map((item) => {
      return {
        address: item.alchemyNft.contract.address,
        chainId: item.chainId,
        tokenId: BigNumber.from(item.alchemyNft.id.tokenId).toBigInt().toString()
      };
    });
    const nfts = await this.nftsService.getNfts(nftRefProps);

    return nfts.map((nftDto, index) => {
      const { alchemyNft, chainId } = alchemyNfts[index] ?? {};
      // skip non erc721
      const alchemyNftWithMetadata = alchemyNft as AlchemyNftWithMetadata;
      if (alchemyNftWithMetadata.id.tokenMetadata.tokenType !== TokenStandard.ERC721) {
        return null;
      }

      const tokenId = BigNumber.from(alchemyNft.id.tokenId).toBigInt().toString();
      let metadata = nftDto?.metadata;
      if (!('metadata' in alchemyNft)) {
        return nftDto || null;
      }
      if ('metadata' in alchemyNft && !metadata) {
        metadata = alchemyNft.metadata as any;
      }
      if (!metadata) {
        return null;
      }

      return {
        ...nftDto,
        hasBlueCheck: nftDto?.hasBlueCheck ?? false,
        collectionAddress: alchemyNft.contract.address,
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
        tokenUri: nftDto?.tokenUri ?? alchemyNft.tokenUri?.raw ?? '',
        rarityRank: nftDto?.rarityRank ?? NaN,
        rarityScore: nftDto?.rarityScore ?? NaN,
        image: {
          url: nftDto?.image?.url ?? '',
          originalUrl: (nftDto?.image?.originalUrl || alchemyNft?.media?.[0]?.raw || alchemyNft?.metadata?.image) ?? '',
          updatedAt: nftDto?.image?.updatedAt ?? NaN
        },
        state: nftDto?.state ?? undefined,
        tokenStandard: alchemyNft.id.tokenMetadata.tokenType as TokenStandard
      };
    });
  }
}
