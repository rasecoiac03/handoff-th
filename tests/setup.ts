import { vi } from "vitest";
import { PubSub } from "graphql-subscriptions";

const mockPubSub = new PubSub();

vi.mock("../src/realtime/pubsub.js", () => ({
  pubsub: mockPubSub,
  TOPIC_MESSAGE_ADDED: (jobId: string) => `MESSAGE_ADDED:${jobId}`,
}));
