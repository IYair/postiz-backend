import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { Organization } from '@prisma/client';
import { CheckPolicies } from '@gitroom/backend/services/auth/permissions/permissions.ability';
import { OrganizationService } from '@gitroom/nestjs-libraries/database/prisma/organizations/organization.service';
import { ImagePresetRepository } from '@gitroom/nestjs-libraries/database/prisma/organizations/image-preset.repository';
import { AddTeamMemberDto } from '@gitroom/nestjs-libraries/dtos/settings/add.team.member.dto';
import { ShortlinkPreferenceDto } from '@gitroom/nestjs-libraries/dtos/settings/shortlink-preference.dto';
import { ImagePromptExtraDto } from '@gitroom/nestjs-libraries/dtos/settings/image-prompt-extra.dto';
import { ImagePresetDto } from '@gitroom/nestjs-libraries/dtos/settings/image-preset.dto';
import { BrandKitDto } from '@gitroom/nestjs-libraries/dtos/settings/brand-kit.dto';
import { ApiTags } from '@nestjs/swagger';
import { AuthorizationActions, Sections } from '@gitroom/backend/services/auth/permissions/permission.exception.class';

@ApiTags('Settings')
@Controller('/settings')
export class SettingsController {
  constructor(
    private _organizationService: OrganizationService,
    private _imagePresetRepository: ImagePresetRepository
  ) {}

  @Get('/team')
  @CheckPolicies(
    [AuthorizationActions.Create, Sections.TEAM_MEMBERS],
    [AuthorizationActions.Create, Sections.ADMIN]
  )
  async getTeam(@GetOrgFromRequest() org: Organization) {
    return this._organizationService.getTeam(org.id);
  }

  @Post('/team')
  @CheckPolicies(
    [AuthorizationActions.Create, Sections.TEAM_MEMBERS],
    [AuthorizationActions.Create, Sections.ADMIN]
  )
  async inviteTeamMember(
    @GetOrgFromRequest() org: Organization,
    @Body() body: AddTeamMemberDto
  ) {
    return this._organizationService.inviteTeamMember(org.id, body);
  }

  @Delete('/team/:id')
  @CheckPolicies(
    [AuthorizationActions.Create, Sections.TEAM_MEMBERS],
    [AuthorizationActions.Create, Sections.ADMIN]
  )
  deleteTeamMember(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string
  ) {
    return this._organizationService.deleteTeamMember(org, id);
  }

  @Get('/shortlink')
  async getShortlinkPreference(@GetOrgFromRequest() org: Organization) {
    return this._organizationService.getShortlinkPreference(org.id);
  }

  @Post('/shortlink')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async updateShortlinkPreference(
    @GetOrgFromRequest() org: Organization,
    @Body() body: ShortlinkPreferenceDto
  ) {
    return this._organizationService.updateShortlinkPreference(
      org.id,
      body.shortlink
    );
  }

  @Get('/image-prompt-extra')
  async getImagePromptExtra(@GetOrgFromRequest() org: Organization) {
    return this._organizationService.getImagePromptExtra(org.id);
  }

  @Post('/image-prompt-extra')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async updateImagePromptExtra(
    @GetOrgFromRequest() org: Organization,
    @Body() body: ImagePromptExtraDto
  ) {
    return this._organizationService.updateImagePromptExtra(
      org.id,
      body.imagePromptExtra ?? null
    );
  }

  @Get('/image-presets')
  listImagePresets(@GetOrgFromRequest() org: Organization) {
    return this._imagePresetRepository.list(org.id);
  }

  @Post('/image-presets')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  createImagePreset(
    @GetOrgFromRequest() org: Organization,
    @Body() body: ImagePresetDto
  ) {
    return this._imagePresetRepository.create(org.id, body);
  }

  @Put('/image-presets/:id')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async updateImagePreset(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
    @Body() body: ImagePresetDto
  ) {
    // updateMany is used so the org scope is enforced in the where clause.
    // It returns count=0 instead of throwing when the preset does not exist
    // or does not belong to the caller's org, so translate that into 404.
    const result = await this._imagePresetRepository.update(org.id, id, body);
    if (result.count === 0) {
      throw new NotFoundException('Image preset not found');
    }
    return result;
  }

  @Delete('/image-presets/:id')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async deleteImagePreset(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string
  ) {
    const result = await this._imagePresetRepository.delete(org.id, id);
    if (result.count === 0) {
      throw new NotFoundException('Image preset not found');
    }
    return result;
  }

  @Get('/brand-kit')
  getBrandKit(@GetOrgFromRequest() org: Organization) {
    return this._organizationService.getBrandKit(org.id);
  }

  @Post('/brand-kit')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  updateBrandKit(
    @GetOrgFromRequest() org: Organization,
    @Body() body: BrandKitDto
  ) {
    return this._organizationService.updateBrandKit(org.id, body);
  }
}
