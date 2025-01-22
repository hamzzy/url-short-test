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
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { UrlService } from './url.service';
import {
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiParam,
  ApiQuery,
  ApiTags,
  ApiResponse,
} from '@nestjs/swagger';
import { ShortenUrlDto } from './dto/shorten-url.dto';
import { AnalyticsQueryDto } from './dto/analytics-query.dto';
import { ClickData } from './entities/click-data.entity';

@ApiTags('url')
@Controller()
export class UrlController {
  constructor(private readonly urlService: UrlService) {}

  @Post('shorten')
  @HttpCode(HttpStatus.CREATED)
  @ApiBody({ type: ShortenUrlDto })
  @ApiCreatedResponse({ description: 'Short URL created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid URL format' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async shortenUrl(@Body() shortenUrlDto: ShortenUrlDto) {
    try {
      if (!shortenUrlDto.url) {
        throw new BadRequestException('URL is required');
      }
      const shortUrl = await this.urlService.shortenUrl(shortenUrlDto);
      return { shortUrl, message: 'URL shortened successfully' };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to shorten URL');
    }
  }

  @Get(':shortCode')
  @ApiParam({ name: 'shortCode', description: 'Short code of the URL' })
  @ApiOkResponse({ description: 'Redirect to original URL' })
  @ApiResponse({ status: 404, description: 'Short code not found' })
  @Redirect()
  async redirectUrl(
    @Param('shortCode') shortCode: string,
    @Req() req: Request,
  ): Promise<{ url: string }> {
    if (!shortCode) {
      throw new BadRequestException('Short code is required');
    }

    try {
      const originalUrl = await this.urlService.getOriginalUrl(shortCode, req);
      return { url: originalUrl };
    } catch (error) {
      throw new NotFoundException('Invalid or expired short code');
    }
  }

  @Get('analytics/:shortCode')
  @ApiParam({ name: 'shortCode', description: 'Short code of the URL' })
  @ApiQuery({ name: 'limit', required: false, type: 'number' })
  @ApiQuery({ name: 'offset', required: false, type: 'number' })
  @ApiOkResponse({ description: 'Click analytics data', type: ClickData })
  @ApiResponse({ status: 404, description: 'Short code not found' })
  async getAnalytics(
    @Param('shortCode') shortCode: string,
    @Query() query: AnalyticsQueryDto,
  ) {
    if (!shortCode) {
      throw new BadRequestException('Short code is required');
    }

    try {
      const analytics = await this.urlService.getAnalytics(shortCode, query);
      return { 
        clicks: analytics.clicks,
        totalClicks: analytics.clicks.length,
        shortCode 
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to retrieve analytics');
    }
  }
}