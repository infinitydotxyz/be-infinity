import { CollectionMetadata } from '@infinityxyz/lib/types/core';
import { RankingQueryDto, UpdateCollectionDto } from '@infinityxyz/lib/types/dto/collections';
import { ExternalNftArrayDto, NftActivityArrayDto, NftArrayDto } from '@infinityxyz/lib/types/dto/collections/nfts';
import { CollectionStatsArrayResponseDto } from '@infinityxyz/lib/types/dto/stats';
import {
  DeleteUserProfileImagesDto,
  PartialUpdateUserProfileDto,
  UpdateUserProfileImagesDto,
  UserActivityArrayDto,
  UserActivityQueryDto,
  UserCollectionPermissions,
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
import { ApiParamUserId, ParamUserId } from 'auth/param-user-id.decorator';
import { UserAuth } from 'auth/user-auth.decorator';
import { instanceToPlain } from 'class-transformer';
import { ParseCollectionIdPipe, ParsedCollectionId } from 'collections/collection-id.pipe';
import CollectionsService from 'collections/collections.service';
import { NftsService } from 'collections/nfts/nfts.service';
import { ApiTag } from 'common/api-tags';
import { ApiParamCollectionId, ParamCollectionId } from 'common/decorators/param-collection-id.decorator';
import { ErrorResponseDto } from 'common/dto/error-response.dto';
import { InvalidCollectionError } from 'common/errors/invalid-collection.error';
import { InvalidUserError } from 'common/errors/invalid-user.error';
import { CacheControlInterceptor } from 'common/interceptors/cache-control.interceptor';
import { ResponseDescription } from 'common/response-description';
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
    private nftsService: NftsService
  ) {}

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
  @UserAuth('userId')
  @ApiOkResponse({ description: ResponseDescription.Success, type: ValidateUsernameResponseDto })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError })
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
        updatedAt: NaN,
        totalCurated: NaN,
        totalCuratedVotes: NaN
      };
    }

    return userProfile;
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
  @UseInterceptors(new CacheControlInterceptor({ maxAge: 60 * 2 }))
  async getNfts(
    @ParamUserId('userId', ParseUserIdPipe) user: ParsedUserId,
    @Query() filters: UserNftsQueryDto
  ): Promise<ExternalNftArrayDto> {
    let nfts: NftArrayDto;
    if (
      filters.orderType !== undefined ||
      filters.maxPrice !== undefined ||
      filters.minPrice !== undefined ||
      filters.orderBy !== undefined
    ) {
      nfts = await this.userService.getUserNftsWithOrders(user, filters);
    } else {
      nfts = await this.userService.getNfts(user, filters);
    }

    const externalNfts = this.nftsService.isSupported(nfts.data);

    return {
      ...nfts,
      data: externalNfts
    };
  }

  @Put('/:userId')
  @UserAuth('userId')
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

  @Get(':userId/watchlist')
  @ApiOperation({
    description: "Get a user's watchlist",
    tags: [ApiTag.User, ApiTag.Stats]
  })
  @UserAuth('userId')
  @ApiOkResponse({ description: ResponseDescription.Success, type: CollectionStatsArrayResponseDto })
  @ApiInternalServerErrorResponse({ description: ResponseDescription.InternalServerError })
  async getWatchlist(
    @ParamUserId('userId', ParseUserIdPipe) user: ParsedUserId,
    @Query() query: RankingQueryDto
  ): Promise<CollectionStatsArrayResponseDto> {
    const watchlist = await this.userService.getWatchlist(user, query);

    const response: CollectionStatsArrayResponseDto = {
      data: watchlist ?? [],
      hasNextPage: false,
      cursor: ''
    };

    return response;
  }

  @Put(':userId/collections/:collectionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UserAuth('userId')
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
    this.statsService.getCurrentSocialsStats(collection.ref).catch((err) => this.logger.error(err));
  }

  @Get(':userId/collections/:collectionId/permissions')
  @UserAuth('userId')
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

  @Get(':userId/followingCollections')
  @UserAuth('userId')
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
  @UserAuth('userId')
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
  @UserAuth('userId')
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
  @UserAuth('userId')
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
  @UserAuth('userId')
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
  @UserAuth('userId')
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
