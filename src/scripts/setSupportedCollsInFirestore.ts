import { ChainId, SupportedCollection } from '@infinityxyz/lib/types/core';
import { ReservoirCollectionV5, ReservorCollsSortBy } from '@infinityxyz/lib/types/services/reservoir';
import { getService } from 'script';
import { ReservoirService } from 'reservoir/reservoir.service';
import { getSearchFriendlyString, sleep, trimLowerCase } from '@infinityxyz/lib/utils';
import { ethers } from 'ethers';
import { ERC721ABI } from '@infinityxyz/lib/abi/erc721';
import { ConfigService } from '@nestjs/config';
import { FirebaseService } from 'firebase/firebase.service';
import FirestoreBatchHandler from 'firebase/firestore-batch-handler';
import { firestoreConstants, getCollectionDocId } from '@infinityxyz/lib/utils';

export const setSupportedCollsInFirestore = async () => {
  // fetch top 100 colls from Reservoir for different time periods
  const reservoirService = getService(ReservoirService);
  if (!reservoirService) {
    throw new Error('Reservoir service not found');
  }

  const configService = getService(ConfigService);
  if (!configService) {
    throw new Error('Config service not found');
  }

  const firebaseService = getService(FirebaseService);
  if (!firebaseService) {
    throw new Error('Firebase service not found');
  }

  const rpcProvider = new ethers.providers.StaticJsonRpcProvider(configService.get('alchemyJsonRpcEthMainnet'));

  const topColls1d = await fetchTop100Colls(reservoirService, ChainId.Mainnet, ReservorCollsSortBy.ONE_DAY_VOLUME);
  const topColls7d = await fetchTop100Colls(reservoirService, ChainId.Mainnet, ReservorCollsSortBy.SEVEN_DAY_VOLUME);
  const topColls30d = await fetchTop100Colls(reservoirService, ChainId.Mainnet, ReservorCollsSortBy.THIRTY_DAY_VOLUME);
  const topCollsAllTime = await fetchTop100Colls(
    reservoirService,
    ChainId.Mainnet,
    ReservorCollsSortBy.ALL_TIME_VOLUME
  );

  const allResults = topColls1d.concat(topColls7d, topColls30d, topCollsAllTime);

  // eliminate duplicates
  const map = new Map<string, SupportedCollection>();
  for (const item of allResults) {
    map.set(item.primaryContract, {
      address: trimLowerCase(item.primaryContract),
      slug: getSearchFriendlyString(item.slug),
      name: item.name,
      chainId: ChainId.Mainnet,
      isSupported: true
    });
  }
  const uniqueColls = Array.from(map.values());

  // filter for erc721s only
  const erc721Colls: SupportedCollection[] = [];
  for (const coll of uniqueColls) {
    try {
      const contract = new ethers.Contract(coll.address, ERC721ABI, rpcProvider);
      const isSupported = await contract.supportsInterface('0x80ac58cd'); // erc721 interface id
      if (typeof isSupported === 'boolean' && isSupported) {
        erc721Colls.push(coll);
      }
    } catch (err) {
      console.error(
        `Error checking erc721 interface for ${coll.name} - ${coll.address}. Not adding it to supported colls list`
      );
      console.error(err);
    }
  }

  console.log(`Found ${erc721Colls.length}. Adding to firestore...`);

  // batch add to firestore
  const fsBatchHandler = new FirestoreBatchHandler(firebaseService);
  const supportedCollsRef = firebaseService.firestore.collection(firestoreConstants.SUPPORTED_COLLECTIONS_COLL);
  erc721Colls.forEach((coll) => {
    const collectionDocId = getCollectionDocId({ collectionAddress: coll.address, chainId: coll.chainId });
    const collRef = supportedCollsRef.doc(collectionDocId);
    fsBatchHandler.add(collRef, coll, { merge: true });
  });

  // final flush
  await fsBatchHandler.flush();

  console.log('Done!');
};

const fetchTop100Colls = async (
  rs: ReservoirService,
  chainId: ChainId,
  period: ReservorCollsSortBy
): Promise<ReservoirCollectionV5[]> => {
  const allResults: ReservoirCollectionV5[] = [];
  let continuation = '';
  for (let i = 0; i < 5; i++) {
    console.log('Sleeping for a few seconds to avoid 429s...');
    await sleep(1 * 1000); // to avoid 429s
    const data = await rs.getTopCollsByVolume(
      chainId,
      period,
      20, // max reservoir limit is 20
      continuation
    );
    allResults.push(...(data?.collections ?? []));
    continuation = data?.continuation ?? '';
  }

  return allResults;
};
