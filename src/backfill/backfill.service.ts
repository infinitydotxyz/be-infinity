import {
  BaseCollection,
  ChainId,
  Erc721Attribute,
  Erc721Metadata,
  Erc721Token,
  Token,
  TokenStandard
} from '@infinityxyz/lib/types/core';
import { NftDto } from '@infinityxyz/lib/types/dto/collections/nfts';
import { AlchemyNft, AlchemyNftWithMetadata } from '@infinityxyz/lib/types/services/alchemy';
import {
  firestoreConstants,
  getCollectionDocId,
  getSearchFriendlyString,
  hexToDecimalTokenId
} from '@infinityxyz/lib/utils';
import { Injectable } from '@nestjs/common';
import { AlchemyService } from 'alchemy/alchemy.service';
import { FirebaseService } from 'firebase/firebase.service';
import FirestoreBatchHandler from 'firebase/firestore-batch-handler';
import { GemService } from 'gem/gem.service';
import { OpenseaService } from 'opensea/opensea.service';
import { OpenseaAsset } from 'opensea/opensea.types';
import { Readable } from 'stream';
import { pageStream } from 'utils/streams';
import { ALCHEMY_CACHED_IMAGE_HOST, TEN_MINS } from '../constants';

@Injectable()
export class BackfillService {
  private fsBatchHandler: FirestoreBatchHandler;
  private collectionsRef: FirebaseFirestore.CollectionReference<FirebaseFirestore.DocumentData>;

  constructor(
    private firebaseService: FirebaseService,
    private openseaService: OpenseaService,
    private alchemyService: AlchemyService,
    private gemService: GemService
  ) {
    this.fsBatchHandler = new FirestoreBatchHandler(this.firebaseService);
    this.collectionsRef = this.firebaseService.firestore.collection(firestoreConstants.COLLECTIONS_COLL);
  }

