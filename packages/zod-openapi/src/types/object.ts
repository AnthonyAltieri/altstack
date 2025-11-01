import { AnySchema, OpenAPIObjectSchema } from "./types";

export function convertOpenAPIObjectToZod(
  schema: OpenAPIObjectSchema,
  convertSchema: (schema: AnySchema) => string,
): string {
  const properties = schema.properties || {};
  const propertyNames = Object.keys(properties);

  if (propertyNames.length === 0) {
    if (schema.additionalProperties === false) {
      return "z.object({}).strict()";
    }
    return "z.record(z.string(), z.unknown())";
  }

  const requiredSet = new Set(schema.required || []);

  const entries: string[] = [];
  for (const [propName, propSchema] of Object.entries(properties)) {
    let zodProp = "z.unknown()";

    if (propSchema && typeof propSchema === "object") {
      zodProp = convertSchema(propSchema);
    }

    if (!requiredSet.has(propName)) {
      zodProp += ".optional()";
    }

    entries.push(`${propName}: ${zodProp}`);
  }

  let result = `z.object({ ${entries.join(", ")} })`;

  if (schema.additionalProperties === false) {
    result += ".strict()";
  }

  return result;
}
