// Email channel over Amazon SES (SESv2 SendEmail).

import { describeError, failure, isRetryableStatus, type ChannelAdapter, type ChannelAddress, type RenderedMessage, type SendResult } from './types.js';

/** Subset of the SESv2 `SendEmailCommand` input that this adapter uses. */
export interface SesSendEmailInput {
  FromEmailAddress: string;
  Destination: { ToAddresses: string[] };
  Content: {
    Simple: {
      Subject: { Data: string; Charset: 'UTF-8' };
      Body: { Text: { Data: string; Charset: 'UTF-8' }; Html?: { Data: string; Charset: 'UTF-8' } };
    };
  };
  ConfigurationSetName?: string;
}

/** Port implemented by a thin wrapper over `SESv2Client.send(new SendEmailCommand(input))`. */
export interface SesPort {
  sendEmail(input: SesSendEmailInput): Promise<{ MessageId?: string }>;
}

export interface EmailAdapterOptions {
  readonly fromAddress: string;
  readonly configurationSet?: string;
}

/** SES error names that will not succeed on retry. */
const PERMANENT_ERRORS = new Set([
  'MessageRejected',
  'MailFromDomainNotVerifiedException',
  'AccountSuspendedException',
  'BadRequestException',
  'NotFoundException',
]);

export class SesEmailAdapter implements ChannelAdapter {
  readonly channel = 'email' as const;

  constructor(
    private readonly ses: SesPort,
    private readonly options: EmailAdapterOptions,
  ) {}

  async send(message: RenderedMessage, address: ChannelAddress): Promise<SendResult> {
    if (!address.email) return failure(false, 'No email address');
    const input: SesSendEmailInput = {
      FromEmailAddress: this.options.fromAddress,
      Destination: { ToAddresses: [address.email] },
      Content: {
        Simple: {
          Subject: { Data: message.title, Charset: 'UTF-8' },
          Body: {
            Text: { Data: message.body, Charset: 'UTF-8' },
            ...(message.html ? { Html: { Data: message.html, Charset: 'UTF-8' as const } } : {}),
          },
        },
      },
      ...(this.options.configurationSet ? { ConfigurationSetName: this.options.configurationSet } : {}),
    };
    try {
      const out = await this.ses.sendEmail(input);
      return out.MessageId ? { ok: true, providerId: out.MessageId } : { ok: true };
    } catch (err) {
      const e = describeError(err);
      const retryable = !PERMANENT_ERRORS.has(e.name) && isRetryableStatus(e.status);
      return failure(retryable, `${e.name}: ${e.message}`);
    }
  }
}
