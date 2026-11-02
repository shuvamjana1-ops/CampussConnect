// Typed per-event templates in English and Hindi.
//
// Ticket and Grievance templates accept only { ticketRef, statusLabel, deepLink, locale }, so description text,
// attachment names and reporter identity cannot reach an email or push body (requirement 9.7). A runtime guard
// additionally rejects any rendered message that contains the description or reporter identity.

import type { Channel, Locale, RenderedMessage } from './types.js';

/** The only data a Ticket or Grievance template may use. */
export interface TicketTemplateParams {
  readonly ticketRef: string;
  readonly statusLabel: string;
  readonly deepLink: string;
  readonly locale: Locale;
}

export interface OpportunityTemplateParams {
  readonly opportunityTitle: string;
  readonly deepLink: string;
  readonly locale: Locale;
}

export interface EmergencyTemplateParams {
  readonly headline: string;
  /** Short acknowledgement link included in SMS and other channels. */
  readonly ackLink: string;
  readonly locale: Locale;
}

export interface TemplateParamsByEvent {
  ticket_created: TicketTemplateParams;
  ticket_routed: TicketTemplateParams;
  ticket_status_changed: TicketTemplateParams;
  ticket_assignment_changed: TicketTemplateParams;
  grievance_status_changed: TicketTemplateParams;
  opportunity_published: OpportunityTemplateParams;
  emergency_alert: EmergencyTemplateParams;
}

export type TemplateEvent = keyof TemplateParamsByEvent;

/** Events whose email and push bodies are restricted to `TicketTemplateParams`. */
export const TICKET_EVENTS: readonly TemplateEvent[] = [
  'ticket_created',
  'ticket_routed',
  'ticket_status_changed',
  'ticket_assignment_changed',
  'grievance_status_changed',
];

interface Copy {
  readonly title: string;
  readonly body: string;
}

type TicketCopy = (p: TicketTemplateParams) => Copy;

const TICKET_COPY: Record<Locale, Record<Exclude<TemplateEvent, 'opportunity_published' | 'emergency_alert'>, TicketCopy>> = {
  en: {
    ticket_created: (p) => ({
      title: `Ticket ${p.ticketRef} received`,
      body: `We received your request ${p.ticketRef}. Status: ${p.statusLabel}. View it: ${p.deepLink}`,
    }),
    ticket_routed: (p) => ({
      title: `Ticket ${p.ticketRef} assigned to a department`,
      body: `Your request ${p.ticketRef} is with the right team. Status: ${p.statusLabel}. View it: ${p.deepLink}`,
    }),
    ticket_status_changed: (p) => ({
      title: `Ticket ${p.ticketRef} updated`,
      body: `Your request ${p.ticketRef} is now: ${p.statusLabel}. View it: ${p.deepLink}`,
    }),
    ticket_assignment_changed: (p) => ({
      title: `Ticket ${p.ticketRef} has a new handler`,
      body: `Your request ${p.ticketRef} was reassigned. Status: ${p.statusLabel}. View it: ${p.deepLink}`,
    }),
    grievance_status_changed: (p) => ({
      title: `Grievance ${p.ticketRef} updated`,
      body: `Your grievance ${p.ticketRef} is now: ${p.statusLabel}. Sign in to view details: ${p.deepLink}`,
    }),
  },
  hi: {
    ticket_created: (p) => ({
      title: `टिकट ${p.ticketRef} प्राप्त हुआ`,
      body: `आपका अनुरोध ${p.ticketRef} प्राप्त हो गया है। स्थिति: ${p.statusLabel}। देखें: ${p.deepLink}`,
    }),
    ticket_routed: (p) => ({
      title: `टिकट ${p.ticketRef} विभाग को सौंपा गया`,
      body: `आपका अनुरोध ${p.ticketRef} संबंधित टीम के पास है। स्थिति: ${p.statusLabel}। देखें: ${p.deepLink}`,
    }),
    ticket_status_changed: (p) => ({
      title: `टिकट ${p.ticketRef} अपडेट हुआ`,
      body: `आपके अनुरोध ${p.ticketRef} की स्थिति: ${p.statusLabel}। देखें: ${p.deepLink}`,
    }),
    ticket_assignment_changed: (p) => ({
      title: `टिकट ${p.ticketRef} के लिए नया हैंडलर`,
      body: `आपका अनुरोध ${p.ticketRef} किसी और को सौंपा गया है। स्थिति: ${p.statusLabel}। देखें: ${p.deepLink}`,
    }),
    grievance_status_changed: (p) => ({
      title: `शिकायत ${p.ticketRef} अपडेट हुई`,
      body: `आपकी शिकायत ${p.ticketRef} की स्थिति: ${p.statusLabel}। विवरण देखने के लिए साइन इन करें: ${p.deepLink}`,
    }),
  },
};

