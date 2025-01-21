import { Injectable, Logger } from '@nestjs/common';
import { URL } from 'url';

@Injectable()
export class LoadBalancer {
  private servers: string[] = [];
  private index: number = 0;
  private readonly logger = new Logger(LoadBalancer.name);

  addServers(servers: string[]) {
    this.servers.push(...servers);
    this.logger.log(`Added servers ${servers}`);
  }
  async next(): Promise<string> {
    if (this.servers.length === 0) {
      throw new Error('No servers have been added to the load balancer.');
    }

    const nextServer = this.servers[this.index % this.servers.length];
    this.index++;
    return nextServer;
  }

  getServers(): string[] {
    return this.servers;
  }
}
