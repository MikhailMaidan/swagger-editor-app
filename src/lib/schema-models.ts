export type SchemaModelUsageKind = "request" | "response";

export type SchemaModelUsage = {
  kind: SchemaModelUsageKind;
  method: string;
  path: string;
};

export type SchemaModelProperty = {
  deprecated: boolean;
  description: string;
  enumValues: string[];
  format: string;
  name: string;
  nullable: boolean;
  readOnly: boolean;
  required: boolean;
  type: string;
  writeOnly: boolean;
};

export type SchemaModel = {
  deprecated: boolean;
  description: string;
  example: string;
  name: string;
  properties: SchemaModelProperty[];
  referencedBy: string[];
  references: string[];
  type: string;
  typeScript: string;
  usages: SchemaModelUsage[];
};

const HTTP_METHODS = new Set([
  "delete",
  "get",
  "head",
  "options",
  "patch",
  "post",
  "put",
  "trace",
]);
const MAX_MODEL_COUNT = 500;
const MAX_MODEL_PROPERTIES = 500;
const MAX_EXAMPLE_DEPTH = 8;
const MAX_EXAMPLE_PROPERTIES = 100;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function readStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function decodePointerSegment(value: string) {
  return value.replaceAll("~1", "/").replaceAll("~0", "~");
}

function getReferencedModelName(reference: string) {
  const prefixes = ["#/components/schemas/", "#/definitions/"];
  const prefix = prefixes.find((item) => reference.startsWith(item));

  if (!prefix) {
    return "";
  }

  return decodePointerSegment(reference.slice(prefix.length).split("/")[0]);
}

function resolveLocalReference(
  rootSchema: Record<string, unknown>,
  reference: string,
) {
  if (!reference.startsWith("#/")) {
    return null;
  }

  const segments = reference.slice(2).split("/").map(decodePointerSegment);
  let current: unknown = rootSchema;

  for (const segment of segments) {
    if (!isRecord(current) || !(segment in current)) {
      return null;
    }

    current = current[segment];
  }

  return current;
}

function readModelDefinitions(rootSchema: Record<string, unknown>) {
  const components = isRecord(rootSchema.components)
    ? rootSchema.components
    : {};
  const componentSchemas = isRecord(components.schemas)
    ? components.schemas
    : {};
  const swaggerDefinitions = isRecord(rootSchema.definitions)
    ? rootSchema.definitions
    : {};
  const definitions = new Map<string, Record<string, unknown>>();

  [...Object.entries(swaggerDefinitions), ...Object.entries(componentSchemas)]
    .slice(0, MAX_MODEL_COUNT * 2)
    .forEach(([name, value]) => {
      if (name && isRecord(value)) {
        definitions.set(name, value);
      }
    });

  return new Map(Array.from(definitions.entries()).slice(0, MAX_MODEL_COUNT));
}

function collectReferencedModels(
  value: unknown,
  rootSchema: Record<string, unknown>,
  knownModelNames: Set<string>,
  followReferences: boolean,
) {
  const referencedModels = new Set<string>();
  const visitedReferences = new Set<string>();
  const visitedObjects = new WeakSet<object>();

  function visit(current: unknown) {
    if (Array.isArray(current)) {
      if (visitedObjects.has(current)) {
        return;
      }

      visitedObjects.add(current);
      current.forEach(visit);
      return;
    }

    if (!isRecord(current) || visitedObjects.has(current)) {
      return;
    }

    visitedObjects.add(current);
    const reference = readString(current.$ref);

    if (reference) {
      const modelName = getReferencedModelName(reference);

      if (knownModelNames.has(modelName)) {
        referencedModels.add(modelName);
      }

      if (followReferences && !visitedReferences.has(reference)) {
        visitedReferences.add(reference);
        visit(resolveLocalReference(rootSchema, reference));
      }
    }

    Object.entries(current).forEach(([key, item]) => {
      if (key !== "$ref") {
        visit(item);
      }
    });
  }

  visit(value);
  return Array.from(referencedModels).sort((first, second) =>
    first.localeCompare(second),
  );
}

