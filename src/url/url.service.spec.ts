import { Test, TestingModule } from '@nestjs/testing';
import { UrlService } from './url.service';
import { RedisClient } from '../utils/redis-client';
import { ConfigService } from '@nestjs/config';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { L1Cache } from '../utils/l1-cache';
import { CircuitBreaker } from '../utils/circuit-breaker';
import { AsyncAnalytics } from '../utils/async-analytics';
import { ShortenUrlDto } from './dto/shorten-url.dto';
import { HttpException, HttpStatus } from '@nestjs/common';
import { ClickData } from './entities/click-data.entity';

describe('UrlService', () => {
  let service: UrlService;
  let redisClient: jest.Mocked<RedisClient>;
  let cacheManager: jest.Mocked<Cache>;
  let l1Cache: jest.Mocked<L1Cache>;
  let circuitBreaker: jest.Mocked<CircuitBreaker>;
  let asyncAnalytics: jest.Mocked<AsyncAnalytics>;
  let configService: jest.Mocked<ConfigService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UrlService,
        {
          provide: RedisClient,
          useValue: {
            exists: jest.fn(),
            set: jest.fn(),
            get: jest.fn(),
            expire: jest.fn(),
            lrange: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('http://localhost'),
          },
        },
        {
          provide: CACHE_MANAGER,
          useValue: {
            get: jest.fn(),
            set: jest.fn(),
          },
        },
        {
          provide: L1Cache,
          useValue: {
            has: jest.fn(),
            get: jest.fn(),
            set: jest.fn(),
          },
        },
        {
          provide: CircuitBreaker,
          useValue: {
            execute: jest.fn().mockImplementation((fn) => fn()),
          },
        },
        {
          provide: AsyncAnalytics,
          useValue: {
            publishBatch: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<UrlService>(UrlService);
    redisClient = module.get(RedisClient);
    cacheManager = module.get(CACHE_MANAGER);
    l1Cache = module.get(L1Cache);
    circuitBreaker = module.get(CircuitBreaker);
    asyncAnalytics = module.get(AsyncAnalytics);
    configService = module.get(ConfigService);
  });

  describe('shortenUrl', () => {
    it('should shorten a URL and return the short URL', async () => {
      const shortenUrlDto: ShortenUrlDto = {
        url: 'http://example.com',
        ttlMinutes: 10,
      };
      redisClient.set.mockResolvedValue(undefined);
      redisClient.expire.mockResolvedValue(undefined);

      const result = await service.shortenUrl(shortenUrlDto);

      expect(result).toHaveProperty('short_url');
      expect(redisClient.set).toHaveBeenCalledWith(
        expect.any(String),
        'http://example.com',
      );
      expect(redisClient.expire).toHaveBeenCalledWith(expect.any(String), 600);
    });
  });

  describe('getOriginalUrl', () => {
    it('should return the original URL from Redis and update caches', async () => {
      const shortCode = 'custom123';
      const mockRequest = {
        headers: {
          'user-agent': 'test-agent',
          'accept-language': 'en-US',
        },
        ip: '127.0.0.1',
      };

      l1Cache.has.mockReturnValue(false);
      cacheManager.get.mockResolvedValue(null);
      redisClient.get.mockResolvedValue('http://example.com');

      const result = await service.getOriginalUrl(shortCode, mockRequest);

      expect(result).toBe('http://example.com');
      expect(redisClient.get).toHaveBeenCalledWith(`url:${shortCode}`);
      expect(cacheManager.set).toHaveBeenCalledWith(
        `cache:${shortCode}`,
        'http://example.com',
        60,
      );
      expect(l1Cache.set).toHaveBeenCalledWith(
        `url:${shortCode}`,
        'http://example.com',
      );
    });

    it('should throw an error if the short URL is not found', async () => {
      const shortCode = 'nonexistent';
      const mockRequest = { headers: {}, ip: '' };

      redisClient.get.mockResolvedValue(null);

      await expect(
        service.getOriginalUrl(shortCode, mockRequest),
      ).rejects.toThrow(
        new HttpException('Short URL not found', HttpStatus.NOT_FOUND),
      );
    });
  });
});
