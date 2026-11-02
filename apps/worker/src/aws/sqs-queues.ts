import {
  ChangeMessageVisibilityCommand,
  DeleteMessageCommand,
  ReceiveMessageCommand,
  SendMessageCommand,
  type SQSClient,
} from '@aws-sdk/client-sqs';
import type { QueueClient, QueueMessage, QueuePublisher } from '@campusconnect/server/outbox';

/** Publishes to and consumes from SQS standard queues, resolving a queue name to its URL with a fixed prefix. */
export class SqsQueues implements QueuePublisher, QueueClient {
  constructor(
    private readonly sqs: SQSClient,
    private readonly urlPrefix: string,
  ) {}

  private url(queue: string): string {
    return `${this.urlPrefix}${queue}`;
  }

  async send(queue: string, body: string): Promise<void> {
    await this.sqs.send(new SendMessageCommand({ QueueUrl: this.url(queue), MessageBody: body }));
  }

  async receive(queue: string, maxMessages: number, waitSeconds: number): Promise<readonly QueueMessage[]> {
    const result = await this.sqs.send(
      new ReceiveMessageCommand({
        QueueUrl: this.url(queue),
        MaxNumberOfMessages: maxMessages,
        WaitTimeSeconds: waitSeconds,
        MessageSystemAttributeNames: ['ApproximateReceiveCount'],
      }),
    );
    const messages: QueueMessage[] = [];
    for (const message of result.Messages ?? []) {
      if (message.Body === undefined || message.ReceiptHandle === undefined) continue;
      messages.push({
        body: message.Body,
        receiptHandle: message.ReceiptHandle,
        receiveCount: Number(message.Attributes?.['ApproximateReceiveCount'] ?? 1),
      });
    }
    return messages;
  }

  async delete(queue: string, receiptHandle: string): Promise<void> {
    await this.sqs.send(new DeleteMessageCommand({ QueueUrl: this.url(queue), ReceiptHandle: receiptHandle }));
  }

  async changeVisibility(queue: string, receiptHandle: string, timeoutSeconds: number): Promise<void> {
    await this.sqs.send(
      new ChangeMessageVisibilityCommand({
        QueueUrl: this.url(queue),
        ReceiptHandle: receiptHandle,
        VisibilityTimeout: timeoutSeconds,
      }),
    );
  }
}
