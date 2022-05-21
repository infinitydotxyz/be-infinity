import { BaseCollection, ChainId, TokenStandard } from '@infinityxyz/lib/types/core';
import { firestoreConstants, getCollectionDocId, getSearchFriendlyString } from '@infinityxyz/lib/utils';
import { Injectable } from '@nestjs/common';
import { AlchemyService } from 'alchemy/alchemy.service';
import { AlchemyNftWithMetadata } from 'alchemy/alchemy.types';
import { NftDto } from 'collections/nfts/dto/nft.dto';
import { FirebaseService } from 'firebase/firebase.service';
import FirestoreBatchHandler from 'firebase/firestore-batch-handler';
import { MnemonicService } from 'mnemonic/mnemonic.service';
import { MnemonicTokenMetadata } from 'mnemonic/mnemonic.types';
import { OpenseaService } from 'opensea/opensea.service';
import { OpenseaAsset } from 'opensea/opensea.types';

@Injectable()
export class BackfillService {
  private fsBatchHandler: FirestoreBatchHandler;
  private collectionsRef: FirebaseFirestore.CollectionReference<FirebaseFirestore.DocumentData>;

  constructor(
    private firebaseService: FirebaseService,
    private openseaService: OpenseaService,
    private mnemonicService: MnemonicService,
    private alchemyService: AlchemyService
  ) {
    this.fsBatchHandler = new FirestoreBatchHandler(this.firebaseService);
    this.collectionsRef = this.firebaseService.firestore.collection(firestoreConstants.COLLECTIONS_COLL);
  }

  async backfillCollection(chainId: ChainId, collectionAddress: string): Promise<BaseCollection | undefined> {
    try {
      const baseCollection: BaseCollection = await this.openseaService.getCollectionWithAddress(
        chainId,
        collectionAddress
      );

      const mintInfo = await this.mnemonicService.getContract(collectionAddress);
      if (mintInfo) {
        const timestampString = mintInfo.mintEvent.blockTimestamp;
        const minterAddress = mintInfo.mintEvent.minterAddress;
        const timestampMs = new Date(timestampString).getTime();
        baseCollection.deployedAt = timestampMs;
        baseCollection.deployer = minterAddress;
      }

      const numOwners = await this.mnemonicService.getNumOwners(collectionAddress);
      if (numOwners && numOwners.dataPoints && numOwners.dataPoints.length > 0) {
        const timestampString = numOwners.dataPoints[0].timestamp;
        const count = numOwners.dataPoints[0].count;
        const timestampMs = new Date(timestampString).getTime();
        baseCollection.numOwners = parseInt(count);
        baseCollection.numOwnersUpdatedAt = timestampMs;
      }

      const numNfts = await this.mnemonicService.getNumTokens(collectionAddress);
      if (numNfts && numNfts.dataPoints && numNfts.dataPoints.length > 0) {
        const totalMinted = parseInt(numNfts.dataPoints[0].totalMinted);
        const totalBurned = parseInt(numNfts.dataPoints[0].totalBurned);
        const count = totalMinted - totalBurned;
        baseCollection.numNfts = count;
      }

      // write to firebase
      const collectionDocId = getCollectionDocId({ chainId, collectionAddress });
      this.collectionsRef
        .doc(collectionDocId)
        .set(baseCollection, { merge: true })
        .then(() => {
          console.log('backfilled collection', chainId, collectionAddress);
        })
        .catch((err) => {
          console.error('error backfilling collection', chainId, collectionAddress, err);
        });

        return baseCollection;
    } catch (err) {
      console.error('error backfilling collection', chainId, collectionAddress, err);
    }
    return undefined;
  }

  async backfillOrFetchNfts(
    nfts: { address: string; chainId: ChainId; tokenId: string }[]
  ): Promise<(NftDto | undefined)[]> {
    // try OS first
    const openseaNfts = await this.fetchAndBackfillNftsFromOpensea(nfts);
    if (openseaNfts && openseaNfts.length > 0) {
      return openseaNfts;
    }

    // try mnemonic
    const mnemonicNfts = await this.fetchNftsFromMnemonic(nfts);
    if (mnemonicNfts && mnemonicNfts.length > 0) {
      return mnemonicNfts;
    }

    // try alchemy
    const alchemyNfts = await this.fetchNftsFromAlchemy(nfts);
    if (alchemyNfts && alchemyNfts.length > 0) {
      return alchemyNfts;
    }

    return [];
  }

  async fetchAndBackfillNftsFromOpensea(
    nfts: { address: string; chainId: ChainId; tokenId: string }[]
  ): Promise<(NftDto | undefined)[]> {
    const nftDtos: NftDto[] = [];
    for (const nft of nfts) {
      const osAsset = await this.openseaService.getNFT(nft.address, nft.tokenId);
      const nftDto = this.transformOpenseaNftToNftDto(nft.chainId, nft.address, osAsset);
      nftDtos.push(nftDto);
      // async save to firebase
      const collectionDocId = getCollectionDocId({ chainId: nft.chainId, collectionAddress: nft.address });
      const tokenDocRef = this.collectionsRef
        .doc(collectionDocId)
        .collection(firestoreConstants.COLLECTION_NFTS_COLL)
        .doc(nft.tokenId);
      this.fsBatchHandler.add(tokenDocRef, nftDto, { merge: true });
    }

    // flush
    this.fsBatchHandler
      .flush()
      .then(() => {
        console.log('backfilled missing nfts');
      })
      .catch((err) => {
        console.error('error backfilling nfts', err);
      });

    // return
    return nftDtos;
  }

