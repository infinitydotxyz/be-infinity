import { OBOrderItem } from '@infinityxyz/lib/types/core';

export class OBOrderCollectionsArrayDto {
  data: Array<Omit<OBOrderItem, 'tokens'>>;
  cursor: string;
  hasNextPage: boolean;
}
