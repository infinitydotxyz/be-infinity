import { ChainId, Collection } from '@infinityxyz/lib/types/core';
import { PipeTransform, Injectable } from '@nestjs/common';
import { FirebaseService } from 'firebase/firebase.service';

export type ParsedCollectionId = {
  address: string;
  chainId: ChainId;
  ref: FirebaseFirestore.DocumentReference<Partial<Collection>>;
};

export type ParsedCollection = {
  address: string;
  chainId: string;
  slug: string;
  startTokenId: string;
  endTokenId: string;
};

@Injectable()
export class ParseCollectionIdPipe implements PipeTransform<string, Promise<ParsedCollectionId>> {
  constructor(private firebaseService: FirebaseService) {}

  async transform(value: string): Promise<ParsedCollectionId> {
    return this.firebaseService.parseCollectionId(value);
  }
}
