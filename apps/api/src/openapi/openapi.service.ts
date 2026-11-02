import 'reflect-metadata';
import { Inject, Injectable } from '@nestjs/common';
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { z } from 'zod';
import { PROBLEM_JSON_MEDIA_TYPE } from '@campusconnect/contracts';
import { API_ROUTE_METADATA, type ApiRouteDefinition } from './api-route';

/** Nest stores the `@Controller()` prefix and the `@Get()`-style path and method under these keys. */
const PATH_METADATA = 'path';
const METHOD_METADATA = 'method';
/** Values of Nest's `RequestMethod` enum, in declaration order. */
const REQUEST_METHODS = ['get', 'post', 'put', 'delete', 'patch', 'all', 'options', 'head'] as const;

export const API_PREFIX = 'api/v1';
/** Routes served outside the versioned prefix. */
export const UNPREFIXED_ROUTES = ['health/dependencies'] as const;

export interface OpenApiDocument {
  readonly openapi: '3.1.0';
  readonly info: { readonly title: string; readonly version: string };
  readonly paths: Record<string, Record<string, unknown>>;
  readonly components: { readonly schemas: Record<string, unknown> };
}

const problemSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number().int(),
  code: z.string(),
  requestId: z.string(),
  instance: z.string().optional(),
});

/** Builds the OpenAPI 3.1 document from `@ApiRoute()` metadata and the Zod schemas it points to. */
@Injectable()
export class OpenApiService {
  private cached: OpenApiDocument | undefined;

  constructor(
    @Inject(DiscoveryService) private readonly discovery: DiscoveryService,
    @Inject(MetadataScanner) private readonly scanner: MetadataScanner,
    @Inject(Reflector) private readonly reflector: Reflector,
  ) {}

  document(): OpenApiDocument {
    this.cached ??= this.build();
    return this.cached;
  }

  private build(): OpenApiDocument {
    const paths: Record<string, Record<string, unknown>> = {};
    for (const wrapper of this.discovery.getControllers()) {
      const { instance, metatype } = wrapper;
      if (instance === null || instance === undefined || metatype === null) continue;
      const prefix = Reflect.getMetadata(PATH_METADATA, metatype) as string | string[] | undefined;
      const prototype = Object.getPrototypeOf(instance) as object;
      for (const name of this.scanner.getAllMethodNames(prototype)) {
        const handler = (prototype as Record<string, unknown>)[name] as object;
        const definition = this.reflector.get<ApiRouteDefinition | undefined>(API_ROUTE_METADATA, handler);
        const routePath = Reflect.getMetadata(PATH_METADATA, handler) as string | string[] | undefined;
        const methodIndex = Reflect.getMetadata(METHOD_METADATA, handler) as number | undefined;
        if (definition === undefined || methodIndex === undefined) continue;
        const method = REQUEST_METHODS[methodIndex];
        if (method === undefined) continue;
        const path = toOpenApiPath(first(prefix), first(routePath));
        (paths[path] ??= {})[method] = operation(definition);
      }
    }
    return {
      openapi: '3.1.0',
      info: { title: 'CampusConnect API', version: '1.0.0' },
      paths,
      components: { schemas: { Problem: z.toJSONSchema(problemSchema) } },
    };
  }
}

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? '';
}

function toOpenApiPath(controllerPath: string, routePath: string): string {
  const joined = [controllerPath, routePath]
    .map((part) => part.replace(/^\/+|\/+$/g, ''))
    .filter((part) => part !== '')
    .join('/');
  const prefixed = (UNPREFIXED_ROUTES as readonly string[]).includes(joined) ? joined : `${API_PREFIX}/${joined}`;
  return `/${prefixed}`.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
}

function operation(definition: ApiRouteDefinition): Record<string, unknown> {
  const parameters = [
    ...parametersOf('path', definition.params),
    ...parametersOf('query', definition.query),
  ];
  const responses: Record<string, unknown> = {};
  for (const [status, schema] of Object.entries(definition.responses)) {
    responses[status] = { description: 'Success', content: { 'application/json': { schema: z.toJSONSchema(schema) } } };
  }
  responses['default'] = {
    description: 'Error',
    content: { [PROBLEM_JSON_MEDIA_TYPE]: { schema: { $ref: '#/components/schemas/Problem' } } },
  };
  return {
    summary: definition.summary,
    ...(parameters.length > 0 ? { parameters } : {}),
    ...(definition.body === undefined
      ? {}
      : {
          requestBody: {
            required: true,
            content: { 'application/json': { schema: z.toJSONSchema(definition.body) } },
          },
        }),
    responses,
  };
}

function parametersOf(location: 'path' | 'query', schema: z.ZodObject | undefined): Record<string, unknown>[] {
  if (schema === undefined) return [];
  return Object.entries(schema.shape).map(([name, field]) => ({
    name,
    in: location,
    required: location === 'path' || !(field as z.ZodType).safeParse(undefined).success,
    schema: z.toJSONSchema(field as z.ZodType),
  }));
}
