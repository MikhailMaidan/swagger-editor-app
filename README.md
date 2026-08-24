# RSSwag

RSSwag is a responsive OpenAPI editor, viewer, and REST client built with
Next.js, React, TypeScript, and Tailwind CSS.

## Demo

[Open the deployed application](https://swagger-editor-app-two.vercel.app/)

## Features

- JSON and YAML OpenAPI editing, large-file import confirmation, validation, and conversion
- Generated endpoint documentation and Try It Out requests through the server
- cURL, Fetch, and raw HTTP generation with snippet downloads
- Scoped request execution with `Ctrl+Enter` or `Cmd+Enter` and cancellation
  with `Escape`
- Schema save with `Ctrl+S` or `Cmd+S`, and formatting with `Ctrl+Shift+F` or
  `Cmd+Shift+F`
- Persistent editor word wrap with `Alt+Z`
- Line navigation with `Ctrl+G` or `Cmd+G`
- In-editor schema search with selected-text prefilling via `Ctrl+F` or `Cmd+F`, plus wrapped `Enter`/`F3` navigation (`Shift` reverses direction)
- Endpoint search focus with `/` outside editable controls
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

Never expose `SUPABASE_SECRET_KEY` through a `NEXT_PUBLIC_` variable. An
older revision of `.env.example` mistakenly documented the project URL as
`NEXT_PUBLIC_SUPABASE_URL`; the app still reads that name as a fallback so
deployments configured against it keep working, but `SUPABASE_URL` is the
correct name going forward.

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
