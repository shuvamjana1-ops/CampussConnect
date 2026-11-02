import { Body, Controller, Delete, Get, Inject, Module, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { z } from 'zod';
import {
  AuditAdminService,
  AuditRangeError,
  AuditSearchTimeoutError,
  MAX_SEARCH_RANGE_MS,
  auditCode,
  auditRef,
  type AnchorStore,
  type AuditDatabase,
  type AuditLogRow,
  type AuditVerifyResult,
} from '@campusconnect/server/audit';
import type { Instant, TenantId, UserId } from '@campusconnect/domain/types';
import { ApiError } from './api-error';
import { RequirePermission } from './guards/public.decorator';
import { ApiRoute } from './openapi/api-route';
import type { AppClsStore } from './request-context';
import { AUDIT_ANCHOR_STORE, AUDIT_DATABASE } from './tokens';
import { ZodValidationPipe } from './zod-validation.pipe';

export const auditSearchQuerySchema = z
  .object({
    actor: z.string().uuid().optional(),
    action: z.string().min(1).max(64).optional(),
    target: z.string().min(1).max(130).optional(),
    from: z.coerce.number().int().nonnegative(),
    to: z.coerce.number().int().nonnegative(),
    limit: z.coerce.number().int().min(1).max(1000).optional(),
    offset: z.coerce.number().int().min(0).optional(),
  })
  .refine((q) => q.to >= q.from && q.to - q.from <= MAX_SEARCH_RANGE_MS, {
    path: ['to'],
    message: 'Range must be positive and at most 30 days.',
  });
export type AuditSearchQuery = z.output<typeof auditSearchQuerySchema>;

export const auditVerifyBodySchema = z.object({
  fromSeqNum: z.number().int().min(1).optional(),
  toSeqNum: z.number().int().min(1).optional(),
});
export type AuditVerifyBody = z.output<typeof auditVerifyBodySchema>;

const auditEntrySchema = z.object({
  id: z.string(),
  actor: z.string(),
  action: z.string(),
  target: z.string(),
  outcome: z.enum(['success', 'failure']),
  details: z.record(z.string(), z.unknown()).optional(),
  timestampMs: z.number().int(),
  hash: z.string(),
  seqNum: z.number().int(),
});
const auditVerifyResultSchema = z.object({
  isValid: z.boolean(),
  entriesChecked: z.number().int(),
  firstFailingEntryId: z.string().optional(),
  anchorsChecked: z.number().int(),
  anchorMismatches: z.array(z.number().int()),
});

/** Audit search and verification for Tenant_Admin. Entries are append-only: no route modifies one (18.4, 18.5). */
@Controller('audit')
export class AuditAdminController {
  private readonly service: AuditAdminService;

  constructor(
    @Inject(AUDIT_DATABASE) db: AuditDatabase,
    @Inject(AUDIT_ANCHOR_STORE) anchors: AnchorStore,
    @Inject(ClsService) private readonly cls: ClsService<AppClsStore>,
  ) {
    this.service = new AuditAdminService(db, anchors);
  }

  @Get()
  @RequirePermission('audit.search')
  @ApiRoute({
    summary: 'Search audit entries by actor, action, target and a range of at most 30 days',
    query: z.object({
      actor: z.string().optional(),
      action: z.string().optional(),
      target: z.string().optional(),
      from: z.number().int(),
      to: z.number().int(),
      limit: z.number().int().optional(),
      offset: z.number().int().optional(),
    }),
    responses: { 200: z.object({ entries: z.array(auditEntrySchema) }) },
  })
  async search(
    @Query(new ZodValidationPipe(auditSearchQuerySchema)) query: AuditSearchQuery,
  ): Promise<{ entries: AuditLogRow[] }> {
    const tenantId = this.tenantId();
    try {
      const entries = await this.service.search(tenantId, {
        fromMs: query.from as Instant,
        toMs: query.to as Instant,
        ...(query.actor === undefined ? {} : { actor: query.actor as UserId }),
        ...(query.action === undefined ? {} : { action: query.action }),
        ...(query.target === undefined ? {} : { target: query.target }),
        ...(query.limit === undefined ? {} : { limit: query.limit }),
        ...(query.offset === undefined ? {} : { offset: query.offset }),
      });
      return { entries };
    } catch (error) {
      if (error instanceof AuditSearchTimeoutError) throw new ApiError('SEARCH_TIMEOUT', {});
      if (error instanceof AuditRangeError) {
        throw ApiError.validation([{ path: 'to', rule: 'range', bounds: { max: MAX_SEARCH_RANGE_MS } } as never]);
      }
      throw error;
    }
  }

  @Post('verify')
  @RequirePermission('audit.search')
  @ApiRoute({
    summary: 'Verify the audit hash chain over a range and compare it with the anchored heads',
    body: auditVerifyBodySchema,
    responses: { 200: auditVerifyResultSchema },
  })
  verify(
    @Body(new ZodValidationPipe(auditVerifyBodySchema)) body: AuditVerifyBody,
  ): Promise<AuditVerifyResult> {
    return this.service.verify(this.tenantId(), body);
  }

  @Patch(':id')
  @RequirePermission('audit.search')
  async patch(@Param('id') id: string): Promise<never> {
    return this.reject(id, 'patch');
  }

  @Put(':id')
  @RequirePermission('audit.search')
  async put(@Param('id') id: string): Promise<never> {
    return this.reject(id, 'put');
  }

  @Delete(':id')
  @RequirePermission('audit.search')
  async remove(@Param('id') id: string): Promise<never> {
    return this.reject(id, 'delete');
  }

  /** Audit entries cannot be changed through the API. The attempt is recorded as a failure, then refused (18.4). */
  private async reject(id: string, method: string): Promise<never> {
    const principal = this.cls.get('principal');
    if (principal === undefined) throw new ApiError('INSUFFICIENT_PERMISSION', {});
    let ref: string;
    try {
      ref = auditRef(id);
    } catch {
      ref = 'invalid';
    }
    await this.service.recordRejectedModification(principal.tenantId, {
      actor: principal.userId,
      action: auditCode(`audit.modify_rejected`),
      target: `audit:${ref}`,
      outcome: 'failure',
      details: { method: auditCode(method) },
      timestampMs: Date.now() as Instant,
    });
    throw new ApiError('ACCESS_DENIED', {});
  }

  private tenantId(): TenantId {
    const principal = this.cls.get('principal');
    if (principal === undefined) throw new ApiError('INSUFFICIENT_PERMISSION', {});
    return principal.tenantId;
  }
}

/** Import this in the composition root and provide `AUDIT_DATABASE` and `AUDIT_ANCHOR_STORE`. */
@Module({ controllers: [AuditAdminController] })
export class AuditAdminModule {}
