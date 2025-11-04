import type { z } from "zod";
import type {
  InputConfig,
  BaseKafkaContext,
  Middleware,
  ProcedureConfig,
} from "./types.js";
import {
  KafkaProcedureBuilder,
  BaseKafkaProcedureBuilder,
  type KafkaProcedure,
} from "./procedure.js";

export class KafkaRouter<TCustomContext extends object = Record<string, never>> {
  private procedures: KafkaProcedure<
    InputConfig,
    z.ZodTypeAny | undefined,
    Record<string, z.ZodTypeAny> | undefined,
    TCustomContext
  >[] = [];
  private middleware: Middleware<BaseKafkaContext, BaseKafkaContext>[] = [];

  constructor(
    config?: Record<
      string,
      KafkaRouter<TCustomContext> | KafkaRouter<TCustomContext>[]
    >,
  ) {
    if (config) {
      for (const [prefix, value] of Object.entries(config)) {
        const routers = Array.isArray(value) ? value : [value];
        for (const router of routers) {
          this.merge(prefix, router);
        }
      }
    }
  }

  use<TContextIn extends BaseKafkaContext, TContextOut extends BaseKafkaContext>(
    middleware: Middleware<TContextIn, TContextOut>,
  ): this {
    this.middleware.push(
      middleware as unknown as Middleware<BaseKafkaContext, BaseKafkaContext>,
    );
    return this;
  }

  topic<
    TTopic extends string,
    TInput extends InputConfig,
    TOutput extends z.ZodTypeAny | undefined,
    TErrors extends Record<string, z.ZodTypeAny> | undefined,
  >(
    topic: TTopic,
    config: ProcedureConfig<TInput, TOutput, TErrors>,
  ): KafkaProcedureBuilder<TInput, TOutput, TErrors, TCustomContext, this> {
    return new KafkaProcedureBuilder<TInput, TOutput, TErrors, TCustomContext, this>(
      topic,
      config,
      this,
    );
  }

  register(
    procedure: KafkaProcedure<
      InputConfig,
      z.ZodTypeAny | undefined,
      Record<string, z.ZodTypeAny> | undefined,
      TCustomContext
    >,
  ): this {
    this.procedures.push(procedure);
    return this;
  }

  merge(
    prefix: string,
    router: KafkaRouter<TCustomContext>,
  ): this {
    const mergedProcedures = router.procedures.map((proc) => ({
      ...proc,
      topic: `${prefix}/${proc.topic}`.replace(/\/+/g, "/"),
    }));
    this.procedures.push(...mergedProcedures);
    this.middleware.push(...router.middleware);
    return this;
  }

  getProcedures(): KafkaProcedure<
    InputConfig,
    z.ZodTypeAny | undefined,
    Record<string, z.ZodTypeAny> | undefined,
    TCustomContext
  >[] {
    return this.procedures;
  }

  getMiddleware(): Middleware<BaseKafkaContext, BaseKafkaContext>[] {
    return this.middleware;
  }

  get procedure(): BaseKafkaProcedureBuilder<
    { message?: never },
    undefined,
    undefined,
    TCustomContext,
    this
  > {
    return new BaseKafkaProcedureBuilder<
      { message?: never },
      undefined,
      undefined,
      TCustomContext,
      this
    >(undefined, undefined, this);
  }
}

export function createKafkaRouter<
  TCustomContext extends object = Record<string, never>,
>(
  config?: Record<
    string,
    KafkaRouter<TCustomContext> | KafkaRouter<TCustomContext>[]
  >,
): KafkaRouter<TCustomContext> {
  return new KafkaRouter<TCustomContext>(config);
}

export function mergeKafkaRouters<
  TCustomContext extends object = Record<string, never>,
>(...routers: KafkaRouter<TCustomContext>[]): KafkaRouter<TCustomContext> {
  const mergedRouter = new KafkaRouter<TCustomContext>();
  for (const router of routers) {
    const routerProcedures = router.getProcedures();
    const routerMiddleware = router.getMiddleware();
    for (const procedure of routerProcedures) {
      mergedRouter.register(procedure);
    }
    for (const middleware of routerMiddleware) {
      mergedRouter.use(middleware);
    }
  }
  return mergedRouter;
}

