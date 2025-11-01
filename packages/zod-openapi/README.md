# zod-openapi

Convert OpenAPI schemas to Zod schemas with TypeScript code generation.

## Features

- Converts OpenAPI 3.x schemas to Zod validation schemas
- Generates TypeScript code with Zod schemas and inferred types
- Handles complex types: objects, arrays, unions (oneOf), intersections (allOf)
- Supports custom string formats via registry system
- Automatically resolves schema dependencies and generates code in correct order
- Supports nullable schemas, enums, validation constraints, and more

## Installation

```bash
pnpm add zod-openapi
# or
npm install zod-openapi
# or
yarn add zod-openapi
```

## Usage

### Basic Example

```typescript
import { openApiToZodTsCode } from "zod-openapi";

const openApiSpec = {
  components: {
    schemas: {
      User: {
        type: "object",
        properties: {
          id: { type: "integer" },
          name: { type: "string" },
          email: { type: "string", format: "email" },
        },
        required: ["id", "name", "email"],
      },
    },
  },
};

const generatedCode = openApiToZodTsCode(openApiSpec);
console.log(generatedCode);
```

Generated output:

```typescript
/**
 * This file was automatically generated from OpenAPI schema
 * Do not manually edit this file
 */

import { z } from 'zod';

export const UserSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  email: z.string().email(),
});
export type User = z.infer<typeof UserSchema>;
```

### Custom String Formats

Register custom Zod schemas for OpenAPI string formats:

```typescript
import {
  registerZodSchemaToOpenApiSchema,
  openApiToZodTsCode,
} from "zod-openapi";
import { z } from "zod";

// Register a custom UUID schema
const uuidSchema = z.string().uuid();
registerZodSchemaToOpenApiSchema(uuidSchema, {
  schemaExportedVariableName: "uuidSchema",
  type: "string",
  format: "uuid",
});

// Now OpenAPI schemas with format: "uuid" will use your custom schema
const openApiSpec = {
  components: {
    schemas: {
      User: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
        },
      },
    },
  },
};

const code = openApiToZodTsCode(openApiSpec, [
  'import { uuidSchema } from "./custom-schemas";',
]);
```

### Request and Response Lookup Objects

Generate route lookup objects with Zod schemas for request and response validation:

```typescript
import { openApiToZodTsCode } from "zod-openapi";

const openApiSpec = {
  components: {
    schemas: {
      User: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
        },
        required: ["id", "name"],
      },
      CreateUser: {
        type: "object",
        properties: {
          name: { type: "string" },
        },
        required: ["name"],
      },
    },
  },
  paths: {
    "/users/{id}": {
      get: {
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/User",
                },
              },
            },
          },
        },
      },
    },
    "/users": {
      post: {
        requestBody: {
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/CreateUser",
              },
            },
          },
        },
        responses: {
          "201": {
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/User",
                },
              },
            },
          },
        },
      },
    },
  },
};

const generatedCode = openApiToZodTsCode(openApiSpec, undefined, {
  includeRoutes: true,
});
```

Generated output includes `Request` and `Response` lookup objects:

```typescript
// ... component schemas ...

// Route schemas
export const GetUsersIdParamsSchema = z.object({
  id: z.string(),
});
export const GetUsersIdResponseSchema = UserSchema;
export const PostUsersBodySchema = CreateUserSchema;
export const PostUsersResponseSchema = UserSchema;

// Request and Response lookup objects
export const Request = {
  '/users/{id}': {
    GET: {
      params: GetUsersIdParamsSchema,
    },
  },
  '/users': {
    POST: {
      body: PostUsersBodySchema,
    },
  },
} as const;

export const Response = {
  '/users/{id}': {
    GET: GetUsersIdResponseSchema,
  },
  '/users': {
    POST: PostUsersResponseSchema,
  },
} as const;
```

Usage example:

```typescript
const endpoint = "/users/{id}" as const;

// Access request schemas
const { params: ParamsSchema } = Request[endpoint]["GET"];

// Access response schema
const ResponseSchema = Response[endpoint]["GET"];

// Use schemas for validation
const params = ParamsSchema.parse({ id: "123" });
const response = ResponseSchema.parse({ id: "123", name: "John" });
```

### Supported String Formats

The following string formats are supported out of the box:

- `color-hex`
- `date`
- `date-time`
- `email`
- `iso-date`
- `iso-date-time`
- `objectid`
- `uri`
- `url`
- `uuid`

## API Reference

### `openApiToZodTsCode(openapi, customImportLines?, options?)`

Converts an OpenAPI specification to TypeScript code containing Zod schemas.

**Parameters:**
- `openapi`: OpenAPI specification object (must contain `components.schemas`)
- `customImportLines`: Optional array of custom import statements to include
- `options`: Optional configuration object
  - `includeRoutes`: If `true`, generates `Request` and `Response` lookup objects from OpenAPI paths (default: `false`)

**Returns:** `string` - Generated TypeScript code

### `convertSchemaToZodString(schema)`

Converts a single OpenAPI schema to a Zod expression string.

**Parameters:**
- `schema`: OpenAPI schema object

**Returns:** `string` - Zod expression as a string (e.g., `"z.string()"`)

### `registerZodSchemaToOpenApiSchema(schema, registration)`

Registers a Zod schema with its OpenAPI representation for custom string formats.

**Parameters:**
- `schema`: Zod schema instance
- `registration`: Registration object describing the OpenAPI type/format

### `extractSchemaDependencies(schema)`

Extracts all schema references from an OpenAPI schema.

**Parameters:**
- `schema`: OpenAPI schema object

**Returns:** `string[]` - Array of referenced schema names

### `topologicalSortSchemas(schemas)`

Sorts schemas topologically to ensure correct generation order.

**Parameters:**
- `schemas`: Record mapping schema names to OpenAPI schema definitions

**Returns:** `string[]` - Schema names in topological order

## Supported OpenAPI Schema Features

- ✅ Basic types: `string`, `number`, `integer`, `boolean`
- ✅ Objects with `properties` and `required`
- ✅ Arrays with `items`
- ✅ Unions (`oneOf`)
- ✅ Intersections (`allOf`)
- ✅ Nullable schemas
- ✅ Enums
- ✅ String formats (email, date, uuid, etc.)
- ✅ Validation constraints (`minLength`, `maxLength`, `pattern`, `minimum`, `maximum`, etc.)
- ✅ Schema references (`$ref`)
- ✅ Additional properties
- ✅ Route request/response lookup objects (`Request` and `Response`)

## Development

```bash
# Run tests
pnpm test

# Type check
pnpm check-types
```

