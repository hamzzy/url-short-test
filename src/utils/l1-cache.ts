import { Injectable } from '@nestjs/common';
import LRUCache from 'lru-cache-node';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class L1Cache {
  private cache: LRUCache<string, any>;
  constructor(private readonly configService: ConfigService) {
    this.cache = new LRUCache<string, any>({
      max: this.configService.get<number>('l1_cache_size'),
    });
  }

  get(key: string): any | undefined {
    return this.cache.get(key);
  }

  set(key: string, value: any): void {
    this.cache.set(key, value);
  }
  has(key: string): boolean {
    return this.cache.has(key);
  }
}

