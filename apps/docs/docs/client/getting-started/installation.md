# Installation

Install the client package and its peer dependencies:

```bash
pnpm add @repo/client zod
# or
npm install @repo/client zod
# or
yarn add @repo/client zod
```

## Peer Dependencies

The client requires:
- **zod**: `^4.0.0` - For schema validation and type inference

## Requirements

To use the client, you need:
1. A server built with `@repo/server` that exposes an OpenAPI spec
2. Generated `Request` and `Response` types from your server's OpenAPI spec
3. The OpenAPI spec object from your server

