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
  HttpException,
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
import * as NodeCache from 'node-cache';

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
      return shortUrl;
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw new HttpException(error.message || '', HttpStatus.BAD_REQUEST);
      }
      throw new HttpException(error.message || 'Failed to shorten URL', 400);
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
      const url = await this.urlService.getOriginalUrl(shortCode, req);
      return { url: url };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw new HttpException(
          error.message || 'Invalid or expired short code',
          HttpStatus.BAD_REQUEST,
        );
      }
      throw new HttpException(error.message, HttpStatus.NOT_FOUND);
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
  ): Promise<{ clicks: ClickData[] }> {
    if (!shortCode) {
      throw new BadRequestException('Short code is required');
    }

    try {
      const analytics = await this.urlService.getAnalytics(shortCode, query);
      return analytics;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new HttpException('url code not found', HttpStatus.NOT_FOUND);
      }
      throw new HttpException(
        error.message || 'Failed to retrieve analytics',
        HttpStatus.NOT_FOUND,
      );
    }
  }
}
