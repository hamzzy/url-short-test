import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
  HttpException,
  HttpStatus,
  UseInterceptors,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisClient } from './redis-client';
import { Observable } from 'rxjs';
import { Request } from 'express';

@Injectable()
export class RateLimiter implements NestInterceptor {
  private readonly logger = new Logger(RateLimiter.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly redisClient: RedisClient,
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<any>> {
    const request: Request = context.switchToHttp().getRequest();
    const ipAddress =
      (request.headers['x-forwarded-for'] as string) || 'unknown';
    const rateLimitKey = `rate_limit:${ipAddress}`;

    const requestCount = await this.redisClient.get(rateLimitKey);
    const requestCountInt = requestCount ? parseInt(requestCount) : 0;
    if (requestCountInt >= this.configService.get('rate_limit_max_requests')) {
      throw new HttpException(
        'Too many requests',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    await this.redisClient.set(rateLimitKey, (requestCountInt + 1).toString());
    await this.redisClient.expire(
      rateLimitKey,
      this.configService.get('rate_limit_window_sec'),
    );
    return next.handle();
  }
}

export function RateLimit() {
  return (target: any, key: string, descriptor: PropertyDescriptor) => {
    Injectable()(target);
    UseInterceptors(RateLimiter)(target, key, descriptor);
  };
}