function collectModelProperties(
  schema: Record<string, unknown>,
  rootSchema: Record<string, unknown>,
  visitedReferences = new Set<string>(),
) {
  const properties = new Map<
    string,
    { required: boolean; schema: Record<string, unknown> }
  >();

  function visit(current: Record<string, unknown>) {
    const reference = readString(current.$ref);

    if (reference && !visitedReferences.has(reference)) {
      visitedReferences.add(reference);
      const resolved = resolveLocalReference(rootSchema, reference);

      if (isRecord(resolved)) {
        visit(resolved);
      }
    }

    if (Array.isArray(current.allOf)) {
      current.allOf.forEach((item) => {
        if (isRecord(item)) {
          visit(item);
        }
      });
    }

    const requiredProperties = new Set(readStringArray(current.required));
    const rawProperties = isRecord(current.properties)
      ? current.properties
      : {};

    Object.entries(rawProperties)
      .slice(0, MAX_MODEL_PROPERTIES)
      .forEach(([name, propertySchema]) => {
        if (isRecord(propertySchema)) {
          properties.set(name, {
            required:
              requiredProperties.has(name) ||
              properties.get(name)?.required === true,
            schema: propertySchema,
          });
        }
      });
  }

  visit(schema);
  return properties;
}

export function getSchemaTypeScriptName(name: string) {
  const normalizedName = name.replace(/[^A-Za-z0-9_$]/g, "_");

  if (!normalizedName) {
    return "SchemaModel";
  }

  return /^[A-Za-z_$]/.test(normalizedName)
    ? normalizedName
    : `_${normalizedName}`;
}

function getTypeScriptPropertyName(name: string) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? name : JSON.stringify(name);
}

function formatTypeScriptLiteral(value: unknown) {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    value === null
  ) {
    return JSON.stringify(value);
  }

  return "unknown";
}

function addNullableType(
  typeScriptType: string,
  schema: Record<string, unknown>,
) {
  const isNullable =
    schema.nullable === true ||
    (Array.isArray(schema.type) && schema.type.includes("null"));

  return isNullable && !typeScriptType.split(" | ").includes("null")
    ? `${typeScriptType} | null`
    : typeScriptType;
}

export function getSchemaTypeScriptType(
  rawSchema: Record<string, unknown>,
  rootSchema: Record<string, unknown>,
  depth = 0,
): string {
  if (depth > MAX_EXAMPLE_DEPTH) {
    return "unknown";
  }

  const reference = readString(rawSchema.$ref);
  const referencedModelName = getReferencedModelName(reference);

  if (referencedModelName) {
    return addNullableType(
      getSchemaTypeScriptName(referencedModelName),
      rawSchema,
    );
  }

  if (reference) {
    const resolved = resolveLocalReference(rootSchema, reference);

    if (isRecord(resolved) && resolved !== rawSchema) {
      return getSchemaTypeScriptType(resolved, rootSchema, depth + 1);
    }
  }

  const enumValues = Array.isArray(rawSchema.enum) ? rawSchema.enum : [];

  if (enumValues.length > 0) {
    return addNullableType(
      enumValues.map(formatTypeScriptLiteral).join(" | "),
      rawSchema,
    );
  }

  const unionSchemas = Array.isArray(rawSchema.oneOf)
    ? rawSchema.oneOf
    : Array.isArray(rawSchema.anyOf)
      ? rawSchema.anyOf
      : [];

  if (unionSchemas.length > 0) {
    return addNullableType(
      unionSchemas
        .filter(isRecord)
        .map((item) => getSchemaTypeScriptType(item, rootSchema, depth + 1))
        .join(" | "),
      rawSchema,
    );
  }

  if (Array.isArray(rawSchema.allOf) && rawSchema.allOf.length > 0) {
    const intersectionTypes = rawSchema.allOf
      .filter(isRecord)
      .map((item) => getSchemaTypeScriptType(item, rootSchema, depth + 1));
    const ownSchema = { ...rawSchema };
    delete ownSchema.allOf;

    if (isRecord(ownSchema.properties)) {
      intersectionTypes.push(
        getSchemaTypeScriptType(ownSchema, rootSchema, depth + 1),
      );
    }

    return addNullableType(
      intersectionTypes.join(" & ") || "unknown",
      rawSchema,
    );
  }

  const rawTypes = Array.isArray(rawSchema.type)
    ? rawSchema.type.filter((item): item is string => typeof item === "string")
    : [readString(rawSchema.type)].filter(Boolean);
  const schemaType = rawTypes.find((item) => item !== "null") ?? "";
  let typeScriptType = "unknown";

  if (schemaType === "array" || rawSchema.items !== undefined) {
    const itemType = isRecord(rawSchema.items)
      ? getSchemaTypeScriptType(rawSchema.items, rootSchema, depth + 1)
      : "unknown";
    typeScriptType = `Array<${itemType}>`;
  } else if (
    schemaType === "object" ||
    isRecord(rawSchema.properties) ||
    rawSchema.additionalProperties !== undefined
  ) {
    const properties = isRecord(rawSchema.properties)
      ? rawSchema.properties
      : {};
    const requiredProperties = new Set(readStringArray(rawSchema.required));
    const propertyTypes = Object.entries(properties)
      .slice(0, MAX_MODEL_PROPERTIES)
      .flatMap(([name, propertySchema]) =>
        isRecord(propertySchema)
          ? [
              `${getTypeScriptPropertyName(name)}${requiredProperties.has(name) ? "" : "?"}: ${getSchemaTypeScriptType(propertySchema, rootSchema, depth + 1)};`,
            ]
          : [],
      );

    if (propertyTypes.length > 0) {
      typeScriptType = `{ ${propertyTypes.join(" ")} }`;
    } else if (isRecord(rawSchema.additionalProperties)) {
      typeScriptType = `Record<string, ${getSchemaTypeScriptType(rawSchema.additionalProperties, rootSchema, depth + 1)}>`;
    } else {
      typeScriptType = "Record<string, unknown>";
    }
  } else if (schemaType === "integer" || schemaType === "number") {
    typeScriptType = "number";
  } else if (schemaType === "boolean") {
    typeScriptType = "boolean";
  } else if (schemaType === "string") {
    typeScriptType = "string";
  }

  return addNullableType(typeScriptType, rawSchema);
}

