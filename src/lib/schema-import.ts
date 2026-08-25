export const MAX_SCHEMA_IMPORT_SIZE_BYTES = 5 * 1024 * 1024;

export type SchemaImportDetails = {
  byteSize: number;
  fileName: string;
};

export function getSchemaImportDetails(file: {
  name: string;
  size: number;
}): SchemaImportDetails {
  const fileName = file.name.trim();
  const byteSize = Number.isFinite(file.size)
    ? Math.max(0, Math.trunc(file.size))
    : 0;

  return {
    byteSize,
    fileName: fileName || "schema",
  };
}

export function shouldConfirmSchemaImport(fileSize: number) {
  return Number.isFinite(fileSize) && fileSize > MAX_SCHEMA_IMPORT_SIZE_BYTES;
}
