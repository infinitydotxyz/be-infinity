import { ChainId } from '@infinityxyz/lib/types/core';
import { Collection } from '@infinityxyz/lib/types/core/Collection';
import { firestoreConstants, getCollectionDocId, trimLowerCase } from '@infinityxyz/lib/utils';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ParsedCollectionId } from 'collections/collection-id.pipe';
import { ethers } from 'ethers';
import firebaseAdmin, { storage } from 'firebase-admin';
import { CollectionRefDto } from './dto/collection-ref.dto';
import { FIREBASE_OPTIONS } from './firebase.constants';
import { FirebaseModuleOptions } from './firebase.types';

@Injectable()
export class FirebaseService {
  private readonly _firestore: FirebaseFirestore.Firestore;
  public readonly firestoreNamespace = firebaseAdmin.firestore;

  public get firestore() {
    return this._firestore;
  }

  public get bucket() {
    return storage().bucket();
  }

  constructor(@Inject(FIREBASE_OPTIONS) private options: FirebaseModuleOptions) {
    if ((options.isTest && firebaseAdmin.apps.length == 0) || !options.isTest) {
      firebaseAdmin.initializeApp(
        {
          credential: firebaseAdmin.credential.cert(options.cert),
          storageBucket: options.storageBucket
        },
        options.certName
      );
    }
    this._firestore = firebaseAdmin.firestore();
    this._firestore.settings({ ignoreUndefinedProperties: true });
  }

  /**
   * Get a reference to a collection via a address + chainId or slug
   */
  async getCollectionRef(
    collectionRefProps: CollectionRefDto
  ): Promise<FirebaseFirestore.DocumentReference<Partial<Collection>>> {
    if ('slug' in collectionRefProps && collectionRefProps?.slug) {
      const docQuery = this.firestore
        .collection(firestoreConstants.COLLECTIONS_COLL)
        .where('slug', '==', collectionRefProps.slug)
        .select('address', 'chainId', 'slug');

      const results = await docQuery.get();
      const doc = results.docs?.[0];
      if (!doc?.exists) {
        throw new NotFoundException('Failed to find collection via slug');
      }
      return doc.ref;
    } else if ('address' in collectionRefProps && collectionRefProps?.address && collectionRefProps?.chainId) {
      const docId = getCollectionDocId({
        collectionAddress: collectionRefProps.address,
        chainId: collectionRefProps.chainId
      });

      return this.firestore.collection(firestoreConstants.COLLECTIONS_COLL).doc(docId);
    } else {
      throw new BadRequestException(`Failed to provide a collection slug or address`);
    }
  }

  async parseCollectionId(value: string): Promise<ParsedCollectionId> {
    const [chainIdOrSlug, address] = value.split(':').map((item) => trimLowerCase(item));
    let chainId, slug;
    let collectionRef: FirebaseFirestore.DocumentReference<Collection>;
    if (address) {
      chainId = chainIdOrSlug;
      collectionRef = (await this.getCollectionRef({
        chainId: chainId as ChainId,
        address
      })) as FirebaseFirestore.DocumentReference<Collection>;
    } else {
      slug = chainIdOrSlug;

      if (!slug) {
        throw new BadRequestException('Invalid slug');
      }

      collectionRef = (await this.getCollectionRef({
        slug
      })) as FirebaseFirestore.DocumentReference<Collection>;
    }

    const [chainIdFromRef, addressFromRef] = collectionRef.id.split(':');

    if (!Object.values(ChainId).includes(chainIdFromRef as any)) {
      throw new BadRequestException('Invalid chain id');
    }

    if (!ethers.utils.isAddress(addressFromRef)) {
      throw new BadRequestException('Invalid address');
    }

    return {
      address: addressFromRef,
      chainId: chainIdFromRef as ChainId,
      ref: collectionRef
    };
  }
}
