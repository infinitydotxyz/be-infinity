import { ApiProperty } from '@nestjs/swagger';
import { ApiRole } from 'auth/auth.constants';
import { IsEnum, IsNumber, IsString } from 'class-validator';

export class RateLimitDto {
  @ApiProperty({
    description: 'The number of requests allowed per ttl seconds'
  })
  @IsNumber()
  limit: number;

  @ApiProperty({
    description: 'The number of seconds before the limit resets'
  })
  @IsNumber()
  ttl: number;
}

export class ApiUserConfigDto {
  @ApiProperty({
    description: 'A global rate limit for the user'
  })
  global: RateLimitDto;

  @ApiProperty({
    description: 'The role of the user',
    enum: ApiRole
  })
  @IsEnum(ApiRole)
  role: ApiRole;
}

export class ApiUserDto {
  @ApiProperty({
    description: 'The unique identifier of the user (api key)'
  })
  @IsString()
  id: string;

  @ApiProperty({
    description: 'The name of the user'
  })
  @IsString()
  name: string;

  @ApiProperty({
    description: 'The configuration of the user'
  })
  config: ApiUserConfigDto;

  @ApiProperty({
    description: 'The HMAC of the user'
  })
  @IsString()
  hmac: string;

  @ApiProperty({
    description: 'The timestamp of when the user was created'
  })
  @IsNumber()
  createdAt: number;

  @ApiProperty({
    description: 'The timestamp of when the user was last updated'
  })
  @IsNumber()
  updatedAt: number;
}

export class ApiUserCredsDto {
  @ApiProperty({
    description: "The user's api key"
  })
  @IsString()
  apiKey: string;

  @ApiProperty({
    description: "The user's api secret"
  })
  @IsString()
  apiSecret: string;
}

export class ApiUserWithCredsDto extends ApiUserCredsDto {
  @ApiProperty({
    description: 'The user'
  })
  user: ApiUserDto;
}
