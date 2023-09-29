import { BigNumber } from '@ethersproject/bignumber/lib/bignumber';
import { TokenStandard } from '@infinityxyz/lib/types/core';
import { ChainId } from '@infinityxyz/lib/types/core/ChainId';
import { NftDto } from '@infinityxyz/lib/types/dto/collections/nfts';
import { AlchemyNft, AlchemyNftWithMetadata } from '@infinityxyz/lib/types/services/alchemy';
import { Injectable } from '@nestjs/common/decorators/core/injectable.decorator';
import { PipeTransform } from '@nestjs/common/interfaces/features/pipe-transform.interface';
import { NftsService } from '../../collections/nfts/nfts.service';
import { getSearchFriendlyString } from '@infinityxyz/lib/utils';

@Injectable()
export class AlchemyNftToInfinityNft
  implements PipeTransform<{ alchemyNft: AlchemyNft; chainId: ChainId }[], Promise<Array<NftDto | null>>>
{
  constructor(private nftsService: NftsService) { }

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
        isFlagged: false,
        tokenStandard: alchemyNftWithMetadata.id.tokenMetadata.tokenType
      };
    });
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async transform(alchemyNfts: { alchemyNft: AlchemyNft; chainId: ChainId }[]): Promise<Array<NftDto | null>> {
    return alchemyNfts.map((item) => {
      const { alchemyNft, chainId } = item;
      // skip non erc721
      const alchemyNftWithMetadata = alchemyNft as AlchemyNftWithMetadata;
      if (alchemyNftWithMetadata.id.tokenMetadata.tokenType !== TokenStandard.ERC721) {
        return null;
      }

      const tokenId = BigNumber.from(alchemyNft.id.tokenId).toBigInt().toString();
      const metadata = alchemyNftWithMetadata?.metadata;
      const contractMetadata = (alchemyNftWithMetadata as any)?.contractMetadata.openSea;

      return {
        ...alchemyNftWithMetadata,
        isFlagged: false,
        hasBlueCheck: false,
        collectionAddress: alchemyNft.contract.address,
        collectionName: contractMetadata?.collectionName,
        chainId: chainId,
        slug: getSearchFriendlyString(contractMetadata?.collectionName ?? '') ?? '',
        collectionSlug: getSearchFriendlyString(contractMetadata?.collectionName ?? '') ?? '',
        tokenId: tokenId,
        minter: '',
        mintedAt: NaN,
        mintTxHash: '',
        mintPrice: NaN,
        metadata,
        numTraitTypes: metadata?.attributes?.length ?? 0,
        updatedAt: NaN,
        tokenUri: alchemyNftWithMetadata.tokenUri?.gateway ?? '',
        rarityRank: NaN,
        rarityScore: NaN,
        image: {
          url: alchemyNftWithMetadata?.media?.[0]?.gateway ?? metadata?.image ?? '',
          originalUrl: alchemyNftWithMetadata?.media?.[0]?.raw ?? '',
          updatedAt: NaN
        },
        state: undefined,
        tokenStandard: alchemyNftWithMetadata?.id.tokenMetadata.tokenType as TokenStandard
      };
    });
  }
}
