import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { Organization } from '@prisma/client';
import { ToolsService } from '@gitroom/nestjs-libraries/tools/tools.service';
import { HolidaysService } from '@gitroom/nestjs-libraries/tools/holidays/holidays.service';
import { OembedService } from '@gitroom/nestjs-libraries/tools/oembed.service';
import { ToolKey } from '@gitroom/nestjs-libraries/tools/tools.registry';
import { GenerateToolDto } from '@gitroom/nestjs-libraries/dtos/tools/generate.tool.dto';
import { GetHolidaysDto } from '@gitroom/nestjs-libraries/dtos/tools/get.holidays.dto';

@Controller('/tools')
export class ToolsController {
  constructor(
    private _toolsService: ToolsService,
    private _holidaysService: HolidaysService,
    private _oembedService: OembedService
  ) {}

  @Post('/generate/:toolKey')
  generate(
    @GetOrgFromRequest() org: Organization,
    @Param('toolKey') toolKey: ToolKey,
    @Body() body: GenerateToolDto
  ) {
    return this._toolsService.generate(org.id, toolKey, body);
  }

  @Get('/holidays')
  holidays(@GetOrgFromRequest() org: Organization, @Query() query: GetHolidaysDto) {
    return this._holidaysService.getHolidays(org.id, query.month, query.year, query.country);
  }

  @Get('/tweet-oembed')
  tweet(@Query('url') url: string) {
    return this._oembedService.getTweet(url);
  }
}
