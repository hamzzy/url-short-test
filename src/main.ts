import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Logger, ValidationPipe } from '@nestjs/common';
// import { HealthCheckService } from '@nestjs/terminus';
import { LoadBalancer } from './utils/load-balancer';
import { AsyncAnalytics } from './utils/async-analytics';
import compression from 'compression';
import cluster from 'cluster';
import os from 'os';
async function bootstrap() {
  if (cluster.isPrimary) {
    const numCPUs = os.cpus().length;
    for (let i = 0; i < numCPUs; i++) {
      cluster.fork();
    }
    cluster.on('exit', (worker) => {
      console.log(`Worker ${worker.process.pid} died. Restarting...`);
      cluster.fork();
    });
  } else {
    const app = await NestFactory.create(AppModule, { bufferLogs: true });
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    app.enableCors();
    app.use(compression());
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
      await asyncAnalytics.initialize();
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
