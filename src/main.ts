import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cors from 'cors';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
// import { HealthCheckService } from '@nestjs/terminus';
import { LoadBalancer } from './utils/load-balancer';
import { AsyncAnalytics } from './utils/async-analytics';
import cluster from 'cluster';
import os from 'os';

async function bootstrap() {
  if (cluster.isPrimary) {
    // Fork workers for each CPU core
    for (let i = 0; i < 2; i++) {
      cluster.fork();
    }

    cluster.on('exit', (worker) => {
      // Replace dead workers immediately
      console.log(`Worker ${worker.process.pid} died, replacing...`);
      cluster.fork();
    });
  } else {
    const app = await NestFactory.create(AppModule);
    app.use(cors());
    const configService = app.get(ConfigService);
    const logger = new Logger('Main');
    const loadBalancer = new LoadBalancer();
    const asyncAnalytics = app.get(AsyncAnalytics);

    const options = new DocumentBuilder()
      .setTitle('URL Shortener API')
      .setDescription('API for shortening URLs')
      .setVersion('1.0')
      .build();
    const document = SwaggerModule.createDocument(app, options);
    SwaggerModule.setup('api', app, document);

    const servers = [configService.get<number>('port').toString()];
    loadBalancer.addServers(servers);

    const nextServer = await loadBalancer.next();
    logger.log(`Selected server ${nextServer}`);

    const subscribeToAnalytics = async () => {
      logger.log('Starting analytics subscriber');
      await asyncAnalytics.onModuleInit();
    };

    app.enableShutdownHooks();
    await app.init();
    await subscribeToAnalytics();

    const start = async () => {
      app.listen(parseInt(nextServer));
      logger.log(`Server running on port ${nextServer}`);
    };
    start();
  }
}
bootstrap();
