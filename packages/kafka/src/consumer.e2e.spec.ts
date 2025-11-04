import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { KafkaContainer, StartedKafkaContainer } from "@testcontainers/kafka";
import { Kafka, Producer } from "kafkajs";
import { createKafkaRouter } from "./router.js";
import { createConsumer } from "./consumer.js";
import { z } from "zod";

// Helper to wait for consumer to be ready (simplified - just wait for group join)
async function waitForConsumerReady(_consumer: any, _timeout = 3000) {
  // Wait for consumer group to be established
  // In tests, a short delay is usually sufficient
  await new Promise((resolve) => setTimeout(resolve, 200));
}

// Helper to wait for message processing with a promise-based approach
function createMessageWaiter<T>(
  targetArray: T[],
  expectedCount: number,
  timeout = 2000,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      if (targetArray.length >= expectedCount) {
        resolve();
      } else if (Date.now() - start > timeout) {
        reject(
          new Error(
            `Timeout: Expected ${expectedCount} messages but got ${targetArray.length}`,
          ),
        );
      } else {
        setTimeout(check, 25); // Check every 25ms instead of 50ms
      }
    };
    check();
  });
}

describe("Consumer e2e", () => {
  let container: StartedKafkaContainer | undefined;
  let kafka: Kafka | undefined;
  let producer: Producer | undefined;

  beforeAll(async () => {
    try {
      container = await new KafkaContainer().start();
      const broker = `${container.getHost()}:${container.getMappedPort(9093)}`;

      kafka = new Kafka({
        brokers: [broker],
        // Reduce retries for faster test execution
        retry: {
          retries: 2,
          initialRetryTime: 100,
          multiplier: 2,
        },
      });

      producer = kafka.producer();
      await producer.connect();
    } catch (error) {
      console.error("Failed to start Kafka container:", error);
      throw error;
    }
  }, 120000);

  afterAll(async () => {
    if (producer) {
      await producer.disconnect();
    }
    if (container) {
      await container.stop();
    }
  });

  it("should consume and process messages", async () => {
    if (!container || !producer) {
      throw new Error("Container or producer not initialized");
    }

    const topic = "test-topic";
    const processedMessages: unknown[] = [];

    const router = createKafkaRouter();
    router
      .topic(topic, {
        input: {
          message: z.object({
            id: z.string(),
            value: z.number(),
          }),
        },
      })
      .handler((ctx) => {
        processedMessages.push(ctx.input);
      });

    const consumer = await createConsumer(router, {
      kafka: kafka!,
      groupId: "test-group",
      consumerConfig: {
        retry: {
          retries: 2,
          initialRetryTime: 100,
        },
      },
    });

    await waitForConsumerReady(consumer);

    await producer.send({
      topic,
      messages: [
        {
          value: JSON.stringify({ id: "1", value: 42 }),
        },
      ],
    });

    await createMessageWaiter(processedMessages, 1);

    expect(processedMessages).toHaveLength(1);
    expect(processedMessages[0]).toEqual({ id: "1", value: 42 });

    await consumer.disconnect();
  });

  it("should validate input schema", async () => {
    if (!container || !producer) {
      throw new Error("Container or producer not initialized");
    }

    const topic = "validation-topic";
    const errors: Error[] = [];

    const router = createKafkaRouter();
    router
      .topic(topic, {
        input: {
          message: z.object({
            id: z.string(),
            count: z.number(),
          }),
        },
      })
      .handler(() => {
        // Should not be called for invalid messages
      });

    const consumer = await createConsumer(router, {
      kafka: kafka!,
      groupId: "validation-group",
      consumerConfig: {
        retry: {
          retries: 1,
          initialRetryTime: 50,
        },
      },
      onError: (error) => {
        errors.push(error);
      },
    });

    await waitForConsumerReady(consumer);

    await producer.send({
      topic,
      messages: [
        {
          value: JSON.stringify({ id: "1", count: "not-a-number" }),
        },
      ],
    });

    await createMessageWaiter(errors, 1);

    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]?.message).toContain("Validation");

    await consumer.disconnect();
  });

  it("should validate output schema", async () => {
    if (!container || !producer) {
      throw new Error("Container or producer not initialized");
    }

    const topic = "output-validation-topic";
    const errors: Error[] = [];

    const router = createKafkaRouter();
    router
      .topic(topic, {
        input: {
          message: z.object({ id: z.string() }),
        },
        output: z.object({
          result: z.string(),
          count: z.number(),
        }),
      })
      .handler(() => {
        return { result: "success", count: "not-a-number" } as any;
      });

    const consumer = await createConsumer(router, {
      kafka: kafka!,
      groupId: "output-validation-group",
      consumerConfig: {
        retry: {
          retries: 1,
          initialRetryTime: 50,
        },
      },
      onError: (error) => {
        errors.push(error);
      },
    });

    await waitForConsumerReady(consumer);

    await producer.send({
      topic,
      messages: [
        {
          value: JSON.stringify({ id: "1" }),
        },
      ],
    });

    // Wait for error to occur (output validation will fail)
    await createMessageWaiter(errors, 1);

    expect(errors.length).toBeGreaterThan(0);

    await consumer.disconnect();
  });

  it("should handle custom context", async () => {
    if (!container || !producer) {
      throw new Error("Container or producer not initialized");
    }

    const topic = "context-topic";
    const contexts: unknown[] = [];

    const router = createKafkaRouter<{ userId: string }>();
    router
      .topic(topic, {
        input: {
          message: z.object({ id: z.string() }),
        },
      })
      .handler((ctx) => {
        contexts.push({ userId: ctx.userId, input: ctx.input });
      });

    const consumer = await createConsumer(router, {
      kafka: kafka!,
      groupId: "context-group",
      createContext: async (_baseCtx) => {
        return { userId: "user-123" };
      },
    });

    await waitForConsumerReady(consumer);

    await producer.send({
      topic,
      messages: [
        {
          value: JSON.stringify({ id: "1" }),
        },
      ],
    });

    await createMessageWaiter(contexts, 1);

    expect(contexts).toHaveLength(1);
    const context = contexts[0] as { userId: string; input: { id: string } };
    expect(context.userId).toBe("user-123");
    expect(context.input.id).toBe("1");

    await consumer.disconnect();
  });

  it("should handle router middleware", async () => {
    if (!container || !producer) {
      throw new Error("Container or producer not initialized");
    }

    const topic = "middleware-topic";
    const calls: string[] = [];

    const router = createKafkaRouter();
    router.use(async ({ ctx: _ctx, next }) => {
      calls.push("router-middleware");
      return next();
    });

    router
      .topic(topic, {
        input: {
          message: z.object({ id: z.string() }),
        },
      })
      .handler(() => {
        calls.push("handler");
      });

    const consumer = await createConsumer(router, {
      kafka: kafka!,
      groupId: "middleware-group",
    });

    await waitForConsumerReady(consumer);

    await producer.send({
      topic,
      messages: [
        {
          value: JSON.stringify({ id: "1" }),
        },
      ],
    });

    await createMessageWaiter(calls, 2);

    expect(calls).toContain("router-middleware");
    expect(calls).toContain("handler");

    await consumer.disconnect();
  });

  it("should handle procedure middleware", async () => {
    if (!container || !producer) {
      throw new Error("Container or producer not initialized");
    }

    const topic = "procedure-middleware-topic";
    const calls: string[] = [];

    const router = createKafkaRouter();
    router
      .topic(topic, {
        input: {
          message: z.object({ id: z.string() }),
        },
      })
      .use(async ({ ctx: _ctx, next }) => {
        calls.push("procedure-middleware-1");
        return next();
      })
      .use(async ({ ctx: _ctx, next }) => {
        calls.push("procedure-middleware-2");
        return next();
      })
      .handler(() => {
        calls.push("handler");
      });

    const consumer = await createConsumer(router, {
      kafka: kafka!,
      groupId: "procedure-middleware-group",
    });

    await waitForConsumerReady(consumer);

    await producer.send({
      topic,
      messages: [
        {
          value: JSON.stringify({ id: "1" }),
        },
      ],
    });

    await createMessageWaiter(calls, 3);

    expect(calls).toEqual([
      "procedure-middleware-1",
      "procedure-middleware-2",
      "handler",
    ]);

    await consumer.disconnect();
  });

  it("should handle error schemas", async () => {
    if (!container || !producer) {
      throw new Error("Container or producer not initialized");
    }

    const topic = "error-schema-topic";
    const errors: Error[] = [];

    const router = createKafkaRouter();
    router
      .topic(topic, {
        input: {
          message: z.object({ id: z.string() }),
        },
        errors: {
          NOT_FOUND: z.object({
            error: z.object({
              code: z.literal("NOT_FOUND"),
              message: z.string(),
            }),
          }),
        },
      })
      .handler((ctx) => {
        if (ctx.input.id === "missing") {
          ctx.error({
            error: {
              code: "NOT_FOUND",
              message: "Resource not found",
            },
          });
        }
      });

    const consumer = await createConsumer(router, {
      kafka: kafka!,
      groupId: "error-schema-group",
      consumerConfig: {
        retry: {
          retries: 1,
          initialRetryTime: 50,
        },
      },
      onError: (error) => {
        errors.push(error);
      },
    });

    await waitForConsumerReady(consumer);

    await producer.send({
      topic,
      messages: [
        {
          value: JSON.stringify({ id: "missing" }),
        },
      ],
    });

    await createMessageWaiter(errors, 1);

    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]?.message).toContain("Resource not found");

    await consumer.disconnect();
  });

  it("should handle multiple topics", async () => {
    if (!container || !producer) {
      throw new Error("Container or producer not initialized");
    }
    const topic1 = "multi-topic-1";
    const topic2 = "multi-topic-2";
    const processed: Record<string, unknown[]> = {
      [topic1]: [],
      [topic2]: [],
    };

    const router = createKafkaRouter();
    router
      .topic(topic1, {
        input: {
          message: z.object({ id: z.string() }),
        },
      })
      .handler((ctx) => {
        processed[topic1]!.push(ctx.input);
      });

    router
      .topic(topic2, {
        input: {
          message: z.object({ value: z.number() }),
        },
      })
      .handler((ctx) => {
        processed[topic2]!.push(ctx.input);
      });

    const consumer = await createConsumer(router, {
      kafka: kafka!,
      groupId: "multi-topic-group",
    });

    await waitForConsumerReady(consumer);

    await producer.send({
      topic: topic1,
      messages: [{ value: JSON.stringify({ id: "1" }) }],
    });

    await producer.send({
      topic: topic2,
      messages: [{ value: JSON.stringify({ value: 42 }) }],
    });

    await Promise.all([
      createMessageWaiter(processed[topic1]!, 1),
      createMessageWaiter(processed[topic2]!, 1),
    ]);

    expect(processed[topic1]).toHaveLength(1);
    expect(processed[topic2]).toHaveLength(1);
    const topic1Message = processed[topic1]?.[0];
    const topic2Message = processed[topic2]?.[0];
    expect(topic1Message).toEqual({ id: "1" });
    expect(topic2Message).toEqual({ value: 42 });

    await consumer.disconnect();
  });
});