  async fetchNftsFromMnemonic(
    nfts: { address: string; chainId: ChainId; tokenId: string }[]
  ): Promise<(NftDto | undefined)[]> {
    const nftDtos: NftDto[] = [];
    for (const nft of nfts) {
      const mnemonicAsset = await this.mnemonicService.getNft(nft.address, nft.tokenId);
      if (mnemonicAsset) {
        const nftDto = this.transformMnemonicNftToNftDto(nft.chainId, nft.address, nft.tokenId, mnemonicAsset);
        nftDtos.push(nftDto);
      }
    }
    return nftDtos;
  }

  async fetchNftsFromAlchemy(
    nfts: { address: string; chainId: ChainId; tokenId: string }[]
  ): Promise<(NftDto | undefined)[]> {
    const nftDtos: NftDto[] = [];
    for (const nft of nfts) {
      const alchemyAsset = await this.alchemyService.getNft(nft.chainId, nft.address, nft.tokenId);
      if (alchemyAsset) {
        const nftDto = this.transformAlchemyNftToNftDto(nft.chainId, nft.address, nft.tokenId, alchemyAsset);
        nftDtos.push(nftDto);
      }
    }
    return nftDtos;
  }

  transformOpenseaNftToNftDto(chainId: ChainId, collectionAddress: string, nft: OpenseaAsset): NftDto {
    return {
      collectionAddress: collectionAddress,
      chainId: chainId,
      tokenId: nft.token_id,
      image: { url: nft.image_url, originalUrl: nft.image_original_url, updatedAt: NaN },
      slug: getSearchFriendlyString(nft.name),
      minter: '',
      mintTxHash: '',
      owner: nft.owner,
      mintedAt: NaN,
      mintPrice: NaN,
      metadata: {
        attributes: nft.traits,
        name: nft.name,
        title: nft.name,
        description: nft.description,
        external_url: nft.external_link,
        image: nft.image_url,
        image_data: '',
        youtube_url: '',
        animation_url: nft.animation_url,
        background_color: nft.background_color
      },
      numTraitTypes: nft.traits.length,
      tokenUri: nft.token_metadata,
      updatedAt: NaN,
      rarityRank: NaN,
      rarityScore: NaN,
      tokenStandard: nft.asset_contract.schema_name as TokenStandard
    };
  }

  transformMnemonicNftToNftDto(
    chainId: ChainId,
    collectionAddress: string,
    tokenId: string,
    nft: MnemonicTokenMetadata
  ): NftDto {
    return {
      collectionAddress: collectionAddress,
      chainId: chainId,
      tokenId,
      image: { url: nft.image.uri, originalUrl: nft.image.uri, updatedAt: NaN },
      slug: getSearchFriendlyString(nft.name),
      minter: '',
      mintTxHash: '',
      owner: '',
      mintedAt: NaN,
      mintPrice: NaN,
      metadata: {
        attributes: [],
        name: nft.name,
        title: nft.name,
        description: nft.description,
        external_url: '',
        image: nft.image.uri,
        image_data: '',
        youtube_url: '',
        animation_url: '',
        background_color: ''
      },
      numTraitTypes: NaN,
      tokenUri: nft.metadataUri.uri,
      updatedAt: NaN,
      rarityRank: NaN,
      rarityScore: NaN,
      tokenStandard: TokenStandard.ERC721 // todo: get this from the mnemonic or add an unknown token standard
    };
  }

  transformAlchemyNftToNftDto(
    chainId: ChainId,
    collectionAddress: string,
    tokenId: string,
    alchemyNft: AlchemyNftWithMetadata
  ): NftDto {
    const attrs = alchemyNft.metadata.attributes.map((attr) => ({
      trait_type: attr.trait_type,
      value: attr.value,
      display_type: attr.display_type
    }));

    return {
      collectionAddress,
      chainId: chainId,
      slug: getSearchFriendlyString(alchemyNft?.title ?? ''),
      tokenId: tokenId,
      minter: '',
      mintedAt: NaN,
      mintTxHash: '',
      mintPrice: NaN,
      metadata: {
        attributes: attrs,
        name: alchemyNft.metadata.name,
        title: alchemyNft.metadata.name,
        description: alchemyNft.description,
        external_url: alchemyNft.metadata.external_url,
        image: alchemyNft.metadata.image,
        image_data: '',
        youtube_url: '',
        animation_url: '',
        background_color: ''
      },
      numTraitTypes: attrs?.length ?? 0,
      updatedAt: NaN,
      tokenUri: alchemyNft?.tokenUri.gateway ?? alchemyNft.tokenUri?.raw ?? '',
      rarityRank: NaN,
      rarityScore: NaN,
      image: {
        url: (alchemyNft?.media?.[0]?.gateway || alchemyNft?.metadata?.image) ?? '',
        originalUrl: (alchemyNft?.media?.[0]?.raw || alchemyNft?.metadata?.image) ?? '',
        updatedAt: NaN
      },
      tokenStandard: alchemyNft.id.tokenMetadata.tokenType
    };
  }
}
