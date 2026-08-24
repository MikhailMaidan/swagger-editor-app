export const MAX_SCHEMA_IMPORT_SIZE_BYTES = 5 * 1024 * 1024;

export function shouldConfirmSchemaImport(fileSize: number) {
  return Number.isFinite(fileSize) && fileSize > MAX_SCHEMA_IMPORT_SIZE_BYTES;
}
