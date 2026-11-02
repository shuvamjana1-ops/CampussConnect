// Session store over a Valkey (Redis protocol) client. The client is injected, so this module adds no dependency.

import type { SessionStore } from './identity.types';

/** The subset of an ioredis-style client used here. */
export interface ValkeyClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: 'EX', seconds: number): Promise<unknown>;
  getdel(key: string): Promise<string | null>;
  del(key: string): Promise<unknown>;
  expire(key: string, seconds: number): Promise<number>;
}

export class ValkeySessionStore implements SessionStore {
  constructor(
    private readonly client: ValkeyClient,
    private readonly prefix = 'cc:',
  ) {}

  async get(key: string): Promise<string | undefined> {
    return (await this.client.get(this.prefix + key)) ?? undefined;
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.client.set(this.prefix + key, value, 'EX', Math.max(1, Math.ceil(ttlSeconds)));
  }

  async take(key: string): Promise<string | undefined> {
    return (await this.client.getdel(this.prefix + key)) ?? undefined;
  }

  async delete(key: string): Promise<void> {
    await this.client.del(this.prefix + key);
  }

  async touch(key: string, ttlSeconds: number): Promise<boolean> {
    return (await this.client.expire(this.prefix + key, Math.max(1, Math.ceil(ttlSeconds)))) === 1;
  }
}
