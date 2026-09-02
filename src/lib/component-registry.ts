export type ComponentKind =
  | "callback"
  | "example"
  | "header"
  | "link"
  | "mediaType"
  | "parameter"
  | "pathItem"
  | "requestBody"
  | "response"
  | "schema"
  | "securityScheme";

export type ComponentReferenceKeyword = "$dynamicRef" | "$ref" | "security";
export type ComponentReferenceStatus = "broken" | "external" | "resolved";

export type ComponentReference = {
  keyword: ComponentReferenceKeyword;
  reference: string;
  sourceComponentKey: string | null;
  sourcePointer: string;
  status: ComponentReferenceStatus;
  targetComponentKey: string | null;
  targetPointer: string | null;
};

export type ReusableComponent = {
  brokenDependencyCount: number;
  dependencyKeys: string[];
  dependentKeys: string[];
  description: string;
  directReferenceCount: number;
  externalDependencyCount: number;
  inCycle: boolean;
  key: string;
  kind: ComponentKind;
  name: string;
  pointer: string;
  reachable: boolean;
  referencePointers: string[];
  rootReferenceCount: number;
  rootReferencePointers: string[];
};

export type ComponentRegistryCycle = {
  componentKeys: string[];
};

export type ComponentRegistryReport = {
  brokenReferenceCount: number;
  categoryCounts: Record<ComponentKind, number>;
  circularComponentCount: number;
  components: ReusableComponent[];
  cycleCount: number;
  cycles: ComponentRegistryCycle[];
  externalReferenceCount: number;
  issueComponentCount: number;
  references: ComponentReference[];
  totalCount: number;
  unusedCount: number;
  usedCount: number;
};

export const COMPONENT_KINDS: ComponentKind[] = [
  "schema",
  "parameter",
  "requestBody",
  "response",
  "header",
  "example",
  "securityScheme",
  "link",
  "callback",
  "pathItem",
  "mediaType",
];

type ComponentCategory = {
  field: string;
  kind: ComponentKind;
  parent: "components" | "root";
};

type ComponentDefinition = {
  description: string;
  key: string;
  kind: ComponentKind;
  name: string;
  pointer: string;
};

type RawReference = Pick<
  ComponentReference,
  "keyword" | "reference" | "sourceComponentKey" | "sourcePointer"
>;

