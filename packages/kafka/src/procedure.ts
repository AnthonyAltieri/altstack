import { z } from "zod";
import type {
  InferOutput,
  InputConfig,
  TypedKafkaContext,
  ProcedureConfig,
} from "./types.js";

function mergeInputConfig<
  TBase extends InputConfig,
  TOverride extends InputConfig,
>(base: TBase, override: TOverride): { message?: z.ZodTypeAny } {
  return {
    message: override.message ?? base.message,
  };
}

// Helper type to merge error configs - unions schemas when error codes overlap
// When both procedure and route define the same error code, the schemas are unioned
// This allows ctx.error() to accept either schema for that error code
type MergeErrors<
  TBaseErrors extends Record<string, z.ZodTypeAny> | undefined,
  TRouteErrors extends Record<string, z.ZodTypeAny> | undefined,
> =
  TRouteErrors extends Record<string, z.ZodTypeAny>
    ? TBaseErrors extends Record<string, z.ZodTypeAny>
      ? {
          // Union all keys from both error configs
          [K in
            | keyof TBaseErrors
            | keyof TRouteErrors]: K extends keyof TBaseErrors
            ? K extends keyof TRouteErrors
              ? TBaseErrors[K] | TRouteErrors[K] // Both define this error code - union the schemas
              : TBaseErrors[K] // Only base defines this error code
            : K extends keyof TRouteErrors
              ? TRouteErrors[K] // Only route defines this error code
              : never;
        }
      : TRouteErrors
    : TBaseErrors;

export interface KafkaProcedure<
  TInput extends InputConfig,
  TOutput extends z.ZodTypeAny | undefined,
  TErrors extends Record<string, z.ZodTypeAny> | undefined,
  TCustomContext extends object = Record<string, never>,
> {
  topic: string;
  config: {
    input: TInput;
    output?: TOutput;
    errors?: TErrors;
  };
  handler: (
    ctx: TypedKafkaContext<TInput, TOutput, TErrors, TCustomContext>,
  ) =>
    | Promise<InferOutput<NonNullable<TOutput>>>
    | InferOutput<NonNullable<TOutput>>
    | void
    | Promise<void>;
  middleware: Array<
    (opts: {
      ctx: TypedKafkaContext<TInput, TOutput, TErrors, TCustomContext>;
      next: (opts?: {
        ctx: Partial<
          TypedKafkaContext<TInput, TOutput, TErrors, TCustomContext>
        >;
      }) => Promise<
        TypedKafkaContext<TInput, TOutput, TErrors, TCustomContext>
      >;
    }) => Promise<TypedKafkaContext<TInput, TOutput, TErrors, TCustomContext>>
  >;
}

export class BaseKafkaProcedureBuilder<
  TBaseInput extends InputConfig = { message?: never },
  TBaseOutput extends z.ZodTypeAny | undefined = undefined,
  TBaseErrors extends Record<string, z.ZodTypeAny> | undefined = undefined,
  TCustomContext extends object = Record<string, never>,
  TRouter = unknown,
