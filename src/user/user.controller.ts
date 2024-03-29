import { CollectionMetadata } from '@infinityxyz/lib/types/core';
import { ApiRole } from '@infinityxyz/lib/types/core/api-user';
import { UserRewardsDto } from '@infinityxyz/lib/types/dto';
import { UpdateCollectionDto, UserCuratedCollectionsDto } from '@infinityxyz/lib/types/dto/collections';
import { CuratedCollectionsQuery } from '@infinityxyz/lib/types/dto/collections/curation/curated-collections-query.dto';
import { CurationQuotaDto } from '@infinityxyz/lib/types/dto/collections/curation/curation-quota.dto';
import { ExternalNftArrayDto, NftActivityArrayDto, NftArrayDto } from '@infinityxyz/lib/types/dto/collections/nfts';
import {
  DeleteUserProfileImagesDto,
  PartialUpdateUserProfileDto,
  UpdateUserProfileImagesDto,
  UserActivityArrayDto,
  UserActivityQueryDto,
  UserCollectionPermissions,
  UserCollectionsQuery,
  UserCollectionsResponse,
  UserFollowingCollectionDeletePayload,
  UserFollowingCollectionPostPayload,
  UserFollowingCollectionsArrayDto,
  UserFollowingUserDeletePayload,
  UserFollowingUserPostPayload,
  UserFollowingUsersArrayDto,
  UserNftsQueryDto,
  UserProfileDto,
  UserProfileImagesDto,
  ValidateUsernameResponseDto
} from '@infinityxyz/lib/types/dto/user';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  NotFoundException,
  Post,
  Put,
  Query,
  UnauthorizedException,
  UploadedFile,
  UploadedFiles,
  UseInterceptors
} from '@nestjs/common';
import { FileFieldsInterceptor, FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiHeader,
  ApiInternalServerErrorResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ApiParamUserId, Auth } from 'auth/api-auth.decorator';
import { SiteRole } from 'auth/auth.constants';
import { ParamUserId } from 'auth/param-user-id.decorator';
import { instanceToPlain } from 'class-transformer';
import { ParseCollectionIdPipe, ParsedCollectionId } from 'collections/collection-id.pipe';
import CollectionsService from 'collections/collections.service';
import { CurationService } from 'collections/curation/curation.service';
import { NftsService } from 'collections/nfts/nfts.service';
import { ApiTag } from 'common/api-tags';
import { ApiParamCollectionId, ParamCollectionId } from 'common/decorators/param-collection-id.decorator';
import { ErrorResponseDto } from 'common/dto/error-response.dto';
import { InvalidCollectionError } from 'common/errors/invalid-collection.error';
import { InvalidUserError } from 'common/errors/invalid-user.error';
import { CacheControlInterceptor } from 'common/interceptors/cache-control.interceptor';
import { ResponseDescription } from 'common/response-description';
import { RewardsService } from 'rewards/rewards.service';
import { StatsService } from 'stats/stats.service';
import { StorageService } from 'storage/storage.service';
import { InvalidProfileError } from './errors/invalid-profile.error';
import { ParseUserIdPipe } from './parser/parse-user-id.pipe';
import { ParsedUserId } from './parser/parsed-user-id';
import { ProfileService } from './profile/profile.service';
import { UsernameType } from './profile/profile.types';
import { QueryUsername } from './profile/query-username.decorator';
import { UserService } from './user.service';

@Controller('user')
export class UserController {
  private readonly logger = new Logger(UserController.name);

  constructor(
    private userService: UserService,
    private collectionsService: CollectionsService,
    private storageService: StorageService,
    private statsService: StatsService,
    private profileService: ProfileService,
    private nftsService: NftsService,
    private curationService: CurationService,
    private rewardsService: RewardsService
  ) {}

