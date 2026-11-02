import { randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR, DiscoveryModule } from '@nestjs/core';
import { ClsModule, ClsService } from 'nestjs-cls';
import { createLogger, NO_TENANT } from '@campusconnect/observability';
import { DependencyHealth } from '@campusconnect/server/health';
import { DegradedInterceptor } from './degraded.interceptor';
import { HealthController } from './health.controller';
import { OpenApiController } from './openapi/openapi.controller';
import { OpenApiService } from './openapi/openapi.service';
import { ProblemExceptionFilter } from './problem-exception.filter';
import type { AppClsStore } from './request-context';
import { LOGGER } from './tokens';

@Module({
  imports: [
    DiscoveryModule,
    ClsModule.forRoot({
      global: true,
      middleware: {
        mount: true,
        generateId: true,
        // The platform generates the request id. A client-supplied id is never trusted (25.1).
        idGenerator: () => randomUUID(),
      },
    }),
  ],
  controllers: [HealthController, OpenApiController],
  providers: [
    { provide: DependencyHealth, useFactory: () => new DependencyHealth() },
    {
      provide: LOGGER,
      inject: [ClsService],
      useFactory: (cls: ClsService<AppClsStore>) =>
        createLogger({
          service: 'api',
          getContext: () => {
            const requestId = cls.getId();
            return requestId === undefined ? undefined : { requestId, tenantId: cls.get('tenantId') ?? NO_TENANT };
          },
        }),
    },
    OpenApiService,
    { provide: APP_FILTER, useClass: ProblemExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: DegradedInterceptor },
  ],
  exports: [DependencyHealth, LOGGER],
})
export class AppModule {}