> {
  private _baseConfig: {
    input: TBaseInput;
    output?: TBaseOutput;
    errors?: TBaseErrors;
  };
  private _middleware: Array<
    (opts: {
      ctx: TypedKafkaContext<
        InputConfig,
        z.ZodTypeAny | undefined,
        Record<string, z.ZodTypeAny> | undefined,
        TCustomContext
      >;
      next: (opts?: {
        ctx: Partial<
          TypedKafkaContext<
            InputConfig,
            z.ZodTypeAny | undefined,
            Record<string, z.ZodTypeAny> | undefined,
            TCustomContext
          >
        >;
      }) => Promise<
        TypedKafkaContext<
          InputConfig,
          z.ZodTypeAny | undefined,
          Record<string, z.ZodTypeAny> | undefined,
          TCustomContext
        >
      >;
    }) => Promise<
      TypedKafkaContext<
        InputConfig,
        z.ZodTypeAny | undefined,
        Record<string, z.ZodTypeAny> | undefined,
        TCustomContext
      >
    >
  > = [];

  constructor(
    baseConfig?: {
      input?: TBaseInput;
      output?: TBaseOutput;
      errors?: TBaseErrors;
    },
    middleware?: Array<
      (opts: {
        ctx: TypedKafkaContext<
          InputConfig,
          z.ZodTypeAny | undefined,
          Record<string, z.ZodTypeAny> | undefined,
          TCustomContext
        >;
        next: (opts?: {
          ctx: Partial<
            TypedKafkaContext<
              InputConfig,
              z.ZodTypeAny | undefined,
              Record<string, z.ZodTypeAny> | undefined,
              TCustomContext
            >
          >;
        }) => Promise<
          TypedKafkaContext<
            InputConfig,
            z.ZodTypeAny | undefined,
            Record<string, z.ZodTypeAny> | undefined,
            TCustomContext
          >
        >;
      }) => Promise<
        TypedKafkaContext<
          InputConfig,
          z.ZodTypeAny | undefined,
          Record<string, z.ZodTypeAny> | undefined,
          TCustomContext
        >
      >
    >,
    private router?: TRouter & {
      register: (
        proc: KafkaProcedure<
          InputConfig,
          z.ZodTypeAny | undefined,
          Record<string, z.ZodTypeAny> | undefined,
          TCustomContext
        >,
      ) => void;
    },
  ) {
    this._baseConfig = {
      input: (baseConfig?.input ?? {}) as TBaseInput,
      output: baseConfig?.output,
      errors: baseConfig?.errors,
    };
    if (middleware) {
      this._middleware = [...middleware];
    }
  }

  use(
    middleware: (opts: {
      ctx: TypedKafkaContext<
        InputConfig,
        z.ZodTypeAny | undefined,
        Record<string, z.ZodTypeAny> | undefined,
        TCustomContext
      >;
      next: (opts?: {
        ctx: Partial<
          TypedKafkaContext<
            InputConfig,
            z.ZodTypeAny | undefined,
            Record<string, z.ZodTypeAny> | undefined,
            TCustomContext
          >
        >;
      }) => Promise<
        TypedKafkaContext<
          InputConfig,
          z.ZodTypeAny | undefined,
          Record<string, z.ZodTypeAny> | undefined,
          TCustomContext
        >
      >;
    }) => Promise<
      TypedKafkaContext<
        InputConfig,
        z.ZodTypeAny | undefined,
        Record<string, z.ZodTypeAny> | undefined,
        TCustomContext
      >
    >,
  ): BaseKafkaProcedureBuilder<
    TBaseInput,
    TBaseOutput,
    TBaseErrors,
    TCustomContext,
    TRouter
  > {
    return new BaseKafkaProcedureBuilder<
      TBaseInput,
      TBaseOutput,
      TBaseErrors,
      TCustomContext,
      TRouter
    >(this._baseConfig, [...this._middleware, middleware], this.router);
  }

  input<TInput extends InputConfig>(
    input: TInput,
  ): BaseKafkaProcedureBuilder<
    {
      message: TInput["message"] extends z.ZodTypeAny
        ? TInput["message"]
        : TBaseInput["message"] extends z.ZodTypeAny
          ? TBaseInput["message"]
          : never;
    },
    TBaseOutput,
    TBaseErrors,
    TCustomContext,
    TRouter
  > {
    const mergedInput = mergeInputConfig(this._baseConfig.input, input);
    return new BaseKafkaProcedureBuilder(
      {
        input: mergedInput as any,
        output: this._baseConfig.output,
        errors: this._baseConfig.errors,
      },
      this._middleware,
      this.router,
    ) as any;
  }

  output<TOutput extends z.ZodTypeAny>(
    output: TOutput,
  ): BaseKafkaProcedureBuilder<
    TBaseInput,
    TOutput,
    TBaseErrors,
    TCustomContext,
    TRouter
  > {
    return new BaseKafkaProcedureBuilder<
      TBaseInput,
      TOutput,
      TBaseErrors,
      TCustomContext,
      TRouter
    >(
      {
        input: this._baseConfig.input,
        output,
        errors: this._baseConfig.errors,
      },
      this._middleware,
      this.router,
    );
  }

  errors<TErrors extends Record<string, z.ZodTypeAny>>(
    errors: TErrors,
  ): BaseKafkaProcedureBuilder<
    TBaseInput,
    TBaseOutput,
    TErrors,
    TCustomContext,
    TRouter
  > {
    return new BaseKafkaProcedureBuilder<
      TBaseInput,
      TBaseOutput,
      TErrors,
      TCustomContext,
      TRouter
    >(
      {
        input: this._baseConfig.input,
        output: this._baseConfig.output,
        errors,
      },
      this._middleware,
      this.router,
    );
  }

  on<
    TRouterProvided extends {
      register: (
        proc: KafkaProcedure<
          InputConfig,
          z.ZodTypeAny | undefined,
          Record<string, z.ZodTypeAny> | undefined,
          TCustomContext
        >,
      ) => void;
    },
  >(
    router: TRouterProvided,
  ): BaseKafkaProcedureBuilder<
    TBaseInput,
    TBaseOutput,
    TBaseErrors,
    TCustomContext,
    TRouterProvided
  > {
    return new BaseKafkaProcedureBuilder<
      TBaseInput,
      TBaseOutput,
      TBaseErrors,
      TCustomContext,
      TRouterProvided
    >(this._baseConfig, this._middleware, router);
  }

  topic<
    TTopic extends string,
    TInput extends InputConfig,
    TOutput extends z.ZodTypeAny | undefined,
    TErrors extends Record<string, z.ZodTypeAny> | undefined,
  >(
    topic: TTopic,
    config: ProcedureConfig<TInput, TOutput, TErrors>,
    router?: TRouter & {
      register: (
        proc: KafkaProcedure<
          InputConfig,
          z.ZodTypeAny | undefined,
          Record<string, z.ZodTypeAny> | undefined,
          TCustomContext
        >,
      ) => void;
    },
  ): KafkaProcedureBuilder<
    {
      message: TInput["message"] extends z.ZodTypeAny
        ? TInput["message"]
        : TBaseInput["message"] extends z.ZodTypeAny
          ? TBaseInput["message"]
          : never;
    },
    TOutput extends z.ZodTypeAny ? TOutput : TBaseOutput,
    MergeErrors<TBaseErrors, TErrors>,
    TCustomContext,
    TRouter
  > {
    const targetRouter = router ?? this.router;
    if (!targetRouter) {
      throw new Error(
        "Procedure must be created from a router or a router must be provided",
      );
    }
    // Merge errors: union schemas when error codes overlap
    const mergedErrors =
      config.errors || this._baseConfig.errors
        ? (() => {
            const base = (this._baseConfig.errors || {}) as Record<
              string,
              z.ZodTypeAny
            >;
            const route = (config.errors || {}) as Record<string, z.ZodTypeAny>;
            const merged: Record<string, z.ZodTypeAny> = {};

            // Add all base errors
            for (const [code, schema] of Object.entries(base)) {
              merged[code] = schema as z.ZodTypeAny;
            }

            // Add route errors, unioning if error code already exists
            for (const [code, routeSchema] of Object.entries(route)) {
              const baseSchema = merged[code];
              if (baseSchema) {
                // Both procedure and route define this error code - union the schemas
                merged[code] = z.union([
                  baseSchema,
                  routeSchema as z.ZodTypeAny,
                ]) as z.ZodTypeAny;
              } else {
                // Only route defines this error code
                merged[code] = routeSchema as z.ZodTypeAny;
              }
            }

            return merged;
          })()
        : undefined;
    const mergedInput = mergeInputConfig(this._baseConfig.input, config.input);
    const mergedConfig = {
      input: mergedInput as any,
      output: config.output ?? this._baseConfig.output,
      errors: mergedErrors,
    };
    const typedMiddleware = this._middleware.map(
      (mw) =>
        mw as unknown as (opts: {
          ctx: TypedKafkaContext<
            {
              message: TInput["message"] extends z.ZodTypeAny
                ? TInput["message"]
                : TBaseInput["message"] extends z.ZodTypeAny
                  ? TBaseInput["message"]
                  : never;
            },
            TOutput extends z.ZodTypeAny ? TOutput : TBaseOutput,
            MergeErrors<TBaseErrors, TErrors>,
            TCustomContext
          >;
          next: (opts?: {
            ctx: Partial<
              TypedKafkaContext<
                {
                  message: TInput["message"] extends z.ZodTypeAny
                    ? TInput["message"]
                    : TBaseInput["message"] extends z.ZodTypeAny
                      ? TBaseInput["message"]
                      : never;
                },
                TOutput extends z.ZodTypeAny ? TOutput : TBaseOutput,
                MergeErrors<TBaseErrors, TErrors>,
                TCustomContext
              >
            >;
          }) => Promise<
            TypedKafkaContext<
              {
                message: TInput["message"] extends z.ZodTypeAny
                  ? TInput["message"]
                  : TBaseInput["message"] extends z.ZodTypeAny
                    ? TBaseInput["message"]
                    : never;
              },
              TOutput extends z.ZodTypeAny ? TOutput : TBaseOutput,
              MergeErrors<TBaseErrors, TErrors>,
              TCustomContext
            >
          >;
        }) => Promise<
          TypedKafkaContext<
            {
              message: TInput["message"] extends z.ZodTypeAny
                ? TInput["message"]
                : TBaseInput["message"] extends z.ZodTypeAny
                  ? TBaseInput["message"]
                  : never;
            },
            TOutput extends z.ZodTypeAny ? TOutput : TBaseOutput,
            MergeErrors<TBaseErrors, TErrors>,
            TCustomContext
          >
        >,
    );
    const builder = new KafkaProcedureBuilder<
      {
        message: TInput["message"] extends z.ZodTypeAny
          ? TInput["message"]
          : TBaseInput["message"] extends z.ZodTypeAny
            ? TBaseInput["message"]
            : never;
      },
      TOutput extends z.ZodTypeAny ? TOutput : TBaseOutput,
      MergeErrors<TBaseErrors, TErrors>,
      TCustomContext,
      TRouter
    >(
      topic,
      mergedConfig as {
        input: {
          message: TInput["message"] extends z.ZodTypeAny
            ? TInput["message"]
            : TBaseInput["message"] extends z.ZodTypeAny
              ? TBaseInput["message"]
              : never;
        };
        output?: TOutput extends z.ZodTypeAny ? TOutput : TBaseOutput;
        errors?: MergeErrors<TBaseErrors, TErrors>;
      },
      targetRouter,
      typedMiddleware,
    );
    return builder;
  }
}

