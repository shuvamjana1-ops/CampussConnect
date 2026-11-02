// SMS channel over AWS End User Messaging SMS (Pinpoint SMS and Voice v2). Emergency alerts only, from
// DLT-registered templates with an entity id and template id per Tenant.

import { describeError, failure, isRetryableStatus, type ChannelAdapter, type ChannelAddress, type RenderedMessage, type SendResult } from './types.js';

export interface SmsSendInput {
  DestinationPhoneNumber: string;
  MessageBody: string;
  MessageType: 'TRANSACTIONAL';
  OriginationIdentity: string;
  ConfigurationSetName?: string;
  /** India DLT registration ids. */
  Context: Record<string, string>;
  DryRun?: boolean;
}

/** Port implemented over `PinpointSMSVoiceV2Client.send(new SendTextMessageCommand(input))`. */
export interface SmsPort {
  sendTextMessage(input: SmsSendInput): Promise<{ MessageId?: string }>;
}

export interface TenantSmsConfig {
  /** Registered DLT principal entity id. */
  readonly dltEntityId: string;
  /** Sender id or origination identity registered for the Tenant. */
  readonly originationIdentity: string;
  readonly configurationSet?: string;
}

/** Looks up the SMS configuration of a Tenant; returns undefined when the Tenant has none. */
export type TenantSmsConfigResolver = (tenantId: string) => Promise<TenantSmsConfig | undefined>;

export interface SmsTemplateEntry {
  /** DLT-registered text with `{#var#}` slots. */
  readonly text: string;
}

const SLOT = /\{#var#\}/g;

/** Fills DLT slots in order. Returns undefined when the number of variables does not match the slots. */
export function fillDltTemplate(text: string, variables: readonly string[]): string | undefined {
  const slots = text.match(SLOT)?.length ?? 0;
  if (slots !== variables.length) return undefined;
  let i = 0;
  return text.replace(SLOT, () => variables[i++] as string);
}

export class SmsAdapter implements ChannelAdapter {
  readonly channel = 'sms' as const;

  constructor(
    private readonly sms: SmsPort,
    private readonly resolveTenant: TenantSmsConfigResolver,
  ) {}

  async send(message: RenderedMessage, address: ChannelAddress): Promise<SendResult> {
    if (!address.phoneE164) return failure(false, 'No phone number');
    if (!message.smsTemplateId) return failure(false, 'SMS requires a DLT template id');
    const config = await this.resolveTenant(message.tenantId).catch(() => null);
    if (config === null) return failure(true, 'Tenant SMS configuration lookup failed');
    if (!config) return failure(false, 'Tenant has no DLT registration');

    try {
      const out = await this.sms.sendTextMessage({
        DestinationPhoneNumber: address.phoneE164,
        MessageBody: message.body,
        MessageType: 'TRANSACTIONAL',
        OriginationIdentity: config.originationIdentity,
        ...(config.configurationSet ? { ConfigurationSetName: config.configurationSet } : {}),
        Context: { EntityId: config.dltEntityId, TemplateId: message.smsTemplateId },
      });
      return out.MessageId ? { ok: true, providerId: out.MessageId } : { ok: true };
    } catch (err) {
      const e = describeError(err);
      const permanent = e.name === 'ValidationException' || e.name === 'ConflictException' || e.name === 'AccessDeniedException';
      return failure(!permanent && isRetryableStatus(e.status), `${e.name}: ${e.message}`);
    }
  }
}