function createTypeScriptDeclaration(
  name: string,
  schema: Record<string, unknown>,
  rootSchema: Record<string, unknown>,
) {
  const typeName = getSchemaTypeScriptName(name);
  const properties = collectModelProperties(schema, rootSchema);
  const hasComposition =
    Array.isArray(schema.allOf) ||
    Array.isArray(schema.oneOf) ||
    Array.isArray(schema.anyOf) ||
    Boolean(schema.$ref);

  if (properties.size > 0 && !hasComposition) {
    const lines = Array.from(properties.entries()).map(
      ([propertyName, property]) =>
        `  ${getTypeScriptPropertyName(propertyName)}${property.required ? "" : "?"}: ${getSchemaTypeScriptType(property.schema, rootSchema)};`,
    );

    return `export interface ${typeName} {\n${lines.join("\n")}\n}`;
  }

  return `export type ${typeName} = ${getSchemaTypeScriptType(schema, rootSchema)};`;
}

function getSchemaDisplayType(
  rawSchema: Record<string, unknown>,
  rootSchema: Record<string, unknown>,
  depth = 0,
): string {
  if (depth > MAX_EXAMPLE_DEPTH) {
    return "unknown";
  }

  const reference = readString(rawSchema.$ref);
  const modelName = getReferencedModelName(reference);

  if (modelName) {
    return modelName;
  }

  if (reference) {
    const resolved = resolveLocalReference(rootSchema, reference);

    if (isRecord(resolved) && resolved !== rawSchema) {
      return getSchemaDisplayType(resolved, rootSchema, depth + 1);
    }
  }

  const alternatives = Array.isArray(rawSchema.oneOf)
    ? rawSchema.oneOf
    : Array.isArray(rawSchema.anyOf)
      ? rawSchema.anyOf
      : [];

  if (alternatives.length > 0) {
    return alternatives
      .filter(isRecord)
      .map((item) => getSchemaDisplayType(item, rootSchema, depth + 1))
      .join(" | ");
  }

  if (Array.isArray(rawSchema.allOf) && rawSchema.allOf.length > 0) {
    return rawSchema.allOf
      .filter(isRecord)
      .map((item) => getSchemaDisplayType(item, rootSchema, depth + 1))
      .join(" & ");
  }

  const schemaType = Array.isArray(rawSchema.type)
    ? rawSchema.type.filter((item) => item !== "null").join(" | ")
    : readString(rawSchema.type);

  if (schemaType === "array" || rawSchema.items !== undefined) {
    return isRecord(rawSchema.items)
      ? `array<${getSchemaDisplayType(rawSchema.items, rootSchema, depth + 1)}>`
      : "array";
  }

  if (schemaType) {
    return schemaType;
  }

  return isRecord(rawSchema.properties) ? "object" : "unknown";
}

function formatEnumValue(value: unknown) {
  if (typeof value === "string") {
    return value;
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    value === null
  ) {
    return String(value);
  }

  return JSON.stringify(value);
}