  @Get('/:userId/rewards')
  @ApiOperation({ summary: 'Get user rewards' })
  @ApiOkResponse({ description: ResponseDescription.Success, type: UserRewardsDto })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError })
  async getRewards(@ParamUserId('userId', ParseUserIdPipe) user: ParsedUserId) {
    const rewards = await this.rewardsService.getUserRewards(user.userChainId, user);
    if (!rewards) {
      throw new NotFoundException(`No rewards found for chain: ${user.userChainId}`);
    }
    return rewards;
  }

  @Get('/:userId/checkUsername')
  @ApiOperation({
    description: 'Check if a username if valid and available',
    tags: [ApiTag.User]
  })
  @ApiQuery({
    name: 'username',
    description: 'The username to check',
    required: true,
    type: String
  })
  @ApiOkResponse({ description: ResponseDescription.Success, type: ValidateUsernameResponseDto })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError })
  @Throttle(10, 2)
  async checkUsername(
    @ParamUserId('userId', ParseUserIdPipe) user: ParsedUserId,
    @QueryUsername('username') usernameObj: UsernameType
  ): Promise<ValidateUsernameResponseDto> {
    let reason = usernameObj.isValid ? '' : usernameObj.reason;
    let isAvailable = true;

    if (usernameObj.isValid) {
      isAvailable = await this.profileService.isAvailable(usernameObj.username, user.userAddress);
      if (!isAvailable) {
        reason = 'Username is already taken';
      }
    }

    const canClaim = usernameObj.isValid && isAvailable;

    if (canClaim) {
      return {
        username: usernameObj.username,
        valid: true
      };
    }

    const suggestions = await this.profileService.getSuggestions(usernameObj.username);

    return {
      username: usernameObj.username,
      valid: false,
      reason,
      suggestions
    };
  }

  @Get('/:userId/collections')
  @ApiOperation({
    description: "Get a user's collections",
    tags: [ApiTag.User, ApiTag.Collection]
  })
  @ApiParamUserId('userId')
  @ApiOkResponse({ description: ResponseDescription.Success })
  @ApiBadRequestResponse({ description: ResponseDescription.BadRequest, type: ErrorResponseDto })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError, type: ErrorResponseDto })
  @UseInterceptors(new CacheControlInterceptor({ maxAge: 30 }))
  async getCollections(
    @ParamUserId('userId', ParseUserIdPipe) user: ParsedUserId,
    @Query() filters: UserCollectionsQuery
  ): Promise<UserCollectionsResponse> {
    const data = await this.userService.getCollections(user, filters);
    return data;
  }

  @Get('/:userId/nfts')
  @ApiOperation({
    description: "Get a user's NFTs. Optionally, filter by a user's nfts with orders",
    tags: [ApiTag.User, ApiTag.Nft]
  })
  @ApiParamUserId('userId')
  @ApiOkResponse({ description: ResponseDescription.Success, type: NftArrayDto })
  @ApiBadRequestResponse({ description: ResponseDescription.BadRequest, type: ErrorResponseDto })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError, type: ErrorResponseDto })
  @UseInterceptors(new CacheControlInterceptor({ maxAge: 30 }))
  async getNfts(
    @ParamUserId('userId', ParseUserIdPipe) user: ParsedUserId,
    @Query() filters: UserNftsQueryDto
  ): Promise<ExternalNftArrayDto> {
    const nfts = await this.userService.getNfts(user, filters);
    const externalNfts = this.nftsService.isSupported(nfts.data);
    return {
      ...nfts,
      data: externalNfts
    };
  }

  @Get('/:userId')
  @ApiOperation({
    description: 'Get a user by their id',
    tags: [ApiTag.User]
  })
  @ApiParamUserId('userId')
  @ApiOkResponse({ description: ResponseDescription.Success, type: UserProfileDto })
  @ApiNotFoundResponse({ description: ResponseDescription.NotFound })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError })
  async getUserProfile(@ParamUserId('userId', ParseUserIdPipe) user: ParsedUserId): Promise<UserProfileDto> {
    const userProfile = await this.userService.getProfile(user);
    if (userProfile === null) {
      return {
        address: user.userAddress,
        displayName: '',
        username: '',
        bio: '',
        profileImage: '',
        bannerImage: '',
        discordUsername: '',
        twitterUsername: '',
        instagramUsername: '',
        facebookUsername: '',
        createdAt: NaN,
        updatedAt: NaN
      };
    }

    return userProfile;
  }

  @Put('/:userId')
  @Auth(SiteRole.User, ApiRole.Guest, 'userId')
  @ApiOperation({
    description: "Update a user's profile",
    tags: [ApiTag.User]
  })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiParamUserId('userId')
  @ApiNoContentResponse({ description: ResponseDescription.Success })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError })
  async updateProfile(
    @ParamUserId('userId', ParseUserIdPipe) user: ParsedUserId,
    @Body() data: PartialUpdateUserProfileDto
  ): Promise<void> {
    const profile: Partial<UserProfileDto> = {
      ...data
    };

    try {
      await this.profileService.updateProfile(user, profile);
    } catch (err) {
      if (err instanceof InvalidProfileError) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }

    return;
  }

  @Put('/:userId/images')
  @Auth(SiteRole.User, ApiRole.Guest, 'userId')
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'profileImage', maxCount: 1 },
      { name: 'bannerImage', maxCount: 1 }
    ])
  )
  @ApiOperation({
    description: 'Update user images',
    tags: [ApiTag.User]
  })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiParamUserId('userId')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    type: UpdateUserProfileImagesDto
  })
  @ApiNoContentResponse({ description: ResponseDescription.Success })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError })
  async uploadImages(
    @ParamUserId('userId', ParseUserIdPipe) user: ParsedUserId,
    @Body() data: DeleteUserProfileImagesDto,
    @UploadedFiles()
    files?: UserProfileImagesDto
  ): Promise<void> {
    const profile: Partial<UserProfileDto> & DeleteUserProfileImagesDto = {
      ...data
    };

    const profileImage = files?.profileImage?.[0];
    if (profileImage && profileImage.buffer.byteLength > 0) {
      const image = await this.storageService.saveImage(profileImage.originalname, {
        contentType: profileImage.mimetype,
        data: profileImage.buffer
      });
      if (!image) {
        throw new Error('Failed to save profile image');
      }
      profile.profileImage = image.publicUrl();
    }

    const bannerImage = files?.bannerImage?.[0];
    if (bannerImage && bannerImage.buffer.byteLength > 0) {
      const image = await this.storageService.saveImage(bannerImage.originalname, {
        contentType: bannerImage.mimetype,
        data: bannerImage.buffer
      });
      if (!image) {
        throw new Error('Failed to save banner image');
      }
      profile.bannerImage = image.publicUrl();
    }

    try {
      await this.profileService.updateProfileImages(user, profile);
    } catch (err) {
      if (err instanceof InvalidProfileError) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }

    return;
  }

  @Put(':userId/collections/:collectionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Auth(SiteRole.User, ApiRole.Guest, 'userId')
  @UseInterceptors(FileInterceptor('profileImage'))
  @ApiOperation({
    description: 'Update collection information',
    tags: [ApiTag.User, ApiTag.Collection]
  })
  @ApiParamCollectionId('collectionId')
  @ApiConsumes('multipart/form-data', 'application/json')
  @ApiHeader({
    name: 'Content-Type',
    required: false
  })
  @ApiNoContentResponse({ description: ResponseDescription.Success })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError })
  async updateCollection(
    @ParamUserId('userId', ParseUserIdPipe) { userAddress }: ParsedUserId,
    @ParamCollectionId('collectionId', ParseCollectionIdPipe) collection: ParsedCollectionId,
    @Body() { metadata = {}, deleteProfileImage }: UpdateCollectionDto,
    @UploadedFile() profileImage: Express.Multer.File
  ) {
    if (!(await this.collectionsService.canModify(userAddress, collection))) {
      throw new UnauthorizedException();
    }

    if (deleteProfileImage) {
      metadata.profileImage = '';
    }

    // Upload image if we're submitting a file.
    // Note that we can't both update the collection and update the image at the same time.
    // This is done intentionally to keep things simpler.
    if (profileImage && profileImage.size > 0) {
      const image = await this.storageService.saveImage(profileImage.originalname, {
        contentType: profileImage.mimetype,
        data: profileImage.buffer
      });

      if (image) {
        metadata.profileImage = image.publicUrl();
      }
    }

    await this.collectionsService.setCollectionMetadata(collection, instanceToPlain(metadata) as CollectionMetadata);

    // Update stats in the background (do NOT await this call).
    this.statsService.refreshSocialsStats(collection.ref).catch((err) => this.logger.error(err));
  }

  @Get(':userId/collections/:collectionId/permissions')
  @Auth(SiteRole.User, ApiRole.Guest, 'userId')
  @ApiOperation({
    description: "Get the user's permissions for this collection",
    tags: [ApiTag.User, ApiTag.Collection]
  })
  @ApiParamUserId('userId')
  @ApiParamCollectionId('collectionId')
  @ApiOkResponse({ description: ResponseDescription.Success, type: UserCollectionPermissions })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError })
  @UseInterceptors(new CacheControlInterceptor({ maxAge: 60 * 5 }))
  async getCollectionPermissions(
    @ParamUserId('userId', ParseUserIdPipe) { userAddress }: ParsedUserId,
    @ParamCollectionId('collectionId', ParseCollectionIdPipe) collection: ParsedCollectionId
  ): Promise<UserCollectionPermissions> {
    return { canModify: await this.collectionsService.canModify(userAddress, collection) };
  }

  @Get(':userId/curated')
  @ApiOperation({
    description: "Get the specified user's curated collections",
    tags: [ApiTag.User, ApiTag.Collection, ApiTag.Curation]
  })
  @ApiOkResponse({ description: ResponseDescription.Success, type: UserCuratedCollectionsDto })
  @ApiParamUserId('userId')
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError })
  getCurated(
    @ParamUserId('userId', ParseUserIdPipe) user: ParsedUserId,
    @Query() query: CuratedCollectionsQuery
  ): Promise<UserCuratedCollectionsDto> {
    return this.userService.getAllCurated(user, query);
  }

  @Get(':userId/curatedQuota')
  @ApiOperation({
    description: "Get the user's available votes for curation",
    tags: [ApiTag.User, ApiTag.Collection, ApiTag.Curation]
  })
  @ApiParamUserId('userId')
  @ApiOkResponse({ description: ResponseDescription.Success })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError })
  async getCurationQuota(@ParamUserId('userId', ParseUserIdPipe) user: ParsedUserId): Promise<CurationQuotaDto> {
    const quota = await this.curationService.getUserCurationQuota(user);
    return quota;
  }

  @Get(':userId/followingCollections')
  @Auth(SiteRole.User, ApiRole.Guest, 'userId')
  @ApiOperation({
    description: 'Get the collections a user is following',
    tags: [ApiTag.User]
  })
  @ApiOkResponse({ description: ResponseDescription.Success, type: UserFollowingCollectionsArrayDto })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError })
  async getCollectionsBeingFollowed(
    @ParamUserId('userId', ParseUserIdPipe) user: ParsedUserId
  ): Promise<UserFollowingCollectionsArrayDto> {
    const collections = await this.userService.getCollectionsBeingFollowed(user);

    const response: UserFollowingCollectionsArrayDto = {
      data: collections,
      hasNextPage: false,
      cursor: ''
    };
    return response;
  }

  @Post(':userId/followingCollections')
  @Auth(SiteRole.User, ApiRole.Guest, 'userId')
  @ApiOperation({
    description: 'Follow a collection for a user',
    tags: [ApiTag.User]
  })
  @ApiCreatedResponse({ description: ResponseDescription.Success })
  @ApiNotFoundResponse({ description: ResponseDescription.NotFound })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError })
  async followCollection(
    @ParamUserId('userId', ParseUserIdPipe) user: ParsedUserId,
    @Body() payload: UserFollowingCollectionPostPayload
  ): Promise<string> {
    try {
      await this.userService.followCollection(user, payload);
    } catch (err) {
      if (err instanceof InvalidCollectionError) {
        throw new NotFoundException(err.message);
      }
      throw err;
    }
    return '';
  }

  @Delete(':userId/followingCollections')
  @Auth(SiteRole.User, ApiRole.Guest, 'userId')
  @ApiOperation({
    description: 'Unfollow a collection for a user',
    tags: [ApiTag.User]
  })
  @ApiCreatedResponse({ description: ResponseDescription.Success })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError })
  @ApiNotFoundResponse({ description: ResponseDescription.NotFound })
  async unfollowCollection(
    @ParamUserId('userId', ParseUserIdPipe) user: ParsedUserId,
    @Body() payload: UserFollowingCollectionDeletePayload
  ): Promise<string> {
    try {
      await this.userService.unfollowCollection(user, payload);
    } catch (err) {
      if (err instanceof InvalidCollectionError) {
        throw new NotFoundException(err.message);
      }
      throw err;
    }
    return '';
  }

  @Get(':userId/followingUsers')
  @Auth(SiteRole.User, ApiRole.Guest, 'userId')
  @ApiOperation({
    description: 'Get the users that the user is following',
    tags: [ApiTag.User]
  })
  @ApiOkResponse({ description: ResponseDescription.Success, type: UserFollowingUsersArrayDto })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError })
  async getUsersBeingFollowed(
    @ParamUserId('userId', ParseUserIdPipe) user: ParsedUserId
  ): Promise<UserFollowingUsersArrayDto> {
    const users = await this.userService.getUsersBeingFollowed(user);

    const response: UserFollowingUsersArrayDto = {
      data: users,
      hasNextPage: false,
      cursor: ''
    };
    return response;
  }

  @Post(':userId/followingUsers')
  @Auth(SiteRole.User, ApiRole.Guest, 'userId')
  @ApiOperation({
    description: 'Follow a user for a user',
    tags: [ApiTag.User]
  })
  @ApiCreatedResponse({ description: ResponseDescription.Success })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError })
  @ApiNotFoundResponse({ description: ResponseDescription.NotFound })
  async followUser(
    @ParamUserId('userId', ParseUserIdPipe) user: ParsedUserId,
    @Body() payload: UserFollowingUserPostPayload
  ): Promise<string> {
    try {
      await this.userService.followUser(user, payload);
    } catch (err) {
      if (err instanceof InvalidUserError) {
        throw new NotFoundException(err.message);
      }
      throw err;
    }
    return '';
  }

  @Delete(':userId/followingUsers')
  @Auth(SiteRole.User, ApiRole.Guest, 'userId')
  @ApiOperation({
    description: 'Unfollow a user for a user',
    tags: [ApiTag.User]
  })
  @ApiCreatedResponse({ description: ResponseDescription.Success })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError })
  @ApiNotFoundResponse({ description: ResponseDescription.NotFound })
  async unfollowUser(
    @ParamUserId('userId', ParseUserIdPipe) user: ParsedUserId,
    @Body() payload: UserFollowingUserDeletePayload
  ): Promise<string> {
    try {
      await this.userService.unfollowUser(user, payload);
    } catch (err) {
      if (err instanceof InvalidUserError) {
        throw new NotFoundException(err.message);
      }
      throw err;
    }
    return '';
  }

  @Get(':userId/activity')
  @ApiOperation({
    description: 'Get the activity of a user',
    tags: [ApiTag.User]
  })
  @ApiParamUserId('userId')
  @ApiOkResponse({ description: ResponseDescription.Success, type: NftActivityArrayDto })
  @ApiNotFoundResponse({ description: ResponseDescription.NotFound })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError })
  @UseInterceptors(new CacheControlInterceptor({ maxAge: 60 * 3 }))
  async getActivity(
    @ParamUserId('userId', ParseUserIdPipe) user: ParsedUserId,
    @Query() query: UserActivityQueryDto
  ): Promise<UserActivityArrayDto> {
    const activity = await this.userService.getActivity(user, query);
    return activity;
  }
}
