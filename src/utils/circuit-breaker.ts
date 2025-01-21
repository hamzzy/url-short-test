import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

enum CircuitState {
  CLOSED,
  OPEN,
  HALF_OPEN,
}
@Injectable()
export class CircuitBreaker {
  private readonly logger = new Logger(CircuitBreaker.name);

  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private lastFailureTime = 0;
  private openTime = 0;
  private readonly failureThreshold: number = 5;
  private readonly retryTimeout: number = 10000;
  constructor(private readonly configService: ConfigService) {}
  async execute<T>(
    operation: () => Promise<T>,
    fallback?: () => T | Promise<T>,
  ): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (Date.now() - this.openTime >= this.retryTimeout) {
        this.transitionToHalfOpen();
      } else {
        this.logger.warn(
          `Circuit is open, not executing. Fallback? ${fallback !== undefined}`,
        );
        if (fallback) {
          return fallback();
        }
        throw new Error('Circuit is open, request blocked.');
      }
    }

    try {
      const result = await operation();
      this.reset();
      return result;
    } catch (err) {
      this.recordFailure();
      this.logger.error(`Circuit breaker caught error: ${err}`);
      if (fallback) {
        return fallback();
      }
      throw err;
    }
  }

  private recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.failureThreshold) {
      this.transitionToOpen();
    }
  }
  private transitionToOpen(): void {
    this.logger.warn('Transition to OPEN');
    this.state = CircuitState.OPEN;
    this.openTime = Date.now();
  }
  private transitionToHalfOpen(): void {
    this.logger.warn('Transition to HALF_OPEN');
    this.state = CircuitState.HALF_OPEN;
  }
  private reset(): void {
    this.logger.warn('Reset');
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
  }
}
