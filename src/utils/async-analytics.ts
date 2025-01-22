// async-analytics.ts
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { connect, Channel, Connection, ConsumeMessage } from 'amqplib';
import { ClickData } from 'src/url/entities/click-data.entity';

@Injectable()
export class AsyncAnalytics implements OnModuleDestroy {
  private channel: Channel;
  private connection: Connection;
  private readonly logger = new Logger(AsyncAnalytics.name);
  private readonly QUEUE_NAME = 'click_events';
  private reconnectAttempts = 0;
  private readonly MAX_RECONNECT_ATTEMPTS = 5;

  constructor(private configService: ConfigService) {
    this.initialize();
  }
  public async initialize() {
    try {
      await this.connect();
    } catch (err) {
      this.logger.error(`Failed to initialize AsyncAnalytics: ${err}`);
    }
  }

  private async connect() {
    try {
      this.connection = await connect(this.configService.get('rabbitmq_url'));
      this.channel = await this.connection.createChannel();
      await this.channel.assertQueue(this.QUEUE_NAME, { durable: true });
      this.channel.prefetch(100); // Adjust prefetch value

      this.channel.on('error', (err) => {
        this.logger.error(`Channel error: ${err}`);
        this.reconnect();
      });

      this.channel.on('close', () => {
        this.logger.warn('Channel closed');
        this.reconnect();
      });

      this.reconnectAttempts = 0;
    } catch (err) {
      this.logger.error(`Connection error: ${err}`);
      throw err;
    }
  }
  private async reconnect() {
    if (this.reconnectAttempts >= this.MAX_RECONNECT_ATTEMPTS) {
      this.logger.error('Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    this.logger.log(
      `Attempting to reconnect (${this.reconnectAttempts}/${this.MAX_RECONNECT_ATTEMPTS})`,
    );
    try {
      await new Promise((resolve) =>
        setTimeout(resolve, 1000 * this.reconnectAttempts),
      );
      await this.connect();
    } catch (err) {
      this.logger.error(`Reconnection failed: ${err}`);
    }
  }
  // async publish(data: { clickKey: string; clickData: ClickData }) {
  //   try {
  //     if (!this.channel || this.channel.closed) {
  //       await this.connect();
  //     }

  //     const message = JSON.stringify(data);
  //     await this.channel.sendToQueue(this.QUEUE_NAME, Buffer.from(message), {
  //       persistent: true,
  //     });
  //   } catch (err) {
  //     this.logger.error(`Error publishing message: ${err}`);
  //     throw err;
  //   }
  // }

  async publishBatch(data: { clickKey: string; clickData: ClickData }[]) {
    try {
      if (!this.channel || this.channel.closed) {
        await this.connect();
      }

      const messages = data.map((d) => JSON.stringify(d));
      for (const message of messages) {
        await this.channel.sendToQueue(this.QUEUE_NAME, Buffer.from(message), {
          persistent: true,
        });
      }
    } catch (err) {
      this.logger.error(`Error publishing batch messages: ${err}`);
      throw err;
    }
  }

  async consume(callback: (data: any) => Promise<void>) {
    try {
      if (!this.channel || this.channel.closed) {
        await this.connect();
      }

      await this.channel.consume(
        this.QUEUE_NAME,
        async (msg: ConsumeMessage | null) => {
          if (msg) {
            try {
              const data = JSON.parse(msg.content.toString());
              await callback(data);
              await this.channel.ack(msg);
            } catch (err) {
              this.logger.error(`Error processing message: ${err}`);

              const retryCount =
                (msg.properties.headers?.['x-retry-count'] || 0) + 1;
              if (retryCount < 3) {
                await this.channel.nack(msg, false, true, {
                  headers: { 'x-retry-count': retryCount },
                });
              } else {
                await this.channel.nack(msg, false, false);
              }
            }
          }
        },
        { noAck: false },
      );
    } catch (err) {
      this.logger.error(`Error setting up consumer: ${err}`);
      throw err;
    }
  }
  async onModuleDestroy() {
    try {
      if (this.channel) {
        await this.channel.close();
      }
      if (this.connection) {
        await this.connection.close();
      }
    } catch (err) {
      this.logger.error(`Error closing connections: ${err}`);
    }
  }
}