const OPPORTUNITY_COPY: Record<Locale, (p: OpportunityTemplateParams) => Copy> = {
  en: (p) => ({
    title: 'New opportunity for you',
    body: `${p.opportunityTitle}. View it: ${p.deepLink}`,
  }),
  hi: (p) => ({
    title: 'आपके लिए नया अवसर',
    body: `${p.opportunityTitle}। देखें: ${p.deepLink}`,
  }),
};

const EMERGENCY_COPY: Record<Locale, (p: EmergencyTemplateParams) => Copy> = {
  en: (p) => ({
    title: 'Emergency alert',
    body: `${p.headline}. Acknowledge: ${p.ackLink}`,
  }),
  hi: (p) => ({
    title: 'आपातकालीन चेतावनी',
    body: `${p.headline}। पुष्टि करें: ${p.ackLink}`,
  }),
};

/** Identifies the recipient and notification the rendered message belongs to. */
export interface RenderContext {
  readonly tenantId: string;
  readonly notificationId: string;
  readonly recipientId: string;
  readonly channel: Channel;
  /** DLT template id; required to render SMS. */
  readonly smsTemplateId?: string;
}

/** Text that must never appear in an email or push body. */
export interface ForbiddenContent {
  readonly description?: string;
  /** Reporter name, email, student id and similar. */
  readonly reporterIdentity?: readonly string[];
}

export class ForbiddenContentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ForbiddenContentError';
  }
}

/** Channels whose bodies leave the platform and are covered by the 9.7 guard. */
const GUARDED_CHANNELS: ReadonlySet<Channel> = new Set<Channel>(['email', 'web_push']);

const MIN_FORBIDDEN_LENGTH = 2;

function normalise(s: string): string {
  return s.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Throws when a rendered email or push message contains the Ticket description or the reporter identity.
 * Short fragments are compared whole; a long description is also checked by its leading 40 characters so a
 * truncated copy is caught.
 */
export function assertNoForbiddenContent(message: RenderedMessage, forbidden: ForbiddenContent): void {
  if (!GUARDED_CHANNELS.has(message.channel)) return;
  const haystack = normalise([message.title, message.body, message.html ?? '', message.deepLink ?? ''].join('\n'));
  const needles: string[] = [];
  if (forbidden.description) {
    const d = normalise(forbidden.description);
    needles.push(d);
    if (d.length > 40) needles.push(d.slice(0, 40));
  }
  for (const id of forbidden.reporterIdentity ?? []) needles.push(normalise(id));
  for (const needle of needles) {
    if (needle.length >= MIN_FORBIDDEN_LENGTH && haystack.includes(needle)) {
      throw new ForbiddenContentError('Rendered message contains the Ticket description or reporter identity');
    }
  }
}

function base(ctx: RenderContext, locale: Locale, copy: Copy, deepLink?: string): RenderedMessage {
  return {
    channel: ctx.channel,
    locale,
    tenantId: ctx.tenantId,
    notificationId: ctx.notificationId,
    recipientId: ctx.recipientId,
    title: copy.title,
    body: copy.body,
    ...(deepLink ? { deepLink } : {}),
  };
}

/**
 * Renders the template for `event` and `ctx.channel`. Email and push renders run through the content guard;
 * pass `forbidden` whenever the caller knows the Ticket description or reporter identity.
 */
export function renderTemplate<E extends TemplateEvent>(
  event: E,
  params: TemplateParamsByEvent[E],
  ctx: RenderContext,
  forbidden: ForbiddenContent = {},
): RenderedMessage {
  let message: RenderedMessage;
  if (event === 'opportunity_published') {
    const p = params as OpportunityTemplateParams;
    message = base(ctx, p.locale, OPPORTUNITY_COPY[p.locale](p), p.deepLink);
  } else if (event === 'emergency_alert') {
    const p = params as EmergencyTemplateParams;
    message = base(ctx, p.locale, EMERGENCY_COPY[p.locale](p), p.ackLink);
    if (ctx.channel === 'sms') {
      if (!ctx.smsTemplateId) throw new Error('SMS rendering requires a DLT template id');
      message = { ...message, smsTemplateId: ctx.smsTemplateId, smsVariables: [p.headline, p.ackLink] };
    }
  } else {
    // Only the four permitted fields are read; anything else on the object is ignored.
    const raw = params as TicketTemplateParams;
    const p: TicketTemplateParams = {
      ticketRef: raw.ticketRef,
      statusLabel: raw.statusLabel,
      deepLink: raw.deepLink,
      locale: raw.locale,
    };
    message = base(ctx, p.locale, TICKET_COPY[p.locale][event as keyof (typeof TICKET_COPY)['en']](p), p.deepLink);
  }
  assertNoForbiddenContent(message, forbidden);
  return message;
}
