import {
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  type S3Client,
} from '@aws-sdk/client-s3';
import type { ObjectLockClient } from '@campusconnect/server/audit';

/** `ObjectLockClient` over S3. Anchors are written in COMPLIANCE mode, so no one can shorten or remove the retention. */
export class S3ObjectLockClient implements ObjectLockClient {
  constructor(
    private readonly s3: S3Client,
    private readonly bucket: string,
  ) {}

  async putObject(request: { key: string; body: string; retainUntil: Date }): Promise<void> {
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: request.key,
        Body: request.body,
        ContentType: 'application/json',
        ObjectLockMode: 'COMPLIANCE',
        ObjectLockRetainUntilDate: request.retainUntil,
      }),
    );
  }

  async getObject(key: string): Promise<string | undefined> {
    try {
      const result = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      return await result.Body?.transformToString();
    } catch (error) {
      if (error instanceof Error && error.name === 'NoSuchKey') return undefined;
      throw error;
    }
  }

  async listKeys(prefix: string, limit: number): Promise<string[]> {
    const result = await this.s3.send(
      new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix, MaxKeys: limit }),
    );
    return (result.Contents ?? []).flatMap((object) => (object.Key === undefined ? [] : [object.Key]));
  }
}