export class KafkaProcedureBuilder<
  TInput extends InputConfig,
  TOutput extends z.ZodTypeAny | undefined,
  TErrors extends Record<string, z.ZodTypeAny> | undefined,
  TCustomContext extends object = Record<string, never>,
  TRouter = unknown,
> {
  private _config: {
    input: TInput;
    output?: TOutput;
    errors?: TErrors;
  };
  private _handler?: (
    ctx: TypedKafkaContext<TInput, TOutput, TErrors, TCustomContext>,
  ) =>
    | Promise<InferOutput<NonNullable<TOutput>>>
    | InferOutput<NonNullable<TOutput>>
    | void
    | Promise<void>;
  private _middleware: Array<
    (opts: {
      ctx: TypedKafkaContext<TInput, TOutput, TErrors, TCustomContext>;
      next: (opts?: {
        ctx: Partial<
          TypedKafkaContext<TInput, TOutput, TErrors, TCustomContext>
        >;
      }) => Promise<
        TypedKafkaContext<TInput, TOutput, TErrors, TCustomContext>
      >;
    }) => Promise<TypedKafkaContext<TInput, TOutput, TErrors, TCustomContext>>
  > = [];
  private _registered = false;

  constructor(
    private topic: string,
    config: {
      input: TInput;
      output?: TOutput;
      errors?: TErrors;
    },
    private router: TRouter & {
      register: (
        proc: KafkaProcedure<
          InputConfig,
          z.ZodTypeAny | undefined,
          Record<string, z.ZodTypeAny> | undefined,
          TCustomContext
        >,
      ) => void;
    },
    initialMiddleware?: Array<
      (opts: {
        ctx: TypedKafkaContext<TInput, TOutput, TErrors, TCustomContext>;
        next: (opts?: {
          ctx: Partial<
            TypedKafkaContext<TInput, TOutput, TErrors, TCustomContext>
          >;
        }) => Promise<
          TypedKafkaContext<TInput, TOutput, TErrors, TCustomContext>
        >;
      }) => Promise<TypedKafkaContext<TInput, TOutput, TErrors, TCustomContext>>
    >,
  ) {
    this._config = config;
    if (initialMiddleware) {
      this._middleware = [...initialMiddleware];
    }
  }

  use(
    middleware: (opts: {
      ctx: TypedKafkaContext<TInput, TOutput, TErrors, TCustomContext>;
      next: (opts?: {
        ctx: Partial<
          TypedKafkaContext<TInput, TOutput, TErrors, TCustomContext>
        >;
      }) => Promise<
        TypedKafkaContext<TInput, TOutput, TErrors, TCustomContext>
      >;
    }) => Promise<TypedKafkaContext<TInput, TOutput, TErrors, TCustomContext>>,
  ): this {
    this._middleware.push(middleware);
    return this;
  }

  handler(
    fn: (
      ctx: TypedKafkaContext<TInput, TOutput, TErrors, TCustomContext>,
    ) =>
      | Promise<InferOutput<NonNullable<TOutput>>>
      | InferOutput<NonNullable<TOutput>>
      | void
      | Promise<void>,
  ): TRouter {
    this._handler = fn;
    if (!this._registered) {
      this.router.register(
        this.build() as unknown as KafkaProcedure<
          InputConfig,
          z.ZodTypeAny | undefined,
          Record<string, z.ZodTypeAny> | undefined,
          TCustomContext
        >,
      );
      this._registered = true;
    }
    return this.router;
  }

  build(): KafkaProcedure<TInput, TOutput, TErrors, TCustomContext> {
    if (!this._handler) {
      throw new Error(`Handler not defined for topic ${this.topic}`);
    }
    return {
      topic: this.topic,
      config: this._config,
      handler: this._handler,
      middleware: this._middleware,
    };
  }
}
