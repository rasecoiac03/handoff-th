import { PubSub } from "graphql-subscriptions";

// In-memory PubSub — suitable for single-instance deployments.
// For horizontal scaling, replace with Redis PubSub, Kafka, etc.
export const pubsub = new PubSub();

export const TOPIC_MESSAGE_ADDED = (jobId: string) => `MESSAGE_ADDED:${jobId}`;
