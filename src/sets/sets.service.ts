import { ChainId, Erc721Token, SetsDataItem, SetsResponse } from '@infinityxyz/lib/types/core';
import { firestoreConstants, trimLowerCase } from '@infinityxyz/lib/utils';
import { Injectable } from '@nestjs/common';
import { SupportedCollectionsProvider } from 'common/providers/supported-collections-provider';
import { PostgresService } from 'postgres/postgres.service';
import { FirebaseService } from '../firebase/firebase.service';

@Injectable()
export default class SetsService {
  private _supportedCollections: SupportedCollectionsProvider;
  constructor(private firebaseService: FirebaseService, private postgresService: PostgresService) {}

  setSupportedCollections(supportedCollections: SupportedCollectionsProvider): void {
    this._supportedCollections = supportedCollections;
  }

  public async getSets(minPrice: number, maxPrice: number): Promise<SetsResponse> {
    try {
      const chainId = ChainId.Mainnet; // future-todo change this when multi collection support is added

      const q = `SELECT price_eth, is_sell_order, collection_address, token_id, token_image, collection_name 
                  FROM eth_nft_orders WHERE status = 'active' 
                  AND is_sell_order = 'true' 
                  AND price_eth > ${minPrice} 
                  AND price_eth < ${maxPrice}
                  LIMIT 1000`;
      const pool = this.postgresService.pool;
      const result = await pool.query(q);
      const data = [];
      for (const row of result.rows) {
        const priceEth = parseFloat(row.price_eth);
        const isSellOrder = row.is_sell_order;
        const collectionAddress = row.collection_address;
        const tokenId = row.token_id;
        const tokenImage = String(row.token_image);
        const collectionName = row.collection_name;

        const collectionId = `${chainId}:${trimLowerCase(collectionAddress)}`;
        const isSupported = this._supportedCollections.has(collectionId);
        // ignore ENS
        if (collectionAddress.toLowerCase() === '0x57f1887a8bf19b14fc0df6fd9b2acc9af147ea85') {
          continue;
        }

        if (
          !isSupported ||
          !tokenId ||
          !collectionAddress ||
          !collectionName ||
          !tokenImage ||
          !priceEth ||
          tokenImage.startsWith('ipfs')
        ) {
          continue;
        }

        const dataPoint: SetsDataItem = {
          tokenId,
          collectionAddress,
          collectionName,
          tokenImage,
          priceEth,
          isSellOrder,
          collectionSlug: ''
        };

        data.push(dataPoint);
      }

      // remove duplicates
      const uniqueData = data.filter(
        (v, i, a) => a.findIndex((t) => t.tokenId === v.tokenId && t.collectionAddress === v.collectionAddress) === i
      );

      // augment with firestore data
      const tokenRefs = [];
      const dataPointMap = new Map<string, SetsDataItem>();
      for (const dataPoint of uniqueData) {
        const collectionId = `${chainId}:${trimLowerCase(dataPoint.collectionAddress)}`;
        const tokenRef = this.firebaseService.firestore
          .collection(firestoreConstants.COLLECTIONS_COLL)
          .doc(collectionId)
          .collection(firestoreConstants.COLLECTION_NFTS_COLL)
          .doc(dataPoint.tokenId);
        tokenRefs.push(tokenRef);

        dataPointMap.set(`${chainId}:${dataPoint.collectionAddress}:${dataPoint.tokenId}`, dataPoint);
      }

      const tokensSnap = await this.firebaseService.firestore.getAll(...tokenRefs);
      for (const tokenSnap of tokensSnap) {
        const tokenDoc = tokenSnap.data() as Erc721Token;
        const collectionAddress = tokenDoc.collectionAddress;
        const collectionSlug = tokenDoc.collectionSlug;
        const tokenId = tokenDoc.tokenId;

        const mapKey = `${chainId}:${collectionAddress}:${tokenId}`;
        const dataPoint = dataPointMap.get(mapKey);

        const imageUrl =
          tokenDoc?.image?.url ||
          tokenDoc?.alchemyCachedImage ||
          dataPoint?.tokenImage ||
          tokenDoc?.metadata?.image ||
          tokenDoc?.image?.originalUrl ||
          tokenDoc?.zoraImage?.url ||
          '';
        const lastSalePriceEth = tokenDoc?.lastSalePriceEth;
        const hasBlueCheck = tokenDoc?.hasBlueCheck;
        if (dataPoint) {
          dataPoint.tokenImage = imageUrl;
          dataPoint.lastPriceEth = lastSalePriceEth;
          dataPoint.hasBlueCheck = hasBlueCheck;
          dataPoint.collectionSlug = collectionSlug ?? '';
        }
      }

      return {
        data: Array.from(dataPointMap.values())
      };
    } catch (err) {
      console.error('Failed to fetch sets', err);
    }

    return {
      data: []
    };
  }
}
