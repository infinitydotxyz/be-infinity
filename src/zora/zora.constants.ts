import { OrderDirection } from '@infinityxyz/lib/types/core/Queries';

export const getSortDirection = (orderDirection: OrderDirection): string => {
  switch (orderDirection) {
    case OrderDirection.Ascending:
      return 'ASC';
    case OrderDirection.Descending:
      return 'DESC';
    default:
      return 'SORT_DIRECTION_UNSPECIFIED';
  }
};
