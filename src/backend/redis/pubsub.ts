import { redis, RedisClient } from "bun";

// `redis` is Bun's built-in singleton client (reads REDIS_URL). It's the publisher.
// A subscribed connection can only call subscribe/unsubscribe/ping (Bun's pub/sub is
// experimental, new in 1.2.23), so a separate connection is required for publishing —
// hence the `.duplicate()` here, kept as a lazily-created singleton subscriber.
export const publisher: RedisClient = redis;

let subscriber: RedisClient | null = null;
let subscriberReady: Promise<RedisClient> | null = null;

export function getSubscriber(onReconnect: () => void): Promise<RedisClient> {
  if (subscriberReady) return subscriberReady;
  subscriberReady = publisher.duplicate().then((client) => {
    subscriber = client;
    // Fires on the initial connect too, but callers only register real subscriptions
    // (and hence only need reconciliation) after their own first subscribe() call, so
    // an extra no-op reconciliation pass on startup is harmless.
    client.onconnect = onReconnect;
    return client;
  });
  return subscriberReady;
}

export function closeSubscriber(): void {
  subscriber?.close();
  subscriber = null;
  subscriberReady = null;
}
