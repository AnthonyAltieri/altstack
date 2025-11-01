import type { AnySchema } from "./types";

export function convertOpenAPIIntersectionToZod(
  schema: { allOf: AnySchema[] },
  convertSchema: (schema: AnySchema) => string,
): string {
  const items = schema.allOf.map((item) => convertSchema(item));

  if (schema.allOf.length === 0) return "z.unknown()";
  if (schema.allOf.length === 1) return convertSchema(schema.allOf[0]!);

  return `z.intersection(${items.join(", ")})`;
}

