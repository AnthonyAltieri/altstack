import { describe, it, expect } from "vitest";
import { createKafkaRouter } from "./router.js";
import { z } from "zod";

describe("KafkaProcedure", () => {
  it("should build procedure with input validation", () => {
    const router = createKafkaRouter();
    let receivedInput: unknown;

    router
      .topic("test-topic", {
        input: { message: z.object({ id: z.string(), value: z.number() }) },
      })
      .handler((ctx) => {
        receivedInput = ctx.input;
      });

    const procedures = router.getProcedures();
    expect(procedures).toHaveLength(1);
    expect(procedures[0]?.config.input.message).toBeDefined();
  });

  it("should build procedure with output validation", () => {
    const router = createKafkaRouter();
    const outputSchema = z.object({ result: z.string() });

    router
      .topic("test-topic", {
        input: { message: z.object({ id: z.string() }) },
        output: outputSchema,
      })
      .handler(() => {
        return { result: "success" };
      });

    const procedures = router.getProcedures();
    expect(procedures[0]?.config.output).toBe(outputSchema);
  });

  it("should build procedure with error schemas", () => {
    const router = createKafkaRouter();
    const errorSchemas = {
      NOT_FOUND: z.object({
        error: z.object({
          code: z.literal("NOT_FOUND"),
          message: z.string(),
        }),
      }),
    };

    router
      .topic("test-topic", {
        input: { message: z.object({ id: z.string() }) },
        errors: errorSchemas,
      })
      .handler((ctx) => {
        if (ctx.input.id === "missing") {
          ctx.error({
            error: {
              code: "NOT_FOUND",
              message: "Not found",
            },
          });
        }
      });

    const procedures = router.getProcedures();
    expect(procedures[0]?.config.errors).toBeDefined();
  });

  it("should chain middleware", () => {
    const router = createKafkaRouter();
    const calls: string[] = [];

    router
      .topic("test", {
        input: { message: z.object({ value: z.string() }) },
      })
      .use(async ({ ctx, next }) => {
        calls.push("middleware-1");
        return next();
      })
      .use(async ({ ctx, next }) => {
        calls.push("middleware-2");
        return next();
      })
      .handler(() => {
        calls.push("handler");
      });

    const procedures = router.getProcedures();
    expect(procedures[0]?.middleware).toHaveLength(2);
  });

  it("should use base procedure builder", () => {
    const router = createKafkaRouter();
    const baseInput = z.object({ base: z.string() });
    const baseOutput = z.object({ baseResult: z.string() });

    router.procedure
      .input({ message: baseInput })
      .output(baseOutput)
      .topic("test", {
        input: { message: z.object({ id: z.string() }) },
      })
      .handler(() => {
        return { baseResult: "success" };
      });

    const procedures = router.getProcedures();
    expect(procedures).toHaveLength(1);
  });

  it("should throw error when handler not defined", () => {
    const router = createKafkaRouter();
    const builder = router.topic("test", {
      input: { message: z.object({ id: z.string() }) },
    });

    expect(() => builder.build()).toThrow("Handler not defined for topic test");
  });
});

