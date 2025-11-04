import { describe, it, expect } from "vitest";
import { createKafkaRouter, mergeKafkaRouters, KafkaRouter } from "./router.js";
import { z } from "zod";

describe("KafkaRouter", () => {
  it("should create a router", () => {
    const router = createKafkaRouter();
    expect(router).toBeInstanceOf(KafkaRouter);
  });

  it("should register a procedure", () => {
    const router = createKafkaRouter();
    const called: string[] = [];

    router
      .topic("test-topic", {
        input: { message: z.object({ id: z.string() }) },
      })
      .handler((ctx) => {
        called.push(ctx.input.id);
      });

    const procedures = router.getProcedures();
    expect(procedures).toHaveLength(1);
    expect(procedures[0]?.topic).toBe("test-topic");
  });

  it("should merge routers with prefix", () => {
    const router1 = createKafkaRouter();
    router1
      .topic("events", {
        input: { message: z.object({ type: z.string() }) },
      })
      .handler(() => {});

    const router = createKafkaRouter({ "v1": router1 });
    const procedures = router.getProcedures();
    expect(procedures).toHaveLength(1);
    expect(procedures[0]?.topic).toBe("v1/events");
  });

  it("should merge multiple routers", () => {
    const router1 = createKafkaRouter();
    router1
      .topic("events", {
        input: { message: z.object({ type: z.string() }) },
      })
      .handler(() => {});

    const router2 = createKafkaRouter();
    router2
      .topic("users", {
        input: { message: z.object({ id: z.string() }) },
      })
      .handler(() => {});

    const merged = mergeKafkaRouters(router1, router2);
    const procedures = merged.getProcedures();
    expect(procedures).toHaveLength(2);
    expect(procedures.map((p) => p.topic)).toContain("events");
    expect(procedures.map((p) => p.topic)).toContain("users");
  });

  it("should use middleware", async () => {
    const router = createKafkaRouter();
    const middlewareCalls: string[] = [];

    router.use(async ({ ctx, next }) => {
      middlewareCalls.push("router-middleware");
      return next();
    });

    router
      .topic("test", {
        input: { message: z.object({ value: z.string() }) },
      })
      .handler(() => {
        middlewareCalls.push("handler");
      });

    const middleware = router.getMiddleware();
    expect(middleware).toHaveLength(1);
  });

  it("should handle procedure middleware", async () => {
    const router = createKafkaRouter();
    const calls: string[] = [];

    router
      .topic("test", {
        input: { message: z.object({ value: z.string() }) },
      })
      .use(async ({ ctx, next }) => {
        calls.push("procedure-middleware");
        return next();
      })
      .handler(() => {
        calls.push("handler");
      });

    const procedures = router.getProcedures();
    expect(procedures[0]?.middleware).toHaveLength(1);
  });
});