function createExampleValue(
  rawSchema: Record<string, unknown>,
  rootSchema: Record<string, unknown>,
  visitedReferences = new Set<string>(),
  depth = 0,
): unknown {
  if (depth > MAX_EXAMPLE_DEPTH) {
    return null;
  }

  if ("example" in rawSchema && rawSchema.example !== undefined) {
    return rawSchema.example;
  }

  if (
    Array.isArray(rawSchema.examples) &&
    rawSchema.examples.length > 0 &&
    rawSchema.examples[0] !== undefined
  ) {
    return rawSchema.examples[0];
  }

  if ("default" in rawSchema && rawSchema.default !== undefined) {
    return rawSchema.default;
  }

  if (Array.isArray(rawSchema.enum) && rawSchema.enum.length > 0) {
    return rawSchema.enum[0];
  }

  const reference = readString(rawSchema.$ref);

  if (reference) {
    if (visitedReferences.has(reference)) {
      return null;
    }

    const resolved = resolveLocalReference(rootSchema, reference);

    if (isRecord(resolved)) {
      const nextVisitedReferences = new Set(visitedReferences);
      nextVisitedReferences.add(reference);
      return createExampleValue(
        resolved,
        rootSchema,
        nextVisitedReferences,
        depth + 1,
      );
    }
  }

  if (Array.isArray(rawSchema.allOf)) {
    const objectExamples = rawSchema.allOf
      .filter(isRecord)
      .map((item) =>
        createExampleValue(
          item,
          rootSchema,
          new Set(visitedReferences),
          depth + 1,
        ),
      )
      .filter(isRecord);
    const ownSchema = { ...rawSchema };
    delete ownSchema.allOf;

    if (isRecord(ownSchema.properties)) {
      const ownExample = createExampleValue(
        ownSchema,
        rootSchema,
        new Set(visitedReferences),
        depth + 1,
      );

      if (isRecord(ownExample)) {
        objectExamples.push(ownExample);
      }
    }

    if (objectExamples.length > 0) {
      return Object.assign({}, ...objectExamples);
    }
  }

  const alternatives = Array.isArray(rawSchema.oneOf)
    ? rawSchema.oneOf
    : Array.isArray(rawSchema.anyOf)
      ? rawSchema.anyOf
      : [];

  if (isRecord(alternatives[0])) {
    return createExampleValue(
      alternatives[0],
      rootSchema,
      visitedReferences,
      depth + 1,
    );
  }

  const schemaType = Array.isArray(rawSchema.type)
    ? rawSchema.type.find((item) => item !== "null")
    : rawSchema.type;
  const properties = isRecord(rawSchema.properties) ? rawSchema.properties : {};

  if (schemaType === "object" || Object.keys(properties).length > 0) {
    return Object.fromEntries(
      Object.entries(properties)
        .slice(0, MAX_EXAMPLE_PROPERTIES)
        .flatMap(([name, propertySchema]) =>
          isRecord(propertySchema)
            ? [
                [
                  name,
                  createExampleValue(
                    propertySchema,
                    rootSchema,
                    new Set(visitedReferences),
                    depth + 1,
                  ),
                ],
              ]
            : [],
        ),
    );
  }

  if (schemaType === "array" || rawSchema.items !== undefined) {
    return isRecord(rawSchema.items)
      ? [
          createExampleValue(
            rawSchema.items,
            rootSchema,
            visitedReferences,
            depth + 1,
          ),
        ]
      : [];
  }

  if (schemaType === "integer" || schemaType === "number") {
    return typeof rawSchema.minimum === "number" ? rawSchema.minimum : 0;
  }

  if (schemaType === "boolean") {
    return false;
  }

  if (schemaType === "string") {
    const format = readString(rawSchema.format).toLowerCase();

    if (format === "date") {
      return "2026-01-01";
    }

    if (format === "date-time") {
      return "2026-01-01T00:00:00Z";
    }

    if (format === "email") {
      return "user@example.com";
    }

    if (format === "uuid") {
      return "00000000-0000-4000-8000-000000000000";
    }

    if (format === "uri" || format === "url") {
      return "https://example.com";
    }

    return "string";
  }

  return null;
}

function createModelExample(
  schema: Record<string, unknown>,
  rootSchema: Record<string, unknown>,
) {
  return JSON.stringify(createExampleValue(schema, rootSchema), null, 2);
}

