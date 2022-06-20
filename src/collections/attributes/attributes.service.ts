import { CollectionAttribute, CollectionAttributes, TraitValueMetadata } from '@infinityxyz/lib/types/core';
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
      const data = doc.data() as CollectionAttribute;
      attributes[data.attributeType] = { ...data, values };
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
    snapshot.forEach((doc) => {
      const data = doc.data() as TraitValueMetadata;
      attributes[data.attributeValue] = data;
    });

    return attributes;
  }
}
