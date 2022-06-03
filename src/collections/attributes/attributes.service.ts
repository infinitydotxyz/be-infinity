import { CollectionAttributes } from '@infinityxyz/lib/types/core';
import { Injectable } from '@nestjs/common';
import { ParsedCollectionId } from 'collections/collection-id.pipe';

@Injectable()
export class AttributesService {
  async getAttributes(collection: ParsedCollectionId): Promise<CollectionAttributes> {
    const snapshot = await collection.ref.collection('attributes').get(); // TODO: use COLLECTION_NFTS_ATTRIBUTES constant
    const attributes: CollectionAttributes = {};
    snapshot.forEach((doc) => (attributes[doc.id] = doc.data() as any));
    return attributes;
  }
}