  public async backfillCollection(
    chainId: ChainId,
    collectionAddress: string
  ): Promise<Partial<BaseCollection | undefined>> {
    console.log('backfilling collection', chainId, collectionAddress);
    try {
      // try fetching from OS
      let baseCollection: Partial<BaseCollection | undefined> = await this.openseaService.getCollectionWithAddress(
        chainId,
        collectionAddress
      );

      // fetch from gem
      if (!baseCollection) {
        baseCollection = await this.gemService.getCollectionWithAddress(chainId, collectionAddress);
      }

      if (!baseCollection) {
        return;
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

  public async backfillNfts(nfts: { address: string; chainId: ChainId; tokenId: string }[]): Promise<NftDto[]> {
    try {
      // try opensea
      const openseaNfts = await this.fetchNftsFromOpensea(nfts);
      if (openseaNfts && openseaNfts.length > 0) {
        // backfill alchemy cached image and attrs async
        this.backfillAlchemyCachedImagesAndAttributes(nfts).catch((err) => {
          console.error(err);
        });

        return openseaNfts;
      }
    } catch (err) {
      console.error('backfillNfts from opensea errored', err);
    }

    try {
      // try alchemy
      const alchemyNfts = await this.fetchNftsFromAlchemy(nfts);
      if (alchemyNfts && alchemyNfts.length > 0) {
        return alchemyNfts;
      }
    } catch (err) {
      console.error('backfillNfts from Alchemy errored', err);
    }

    return [];
  }

  public async backfillAnyInvalidNfts(chainId: string, collectionAddress: string) {
    console.log('Backfilling any invalid nfts for', chainId, collectionAddress);

    const collectionDocId = getCollectionDocId({ chainId, collectionAddress });
    const invalidNftsRef = this.collectionsRef
      .doc(collectionDocId)
      .collection(firestoreConstants.COLLECTION_INVALID_NFTS_COLL);

    const now = Date.now();
    const staleIfUpdatedBefore = now - TEN_MINS;
    const invalidNfts = (await invalidNftsRef.where('updatedAt', '<', staleIfUpdatedBefore).limit(1000).get()).docs;
    console.log('Found', invalidNfts.length, 'invalid nfts');

    const tokenIds: string[] = [];
    for (const invalidNft of invalidNfts) {
      const nft = invalidNft.data() as Token;
      if (!nft.collectionAddress || !nft.tokenId) {
        continue;
      }

      // image and attributes
      const imageUrl = nft.image?.url;
      const metadata = nft.metadata as Erc721Metadata;
      const hasAttributes = metadata?.attributes && metadata?.attributes.length > 0;
      if (!imageUrl || !hasAttributes) {
        tokenIds.push(nft.tokenId);
      }
    }

    this.backfillInvalidNftsFromOS(tokenIds, chainId, collectionAddress).catch((err) => {
      console.error('Error backfilling invalid nfts from OS for', collectionAddress, err);
    });
  }

  private async backfillInvalidNftsFromOS(allTokenIds: string[], chainId: string, collectionAddress: string) {
    const openseaLimit = 20;
    console.log('Backfilling', allTokenIds.length, 'invalid nfts from OS for', chainId, collectionAddress);
    const updateTokens = async (tokenIds: Partial<Token>[]) => {
      let tokenIdsConcat = '';
      for (const tokenId of tokenIds) {
        tokenIdsConcat += `token_ids=${tokenId}&`;
      }
      const data = await this.openseaService.getGivenNFTsOfContract(collectionAddress, tokenIdsConcat);
      for (const datum of data.assets) {
        const tokenId = datum.token_id;
        let tokenIdNumeric = NaN;
        try {
          tokenIdNumeric = Number(tokenId);
        } catch (err) {
          console.error('Error parsing tokenId to number', err);
        }

        const token: Partial<Erc721Token> = {
          updatedAt: Date.now(),
          tokenId,
          tokenIdNumeric,
          slug: getSearchFriendlyString(datum.name),
          tokenStandard: TokenStandard.ERC721, // default
          metadata: {
            name: datum.name ?? null,
            title: datum.name ?? null,
            image: datum.image_url ?? '',
            external_url: datum?.external_link ?? '',
            description: datum.description ?? '',
            background_color: datum.background_color ?? '',
            animation_url: datum?.animation_url ?? ''
          },
          image: { originalUrl: datum.image_original_url, updatedAt: Date.now() }
        };

        if (datum.image_url && token.image) {
          token.image.url = datum.image_url;
        }

        if (datum.traits && datum.traits.length > 0 && token.metadata) {
          const attrMap: any = {};

          token.metadata.attributes = datum.traits.map((trait) => {
            const attrType = getSearchFriendlyString(trait.trait_type);
            const attrValue = getSearchFriendlyString(String(trait.value));
            attrMap[`${attrType}:::${attrValue}`] = true;

            const isTraitValueNumeric = !isNaN(Number(trait.value));
            return {
              trait_type: trait.trait_type,
              value: isTraitValueNumeric ? Number(trait.value) : trait.value
            };
          });

          token.metadata.attributesMap = attrMap;

          token.numTraitTypes = datum.traits.length;
        }

        // update firestore if data is present
        if (!tokenId || !token.image?.url || !token.metadata?.attributes || token.numTraitTypes === 0) {
          continue;
        }

        // set nft data
        const collectionDocId = getCollectionDocId({ chainId, collectionAddress });
        const nftDocRef = this.collectionsRef
          .doc(collectionDocId)
          .collection(firestoreConstants.COLLECTION_NFTS_COLL)
          .doc(tokenId);
        this.fsBatchHandler.add(nftDocRef, token, { merge: true });

        // remove from invalid nfts
        const invalidNftDocRef = this.collectionsRef
          .doc(collectionDocId)
          .collection(firestoreConstants.COLLECTION_INVALID_NFTS_COLL)
          .doc(tokenId);
        this.fsBatchHandler.delete(invalidNftDocRef);
      }
    };

    const metadataLessTokenPages = Readable.from(allTokenIds).pipe(pageStream(openseaLimit));
    let tokensUpdated = 0;
    for await (const tokens of metadataLessTokenPages) {
      tokensUpdated += tokens.length;
      await updateTokens(tokens as Partial<Token>[]);
    }

    // flush
    this.fsBatchHandler
      .flush()
      .then(() => {
        console.log('Backfilled', tokensUpdated, 'invalid nfts for', collectionAddress);
      })
      .catch((err) => {
        console.error('Error backfilling invalid nfts from OS for', collectionAddress, err);
      });
  }

  public async backfillAnyMissingNftData(nfts: NftDto[]) {
    for (const nft of nfts) {
      if (!nft.collectionAddress || !nft.tokenId) {
        continue;
      }

      const dataToSave: Partial<Token> = {};
      let attributes: Erc721Attribute[] = [];

      // image
      if (!nft.image?.url) {
        const openseaData = await this.openseaService.getNFT(nft.collectionAddress, nft.tokenId);
        if (openseaData.image_url) {
          dataToSave.image = { url: openseaData.image_url };
        }

        if (openseaData.traits && openseaData.traits.length > 0) {
          attributes = openseaData.traits.map((trait) => {
            const isTraitValueNumeric = !isNaN(Number(trait.value));
            return { trait_type: trait.trait_type, value: isTraitValueNumeric ? Number(trait.value) : trait.value };
          });
        }
      }

      // alchemy cached image
      const alchemyCachedImage = nft?.alchemyCachedImage;
      const hasAlchemyCachedImage = alchemyCachedImage && alchemyCachedImage.includes(ALCHEMY_CACHED_IMAGE_HOST);
      if (!hasAlchemyCachedImage) {
        const alchemyData = await this.alchemyService.getNft(
          nft.chainId ?? ChainId.Mainnet,
          nft.collectionAddress,
          nft.tokenId
        );
        const cachedImage = alchemyData?.media?.[0]?.gateway;
        if (cachedImage && cachedImage.includes(ALCHEMY_CACHED_IMAGE_HOST)) {
          dataToSave.alchemyCachedImage = cachedImage;
        }

        if (alchemyData?.metadata?.attributes && alchemyData?.metadata?.attributes.length > 0) {
          attributes = alchemyData.metadata.attributes.map((trait) => {
            const isTraitValueNumeric = !isNaN(Number(trait.value));
            return { trait_type: trait.trait_type, value: isTraitValueNumeric ? Number(trait.value) : trait.value };
          });
        }
      }

      // attributes
      const metadata = nft.metadata as Erc721Metadata;
      const hasAttributes = metadata?.attributes && metadata?.attributes.length > 0;
      if (!hasAttributes) {
        if (attributes.length === 0) {
          const openseaData = await this.openseaService.getNFT(nft.collectionAddress, nft.tokenId);
          if (openseaData.traits && openseaData.traits.length > 0) {
            attributes = openseaData.traits.map((trait) => {
              const isTraitValueNumeric = !isNaN(Number(trait.value));
              return { trait_type: trait.trait_type, value: isTraitValueNumeric ? Number(trait.value) : trait.value };
            });
          } else {
            const alchemyData = await this.alchemyService.getNft(
              nft.chainId ?? ChainId.Mainnet,
              nft.collectionAddress,
              nft.tokenId
            );
            if (alchemyData?.metadata?.attributes && alchemyData?.metadata?.attributes.length > 0) {
              attributes = alchemyData.metadata.attributes.map((trait) => {
                const isTraitValueNumeric = !isNaN(Number(trait.value));
                return { trait_type: trait.trait_type, value: isTraitValueNumeric ? Number(trait.value) : trait.value };
              });
            }
          }
        } else {
          if (attributes.length > 0) {
            const attrMap: any = {};
            attributes.forEach((attr) => {
              const attrType = getSearchFriendlyString(attr.trait_type);
              const attrValue = getSearchFriendlyString(String(attr.value));
              attrMap[`${attrType}:::${attrValue}`] = true;
            });
            dataToSave.metadata = { attributes, attributesMap: attrMap };
            dataToSave.numTraitTypes = attributes.length;
          }
        }
      }

      // save to firestore
      const collectionDocId = getCollectionDocId({
        chainId: nft.chainId ?? ChainId.Mainnet,
        collectionAddress: nft.collectionAddress
      });
      const docRef = this.collectionsRef
        .doc(collectionDocId)
        .collection(firestoreConstants.COLLECTION_NFTS_COLL)
        .doc(nft.tokenId);
      this.fsBatchHandler.add(docRef, dataToSave, { merge: true });
    }

    // flush
    this.fsBatchHandler
      .flush()
      .then(() => {
        console.log('Backfilled missing nft data');
      })
      .catch((err) => {
        console.error('Error backfilling missing nft data', err);
      });
  }

  private async backfillAlchemyCachedImagesAndAttributes(
    nfts: { address: string; chainId: string; tokenId: string }[]
  ) {
    for (const nft of nfts) {
      const alchemyAsset = await this.alchemyService.getNft(nft.chainId, nft.address, nft.tokenId);
      if (alchemyAsset) {
        const nftDto = this.transformAlchemyNftToNftDto(nft.chainId as ChainId, nft.address, nft.tokenId, alchemyAsset);

        const data: Partial<Token> = {};
        if (nftDto.alchemyCachedImage) {
          data.alchemyCachedImage = nftDto.alchemyCachedImage;
        }
        if (nftDto.metadata.attributes && nftDto.metadata.attributes.length > 0) {
          const attrMap: any = {};
          (nftDto.metadata?.attributes ?? []).forEach((attr) => {
            const attrType = getSearchFriendlyString(attr.trait_type);
            const attrValue = getSearchFriendlyString(String(attr.value));
            attrMap[`${attrType}:::${attrValue}`] = true;
          });
          data.metadata = { attributes: nftDto.metadata.attributes, attributesMap: attrMap };
          data.numTraitTypes = nftDto.metadata.attributes.length;
        }

        // async save to firebase
        const collectionDocId = getCollectionDocId({ chainId: nft.chainId, collectionAddress: nft.address });
        const tokenDocRef = this.collectionsRef
          .doc(collectionDocId)
          .collection(firestoreConstants.COLLECTION_NFTS_COLL)
          .doc(nft.tokenId);
        this.fsBatchHandler.add(tokenDocRef, data, { merge: true });
      }
    }

    // flush
    this.fsBatchHandler
      .flush()
      .then(() => {
        console.log('Backfilled alchemy cached images and attributes');
      })
      .catch((err) => {
        console.error('Error backfilling alchemy cached images and attributes', err);
      });
  }

  public backfillAlchemyCachedImagesForUserNfts(nfts: AlchemyNft[], chainId: ChainId, user?: string) {
    for (const nft of nfts) {
      const nftWithMetadata = nft as AlchemyNftWithMetadata;
      const collectionAddress = nftWithMetadata.contract.address;
      const tokenId = hexToDecimalTokenId(nftWithMetadata.id.tokenId);
      const alchemyCachedImage = nftWithMetadata.media?.[0]?.gateway;
      if (!alchemyCachedImage.includes(ALCHEMY_CACHED_IMAGE_HOST)) {
        // skip if not cached image
        continue;
      }
      const collectionDocId = getCollectionDocId({ chainId, collectionAddress });
      // save in collections/nfts
      const tokenDocRef = this.collectionsRef
        .doc(collectionDocId)
        .collection(firestoreConstants.COLLECTION_NFTS_COLL)
        .doc(tokenId);
      this.fsBatchHandler.add(tokenDocRef, { alchemyCachedImage }, { merge: true });

      // save in user assets
      if (user) {
        const userTokenIdDocRef = this.firebaseService.firestore
          .collection(firestoreConstants.USERS_COLL)
          .doc(user)
          .collection(firestoreConstants.USER_COLLECTIONS_COLL)
          .doc(collectionDocId)
          .collection(firestoreConstants.USER_NFTS_COLL)
          .doc(tokenId);
        this.fsBatchHandler.add(userTokenIdDocRef, { alchemyCachedImage }, { merge: true });
      }
    }

    // write batch
    this.fsBatchHandler
      .flush()
      .then(() => {
        console.log('Backfilled alchemy cached images');
      })
      .catch((e) => {
        console.error('Error backfilling alchemy cached images', e);
      });
  }

  private async fetchNftsFromOpensea(
    nfts: { address: string; chainId: ChainId; tokenId: string }[]
  ): Promise<NftDto[]> {
    const nftDtos: NftDto[] = [];
    for (const nft of nfts) {
      const osAsset = await this.openseaService.getNFT(nft.address, nft.tokenId);
      const nftDto = this.transformOpenseaNftToNftDto(nft.chainId, nft.address, osAsset);
      nftDtos.push(nftDto);

      const tokenId = nftDto.tokenId;
      let tokenIdNumeric = NaN;
      try {
        tokenIdNumeric = Number(tokenId);
      } catch (err) {
        console.error('Error parsing tokenId to number', err);
      }

      // async save to firebase
      const collectionDocId = getCollectionDocId({ chainId: nft.chainId, collectionAddress: nft.address });
      const tokenDocRef = this.collectionsRef
        .doc(collectionDocId)
        .collection(firestoreConstants.COLLECTION_NFTS_COLL)
        .doc(nft.tokenId);
      this.fsBatchHandler.add(tokenDocRef, { ...nftDto, tokenIdNumeric }, { merge: true });
    }

    // flush
    this.fsBatchHandler
      .flush()
      .then(() => {
        console.log('Backfilled missing nfts from opensea');
      })
      .catch((err) => {
        console.error('Error backfilling nfts from opensea', err);
      });

    // return
    return nftDtos;
  }

  private async fetchNftsFromAlchemy(
    nfts: { address: string; chainId: ChainId; tokenId: string }[]
  ): Promise<NftDto[]> {
    const nftDtos: NftDto[] = [];
    for (const nft of nfts) {
      const alchemyAsset = await this.alchemyService.getNft(nft.chainId, nft.address, nft.tokenId);
      if (alchemyAsset) {
        const nftDto = this.transformAlchemyNftToNftDto(nft.chainId, nft.address, nft.tokenId, alchemyAsset);
        nftDtos.push(nftDto);

        const tokenId = nftDto.tokenId;
        let tokenIdNumeric = NaN;
        try {
          tokenIdNumeric = Number(tokenId);
        } catch (err) {
          console.error('Error parsing tokenId to number', err);
        }

        // async save to firebase
        const dataToSave = nftDto;
        const attrMap: any = {};
        dataToSave.metadata.attributes?.forEach?.((attr) => {
          const attrType = getSearchFriendlyString(attr.trait_type);
          const attrValue = getSearchFriendlyString(String(attr.value));
          attrMap[`${attrType}:::${attrValue}`] = true;
        });
        (dataToSave.metadata as any).attributesMap = attrMap;

        const collectionDocId = getCollectionDocId({ chainId: nft.chainId, collectionAddress: nft.address });
        const tokenDocRef = this.collectionsRef
          .doc(collectionDocId)
          .collection(firestoreConstants.COLLECTION_NFTS_COLL)
          .doc(nft.tokenId);
        this.fsBatchHandler.add(tokenDocRef, { ...dataToSave, tokenIdNumeric }, { merge: true });
      }
    }

    // flush
    this.fsBatchHandler
      .flush()
      .then(() => {
        console.log('Backfilled missing nfts from opensea');
      })
      .catch((err) => {
        console.error('Error backfilling nfts from opensea', err);
      });

    // return
    return nftDtos;
  }

  private transformOpenseaNftToNftDto(chainId: ChainId, collectionAddress: string, nft: OpenseaAsset): NftDto {
    return {
      collectionAddress: collectionAddress,
      chainId: chainId,
      tokenId: nft.token_id,
      image: { url: nft.image_url, originalUrl: nft.image_original_url, updatedAt: Date.now() },
      slug: getSearchFriendlyString(nft.name),
      minter: '',
      mintTxHash: '',
      mintedAt: NaN,
      mintPrice: NaN,
      metadata: {
        attributes: nft.traits.map((trait) => {
          const isTraitValueNumeric = !isNaN(Number(trait.value));
          return { trait_type: trait.trait_type, value: isTraitValueNumeric ? Number(trait.value) : trait.value };
        }),
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
      updatedAt: Date.now(),
      rarityRank: NaN,
      rarityScore: NaN,
      isFlagged: false,
      tokenStandard: nft.asset_contract.schema_name as TokenStandard
    };
  }

  private transformAlchemyNftToNftDto(
    chainId: ChainId,
    collectionAddress: string,
    tokenId: string,
    alchemyNft: AlchemyNftWithMetadata
  ): NftDto {
    const attrs = alchemyNft.metadata.attributes?.map?.((attr) => {
      const isTraitValueNumeric = !isNaN(Number(attr.value));
      return { trait_type: attr.trait_type, value: isTraitValueNumeric ? Number(attr.value) : attr.value };
    });

    const cachedImage = alchemyNft?.media?.[0]?.gateway;
    let alchemyCachedImage = '';
    if (cachedImage && cachedImage.includes(ALCHEMY_CACHED_IMAGE_HOST)) {
      alchemyCachedImage = cachedImage;
    }

    const data: NftDto = {
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
        image: alchemyNft?.media?.[0]?.gateway || alchemyNft.metadata.image,
        image_data: '',
        youtube_url: '',
        animation_url: '',
        background_color: ''
      },
      numTraitTypes: attrs?.length ?? 0,
      updatedAt: Date.now(),
      tokenUri: alchemyNft?.tokenUri.gateway ?? alchemyNft.tokenUri?.raw ?? '',
      rarityRank: NaN,
      rarityScore: NaN,
      isFlagged: false,
      image: {
        url: alchemyCachedImage,
        originalUrl: (alchemyNft?.media?.[0]?.raw || alchemyNft?.metadata?.image) ?? '',
        updatedAt: Date.now()
      },
      tokenStandard: alchemyNft.id.tokenMetadata.tokenType
    };

    if (alchemyCachedImage) {
      data.alchemyCachedImage = alchemyCachedImage;
    }

    return data;
  }
}
