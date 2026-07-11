import { cookies } from "next/headers";
import { SchemasPageContent } from "@/components/schemas-page-content";
import { AUTH_TOKEN_COOKIE } from "@/lib/auth";
import { readSchemasFromDatabase } from "@/lib/database";
import {
  parseSavedSchemas,
  SERVER_SAVED_SCHEMAS_COOKIE,
  sortSavedSchemas,
} from "@/lib/schema-storage";
import { getAuthenticatedUserId } from "@/lib/server-auth";

export default async function SchemasPage() {
  const cookieStore = await cookies();
  const cookieSchemas = sortSavedSchemas(
    parseSavedSchemas(cookieStore.get(SERVER_SAVED_SCHEMAS_COOKIE)?.value),
  );
  const userId = getAuthenticatedUserId(
    cookieStore.get(AUTH_TOKEN_COOKIE)?.value,
  );
  let initialSchemas = cookieSchemas;

  if (userId) {
    try {
      initialSchemas = (await readSchemasFromDatabase(userId)) || cookieSchemas;
    } catch {
      initialSchemas = cookieSchemas;
    }
  }

  return <SchemasPageContent initialSchemas={initialSchemas} />;
}
