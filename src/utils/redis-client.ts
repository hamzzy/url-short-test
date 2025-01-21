import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis, { Cluster } from 'ioredis';
import { Logger } from '@nestjs/common';

@Injectable()
export class RedisClient implements OnModuleInit, OnModuleDestroy {
  private client: Cluster; // Changed from Redis to Cluster
  private readonly logger = new Logger(RedisClient.name);
  private initialConnectionAttempts = 0;
  private maxConnectionAttempts = 5;
  private connectionDelay = 5000;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    const redisUrls = this.configService.get<string[]>('redis.urls') || [];
    if (!redisUrls.length || redisUrls.some((url) => !url.includes(':'))) {
      throw new Error(
        'Invalid redis.urls configuration. Ensure host:port format.',
      );
    }

    const nodes = redisUrls.map((url) => {
      const [host, port] = url.replace('redis://', '').split(':');
      return { host, port: parseInt(port, 10) };
    });

    try {
      await this.createClusterClient(nodes);
    } catch (error) {
      this.logger.error('Failed to initialize Redis Cluster client', error);
      throw error;
    }
  }

  private async createClusterClient(
    nodes: Array<{ host: string; port: number }>,
  ) {
    this.client = new Redis.Cluster(nodes, {
      redisOptions: {
        connectTimeout: 1000,
        maxRetriesPerRequest: 1,
      },
      clusterRetryStrategy: (times) => {
        if (times >= this.maxConnectionAttempts) {
          return null;
        }
        return this.connectionDelay;
      },
      enableReadyCheck: true,
      slotsRefreshTimeout: 2000,
      enableAutoPipelining: true,
    });

    this.client.on('error', (err) => {
      this.logger.error('Redis Cluster Error:', err);
    });

    this.client.on('node error', (err, node) => {
      this.logger.error(
        `Redis Cluster Node ${node.options.host}:${node.options.port} Error:`,
        err,
      );
    });

    this.client.on('connect', () => {
      this.logger.log('Connected to Redis Cluster');
    });

    this.client.on('+node', (node) => {
      this.logger.log(
        `New node added to Redis Cluster: ${node.options.host}:${node.options.port}`,
      );
    });

    this.client.on('-node', (node) => {
      this.logger.log(
        `Node removed from Redis Cluster: ${node.options.host}:${node.options.port}`,
      );
    });

    await this.waitForConnection();
  }

  private async waitForConnection() {
    try {
      await this.client.ping();
      this.logger.log('Successfully connected to Redis Cluster');
    } catch (error) {
      this.initialConnectionAttempts++;
      if (this.initialConnectionAttempts < this.maxConnectionAttempts) {
        this.logger.error(
          `Error connecting to Redis Cluster (attempt ${this.initialConnectionAttempts}/${this.maxConnectionAttempts}), retrying in ${this.connectionDelay}ms`,
        );
        await new Promise((resolve) =>
          setTimeout(resolve, this.connectionDelay),
        );
        return await this.waitForConnection();
      }
      throw error;
    }
  }

  // The method signatures remain the same but now use the Cluster type internally
  async set(key: string, value: string): Promise<void> {
    await this.client.set(key, value);
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async exists(key: string): Promise<boolean> {
    const exists = await this.client.exists(key);
    return exists > 0;
  }

  async expire(key: string, seconds: number): Promise<void> {
    await this.client.expire(key, seconds);
  }

  async rpush(key: string, value: string): Promise<void> {
    await this.client.rpush(key, value);
  }

  async lrange(key: string, start: number, stop: number): Promise<string[]> {
    return this.client.lrange(key, start, stop);
  }

  async publish(channel: string, message: string): Promise<number> {
    return this.client.publish(channel, message);
  }

  async subscribe(
    channel: string,
    callback: (channel: string, message: string) => void,
  ): Promise<void> {
    const subscriber = this.client.duplicate();
    await subscriber.subscribe(channel);
    subscriber.on('message', callback);
  }
  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  async onModuleDestroy() {
    await this.client.quit();
  }
}
