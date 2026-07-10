import type { RequestHistoryRecord } from "./request-history";
import type { SavedSchemaRecord } from "./schema-storage";

type DatabaseConfig = {
  apiKey: string;
  url: string;
};

type HistoryRow = {
  created_at: string;
  duration_ms: number;
  error_details: string | null;
  id: string;
  method: string;
  path: string;
  request_size: number;
  response_size: number;
  status: number;
  summary: string;
  url: string;
};

type SchemaRow = {
  created_at: string;
  format: string;
  id: string;
  schema_text: string;
  title: string;
  updated_at: string;
  version: string;
};

function getDatabaseConfig(): DatabaseConfig | null {
  const url = process.env.SUPABASE_URL;
  const apiKey =
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !apiKey) {
    return null;
  }

  return {
    apiKey,
    url: url.replace(/\/$/, ""),
  };
}

export function isDatabaseConfigured() {
  return getDatabaseConfig() !== null;
}

function createHeaders(config: DatabaseConfig, prefer?: string) {
  const headers = new Headers({
    apikey: config.apiKey,
    Authorization: `Bearer ${config.apiKey}`,
    "Content-Type": "application/json",
  });

  if (prefer) {
    headers.set("Prefer", prefer);
  }

  return headers;
}

async function readRows<T>(table: string, query: URLSearchParams) {
  const config = getDatabaseConfig();

  if (!config) {
    return null;
  }

  const response = await fetch(
    `${config.url}/rest/v1/${table}?${query.toString()}`,
    {
      cache: "no-store",
      headers: createHeaders(config),
    },
  );

  if (!response.ok) {
    throw new Error(`Database read failed with status ${response.status}.`);
  }

  return (await response.json()) as T[];
}

async function saveRow(table: string, row: Record<string, unknown>) {
  const config = getDatabaseConfig();

  if (!config) {
    return false;
  }

  const response = await fetch(`${config.url}/rest/v1/${table}`, {
    body: JSON.stringify(row),
    headers: createHeaders(
      config,
      "resolution=merge-duplicates,return=minimal",
    ),
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(`Database write failed with status ${response.status}.`);
  }

  return true;
}

function historyRowToRecord(row: HistoryRow): RequestHistoryRecord {
  return {
    createdAt: row.created_at,
    durationMs: row.duration_ms,
    errorDetails: row.error_details,
    id: row.id,
    method: row.method,
    path: row.path,
    requestSize: row.request_size,
    responseSize: row.response_size,
    status: row.status,
    summary: row.summary,
    url: row.url,
  };
}

function schemaRowToRecord(row: SchemaRow): SavedSchemaRecord {
  return {
    createdAt: row.created_at,
    format: row.format,
    id: row.id,
    schemaText: row.schema_text,
    title: row.title,
    updatedAt: row.updated_at,
    version: row.version,
  };
}

export async function readHistoryFromDatabase(userId: string) {
  const query = new URLSearchParams({
    limit: "20",
    order: "created_at.desc",
    select: "*",
    user_id: `eq.${userId}`,
  });
  const rows = await readRows<HistoryRow>("rsswagger_history", query);

  return rows?.map(historyRowToRecord) ?? null;
}

export async function readHistoryRecordFromDatabase(
  userId: string,
  recordId: string,
) {
  const query = new URLSearchParams({
    id: `eq.${recordId}`,
    limit: "1",
    select: "*",
    user_id: `eq.${userId}`,
  });
  const rows = await readRows<HistoryRow>("rsswagger_history", query);

  return rows ? rows[0] ? historyRowToRecord(rows[0]) : null : undefined;
}

export function saveHistoryToDatabase(
  userId: string,
  record: RequestHistoryRecord,
) {
  return saveRow("rsswagger_history", {
    created_at: record.createdAt,
    duration_ms: record.durationMs,
    error_details: record.errorDetails,
    id: record.id,
    method: record.method,
    path: record.path,
    request_size: record.requestSize,
    response_size: record.responseSize,
    status: record.status,
    summary: record.summary,
    url: record.url,
    user_id: userId,
  });
}

export async function readSchemasFromDatabase(userId: string) {
  const query = new URLSearchParams({
    limit: "10",
    order: "updated_at.desc",
    select: "*",
    user_id: `eq.${userId}`,
  });
  const rows = await readRows<SchemaRow>("rsswagger_schemas", query);

  return rows?.map(schemaRowToRecord) ?? null;
}

export function saveSchemaToDatabase(
  userId: string,
  schema: SavedSchemaRecord,
) {
  return saveRow("rsswagger_schemas", {
    created_at: schema.createdAt,
    format: schema.format,
    id: schema.id,
    schema_text: schema.schemaText,
    title: schema.title,
    updated_at: schema.updatedAt,
    user_id: userId,
    version: schema.version,
  });
}
