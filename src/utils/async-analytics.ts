import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisClient } from './redis-client';
import { connect, Channel, Connection } from 'amqplib';

@Injectable()
export class AsyncAnalytics implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AsyncAnalytics.name);
  private channel: Channel;
  private connection: Connection;
  constructor(
    private readonly configService: ConfigService,
    private readonly redisClient: RedisClient,
  ) {}

  async onModuleInit() {
    try {
      this.connection = await connect(this.configService.get('rabbitmq.url'));
      this.channel = await this.connection.createChannel();
      this.logger.log(`Connection to rabbitmq successful`);
      await this.channel.assertQueue('analytics', { durable: true });

      this.channel.consume(
        'analytics',
        async (message) => {
          if (message) {
            try {
              const { clickKey, clickData } = JSON.parse(
                message.content.toString(),
              );
              await this.redisClient.rpush(clickKey, JSON.stringify(clickData));
              this.channel.ack(message);
            } catch (err) {
              this.logger.error(`Failed to process ${err}`);
              this.channel.reject(message, false);
            }
          }
        },
        { noAck: false },
      );
    } catch (err) {
      this.logger.error(`Failed to connect to rabbitmq ${err}`);
    }
  }
  async publish(message: any): Promise<void> {
    if (this.channel) {
      await this.channel.sendToQueue(
        'analytics',
        Buffer.from(JSON.stringify(message)),
        { persistent: true },
      );
    } else {
      this.logger.error('Failed to publish since there is no channel');
    }
  }
  async onModuleDestroy() {
    if (this.channel) {
      await this.channel.close();
    }

    if (this.connection) {
      await this.connection.close();
    }
  }
}
