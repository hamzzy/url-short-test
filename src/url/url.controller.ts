import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Redirect,
  Query,
  HttpCode,
  HttpStatus,
  Req,
} from '@nestjs/common';
import { UrlService } from './url.service';
import {
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { ShortenUrlDto } from './dto/shorten-url.dto';
import { AnalyticsQueryDto } from './dto/analytics-query.dto';
import { ClickData } from './entities/click-data.entity';
import { RateLimit } from 'src/utils/rate-limiter';

@ApiTags('url')
@Controller()
export class UrlController {
  constructor(private readonly urlService: UrlService) {}

  @Post('shorten')
  @HttpCode(HttpStatus.CREATED)
  @ApiBody({ type: ShortenUrlDto })
  @ApiCreatedResponse({ description: 'Short url created' })
  @RateLimit()
  async shortenUrl(@Body() shortenUrlDto: ShortenUrlDto): Promise<any> {
    return this.urlService.shortenUrl(shortenUrlDto);
  }

  @Get(':shortCode')
  @ApiParam({ name: 'shortCode', description: 'Short code of the URL' })
  @ApiOkResponse({ description: 'Redirect to original URL' })
  @Redirect()
  async redirectUrl(
    @Param('shortCode') shortCode: string,
    @Req() req: Request,
  ): Promise<{ url: string }> {
    const originalUrl = await this.urlService.getOriginalUrl(shortCode, req);
    return { url: originalUrl };
  }

  @Get('analytics/:shortCode')
  @ApiParam({ name: 'shortCode', description: 'Short code of the URL' })
  @ApiQuery({ name: 'limit', required: false, type: 'number' })
  @ApiQuery({ name: 'offset', required: false, type: 'number' })
  @ApiOkResponse({ description: 'Click data' })
  async getAnalytics(
    @Param('shortCode') shortCode: string,
    @Query() query: AnalyticsQueryDto,
  ): Promise<{ clicks: ClickData[] }> {
    return this.urlService.getAnalytics(shortCode, query);
  }
}
