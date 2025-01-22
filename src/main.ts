import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Logger, ValidationPipe } from '@nestjs/common';
// import { HealthCheckService } from '@nestjs/terminus';
import { AsyncAnalytics } from './utils/async-analytics';
import compression from 'compression';
import cluster from 'cluster';
async function bootstrap() {
  if (cluster.isPrimary) {
    for (let i = 0; i < 3; i++) {
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
    const asyncAnalytics = app.get(AsyncAnalytics);

    const options = new DocumentBuilder()
      .setTitle('URL Shortener API')
      .setDescription('API for shortening URLs')
      .setVersion('1.0')
      .build();
    const document = SwaggerModule.createDocument(app, options);
    SwaggerModule.setup('api-docs', app, document);

    const servers = configService.get<number>('port').toString();

    // Get healthy servers
    logger.log(`Selected server ${servers}`);

    const subscribeToAnalytics = async () => {
      await asyncAnalytics.initialize();
      logger.log('Starting analytics subscriber');
    };

    app.enableShutdownHooks();
    await app.init();
    await subscribeToAnalytics();

    const start = async () => {
      app.listen(parseInt(servers));
      logger.log(`Server running on port ${servers}`);
    };
    start();
  }
}
bootstrap();
