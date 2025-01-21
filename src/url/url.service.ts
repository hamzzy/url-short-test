import { Injectable, Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { RedisClient } from '../utils/redis-client';
import { v4 as uuidv4 } from 'uuid';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { L1Cache } from '../utils/l1-cache';
import { BloomFilter } from '../utils/bloom-filter';
import { CircuitBreaker } from '../utils/circuit-breaker';
import { AsyncAnalytics } from '../utils/async-analytics';
import { ClickData } from './entities/click-data.entity';
import { ShortenUrlDto } from './dto/shorten-url.dto';
import { AnalyticsQueryDto } from './dto/analytics-query.dto';

@Injectable()
export class UrlService {
  private readonly logger = new Logger(UrlService.name);
  private bloomFilter: BloomFilter;

  private getDeviceType(userAgent: string): string {
    if (!userAgent) return 'Unknown';
    if (/mobile/i.test(userAgent)) return 'Mobile';
    if (/tablet/i.test(userAgent)) return 'Tablet';
    if (/windows|macintosh|linux/i.test(userAgent)) return 'Desktop';
    return 'Other';
  }

  constructor(
    private readonly configService: ConfigService,
    private readonly redisClient: RedisClient,
    private readonly l1Cache: L1Cache,
    private readonly circuitBreaker: CircuitBreaker,
    private readonly asyncAnalytics: AsyncAnalytics,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {
    this.bloomFilter = new BloomFilter(10000);
  }

  private generateShortCode(length: number): string {
    const charset =
      'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < length; i++) {
      const randomIndex = randomBytes(1)[0] % charset.length;
      code += charset[randomIndex];
    }
    return code;
  }

  async shortenUrl(shortenUrlDto: ShortenUrlDto): Promise<any> {
    const { url, customCode, ttlMinutes } = shortenUrlDto;
    const shortCode = customCode || this.generateShortCode(7);
    const redisUrlKey = `url:${shortCode}`;
    const result = await this.circuitBreaker.execute(async () => {
      const exists = await this.redisClient.exists(redisUrlKey);
      if (exists) {
        throw new Error('Custom code already in use');
      }
      await this.redisClient.set(redisUrlKey, url);

      if (ttlMinutes) {
        await this.redisClient.expire(redisUrlKey, ttlMinutes * 60);
      }
      this.bloomFilter.add(redisUrlKey);
      return `${this.configService.get('base_url')}/${shortCode}`;
    });
    return { short_url: result };
  }

  async getOriginalUrl(shortCode: string, req: any): Promise<string> {
    const redisUrlKey = `url:${shortCode}`;
    const l1CacheKey = `${redisUrlKey}`;
    const cacheKey = `cache:${shortCode}`;
    if (this.l1Cache.has(l1CacheKey)) {
      return this.l1Cache.get(l1CacheKey);
    }

    // if (!this.bloomFilter.test(redisUrlKey)) {
    //   throw new Error('Short URL not found');
    // }

    const originalUrl = await this.circuitBreaker.execute(
      async () => {
        let cachedUrl = await this.cacheManager.get<string>(cacheKey);
        if (!cachedUrl) {
          cachedUrl = await this.redisClient.get(redisUrlKey);
          if (!cachedUrl) {
            throw new Error('Short URL not found');
          }
          if (this.configService.get('cache_enabled')) {
            await this.cacheManager.set(cacheKey, cachedUrl, 60);
          }
        }
        return cachedUrl;
      },
      () => {
        return this.cacheManager.get(cacheKey);
      },
    );

    this.l1Cache.set(l1CacheKey, originalUrl);

    // Store the click data
    const clickData = new ClickData();
    clickData.timestamp = new Date().toISOString();
    clickData.user_agent = req.headers['user-agent'] || 'Unknown';
    clickData.ip_address = req.ip || 'Unknown';
    clickData.referer = req.headers['referer'] || 'Direct';
    clickData.device_type = this.getDeviceType(req.headers['user-agent']);
    clickData.timestamp_unix = Date.now();
    clickData.short_code = shortCode;
    clickData.click_id = uuidv4();
    const clickKey = `clicks:${shortCode}`;

    await this.asyncAnalytics.publish({
      clickKey,
      clickData,
    });
    return originalUrl;
  }

  async getAnalytics(
    shortCode: string,
    query: AnalyticsQueryDto,
  ): Promise<{ clicks: ClickData[] }> {
    const { limit = 100, offset = 0 } = query;
    const clickKey = `clicks:${shortCode}`;
    const clickDataStrings: string[] = await this.circuitBreaker.execute(
      async () => {
        return await this.redisClient.lrange(
          clickKey,
          offset,
          offset + limit - 1,
        );
      },
      () => {
        return [];
      },
    );
    const clicks: ClickData[] = clickDataStrings.map((clickDataString) =>
      JSON.parse(clickDataString),
    );
    return { clicks };
  }
}
