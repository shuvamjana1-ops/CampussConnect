import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { API_PREFIX, UNPREFIXED_ROUTES } from './openapi/openapi.service';

const DEFAULT_PORT = 3000;

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  // All endpoints live under /api/v1 (design: Components and Interfaces). Health is served at the root for load balancers.
  app.setGlobalPrefix(API_PREFIX, { exclude: [...UNPREFIXED_ROUTES] });
  app.disable('x-powered-by');
  app.enableShutdownHooks();
  await app.listen(Number(process.env['PORT'] ?? DEFAULT_PORT));
}

void bootstrap();
