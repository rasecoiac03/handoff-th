import { RedisPubSub } from "graphql-redis-subscriptions";
import { Redis } from "ioredis";

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

const options = { retryStrategy: (times: number) => Math.min(times * 50, 2000) };

export const pubsub = new RedisPubSub({
  publisher: new Redis(redisUrl, options),
  subscriber: new Redis(redisUrl, options),
});

export const TOPIC_MESSAGE_ADDED = (jobId: string) => `MESSAGE_ADDED:${jobId}`;
