import { SetMetadata } from '@nestjs/common';
import type { z } from 'zod';

export const API_ROUTE_METADATA = 'campusconnect:api-route';

/** What the OpenAPI document needs to know about a handler beyond its HTTP method and path. */
export interface ApiRouteDefinition {
  readonly summary: string;
  /** Path parameters, as an object schema keyed by parameter name. */
  readonly params?: z.ZodObject;
  /** Query parameters, as an object schema keyed by parameter name. */
  readonly query?: z.ZodObject;
  readonly body?: z.ZodType;
  /** Success response schemas keyed by HTTP status. Error responses are added automatically as problem+json. */
  readonly responses: Readonly<Record<number, z.ZodType>>;
}

/** Documents a controller handler. The same Zod schemas validate requests, so the document cannot drift from them. */
export const ApiRoute = (definition: ApiRouteDefinition): MethodDecorator => SetMetadata(API_ROUTE_METADATA, definition);
