import { Transform, Type } from 'class-transformer';
import { IsArray, IsEnum, IsNotEmpty, IsNumber, IsString, ValidateNested } from 'class-validator';
import { normalizeAddressTransformer } from 'common/transformers/normalize-address.transformer';

export class MnemonicTopOwner {
  @Transform(normalizeAddressTransformer)
  address: string;

  ownedCount: number;
}

export enum MnemonicTokenType {
  Unspecified = 'TOKEN_TYPE_UNSPECIFIED',
  Unknown = 'TOKEN_TYPE_UNKNOWN',
  Erc20 = 'TOKEN_TYPE_ERC20',
  Erc721 = 'TOKEN_TYPE_ERC721',
  Erc1155 = 'TOKEN_TYPE_ERC1155',
  Erc721Legacy = 'TOKEN_TYPE_ERC721_LEGACY',
  CryptoPunks = 'TOKEN_TYPE_CRYPTOPUNKS'
}

export class MnemonicNumOwners {
  timestamp: string;
  count: string;
}

export class MnemonicPricesByContractResponse {
  dataPoints: MnemonicPricesByContractDataPoint[];
}

export class MnemonicPricesForStatsPeriod {
  minPrice: number;
  maxPrice: number;
  avgPrice: number;
}

export class MnemonicPricesByContractDataPoint {
  timestamp: string;
  min: string;
  max: string;
  avg: string;
}

export class MnemonicVolumesForStatsPeriod {
  numSales: number;
  salesVolume: number;
}

export class MnemonicSalesVolumeByContractResponse {
  dataPoints: MnemonicSalesVolumeByContractDataPoint[];
}

export class MnemonicSalesVolumeByContractDataPoint {
  timestamp: string;
  count: string;
  volume: string;
}

export class MnemonicNumOwnersResponseBody {
  @IsArray()
  @ValidateNested({ each: true, message: 'Invalid num owners' })
  @Type(() => MnemonicNumOwners)
  dataPoints: MnemonicNumOwners[];
}

export class MnemonicNumTokens {
  timestamp: string;
  minted: string;
  burned: string;
  totalMinted: string;
  totalBurned: string;
}

export class MnemonicNumTokensResponseBody {
  @IsArray()
  @ValidateNested({ each: true, message: 'Invalid num tokens' })
  @Type(() => MnemonicNumTokens)
  dataPoints: MnemonicNumTokens[];
}

export class TopOwnersResponseBody {
  @IsArray()
  @ValidateNested({ each: true, message: 'Invalid top owner' })
  @Type(() => MnemonicTopOwner)
  owner: MnemonicTopOwner[];
}

export class MnemonicContractDetails {
  type: string;
  name: string;
  symbol: string;
  decimals: number;
  address: string;
  mintEvent: MnemonicMintEvent;
}

export class MnemonicMintEvent {
  blockTimestamp: string;
  minterAddress: string;
  txHash: string;
}

export class MnemonicTokenMetadataUri {
  @IsString()
  uri: string;

  @IsString()
  mimeType: string;
}

export class MnemonicTokenMetadata {
  @ValidateNested({ message: 'Invalid metadata uri' })
  @Type(() => MnemonicTokenMetadataUri)
  metadataUri: MnemonicTokenMetadataUri;

  @IsString()
  name: string;

  @IsString()
  description: string;

  @ValidateNested({ message: 'Invalid metadata uri' })
  @Type(() => MnemonicTokenMetadataUri)
  image: MnemonicTokenMetadataUri;
}

export class MnemonicUserNft {
  @Transform(normalizeAddressTransformer)
  contractAddress: string;

  @IsString()
  @IsNotEmpty()
  tokenId: string;

  @IsEnum(MnemonicTokenType)
  type: MnemonicTokenType;

  @IsNumber()
  quantity: number;

  @ValidateNested({ message: 'Token metadata' })
  @Type(() => MnemonicTokenMetadata)
  metadata: MnemonicTokenMetadata;
}
export class UserNftsResponseBody {
  @IsArray()
  @ValidateNested({ each: true, message: 'Invalid user nft' })
  @Type(() => MnemonicTopOwner)
  tokens: MnemonicUserNft[];
}
