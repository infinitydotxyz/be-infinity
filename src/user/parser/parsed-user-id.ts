import { ChainId } from '@infinityxyz/lib/types/core';
import { UserProfileDto } from '@infinityxyz/lib/types/dto/user/user-profile.dto';

export type ParsedUserId = {
  userAddress: string;
  userChainId: ChainId;
  ref: FirebaseFirestore.DocumentReference<UserProfileDto>;
};
