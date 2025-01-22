import { Test, TestingModule } from '@nestjs/testing';
import { UrlService } from './url.service';
import { RedisClient } from '../utils/redis-client';
import { ConfigService } from '@nestjs/config';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { L1Cache } from '../utils/l1-cache';
import { CircuitBreaker } from '../utils/circuit-breaker';
import { AsyncAnalytics } from '../utils/async-analytics';
import { EnhancedBloomFilter } from '../utils/bloom-filter';
import { ClickData } from '../url/entities/click-data.entity';
import { ShortenUrlDto } from '../url/dto/shorten-url.dto';
import { HttpException } from '@nestjs/common';

describe('UrlService', () => {
  let service: UrlService;
  let redisClient: RedisClient;
  let cacheManager: Cache;
  let l1Cache: L1Cache;
  let circuitBreaker: CircuitBreaker;
  let asyncAnalytics: AsyncAnalytics;
  let bloomFilter: EnhancedBloomFilter;
  let configService: ConfigService;

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
        {
          provide: EnhancedBloomFilter,
          useValue: {
            test: jest.fn(),
            add: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<UrlService>(UrlService);
    redisClient = module.get<RedisClient>(RedisClient);
    cacheManager = module.get<Cache>(CACHE_MANAGER);
    l1Cache = module.get<L1Cache>(L1Cache);
    circuitBreaker = module.get<CircuitBreaker>(CircuitBreaker);
    asyncAnalytics = module.get<AsyncAnalytics>(AsyncAnalytics);
    bloomFilter = module.get<EnhancedBloomFilter>(EnhancedBloomFilter);
    configService = module.get<ConfigService>(ConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('shortenUrl', () => {
    it('should shorten a URL and return a short URL', async () => {
      const shortenUrlDto: ShortenUrlDto = {
        url: 'http://example.com',
        customCode: 'custom123',
        ttlMinutes: 10,
      };
      redisClient.exists = jest.fn().mockResolvedValue(false);
      bloomFilter.test = jest.fn().mockResolvedValue(false);
      redisClient.set = jest.fn().mockResolvedValue(undefined);
      redisClient.expire = jest.fn().mockResolvedValue(undefined);
      bloomFilter.add = jest.fn().mockResolvedValue(undefined);

      const result = await service.shortenUrl(shortenUrlDto);

      expect(result.short_url).toBe('http://localhost/custom123');
      expect(redisClient.set).toHaveBeenCalledWith(
        'url:custom123',
        'http://example.com',
      );
      expect(bloomFilter.add).toHaveBeenCalledWith('url:custom123');
    });

    it('should throw an error if the custom code already exists', async () => {
      const shortenUrlDto: ShortenUrlDto = {
        url: 'http://example.com',
        customCode: 'custom123',
        ttlMinutes: 10,
      };
      redisClient.exists = jest.fn().mockResolvedValue(true);
      bloomFilter.test = jest.fn().mockResolvedValue(true);

      await expect(service.shortenUrl(shortenUrlDto)).rejects.toThrow(
        HttpException,
      );
    });
  });

  describe('getOriginalUrl', () => {
    it('should return the original URL when found in cache or redis', async () => {
      const shortCode = 'custom123';
      const redisUrlKey = `url:${shortCode}`;
      const cacheKey = `cache:${shortCode}`;
      redisClient.get = jest.fn().mockResolvedValue('http://example.com');
      cacheManager.get = jest.fn().mockResolvedValue(null);
      cacheManager.set = jest.fn().mockResolvedValue(undefined);

      const result = await service.getOriginalUrl(shortCode, {
        headers: {},
        ip: '127.0.0.1',
      });

      expect(result).toBe('http://example.com');
      expect(redisClient.get).toHaveBeenCalledWith(redisUrlKey);
      expect(cacheManager.set).toHaveBeenCalledWith(
        cacheKey,
        'http://example.com',
        60,
      );
    });

    it('should throw an error if the URL is not found', async () => {
      const shortCode = 'custom123';
      redisClient.get = jest.fn().mockResolvedValue(null);

      await expect(
        service.getOriginalUrl(shortCode, { headers: {}, ip: '127.0.0.1' }),
      ).rejects.toThrow(Error);
    });
  });

  describe('getAnalytics', () => {
    it('should return click data for a URL', async () => {
      const shortCode = 'custom123';
      const query = { limit: 5, offset: 0 };
      redisClient.lrange = jest
        .fn()
        .mockResolvedValue([
          JSON.stringify({ click_id: '1', timestamp: '2021-01-01' }),
        ]);

      const result = await service.getAnalytics(shortCode, query);

      expect(result.clicks.length).toBe(1);
      expect(result.clicks[0].click_id).toBe('1');
      expect(redisClient.lrange).toHaveBeenCalledWith('clicks:custom123', 0, 4);
    });

    it('should handle errors gracefully in analytics', async () => {
      const shortCode = 'custom123';
      const query = { limit: 5, offset: 0 };
      redisClient.lrange = jest
        .fn()
        .mockRejectedValue(new Error('Redis error'));

      await expect(service.getAnalytics(shortCode, query)).rejects.toThrow(
        Error,
      );
    });
  });
});
