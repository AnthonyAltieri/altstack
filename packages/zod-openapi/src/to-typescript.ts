import { topologicalSortSchemas } from "./dependencies";
import { convertSchemaToZodString } from "./to-zod";
import type { AnySchema } from "./types/types";
import {
  parseOpenApiPaths,
  generateRouteSchemaNames,
  type RouteInfo,
} from "./routes";

function generateRouteSchemas(
  routes: RouteInfo[],
  convertSchema: (schema: AnySchema) => string,
): string[] {
  const lines: string[] = [];
  const schemaNames = new Set<string>();

  for (const route of routes) {
    const names = generateRouteSchemaNames(route);
    const pathParams = route.parameters.filter((p) => p.in === "path");
    const queryParams = route.parameters.filter((p) => p.in === "query");
    const headerParams = route.parameters.filter((p) => p.in === "header");

    if (names.paramsSchemaName && pathParams.length > 0) {
      if (!schemaNames.has(names.paramsSchemaName)) {
        schemaNames.add(names.paramsSchemaName);
        const properties: string[] = [];
        const required: string[] = [];
        for (const param of pathParams) {
          const zodExpr = convertSchema(param.schema);
          properties.push(`${param.name}: ${zodExpr}`);
          if (param.required) {
            required.push(param.name);
          }
        }
        lines.push(
          `export const ${names.paramsSchemaName} = z.object({ ${properties.join(", ")} });`,
        );
      }
    }

    if (names.querySchemaName && queryParams.length > 0) {
      if (!schemaNames.has(names.querySchemaName)) {
        schemaNames.add(names.querySchemaName);
        const properties: string[] = [];
        for (const param of queryParams) {
          let zodExpr = convertSchema(param.schema);
          if (!param.required) {
            zodExpr += ".optional()";
          }
          properties.push(`${param.name}: ${zodExpr}`);
        }
        lines.push(
          `export const ${names.querySchemaName} = z.object({ ${properties.join(", ")} });`,
        );
      }
    }

    if (names.headersSchemaName && headerParams.length > 0) {
      if (!schemaNames.has(names.headersSchemaName)) {
        schemaNames.add(names.headersSchemaName);
        const properties: string[] = [];
        for (const param of headerParams) {
          let zodExpr = convertSchema(param.schema);
          if (!param.required) {
            zodExpr += ".optional()";
          }
          properties.push(`${param.name}: ${zodExpr}`);
        }
        lines.push(
          `export const ${names.headersSchemaName} = z.object({ ${properties.join(", ")} });`,
        );
      }
    }

    if (names.bodySchemaName && route.requestBody) {
      if (!schemaNames.has(names.bodySchemaName)) {
        schemaNames.add(names.bodySchemaName);
        const zodExpr = convertSchema(route.requestBody);
        lines.push(`export const ${names.bodySchemaName} = ${zodExpr};`);
      }
    }

    if (names.responseSchemaName && !schemaNames.has(names.responseSchemaName)) {
      schemaNames.add(names.responseSchemaName);
      const successStatuses = Object.keys(route.responses).filter((s) =>
        s.startsWith("2"),
      );
      const responseSchemas = successStatuses
        .map((s) => route.responses[s])
        .filter((s): s is AnySchema => Boolean(s));
      
      if (responseSchemas.length === 1) {
        const zodExpr = convertSchema(responseSchemas[0]);
        lines.push(`export const ${names.responseSchemaName} = ${zodExpr};`);
      } else if (responseSchemas.length > 1) {
        const zodExprs = responseSchemas.map((s) => convertSchema(s));
        lines.push(
          `export const ${names.responseSchemaName} = z.union([${zodExprs.join(", ")}]);`,
        );
      }
    }
  }

  return lines;
}

