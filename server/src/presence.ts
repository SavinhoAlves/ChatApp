import { Redis } from 'ioredis';

/**
 * Presença online por usuário. Um usuário pode ter vários sockets (celular + PC),
 * então "online" significa ter pelo menos um socket conectado.
 *
 * Sem REDIS_URL usa memória (suficiente para uma única instância do servidor).
 */
export interface Presence {
  /** Retorna true se o usuário acabou de ficar online (primeiro socket). */
  add(userId: string, socketId: string): Promise<boolean>;
  /** Retorna true se o usuário acabou de ficar offline (último socket saiu). */
  remove(userId: string, socketId: string): Promise<boolean>;
  isOnline(userId: string): Promise<boolean>;
  onlineAmong(userIds: string[]): Promise<string[]>;
}

class MemoryPresence implements Presence {
  private sockets = new Map<string, Set<string>>();

  async add(userId: string, socketId: string) {
    const set = this.sockets.get(userId) ?? new Set<string>();
    const wasOffline = set.size === 0;
    set.add(socketId);
    this.sockets.set(userId, set);
    return wasOffline;
  }

  async remove(userId: string, socketId: string) {
    const set = this.sockets.get(userId);
    if (!set) return false;
    set.delete(socketId);
    if (set.size === 0) {
      this.sockets.delete(userId);
      return true;
    }
    return false;
  }

  async isOnline(userId: string) {
    return (this.sockets.get(userId)?.size ?? 0) > 0;
  }

  async onlineAmong(userIds: string[]) {
    return userIds.filter((id) => (this.sockets.get(id)?.size ?? 0) > 0);
  }
}

const key = (userId: string) => `presence:${userId}`;

class RedisPresence implements Presence {
  constructor(private redis: Redis) {}

  /** Ao iniciar, nenhum socket antigo existe mais: limpa presença residual. */
  async reset() {
    const stream = this.redis.scanStream({ match: 'presence:*', count: 100 });
    for await (const keys of stream as AsyncIterable<string[]>) {
      if (keys.length) await this.redis.del(...keys);
    }
  }

  async add(userId: string, socketId: string) {
    const before = await this.redis.scard(key(userId));
    await this.redis.sadd(key(userId), socketId);
    return before === 0;
  }

  async remove(userId: string, socketId: string) {
    await this.redis.srem(key(userId), socketId);
    return (await this.redis.scard(key(userId))) === 0;
  }

  async isOnline(userId: string) {
    return (await this.redis.scard(key(userId))) > 0;
  }

  async onlineAmong(userIds: string[]) {
    if (userIds.length === 0) return [];
    const pipeline = this.redis.pipeline();
    for (const id of userIds) pipeline.scard(key(id));
    const results = (await pipeline.exec()) ?? [];
    return userIds.filter((_, i) => Number(results[i]?.[1] ?? 0) > 0);
  }
}

export async function createPresence(redis?: Redis): Promise<Presence> {
  if (!redis) return new MemoryPresence();
  const presence = new RedisPresence(redis);
  await presence.reset();
  return presence;
}
