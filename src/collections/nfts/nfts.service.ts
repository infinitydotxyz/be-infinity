import { ChainId, NftSaleAndOrder } from '@infinityxyz/lib/types/core';
import { ExternalNftDto, NftDto, NftQueryDto } from '@infinityxyz/lib/types/dto/collections/nfts';
import { firestoreConstants, getCollectionDocId } from '@infinityxyz/lib/utils';
import { Injectable } from '@nestjs/common';
import { ParsedCollectionId } from 'collections/collection-id.pipe';
import { FirebaseService } from 'firebase/firebase.service';
import { ReservoirService } from 'reservoir/reservoir.service';
import { ReservoirTokenV6 } from 'reservoir/types';
import { OrdersService } from 'v2/orders/orders.service';

@Injectable()
export class NftsService {
  constructor(
    private firebaseService: FirebaseService,
    private reservoirService: ReservoirService,
    protected ordersService: OrdersService
  ) {}

  async getNft(nftQuery: NftQueryDto): Promise<ReservoirTokenV6 | undefined> {
    const data = await this.reservoirService.getSingleTokenInfo(nftQuery.chainId, nftQuery.address, nftQuery.tokenId);
    const first = data?.tokens?.[0];
    return first;
  }

  isSupported(nfts: NftDto[]) {
    const externalNfts: ExternalNftDto[] = [];
    for (const nft of nfts) {
      // const isSupported = this._supportedCollections.has(nft.collectionAddress ?? '');
      const isSupported = true;
      if (isSupported) {
        const externalNft: ExternalNftDto = {
          ...nft,
          isSupported
        };
        externalNfts.push(externalNft);
      }
    }

    return externalNfts;
  }

  async getNfts(nfts: { address: string; chainId: ChainId; tokenId: string }[]): Promise<NftDto[]> {
    const refs = nfts.map((item) => {
      const collectionDocId = getCollectionDocId({
        collectionAddress: item.address,
        chainId: item.chainId
      });
      return this.firebaseService.firestore
        .collection(firestoreConstants.COLLECTIONS_COLL)
        .doc(collectionDocId)
        .collection(firestoreConstants.COLLECTION_NFTS_COLL)
        .doc(item.tokenId);
    });

    if (refs.length === 0) {
      return [];
    }

    const snapshots = await this.firebaseService.firestore.getAll(...refs);

    const nftsMergedWithSnapshot = nfts.map((item, index) => {
      const snapshot = snapshots[index];
      const nft = (snapshot.data() ?? {}) as NftDto;
      return {
        ...item,
        ...nft
      };
    });

    return nftsMergedWithSnapshot;
  }

  async getSalesAndOrders(collection: ParsedCollectionId, tokenId: string): Promise<NftSaleAndOrder[]> {
    const data: NftSaleAndOrder[] = [];
    const chainId = collection.chainId;
    const collectionAddress = collection.address;

    const salesResult = await this.reservoirService.getSales(
      chainId,
      collectionAddress,
      tokenId,
      undefined,
      undefined,
      10
    );
    for (const sale of salesResult?.sales ?? []) {
      const priceEth = sale.price.amount.native;
      const timestamp = sale.timestamp * 1000;

      if (!priceEth || !timestamp) {
        continue;
      }

      const dataPoint: NftSaleAndOrder = {
        dataType: 'Sale',
        priceEth,
        timestamp
      };

      data.push(dataPoint);
    }

    const listings = await this.reservoirService.getOrders(
      chainId,
      collectionAddress,
      tokenId,
      undefined,
      undefined,
      'sell',
      false,
      'updatedAt',
      10
    );

    const bids = await this.reservoirService.getOrders(
      chainId,
      collectionAddress,
      tokenId,
      undefined,
      undefined,
      'buy',
      false,
      'updatedAt',
      10
    );

    for (const listing of listings?.orders ?? []) {
      const priceEth = listing.price.amount.native;
      const timestamp = new Date(listing.updatedAt).getTime();
      const isSellOrder = true;

      if (!priceEth || !timestamp) {
        continue;
      }

      const dataPoint: NftSaleAndOrder = {
        dataType: isSellOrder ? 'Listing' : 'Offer',
        priceEth,
        timestamp
      };

      data.push(dataPoint);
    }

    for (const bid of bids?.orders ?? []) {
      const priceEth = bid.price.amount.native;
      const timestamp = new Date(bid.updatedAt).getTime();
      const isSellOrder = false;

      if (!priceEth || !timestamp) {
        continue;
      }

      const dataPoint: NftSaleAndOrder = {
        dataType: isSellOrder ? 'Listing' : 'Offer',
        priceEth,
        timestamp
      };

      data.push(dataPoint);
    }

    return data;
  }
}