function generateRequestResponseObjects(
  routes: RouteInfo[],
): string[] {
  const lines: string[] = [];
  const requestPaths: Record<string, Record<string, string[]>> = {};
  const responsePaths: Record<string, Record<string, string>> = {};

  for (const route of routes) {
    const names = generateRouteSchemaNames(route);
    const pathParams = route.parameters.filter((p) => p.in === "path");
    const queryParams = route.parameters.filter((p) => p.in === "query");
    const headerParams = route.parameters.filter((p) => p.in === "header");

    if (!requestPaths[route.path]) {
      requestPaths[route.path] = {};
    }
    if (!requestPaths[route.path][route.method]) {
      requestPaths[route.path][route.method] = [];
    }

    const requestParts: string[] = [];
    if (names.paramsSchemaName && pathParams.length > 0) {
      requestParts.push(`params: ${names.paramsSchemaName}`);
    }
    if (names.querySchemaName && queryParams.length > 0) {
      requestParts.push(`query: ${names.querySchemaName}`);
    }
    if (names.headersSchemaName && headerParams.length > 0) {
      requestParts.push(`headers: ${names.headersSchemaName}`);
    }
    if (names.bodySchemaName && route.requestBody) {
      requestParts.push(`body: ${names.bodySchemaName}`);
    }

    if (requestParts.length > 0) {
      requestPaths[route.path][route.method] = requestParts;
    }

    if (!responsePaths[route.path]) {
      responsePaths[route.path] = {};
    }
    const successStatuses = Object.keys(route.responses).filter((s) =>
      s.startsWith("2"),
    );
    if (successStatuses.length > 0 && names.responseSchemaName) {
      responsePaths[route.path][route.method] = names.responseSchemaName;
    }
  }

  lines.push("export const Request = {");
  for (const [path, methods] of Object.entries(requestPaths)) {
    const methodEntries = Object.entries(methods).filter(
      ([, parts]) => parts.length > 0,
    );
    if (methodEntries.length > 0) {
      lines.push(`  '${path}': {`);
      for (const [method, parts] of methodEntries) {
        lines.push(`    ${method}: {`);
        for (const part of parts) {
          lines.push(`      ${part},`);
        }
        lines.push(`    },`);
      }
      lines.push(`  },`);
    }
  }
  lines.push("} as const;");
  lines.push("");

  lines.push("export const Response = {");
  for (const [path, methods] of Object.entries(responsePaths)) {
    const methodEntries = Object.entries(methods);
    if (methodEntries.length > 0) {
      lines.push(`  '${path}': {`);
      for (const [method, schemaName] of methodEntries) {
        lines.push(`    ${method}: ${schemaName},`);
      }
      lines.push(`  },`);
    }
  }
  lines.push("} as const;");

  return lines;
}

export const openApiToZodTsCode = (
  openapi: Record<string, unknown>,
  customImportLines?: string[],
  options?: { includeRoutes?: boolean },
): string => {
  const components = (openapi as AnySchema)["components"] as
    | AnySchema
    | undefined;
  const schemas: Record<string, AnySchema> =
    (components?.["schemas"] as Record<string, AnySchema>) ?? {};

  const lines: string[] = [];
  lines.push("/**");
  lines.push(" * This file was automatically generated from OpenAPI schema");
  lines.push(" * Do not manually edit this file");
  lines.push(" */");
  lines.push("");
  lines.push("import { z } from 'zod';");
  lines.push(...(customImportLines ?? []));
  lines.push("");

  const sortedSchemaNames = topologicalSortSchemas(schemas);

  for (const name of sortedSchemaNames) {
    const schema = schemas[name];
    if (schema) {
      const zodExpr = convertSchemaToZodString(schema);
      const schemaName = `${name}Schema`;
      const typeName = name;
      lines.push(`export const ${schemaName} = ${zodExpr};`);
      lines.push(`export type ${typeName} = z.infer<typeof ${schemaName}>;`);
      lines.push("");
    }
  }

  if (options?.includeRoutes) {
    const routes = parseOpenApiPaths(openapi);
    if (routes.length > 0) {
      const routeSchemas = generateRouteSchemas(
        routes,
        convertSchemaToZodString,
      );
      if (routeSchemas.length > 0) {
        lines.push(...routeSchemas);
        lines.push("");
        const requestResponseObjs = generateRequestResponseObjects(routes);
        lines.push(...requestResponseObjs);
      }
    }
  }

  return lines.join("\n");
};

