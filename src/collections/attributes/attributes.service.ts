import { CollectionAttribute, CollectionAttributes } from '@infinityxyz/lib/types/core';
import { firestoreConstants } from '@infinityxyz/lib/utils/constants';
import { Injectable } from '@nestjs/common';
import { ParsedCollectionId } from 'collections/collection-id.pipe';

@Injectable()
export class AttributesService {
  async getAttributes(collection: ParsedCollectionId): Promise<CollectionAttributes> {
    const attributes: CollectionAttributes = {};

    const snapshot = await collection.ref.collection(firestoreConstants.COLLECTION_ATTRIBUTES).get();

    for (const doc of snapshot.docs) {
      const values = await this.getAttributeValues(collection, doc.id);
      attributes[doc.id] = { ...(doc.data() as any), values };
    }

    return attributes;
  }

  async getAttributeValues(
    collection: ParsedCollectionId,
    attributeDocId: string
  ): Promise<CollectionAttribute['values']> {
    const attributes: CollectionAttribute['values'] = {};

    const snapshot = await collection.ref
      .collection(firestoreConstants.COLLECTION_ATTRIBUTES)
      .doc(attributeDocId)
      .collection(firestoreConstants.COLLECTION_ATTRIBUTES_VALUES)
      .get();
    snapshot.forEach((doc) => (attributes[doc.id] = doc.data() as any));

    return attributes;
  }
}
