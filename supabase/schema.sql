create table if not exists public.rsswagger_schemas (
  id text primary key,
  user_id text not null,
  title text not null,
  version text not null,
  format text not null,
  schema_text text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create index if not exists rsswagger_schemas_user_updated_idx
  on public.rsswagger_schemas (user_id, updated_at desc);

create table if not exists public.rsswagger_history (
  id text primary key,
  user_id text not null,
  method text not null,
  path text not null,
  url text not null,
  status integer not null,
  summary text not null,
  duration_ms integer not null,
  request_size integer not null,
  response_size integer not null,
  error_details text,
  created_at timestamptz not null
);

create index if not exists rsswagger_history_user_created_idx
  on public.rsswagger_history (user_id, created_at desc);

alter table public.rsswagger_schemas enable row level security;
alter table public.rsswagger_history enable row level security;
