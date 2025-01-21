import { Module } from '@nestjs/common';
import { UrlService } from './url.service';
import { UrlController } from './url.controller';
import { RedisClient } from 'src/utils/redis-client';
import { CircuitBreaker } from 'src/utils/circuit-breaker';
import { AsyncAnalytics } from 'src/utils/async-analytics';
import { L1Cache } from 'src/utils/l1-cache';
import { RateLimiter } from 'src/utils/rate-limiter';

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
