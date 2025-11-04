import type { z } from "zod";
import type { KafkaMessage } from "kafkajs";

export type InferOutput<T extends z.ZodTypeAny> = z.infer<T>;

export type InferErrorSchemas<T extends Record<string, z.ZodTypeAny>> = {
  [K in keyof T]: z.infer<T[K]>;
};

export type ErrorUnion<T extends Record<string, z.ZodTypeAny>> =
  InferErrorSchemas<T>[keyof InferErrorSchemas<T>];

export interface InputConfig {
  message?: z.ZodTypeAny;
}

export type InferInput<T extends InputConfig> = T extends { message: infer M }
  ? M extends z.ZodTypeAny
    ? z.infer<M>
    : never
  : never;

export interface BaseKafkaContext {
  message: KafkaMessage;
  topic: string;
  partition: number;
  offset: string;
}

export type TypedKafkaContext<
  TInput extends InputConfig,
  _TOutput extends z.ZodTypeAny | undefined,
  TErrors extends Record<string, z.ZodTypeAny> | undefined,
  TCustomContext extends object = Record<string, never>,
> = BaseKafkaContext &
  TCustomContext & {
    input: InferInput<TInput>;
    error: TErrors extends Record<string, z.ZodTypeAny>
      ? (error: ErrorUnion<TErrors>) => never
      : never;
  };

export type Middleware<
  TContextIn extends BaseKafkaContext,
  TContextOut extends BaseKafkaContext = TContextIn,
> = (opts: {
  ctx: TContextIn;
  next: (opts?: { ctx: Partial<TContextOut> }) => Promise<TContextOut>;
}) => Promise<TContextOut>;

export interface ProcedureConfig<
  TInput extends InputConfig,
  TOutput extends z.ZodTypeAny | undefined,
  TErrors extends Record<string, z.ZodTypeAny> | undefined,
> {
  input: TInput;
  output?: TOutput;
  errors?: TErrors;
}

/**
 * Helper function to create middleware with proper context typing.
 * Eliminates the need for type assertions when using middleware with routers.
 *
 * @example
 * ```typescript
 * const loggingMiddleware = createMiddleware<AppContext>(async ({ ctx, next }) => {
 *   console.log(`Processing message from topic ${ctx.topic}`);
 *   return next();
 * });
 *
 * const router = createKafkaRouter<AppContext>()
 *   .use(loggingMiddleware)
 *   .topic("user-events", { ... })
 * ```
 */
export function createMiddleware<TCustomContext extends object>(
  middleware: Middleware<
    BaseKafkaContext & TCustomContext,
    BaseKafkaContext & TCustomContext
  >,
): Middleware<BaseKafkaContext, BaseKafkaContext> {
  return middleware as unknown as Middleware<
    BaseKafkaContext,
    BaseKafkaContext
  >;
}
