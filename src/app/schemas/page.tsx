import { cookies } from "next/headers";
import { SchemasPageContent } from "@/components/schemas-page-content";
import {
  parseSavedSchemas,
  SERVER_SAVED_SCHEMAS_COOKIE,
  sortSavedSchemas,
} from "@/lib/schema-storage";

export default async function SchemasPage() {
  const cookieStore = await cookies();
  const initialSchemas = sortSavedSchemas(
    parseSavedSchemas(cookieStore.get(SERVER_SAVED_SCHEMAS_COOKIE)?.value),
  );

  return <SchemasPageContent initialSchemas={initialSchemas} />;
}
