import { Module } from '@nestjs/common';
import { UrlService } from './url.service';
import { UrlController } from './url.controller';
import { RedisClient } from '../utils/redis-client';
import { CircuitBreaker } from '../utils/circuit-breaker';
import { AsyncAnalytics } from '../utils/async-analytics';
import { L1Cache } from '../utils/l1-cache';
import { RateLimiter } from '../utils/rate-limiter';

@Module({
  controllers: [UrlController],
  providers: [
    UrlService,
    RedisClient,
    RateLimiter,
    L1Cache,
    CircuitBreaker,
    AsyncAnalytics,
  ],
})
export class UrlModule {}
