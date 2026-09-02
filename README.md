# RSSwag

RSSwag is a responsive OpenAPI editor, viewer, and REST client built with
Next.js, React, TypeScript, and Tailwind CSS.

## Demo

[Open the deployed application](https://swagger-editor-app-two.vercel.app/)

## Features

- JSON and YAML OpenAPI editing, large-file import confirmation, import feedback, validation, and conversion
- Remote OpenAPI import from public URLs with redirect, timeout, and size safeguards
- Live API quality audit with coverage scoring, severity filters, endpoint navigation, JSON export, and localized Markdown sharing
- Persistent API comparison baselines with semantic breaking-change review and JSON reports
- Named local schema checkpoints with validity metadata, restore, download, and delete actions
- OpenAPI 3 and Swagger 2 data-model explorer with dependency analysis, operation usage, generated examples, and TypeScript exports
- Reusable-component registry for OpenAPI 3.0-3.2 and Swagger 2 with transitive reachability, local and external reference diagnostics, cycle detection, dependency search, Mermaid graphs, and JSON reports
- OpenAPI 3 workflow explorer with response-link resolution, runtime-expression handoffs, broken-target and cycle detection, endpoint navigation, Mermaid diagrams, and JSON reports
- Callback and webhook contract explorer with reusable-reference resolution, payload examples, receiver responses, source navigation, diagnostics, Markdown sharing, and JSON reports
- API security posture dashboard with strict, optional, and public access analysis, scheme usage, actionable findings, operation filtering, and shareable reports
- Postman Collection 2.1 and environment exports with filtered-view scope, tag folders, request examples, authentication placeholders, and saved responses
- Local schema picker access with `Ctrl+O` or `Cmd+O`
- Schema downloads with `Ctrl+Shift+S` or `Cmd+Shift+S`
- Localized success and error feedback for schema copy, save, import, and download actions
- Saved-schema and collection export download feedback
- Request-history collection and individual export feedback with blocked-download recovery
- Generated endpoint documentation and Try It Out requests through the server
- Persisted Live/Mock execution modes with explicit or type-correct generated
  schema examples, selectable response media types, and history-safe mock runs
  with documented response headers and configurable, cancellable latency
- Schema-aware parameter controls with enum choices and preflight validation
  for numeric ranges, string lengths, and patterns
- Live advisory request-body contract checks for documented top-level types and
  required JSON properties
- Automatic response contract checks for documented statuses, media types,
  top-level body shapes, and required properties, with copyable JSON reports
- Offline Mock contract suite runner across all documented response variants,
  with visible-endpoint scope, pass/partial/fail filtering, and JSON exports
- Persistent request environments with reusable base URLs and shared headers
  across previews and Try It Out execution
- Schema-driven, session-only authentication for API keys, Bearer and Basic
  auth, OAuth 2, and OpenID Connect access tokens, with secret-safe history
- cURL, Fetch, and raw HTTP generation with snippet downloads
- Scoped request execution with `Ctrl+Enter` or `Cmd+Enter` and cancellation
  with `Escape`
- Persistent endpoint request presets for parameters, bodies, response choices,
  and timeouts
- Schema save with `Ctrl+S` or `Cmd+S`, and formatting with `Ctrl+Shift+F` or
  `Cmd+Shift+F`
- Unsaved-change indicators and leave protection for authenticated edits and
  guest drafts that are still pending or failed
- Persistent editor word wrap with `Alt+Z`
- Line navigation with `Ctrl+G` or `Cmd+G`
- In-editor schema search with selected-text prefilling via `Ctrl+F` or `Cmd+F`, plus wrapped `Enter`/`F3` navigation (`Shift` reverses direction)
- Endpoint search focus with `/` outside editable controls
- Shareable endpoint-view links that restore search, filters, favorites, and sorting
- Spreadsheet-safe CSV inventories for the currently visible endpoint view
- Persistent collapsible endpoint details with visible-endpoint bulk controls
- Persistent endpoint favorites with favorites-only filtering
- Persistent endpoint sorting by schema order, path, or HTTP method
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
