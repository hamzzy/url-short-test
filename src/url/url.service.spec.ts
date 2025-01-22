import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { UrlService } from './url.service';
import { RedisClient } from '../utils/redis-client';
import { L1Cache } from '../utils/l1-cache';
import { CircuitBreaker } from '../utils/circuit-breaker';
import { AsyncAnalytics } from '../utils/async-analytics';
import { EnhancedBloomFilter } from '../utils/bloom-filter';
import { ClickData } from './entities/click-data.entity';
import { ShortenUrlDto } from './dto/shorten-url.dto';
import {
  ShortUrlNotFoundException,
  DuplicateShortCodeException,
  InvalidUrlException,
  AnalyticsException,
} from './exceptions/url.exceptions';

describe('UrlService', () => {
  let service: UrlService;
  let redisClient: jest.Mocked<RedisClient>;
  let l1Cache: jest.Mocked<L1Cache>;
  let circuitBreaker: jest.Mocked<CircuitBreaker>;
  let asyncAnalytics: jest.Mocked<AsyncAnalytics>;
  let cacheManager: jest.Mocked<Cache>;
  let configService: jest.Mocked<ConfigService>;

  const mockRedisClient = {
    set: jest.fn(),
    get: jest.fn(),
    exists: jest.fn(),
    expire: jest.fn(),
    lrange: jest.fn(),
  };

  const mockL1Cache = {
    has: jest.fn(),
    get: jest.fn(),
    set: jest.fn(),
  };

  const mockCircuitBreaker = {
    execute: jest.fn(),
  };

  const mockAsyncAnalytics = {
    publishBatch: jest.fn(),
  };

  const mockCacheManager = {
    get: jest.fn(),
    set: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UrlService,
        {
          provide: RedisClient,
          useValue: mockRedisClient,
        },
        {
          provide: L1Cache,
          useValue: mockL1Cache,
        },
        {
          provide: CircuitBreaker,
          useValue: mockCircuitBreaker,
        },
        {
          provide: AsyncAnalytics,
          useValue: mockAsyncAnalytics,
        },
        {
          provide: CACHE_MANAGER,
          useValue: mockCacheManager,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<UrlService>(UrlService);
    redisClient = module.get(RedisClient);
    l1Cache = module.get(L1Cache);
    circuitBreaker = module.get(CircuitBreaker);
    asyncAnalytics = module.get(AsyncAnalytics);
    cacheManager = module.get(CACHE_MANAGER);
    configService = module.get(ConfigService);

    // Reset all mocks before each test
    jest.clearAllMocks();
  });

  describe('shortenUrl', () => {
    const shortenUrlDto: ShortenUrlDto = {
      url: 'https://example.com',
      customCode: 'custom123',
      ttlMinutes: 60,
    };

    it('should successfully create a short URL', async () => {
      mockRedisClient.exists.mockResolvedValue(0);
      mockCircuitBreaker.execute.mockResolvedValue(
        'http://short.url/custom123',
      );
      mockConfigService.get.mockReturnValue('http://short.url');

      const result = await service.shortenUrl(shortenUrlDto);

      expect(result).toHaveProperty('short_url');
      expect(mockRedisClient.set).toHaveBeenCalled();
      expect(mockRedisClient.expire).toHaveBeenCalledWith(
        'url:custom123',
        3600,
      );
    });

    it('should throw DuplicateShortCodeException for existing custom code', async () => {
      mockRedisClient.exists.mockResolvedValue(1);

      await expect(service.shortenUrl(shortenUrlDto)).rejects.toThrow(
        DuplicateShortCodeException,
      );
    });

    it('should generate random code when custom code is not provided', async () => {
      const dtoWithoutCustomCode = { url: 'https://example.com' };
      mockCircuitBreaker.execute.mockResolvedValue('http://short.url/abc123');

      const result = await service.shortenUrl(dtoWithoutCustomCode);

      expect(result).toHaveProperty('short_url');
      expect(result.short_url).toMatch(/http:\/\/short\.url\/[a-zA-Z0-9]{7}/);
    });
  });

  describe('getOriginalUrl', () => {
    const shortCode = 'abc123';
    const mockRequest = {
      headers: {
        'user-agent': 'test-agent',
        referer: 'test-referer',
      },
      ip: '127.0.0.1',
    };

    it('should return URL from L1 cache if available', async () => {
      const cachedUrl = 'https://cached-example.com';
      mockL1Cache.has.mockReturnValue(true);
      mockL1Cache.get.mockReturnValue(cachedUrl);

      const result = await service.getOriginalUrl(shortCode, mockRequest);

      expect(result).toBe(cachedUrl);
      expect(mockRedisClient.get).not.toHaveBeenCalled();
    });

    it('should fetch and cache URL if not in L1 cache', async () => {
      const originalUrl = 'https://example.com';
      mockL1Cache.has.mockReturnValue(false);
      mockCircuitBreaker.execute.mockResolvedValue(originalUrl);
      mockConfigService.get.mockReturnValue(true);

      const result = await service.getOriginalUrl(shortCode, mockRequest);

      expect(result).toBe(originalUrl);
      expect(mockL1Cache.set).toHaveBeenCalled();
      expect(mockCacheManager.set).toHaveBeenCalled();
    });

    it('should throw ShortUrlNotFoundException for non-existent URL', async () => {
      mockL1Cache.has.mockReturnValue(false);
      mockCircuitBreaker.execute.mockRejectedValue(
        new Error('Short URL not found'),
      );

      await expect(
        service.getOriginalUrl(shortCode, mockRequest),
      ).rejects.toThrow(ShortUrlNotFoundException);
    });
  });

  describe('getAnalytics', () => {
    const shortCode = 'abc123';
    const query = { limit: 10, offset: 0 };

    it('should return click analytics successfully', async () => {
      const mockClicks = ['{"timestamp":"2023-01-01"}'];
      mockCircuitBreaker.execute.mockResolvedValue(mockClicks);

      const result = await service.getAnalytics(shortCode, query);

      expect(result).toHaveProperty('clicks');
      expect(Array.isArray(result.clicks)).toBe(true);
    });

    it('should handle empty analytics results', async () => {
      mockCircuitBreaker.execute.mockResolvedValue([]);

      const result = await service.getAnalytics(shortCode, query);

      expect(result.clicks).toHaveLength(0);
    });

    it('should throw AnalyticsException on Redis failure', async () => {
      mockCircuitBreaker.execute.mockRejectedValue(new Error('Redis error'));

      await expect(service.getAnalytics(shortCode, query)).rejects.toThrow(
        AnalyticsException,
      );
    });
  });

  describe('click data batching', () => {
    it('should batch click data and flush when batch size is reached', async () => {
      const shortCode = 'abc123';
      const mockRequest = {
        headers: { 'user-agent': 'test-agent' },
        ip: '127.0.0.1',
      };

      mockL1Cache.has.mockReturnValue(false);
      mockCircuitBreaker.execute.mockResolvedValue('https://example.com');

      // Trigger multiple clicks
      for (let i = 0; i < 11; i++) {
        await service.getOriginalUrl(shortCode, mockRequest);
      }

      expect(mockAsyncAnalytics.publishBatch).toHaveBeenCalled();
    });
  });
});
