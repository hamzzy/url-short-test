import { Test, TestingModule } from '@nestjs/testing';
import { UrlController } from './url.controller';
import { UrlService } from './url.service';
import {
  BadRequestException,
  HttpException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ShortenUrlDto } from './dto/shorten-url.dto';
import { AnalyticsQueryDto } from './dto/analytics-query.dto';
import { ClickData } from './entities/click-data.entity';

describe('UrlController', () => {
  let controller: UrlController;
  let service: UrlService;

  const mockUrlService = {
    shortenUrl: jest.fn(),
    getOriginalUrl: jest.fn(),
    getAnalytics: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UrlController],
      providers: [
        {
          provide: UrlService,
          useValue: mockUrlService,
        },
      ],
    }).compile();

    controller = module.get<UrlController>(UrlController);
    service = module.get<UrlService>(UrlService);
  });

  describe('shortenUrl', () => {
    it('should return a shortened URL on success', async () => {
      const shortenUrlDto: ShortenUrlDto = { url: 'http://example.com' };
      const result = 'http://short.ly/abc123';

      mockUrlService.shortenUrl.mockResolvedValue(result);

      const response = await controller.shortenUrl(shortenUrlDto);
      expect(response).toBe(result);
    });

    it('should throw BadRequestException if URL is missing', async () => {
      const shortenUrlDto: ShortenUrlDto = { url: '' };
      try {
        await controller.shortenUrl(shortenUrlDto);
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
      }
    });

    it('should handle internal server error', async () => {
      const shortenUrlDto: ShortenUrlDto = { url: 'http://example.com' };
      const errorMessage = 'Internal error';
      mockUrlService.shortenUrl.mockRejectedValue(new Error(errorMessage));

      try {
        await controller.shortenUrl(shortenUrlDto);
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        expect(error.message).toContain('Internal error');
      }
    });
  });

  describe('redirectUrl', () => {
    it('should redirect to the original URL', async () => {
      const shortCode = 'abc123';
      const originalUrl = 'http://example.com';
      const req = {} as Request;

      mockUrlService.getOriginalUrl.mockResolvedValue(originalUrl);

      const response = await controller.redirectUrl(shortCode, req);
      expect(response.url).toBe(originalUrl);
    });

    it('should throw BadRequestException if short code is missing', async () => {
      try {
        await controller.redirectUrl('', {} as Request);
      } catch (error) {
        expect(error).toBeInstanceOf(BadRequestException);
      }
    });

    it('should throw NotFoundException if short code is invalid', async () => {
      const shortCode = 'abc123';
      const req = {} as Request;
      mockUrlService.getOriginalUrl.mockRejectedValue(new NotFoundException());

      try {
        await controller.redirectUrl(shortCode, req);
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        expect(error.getStatus()).toBe(404);
      }
    });
  });

  describe('getAnalytics', () => {
    it('should return click analytics data', async () => {
      const shortCode = 'abc123';
      const query: AnalyticsQueryDto = { limit: 10, offset: 0 };
      const analytics: ClickData[] = [
        {
          ip_address: '127.0.0.1',
          device_type: 'Mozilla',
          timestamp: new Date().toISOString(),
          user_agent: '',
          short_code: '',
          click_id: '',
          referer: undefined,
          timestamp_unix: 0,
          country: undefined,
        },
      ];

      mockUrlService.getAnalytics.mockResolvedValue({ clicks: analytics });

      const response = await controller.getAnalytics(shortCode, query);
      expect(response.clicks).toEqual(analytics);
    });

    it('should throw BadRequestException if short code is missing', async () => {
      try {
        await controller.getAnalytics('', {} as AnalyticsQueryDto);
      } catch (error) {
        expect(error).toBeInstanceOf(BadRequestException);
      }
    });

    it('should throw NotFoundException if analytics not found', async () => {
      const shortCode = 'abc123';
      const query: AnalyticsQueryDto = { limit: 10, offset: 0 };
      mockUrlService.getAnalytics.mockRejectedValue(new NotFoundException());

      try {
        await controller.getAnalytics(shortCode, query);
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        expect(error.getStatus()).toBe(404);
      }
    });
  });
});
