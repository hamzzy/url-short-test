import { Test, TestingModule } from '@nestjs/testing';
import { UrlController } from './url.controller';
import { UrlService } from './url.service';
import {
  BadRequestException,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ShortenUrlDto } from './dto/shorten-url.dto';
import { AnalyticsQueryDto } from './dto/analytics-query.dto';

describe('UrlController', () => {
  let controller: UrlController;
  let service: UrlService;

  // Mock data
  const mockShortUrl = {
    shortUrl: {
      shortUrl: 'http://short.url/abc123',
      message: 'URL shortened successfully',
    },
    message: 'URL shortened successfully',
  };

  const mockOriginalUrl = 'http://original.url';

  const mockAnalytics = {
    clicks: [
      {
        timestamp: new Date(),
        userAgent: 'test-agent',
        ipAddress: '127.0.0.1',
      },
    ],
  };

  // Mock service
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

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('shortenUrl', () => {
    const shortenUrlDto: ShortenUrlDto = { url: 'http://example.com' };

    it('should create a short URL successfully', async () => {
      mockUrlService.shortenUrl.mockResolvedValue(mockShortUrl);

      const result = await controller.shortenUrl(shortenUrlDto);
     console.log()
      expect(result).toEqual(mockShortUrl);
      expect(service.shortenUrl).toHaveBeenCalledWith(shortenUrlDto);
    });

    it('should throw BadRequestException when URL is missing', async () => {
      await expect(controller.shortenUrl({ url: '' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw InternalServerErrorException on service failure', async () => {
      mockUrlService.shortenUrl.mockRejectedValue(new Error());

      await expect(controller.shortenUrl(shortenUrlDto)).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  describe('redirectUrl', () => {
    const shortCode = 'abc123';
    const mockRequest = {} as Request;

    it('should redirect to original URL successfully', async () => {
      mockUrlService.getOriginalUrl.mockResolvedValue(mockOriginalUrl);

      const result = await controller.redirectUrl(shortCode, mockRequest);

      expect(result).toEqual({ url: mockOriginalUrl });
      expect(service.getOriginalUrl).toHaveBeenCalledWith(
        shortCode,
        mockRequest,
      );
    });

    it('should throw BadRequestException when short code is empty', async () => {
      await expect(controller.redirectUrl('', mockRequest)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw NotFoundException when short code is invalid', async () => {
      mockUrlService.getOriginalUrl.mockRejectedValue(new Error());

      await expect(
        controller.redirectUrl(shortCode, mockRequest),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getAnalytics', () => {
    const shortCode = 'abc123';
    const query: AnalyticsQueryDto = { limit: 10, offset: 0 };

    it('should return analytics data successfully', async () => {
      mockUrlService.getAnalytics.mockResolvedValue(mockAnalytics);

      const result = await controller.getAnalytics(shortCode, query);

      expect(result).toEqual({
        clicks: mockAnalytics.clicks,
        totalClicks: mockAnalytics.clicks.length,
        shortCode,
      });
      expect(service.getAnalytics).toHaveBeenCalledWith(shortCode, query);
    });

    it('should throw BadRequestException when short code is empty', async () => {
      await expect(controller.getAnalytics('', query)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw NotFoundException when service throws NotFoundException', async () => {
      mockUrlService.getAnalytics.mockRejectedValue(new NotFoundException());

      await expect(controller.getAnalytics(shortCode, query)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw InternalServerErrorException on other service errors', async () => {
      mockUrlService.getAnalytics.mockRejectedValue(new Error());

      await expect(controller.getAnalytics(shortCode, query)).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });
});
