import { Controller, Get, Inject } from '@nestjs/common';
import { OpenApiService, type OpenApiDocument } from './openapi.service';

/** Serves the generated OpenAPI document at `/api/v1/openapi.json`. */
@Controller('openapi.json')
export class OpenApiController {
  constructor(@Inject(OpenApiService) private readonly openApi: OpenApiService) {}

  @Get()
  document(): OpenApiDocument {
    return this.openApi.document();
  }
}
