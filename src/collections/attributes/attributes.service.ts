import { CollectionAttribute, CollectionAttributes, TraitValueMetadata } from '@infinityxyz/lib/types/core';
import { firestoreConstants } from '@infinityxyz/lib/utils/constants';
import { Injectable } from '@nestjs/common';
import { ParsedCollectionId } from 'collections/collection-id.pipe';
import PQueue from 'p-queue';

@Injectable()
export class AttributesService {
  async getAttributes(collection: ParsedCollectionId): Promise<CollectionAttributes> {
    const attributes: CollectionAttributes = {};
    const stream = collection.ref.collection(firestoreConstants.COLLECTION_ATTRIBUTES).stream() as AsyncIterable<
      FirebaseFirestore.DocumentSnapshot<CollectionAttribute>
    >;

    const queue = new PQueue({ concurrency: 10 });

    const promises: Promise<void>[] = [];
    for await (const snap of stream) {
      const data = snap.data() as CollectionAttribute;
      const promise = queue
        .add(async () => {
          const values = await this.getAttributeValues(collection, snap.id);
          attributes[data.attributeType] = { ...data, values };
        })
        .catch((err) => {
          console.error(err);
        });

      promises.push(promise);
    }

    await Promise.allSettled(promises);
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
      .limit(100)
      .get();
    snapshot.forEach((doc) => {
      const data = doc.data() as TraitValueMetadata;
      attributes[data.attributeValue] = data;
    });

    return attributes;
  }
}
