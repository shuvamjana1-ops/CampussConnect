import type { PipeTransform } from '@nestjs/common';
import { validate } from '@campusconnect/contracts';
import type { z } from 'zod';
import { ApiError } from './api-error';

/**
 * Validates a request part against a Zod schema and passes on the parsed value. On failure it throws
 * `VALIDATION_FAILED` listing every invalid field path with its rule and bounds, never the submitted value (22.4).
 *
 * Use it per parameter: `@Body(new ZodValidationPipe(createTicketSchema)) body: CreateTicket`.
 */
export class ZodValidationPipe<S extends z.ZodType> implements PipeTransform<unknown, z.output<S>> {
  constructor(private readonly schema: S) {}

  transform(value: unknown): z.output<S> {
    const result = validate(this.schema, value);
    if (!result.ok) throw ApiError.validation(result.errors);
    return result.value;
  }
}
