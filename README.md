# RSSwag

RSSwag is a responsive OpenAPI editor, viewer, and REST client built with
Next.js, React, TypeScript, and Tailwind CSS.

## Demo

[Open the deployed application](https://swagger-editor-app-two.vercel.app/)

## Features

- JSON and YAML OpenAPI editing, validation, and conversion
- Generated endpoint documentation and Try It Out requests through the server
- cURL generation from the current request values
- Authentication-aware schema saving and request history
- Server-rendered history analytics in English and Russian

## Local Setup

Install dependencies and start the development server:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Database Setup

The application supports Supabase persistence and falls back to secure,
server-readable cookies during local development.

1. Create a Supabase project.
2. Run [supabase/schema.sql](./supabase/schema.sql) in the Supabase SQL editor.
3. Copy `.env.example` to `.env.local` and provide `SUPABASE_URL` and the
   server-only `SUPABASE_SECRET_KEY`.
4. Add the same variables to the Vercel project for Production and Preview.

Never expose `SUPABASE_SECRET_KEY` through a `NEXT_PUBLIC_` variable.

## Quality Checks

```bash
npm run format:check
npm run lint
npm run test
npm run coverage
npm run build
```

Vitest enforces at least 80% coverage for statements, branches, functions,
and lines. Husky runs formatting and lint checks before each commit.

## Author

[Mikhail Maidan](https://github.com/MikhailMaidan) - responsible for everything.

Built for the [RS School React final task](https://github.com/rolling-scopes-school/tasks/blob/master/react/modules/tasks/final.md).