const COMPONENT_CATEGORIES: ComponentCategory[] = [
  { field: "schemas", kind: "schema", parent: "components" },
  { field: "parameters", kind: "parameter", parent: "components" },
  { field: "requestBodies", kind: "requestBody", parent: "components" },
  { field: "responses", kind: "response", parent: "components" },
  { field: "headers", kind: "header", parent: "components" },
  { field: "examples", kind: "example", parent: "components" },
  {
    field: "securitySchemes",
    kind: "securityScheme",
    parent: "components",
  },
  { field: "links", kind: "link", parent: "components" },
  { field: "callbacks", kind: "callback", parent: "components" },
  { field: "pathItems", kind: "pathItem", parent: "components" },
  { field: "mediaTypes", kind: "mediaType", parent: "components" },
  { field: "definitions", kind: "schema", parent: "root" },
  { field: "parameters", kind: "parameter", parent: "root" },
  { field: "responses", kind: "response", parent: "root" },
  {
    field: "securityDefinitions",
    kind: "securityScheme",
    parent: "root",
  },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function escapePointerSegment(value: string) {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}

function toPointer(path: string[]) {
  return path.length === 0
    ? "#"
    : `#/${path.map(escapePointerSegment).join("/")}`;
}

function decodePointerSegment(value: string) {
  let decoded = value;

  try {
    decoded = decodeURIComponent(value);
  } catch {
    return null;
  }

  return decoded.replaceAll("~1", "/").replaceAll("~0", "~");
}

function getPointerPath(reference: string) {
  if (reference === "#") {
    return [];
  }

  if (!reference.startsWith("#/")) {
    return null;
  }

  const path: string[] = [];

  for (const segment of reference.slice(2).split("/")) {
    const decoded = decodePointerSegment(segment);

    if (decoded === null) {
      return null;
    }

    path.push(decoded);
  }

  return path;
}

function getValueAtPath(root: Record<string, unknown>, path: string[]) {
  let current: unknown = root;

  for (const segment of path) {
    if (Array.isArray(current)) {
      if (!/^\d+$/.test(segment)) {
        return undefined;
      }

      current = current[Number(segment)];
    } else if (isRecord(current) && segment in current) {
      current = current[segment];
    } else {
      return undefined;
    }
  }

  return current;
}

function getDescription(value: unknown) {
  if (!isRecord(value)) {
    return "";
  }

  return readString(value.description) || readString(value.summary);
}

function collectDefinitions(schema: Record<string, unknown>) {
  const definitions: ComponentDefinition[] = [];
  const components = isRecord(schema.components) ? schema.components : {};

  COMPONENT_CATEGORIES.forEach((category) => {
    const parent = category.parent === "components" ? components : schema;
    const rawCollection = parent[category.field];
    const collection: Record<string, unknown> = isRecord(rawCollection)
      ? rawCollection
      : {};

    Object.entries(collection).forEach(([name, value]) => {
      const path =
        category.parent === "components"
          ? ["components", category.field, name]
          : [category.field, name];
      const pointer = toPointer(path);

      definitions.push({
        description: getDescription(value),
        key: pointer,
        kind: category.kind,
        name,
        pointer,
      });
    });
  });

  const kindOrder = new Map(
    COMPONENT_KINDS.map((kind, index) => [kind, index]),
  );

  return definitions.sort(
    (first, second) =>
      (kindOrder.get(first.kind) ?? 0) - (kindOrder.get(second.kind) ?? 0) ||
      first.name.localeCompare(second.name) ||
      first.pointer.localeCompare(second.pointer),
  );
}

function shouldSkipChild(
  key: string,
  value: unknown,
  childPointer: string,
  componentByPointer: Map<string, ComponentDefinition>,
) {
  if (componentByPointer.has(childPointer)) {
    return false;
  }

  if (key.toLowerCase().startsWith("x-")) {
    return true;
  }

  if (
    key === "const" ||
    key === "default" ||
    key === "enum" ||
    key === "example" ||
    key === "value"
  ) {
    return true;
  }

  return key === "examples" && Array.isArray(value);
}

function isSecurityContext(
  path: string[],
  component: ComponentDefinition | undefined,
) {
  return (
    path.length === 0 ||
    path[0] === "paths" ||
    path[0] === "webhooks" ||
    component?.kind === "callback" ||
    component?.kind === "pathItem"
  );
}

function collectDocumentReferences(
  schema: Record<string, unknown>,
  definitions: ComponentDefinition[],
) {
  const componentByPointer = new Map(
    definitions.map((definition) => [definition.pointer, definition]),
  );
  const securitySchemeByName = new Map(
    definitions
      .filter((definition) => definition.kind === "securityScheme")
      .map((definition) => [definition.name, definition]),
  );
  const rawReferences: RawReference[] = [];
  const anchorPaths = new Map<string, string[]>();
  const ancestors = new WeakSet<object>();

  const visit = (
    value: unknown,
    path: string[],
    sourceComponent: ComponentDefinition | undefined,
  ) => {
    if (typeof value !== "object" || value === null) {
      return;
    }

    if (ancestors.has(value)) {
      return;
    }

    ancestors.add(value);

    if (Array.isArray(value)) {
      value.forEach((item, index) =>
        visit(item, [...path, String(index)], sourceComponent),
      );
      ancestors.delete(value);
      return;
    }

    const record = value as Record<string, unknown>;
    const pointer = toPointer(path);
    const activeComponent = componentByPointer.get(pointer) ?? sourceComponent;
    const anchor = readString(record.$anchor);
    const dynamicAnchor = readString(record.$dynamicAnchor);

    if (anchor && !anchorPaths.has(anchor)) {
      anchorPaths.set(anchor, path);
    }

    if (dynamicAnchor && !anchorPaths.has(dynamicAnchor)) {
      anchorPaths.set(dynamicAnchor, path);
    }

    (["$ref", "$dynamicRef"] as const).forEach((keyword) => {
      const reference = readString(record[keyword]);

      if (reference) {
        rawReferences.push({
          keyword,
          reference,
          sourceComponentKey: activeComponent?.key ?? null,
          sourcePointer: toPointer([...path, keyword]),
        });
      }
    });

    if (
      isSecurityContext(path, activeComponent) &&
      Array.isArray(record.security)
    ) {
      record.security.forEach((requirement, requirementIndex) => {
        if (!isRecord(requirement)) {
          return;
        }

        Object.keys(requirement).forEach((name) => {
          const definition = securitySchemeByName.get(name);
          const fallbackPointer = isRecord(schema.components)
            ? toPointer(["components", "securitySchemes", name])
            : toPointer(["securityDefinitions", name]);

          rawReferences.push({
            keyword: "security",
            reference: definition?.pointer ?? fallbackPointer,
            sourceComponentKey: activeComponent?.key ?? null,
            sourcePointer: toPointer([
              ...path,
              "security",
              String(requirementIndex),
              name,
            ]),
          });
        });
      });
    }

    Object.entries(record).forEach(([key, childValue]) => {
      const childPath = [...path, key];
      const childPointer = toPointer(childPath);

      if (
        key === "$ref" ||
        key === "$dynamicRef" ||
        shouldSkipChild(key, childValue, childPointer, componentByPointer)
      ) {
        return;
      }

      visit(childValue, childPath, activeComponent);
    });

    ancestors.delete(value);
  };

  visit(schema, [], undefined);

  return { anchorPaths, rawReferences };
}

function findTargetComponent(
  targetPointer: string,
  definitions: ComponentDefinition[],
) {
  return definitions
    .filter(
      (definition) =>
        targetPointer === definition.pointer ||
        targetPointer.startsWith(`${definition.pointer}/`),
    )
    .sort((first, second) => second.pointer.length - first.pointer.length)[0];
}

function resolveReferences(
  schema: Record<string, unknown>,
  definitions: ComponentDefinition[],
  rawReferences: RawReference[],
  anchorPaths: Map<string, string[]>,
) {
  return rawReferences
    .map<ComponentReference>((rawReference) => {
      if (!rawReference.reference.startsWith("#")) {
        return {
          ...rawReference,
          status: "external",
          targetComponentKey: null,
          targetPointer: null,
        };
      }

      let targetPath = getPointerPath(rawReference.reference);

      if (targetPath === null && rawReference.reference.startsWith("#")) {
        let anchor = rawReference.reference.slice(1);

        try {
          anchor = decodeURIComponent(anchor);
        } catch {
          anchor = "";
        }

        targetPath = anchorPaths.get(anchor) ?? null;
      }

      const targetExists =
        targetPath !== null && getValueAtPath(schema, targetPath) !== undefined;
      const targetPointer =
        targetExists && targetPath !== null ? toPointer(targetPath) : null;
      const targetComponent = targetPointer
        ? findTargetComponent(targetPointer, definitions)
        : undefined;

      return {
        ...rawReference,
        status: targetExists ? "resolved" : "broken",
        targetComponentKey: targetComponent?.key ?? null,
        targetPointer,
      };
    })
    .sort(
      (first, second) =>
        first.sourcePointer.localeCompare(second.sourcePointer) ||
        first.reference.localeCompare(second.reference),
    );
}

function findCycles(graph: Map<string, Set<string>>) {
  const cycles: string[][] = [];
  const indexByKey = new Map<string, number>();
  const lowLinkByKey = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  let nextIndex = 0;

  const visit = (key: string) => {
    indexByKey.set(key, nextIndex);
    lowLinkByKey.set(key, nextIndex);
    nextIndex += 1;
    stack.push(key);
    onStack.add(key);

    (graph.get(key) ?? new Set()).forEach((targetKey) => {
      if (!indexByKey.has(targetKey)) {
        visit(targetKey);
        lowLinkByKey.set(
          key,
          Math.min(
            lowLinkByKey.get(key) ?? 0,
            lowLinkByKey.get(targetKey) ?? 0,
          ),
        );
      } else if (onStack.has(targetKey)) {
        lowLinkByKey.set(
          key,
          Math.min(lowLinkByKey.get(key) ?? 0, indexByKey.get(targetKey) ?? 0),
        );
      }
    });

    if (lowLinkByKey.get(key) !== indexByKey.get(key)) {
      return;
    }

    const component: string[] = [];
    let member = "";

    do {
      member = stack.pop() ?? "";
      onStack.delete(member);

      if (member) {
        component.push(member);
      }
    } while (member && member !== key);

    const hasSelfLoop = component.some((componentKey) =>
      graph.get(componentKey)?.has(componentKey),
    );

    if (component.length > 1 || hasSelfLoop) {
      cycles.push(component.sort());
    }
  };

  graph.forEach((_targets, key) => {
    if (!indexByKey.has(key)) {
      visit(key);
    }
  });

  return cycles.sort((first, second) =>
    (first[0] ?? "").localeCompare(second[0] ?? ""),
  );
}

function getReachableComponents(
  graph: Map<string, Set<string>>,
  references: ComponentReference[],
) {
  const reachable = new Set(
    references
      .filter(
        (reference) =>
          reference.status === "resolved" &&
          reference.sourceComponentKey === null &&
          reference.targetComponentKey !== null,
      )
      .map((reference) => reference.targetComponentKey as string),
  );
  const pending = [...reachable];

  while (pending.length > 0) {
    const sourceKey = pending.shift() as string;

    (graph.get(sourceKey) ?? new Set()).forEach((targetKey) => {
      if (!reachable.has(targetKey)) {
        reachable.add(targetKey);
        pending.push(targetKey);
      }
    });
  }

  return reachable;
}

function uniqueSorted(values: string[]) {
  return Array.from(new Set(values)).sort();
}

export function createComponentRegistryReport(
  schema: Record<string, unknown>,
): ComponentRegistryReport {
  const definitions = collectDefinitions(schema);
  const { anchorPaths, rawReferences } = collectDocumentReferences(
    schema,
    definitions,
  );
  const references = resolveReferences(
    schema,
    definitions,
    rawReferences,
    anchorPaths,
  );
  const graph = new Map(
    definitions.map((definition) => [definition.key, new Set<string>()]),
  );

  references.forEach((reference) => {
    if (
      reference.status === "resolved" &&
      reference.sourceComponentKey &&
      reference.targetComponentKey
    ) {
      graph
        .get(reference.sourceComponentKey)
        ?.add(reference.targetComponentKey);
    }
  });

  const cycles = findCycles(graph);
  const circularKeys = new Set(cycles.flat());
  const reachableKeys = getReachableComponents(graph, references);
  const components = definitions.map<ReusableComponent>((definition) => {
    const inboundReferences = references.filter(
      (reference) => reference.targetComponentKey === definition.key,
    );
    const outboundReferences = references.filter(
      (reference) => reference.sourceComponentKey === definition.key,
    );
    const dependentKeys = references
      .filter(
        (reference) =>
          reference.status === "resolved" &&
          reference.targetComponentKey === definition.key &&
          reference.sourceComponentKey,
      )
      .map((reference) => reference.sourceComponentKey as string);
    const rootReferences = inboundReferences.filter(
      (reference) => reference.sourceComponentKey === null,
    );

    return {
      ...definition,
      brokenDependencyCount: outboundReferences.filter(
        (reference) => reference.status === "broken",
      ).length,
      dependencyKeys: uniqueSorted([...(graph.get(definition.key) ?? [])]),
      dependentKeys: uniqueSorted(dependentKeys),
      directReferenceCount: inboundReferences.length,
      externalDependencyCount: outboundReferences.filter(
        (reference) => reference.status === "external",
      ).length,
      inCycle: circularKeys.has(definition.key),
      reachable: reachableKeys.has(definition.key),
      referencePointers: uniqueSorted(
        inboundReferences.map((reference) => reference.sourcePointer),
      ),
      rootReferenceCount: rootReferences.length,
      rootReferencePointers: uniqueSorted(
        rootReferences.map((reference) => reference.sourcePointer),
      ),
    };
  });
  const usedCount = components.filter(
    (component) => component.reachable,
  ).length;
  const issueComponentCount = components.filter(
    (component) =>
      !component.reachable ||
      component.inCycle ||
      component.brokenDependencyCount > 0 ||
      component.externalDependencyCount > 0,
  ).length;
  const categoryCounts = Object.fromEntries(
    COMPONENT_KINDS.map((kind) => [
      kind,
      components.filter((component) => component.kind === kind).length,
    ]),
  ) as Record<ComponentKind, number>;

  return {
    brokenReferenceCount: references.filter(
      (reference) => reference.status === "broken",
    ).length,
    categoryCounts,
    circularComponentCount: circularKeys.size,
    components,
    cycleCount: cycles.length,
    cycles: cycles.map((componentKeys) => ({ componentKeys })),
    externalReferenceCount: references.filter(
      (reference) => reference.status === "external",
    ).length,
    issueComponentCount,
    references,
    totalCount: components.length,
    unusedCount: components.length - usedCount,
    usedCount,
  };
}
