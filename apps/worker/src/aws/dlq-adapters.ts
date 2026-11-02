import { GetMetricStatisticsCommand, type CloudWatchClient } from '@aws-sdk/client-cloudwatch';
import { PublishCommand, type SNSClient } from '@aws-sdk/client-sns';
import type { AlertSink, DlqAgeSource } from '../dlq-realert';

const LOOKBACK_MS = 10 * 60 * 1000;
const PERIOD_SECONDS = 60;

/** Reads `ApproximateAgeOfOldestMessage` from CloudWatch; SQS itself does not expose the age. */
export class CloudWatchDlqAgeSource implements DlqAgeSource {
  constructor(
    private readonly cloudWatch: CloudWatchClient,
    private readonly now: () => number = Date.now,
  ) {}

  async oldestMessageAgeSeconds(queue: string): Promise<number> {
    const end = this.now();
    const result = await this.cloudWatch.send(
      new GetMetricStatisticsCommand({
        Namespace: 'AWS/SQS',
        MetricName: 'ApproximateAgeOfOldestMessage',
        Dimensions: [{ Name: 'QueueName', Value: queue }],
        StartTime: new Date(end - LOOKBACK_MS),
        EndTime: new Date(end),
        Period: PERIOD_SECONDS,
        Statistics: ['Maximum'],
      }),
    );
    // Use the latest datapoint: an older one may describe a message that has since been handled.
    const latest = [...(result.Datapoints ?? [])].sort(
      (a, b) => (b.Timestamp?.getTime() ?? 0) - (a.Timestamp?.getTime() ?? 0),
    )[0];
    return latest?.Maximum ?? 0;
  }
}

/** Publishes alerts to the SNS topic that AWS Chatbot forwards to the operations channel. */
export class SnsAlertSink implements AlertSink {
  constructor(
    private readonly sns: SNSClient,
    private readonly topicArn: string,
  ) {}

  async dlqMessageStuck(alert: { readonly queue: string; readonly ageSeconds: number }): Promise<void> {
    await this.sns.send(
      new PublishCommand({
        TopicArn: this.topicArn,
        Subject: 'DLQ message stuck',
        Message: JSON.stringify({ kind: 'dlq_message_stuck', queue: alert.queue, ageSeconds: alert.ageSeconds }),
      }),
    );
  }
}