function readModelUsages(
  rootSchema: Record<string, unknown>,
  knownModelNames: Set<string>,
) {
  const usagesByModel = new Map<string, SchemaModelUsage[]>();
  const paths = isRecord(rootSchema.paths) ? rootSchema.paths : {};

  function addUsages(
    modelNames: string[],
    usage: Omit<SchemaModelUsage, "kind">,
    kind: SchemaModelUsageKind,
  ) {
    modelNames.forEach((modelName) => {
      const usages = usagesByModel.get(modelName) ?? [];

      if (
        !usages.some(
          (item) =>
            item.kind === kind &&
            item.method === usage.method &&
            item.path === usage.path,
        )
      ) {
        usages.push({ ...usage, kind });
        usagesByModel.set(modelName, usages);
      }
    });
  }

  Object.entries(paths).forEach(([path, pathConfig]) => {
    if (!isRecord(pathConfig)) {
      return;
    }

    Object.entries(pathConfig).forEach(([method, operation]) => {
      if (!HTTP_METHODS.has(method) || !isRecord(operation)) {
        return;
      }

      const usage = { method: method.toUpperCase(), path };
      const requestSources = [
        pathConfig.parameters,
        operation.parameters,
        operation.requestBody,
      ];
      const requestModels = collectReferencedModels(
        requestSources,
        rootSchema,
        knownModelNames,
        true,
      );
      const responseModels = collectReferencedModels(
        operation.responses,
        rootSchema,
        knownModelNames,
        true,
      );

      addUsages(requestModels, usage, "request");
      addUsages(responseModels, usage, "response");
    });
  });

  usagesByModel.forEach((usages) => {
    usages.sort(
      (first, second) =>
        first.path.localeCompare(second.path) ||
        first.method.localeCompare(second.method) ||
        first.kind.localeCompare(second.kind),
    );
  });

  return usagesByModel;
}

export function extractSchemaModels(
  rootSchema: Record<string, unknown>,
): SchemaModel[] {
  const definitions = readModelDefinitions(rootSchema);
  const knownModelNames = new Set(definitions.keys());

  if (knownModelNames.size === 0) {
    return [];
  }

  const referencesByModel = new Map<string, string[]>();
  const referencedByModel = new Map<string, string[]>();

  definitions.forEach((schema, name) => {
    const references = collectReferencedModels(
      schema,
      rootSchema,
      knownModelNames,
      false,
    );
    referencesByModel.set(name, references);

    references.forEach((reference) => {
      referencedByModel.set(reference, [
        ...(referencedByModel.get(reference) ?? []),
        name,
      ]);
    });
  });

  const usagesByModel = readModelUsages(rootSchema, knownModelNames);

  return Array.from(definitions.entries())
    .map(([name, schema]) => {
      const properties = Array.from(
        collectModelProperties(schema, rootSchema).entries(),
      ).map(([propertyName, property]) => {
        const reference = readString(property.schema.$ref);
        const resolvedPropertySchema = reference
          ? resolveLocalReference(rootSchema, reference)
          : null;
        const displaySchema = isRecord(resolvedPropertySchema)
          ? { ...resolvedPropertySchema, ...property.schema }
          : property.schema;

        return {
          deprecated: displaySchema.deprecated === true,
          description: readString(displaySchema.description),
          enumValues: Array.isArray(displaySchema.enum)
            ? displaySchema.enum.map(formatEnumValue)
            : [],
          format: readString(displaySchema.format),
          name: propertyName,
          nullable:
            displaySchema.nullable === true ||
            (Array.isArray(displaySchema.type) &&
              displaySchema.type.includes("null")),
          readOnly: displaySchema.readOnly === true,
          required: property.required,
          type: getSchemaDisplayType(property.schema, rootSchema),
          writeOnly: displaySchema.writeOnly === true,
        } satisfies SchemaModelProperty;
      });

      return {
        deprecated: schema.deprecated === true,
        description: readString(schema.description),
        example: createModelExample(schema, rootSchema),
        name,
        properties,
        referencedBy: Array.from(
          new Set(referencedByModel.get(name) ?? []),
        ).sort((first, second) => first.localeCompare(second)),
        references: referencesByModel.get(name) ?? [],
        type: getSchemaDisplayType(schema, rootSchema),
        typeScript: createTypeScriptDeclaration(name, schema, rootSchema),
        usages: usagesByModel.get(name) ?? [],
      } satisfies SchemaModel;
    })
    .sort((first, second) => first.name.localeCompare(second.name));
}
