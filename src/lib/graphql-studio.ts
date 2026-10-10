import {
  buildASTSchema,
  buildClientSchema,
  executeSync,
  getNamedType,
  getOperationAST,
  getVariableValues,
  GraphQLError,
  introspectionFromSchema,
  isAbstractType,
  isEnumType,
  isInputObjectType,
  isInputType,
  isInterfaceType,
  isListType,
  isNonNullType,
  isObjectType,
  isRequiredArgument,
  isScalarType,
  isSpecifiedDirective,
  isSpecifiedScalarType,
  isUnionType,
  Kind,
  Lexer,
  parse,
  printSchema,
  Source,
  TokenKind,
  typeFromAST,
  TypeInfo,
  validate,
  validateSchema,
  valueFromASTUntyped,
  visit,
  visitWithTypeInfo,
  type DocumentNode,
  type FragmentDefinitionNode,
  type GraphQLInputType,
  type GraphQLField,
  type GraphQLInputField,
  type GraphQLNamedType,
  type GraphQLOutputType,
  type GraphQLSchema,
  type GraphQLType,
  type IntrospectionQuery,
  type OperationDefinitionNode,
  type SelectionSetNode,
} from "graphql";
import {
  parseTransformValue,
  TransformError,
  type JsonValue,
} from "./api-transform";
import { getByteSize } from "./text-encoding";

export const MAX_GRAPHQL_SOURCE_BYTES = 2 * 1024 * 1024;
export const MAX_GRAPHQL_REQUEST_BYTES = 128 * 1024;
export const MAX_GRAPHQL_FIXTURE_BYTES = 256 * 1024;
export const MAX_GRAPHQL_PROJECT_BYTES = 8 * 1024 * 1024;
export const MAX_GRAPHQL_CASES = 50;
const MAX_WORK = 10000;
export type GraphqlKind = "query" | "mutation" | "subscription";
export type GraphqlTypeKind =
  "object" | "interface" | "union" | "input" | "enum" | "scalar";
export type GraphqlIssueCode =
  | "schema"
  | "limit"
  | "variables"
  | "fixtures"
  | "generation"
  | "request"
  | "subscription"
  | "introspection"
  | "endpoint"
  | "project"
  | "case";
export class GraphqlStudioError extends Error {
  constructor(
    public code: GraphqlIssueCode,
    public details = "",
  ) {
    super(code);
  }
}
export type GraphqlArgument = {
  name: string;
  type: string;
  typeName: string;
  description: string;
  required: boolean;
  defaultValue?: string;
};
export type GraphqlField = {
  name: string;
  type: string;
  typeName: string;
  description: string;
  deprecated: boolean;
  deprecationReason: string;
  arguments: GraphqlArgument[];
  defaultValue?: string;
};
export type GraphqlType = {
  name: string;
  kind: GraphqlTypeKind;
  description: string;
  fields: GraphqlField[];
  members: string[];
  possibleTypes: string[];
  dependencies: string[];
  enumValues: { name: string; description: string; deprecated: boolean }[];
  oneOf: boolean;
};
export type GraphqlRootField = GraphqlField & {
  key: string;
  kind: GraphqlKind;
  owner: string;
};
export type GraphqlContract = {
  source: string;
  sdl: string;
  format: "sdl" | "introspection";
  schema: GraphQLSchema;
  types: GraphqlType[];
  operations: GraphqlRootField[];
  fieldCount: number;
};
export type GraphqlDraft = {
  name: string;
  document: string;
  operationName: string;
  variables: string;
  fixtures: string;
};
export type GraphqlCase = GraphqlDraft & { id: string };
export type GraphqlProject = {
  kind: "rsswag-graphql-project";
  version: 1;
  name: string;
  source: string;
  endpoint: string;
  draft: GraphqlDraft;
  cases: GraphqlCase[];
};
export type GraphqlDiagnostic = {
  phase: "document" | "selection" | "variables";
  message: string;
  locations: { line: number; column: number }[];
};
export type GraphqlWarning = {
  code: "custom-scalar" | "custom-directive";
  name: string;
};
export type GraphqlRequestCheck = {
  ready: boolean;
  document: DocumentNode | null;
  operation: OperationDefinitionNode | null;
  operations: { name: string; kind: GraphqlKind }[];
  variables: Record<string, JsonValue>;
  coercedVariables: Record<string, unknown>;
  issues: GraphqlDiagnostic[];
  warnings: GraphqlWarning[];
  ignoredVariableCount: number;
};
export type GraphqlRehearsal = {
  check: GraphqlRequestCheck;
  response: JsonValue | null;
  status: "invalid" | "success" | "errors";
  fieldSteps: number;
};
const record = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
const own = (v: unknown, key: string): unknown =>
  record(v) && Object.hasOwn(v, key) ? v[key] : undefined;
const bounded = (text: string, max: number) => {
  if (getByteSize(text) > max) throw new GraphqlStudioError("limit");
};
const requiredInput = (v: { type: GraphQLInputType; defaultValue?: unknown }) =>
  isNonNullType(v.type) && v.defaultValue === undefined;
const kindOf = (type: GraphQLNamedType): GraphqlTypeKind =>
  isObjectType(type)
    ? "object"
    : isInterfaceType(type)
      ? "interface"
      : isUnionType(type)
        ? "union"
        : isInputObjectType(type)
          ? "input"
          : isEnumType(type)
            ? "enum"
            : "scalar";

function parseGraphql(text: string, schema = false): DocumentNode {
  bounded(text, schema ? MAX_GRAPHQL_SOURCE_BYTES : MAX_GRAPHQL_REQUEST_BYTES);
  // Check lexical nesting before the recursive parser/validator sees input.
  const lexer = new Lexer(new Source(text));
  let depth = 0,
    tokens = 0;
  for (
    let token = lexer.advance();
    token.kind !== TokenKind.EOF;
    token = lexer.advance()
  ) {
    if (++tokens > (schema ? 50000 : 10000))
      throw new GraphqlStudioError("limit");
    if (
      [TokenKind.BRACE_L, TokenKind.BRACKET_L, TokenKind.PAREN_L].includes(
        token.kind as typeof TokenKind.BRACE_L,
      )
    )
      depth++;
    if (
      [TokenKind.BRACE_R, TokenKind.BRACKET_R, TokenKind.PAREN_R].includes(
        token.kind as typeof TokenKind.BRACE_R,
      )
    )
      depth--;
    if (depth > 40) throw new GraphqlStudioError("limit");
  }
  const document = parse(text, { maxTokens: schema ? 50000 : 10000 });
  let nodes = 0;
  visit(document, {
    enter(node) {
      if (
        ++nodes > (schema ? 50000 : 10000) ||
        (node.kind === Kind.NAME && node.value.length > 256)
      )
        throw new GraphqlStudioError("limit");
    },
  });
  if (!schema) boundSelectionExpansion(document);
  return document;
}
function boundTypeWrappers(type: GraphQLType) {
  let current = type,
    depth = 0;
  while (isListType(current) || isNonNullType(current)) {
    if (++depth > 16) throw new GraphqlStudioError("limit");
    current = current.ofType;
  }
}
function fragmentMap(document: DocumentNode) {
  return new Map(
    document.definitions
      .filter(
        (d): d is FragmentDefinitionNode => d.kind === Kind.FRAGMENT_DEFINITION,
      )
      .map((d) => [d.name.value, d]),
  );
}
function boundSelectionExpansion(document: DocumentNode) {
  const fragments = fragmentMap(document);
  let work = 0;
  function scan(set: SelectionSetNode, depth: number, ancestors: Set<string>) {
    if (depth > 24) throw new GraphqlStudioError("limit");
    for (const selection of set.selections) {
      if (++work > MAX_WORK) throw new GraphqlStudioError("limit");
      if (selection.kind === Kind.FRAGMENT_SPREAD) {
        const name = selection.name.value,
          fragment = fragments.get(name);
        if (fragment && !ancestors.has(name))
          scan(fragment.selectionSet, depth + 1, new Set([...ancestors, name]));
      } else if (selection.selectionSet)
        scan(selection.selectionSet, depth + 1, ancestors);
    }
  }
  for (const definition of document.definitions)
    if (
      definition.kind === Kind.OPERATION_DEFINITION ||
      definition.kind === Kind.FRAGMENT_DEFINITION
    )
      scan(
        definition.selectionSet,
        0,
        new Set(
          definition.kind === Kind.FRAGMENT_DEFINITION
            ? [definition.name.value]
            : [],
        ),
      );
}
function jsonObject(
  text: string,
  code: "variables" | "fixtures",
  max: number,
): Record<string, JsonValue> {
  bounded(text, max);
  try {
    const value = parseTransformValue(text);
    if (!record(value)) throw new Error("object");
    let nodes = 0;
    const pending: { value: unknown; depth: number }[] = [{ value, depth: 0 }];
    while (pending.length) {
      const { value: v, depth } = pending.pop()!;
      if (++nodes > MAX_WORK || depth > 32)
        throw new GraphqlStudioError("limit");
      if (v !== null && typeof v === "object")
        for (const child of Object.values(v)) {
          pending.push({ value: child, depth: depth + 1 });
          if (nodes + pending.length > MAX_WORK)
            throw new GraphqlStudioError("limit");
        }
    }
    return value as Record<string, JsonValue>;
  } catch (error) {
    throw error instanceof GraphqlStudioError
      ? error
      : new GraphqlStudioError(
          error instanceof TransformError && error.code === "limit"
            ? "limit"
            : code,
        );
  }
}
export function readGraphqlContract(source: string): GraphqlContract {
  bounded(source, MAX_GRAPHQL_SOURCE_BYTES);
  try {
    let schema: GraphQLSchema;
    const format = source
      .trimStart()
      .replace(/^\uFEFF/, "")
      .startsWith("{")
      ? "introspection"
      : "sdl";
    if (format === "introspection") {
      const parsed = parseTransformValue(source);
      if (!record(parsed)) throw new Error("Expected an introspection object.");
      const data = own(parsed, "__schema") ? parsed : own(parsed, "data");
      if (
        !record(data) ||
        !record(own(data, "__schema")) ||
        !Array.isArray(own(own(data, "__schema"), "types"))
      )
        throw new Error("Expected __schema or data.__schema.");
      if ((own(own(data, "__schema"), "types") as unknown[]).length > 1000)
        throw new GraphqlStudioError("limit");
      schema = buildClientSchema(data as unknown as IntrospectionQuery);
    } else schema = buildASTSchema(parseGraphql(source, true));
    const errors = validateSchema(schema);
    if (errors.length)
      throw new GraphqlStudioError(
        "schema",
        errors
          .slice(0, 8)
          .map((e) => e.message)
          .join("\n")
          .slice(0, 3000),
      );
    const schemaTypes = Object.values(schema.getTypeMap()).filter(
      (type) => !type.name.startsWith("__"),
    );
    if (schemaTypes.length > 1000) throw new GraphqlStudioError("limit");
    schema
      .getDirectives()
      .forEach((directive) =>
        directive.args.forEach((arg) => boundTypeWrappers(arg.type)),
      );
    let fieldCount = 0;
    const types = schemaTypes
      .map((type): GraphqlType => {
        if (type.name.length > 256) throw new GraphqlStudioError("limit");
        const dependencies = new Set<string>();
        const fields: GraphqlField[] = [];
        if (
          isObjectType(type) ||
          isInterfaceType(type) ||
          isInputObjectType(type)
        ) {
          for (const field of Object.values<
            GraphQLField<unknown, unknown> | GraphQLInputField
          >(type.getFields())) {
            if (++fieldCount > 10000 || field.name.length > 256)
              throw new GraphqlStudioError("limit");
            boundTypeWrappers(field.type);
            const args = "args" in field ? field.args : [];
            const argumentsInfo: GraphqlArgument[] = args.map((arg) => {
              boundTypeWrappers(arg.type);
              dependencies.add(getNamedType(arg.type).name);
              return {
                name: arg.name,
                type: String(arg.type),
                typeName: getNamedType(arg.type).name,
                description: arg.description ?? "",
                required: isRequiredArgument(arg),
                ...(arg.defaultValue === undefined
                  ? {}
                  : { defaultValue: JSON.stringify(arg.defaultValue) }),
              };
            });
            dependencies.add(getNamedType(field.type).name);
            fields.push({
              name: field.name,
              type: String(field.type),
              typeName: getNamedType(field.type).name,
              description: field.description ?? "",
              deprecated: field.deprecationReason != null,
              deprecationReason: field.deprecationReason ?? "",
              arguments: argumentsInfo,
              ...("defaultValue" in field && field.defaultValue !== undefined
                ? { defaultValue: JSON.stringify(field.defaultValue) }
                : {}),
            });
          }
        }
        const members = isUnionType(type)
          ? type.getTypes().map((t) => t.name)
          : isObjectType(type) || isInterfaceType(type)
            ? type.getInterfaces().map((t) => t.name)
            : [];
        members.forEach((name) => dependencies.add(name));
        return {
          name: type.name,
          kind: kindOf(type),
          description: type.description ?? "",
          fields,
          members,
          possibleTypes: isInterfaceType(type)
            ? schema.getPossibleTypes(type).map((t) => t.name)
            : [],
          dependencies: [...dependencies].sort(),
          enumValues: isEnumType(type)
            ? type.getValues().map((v) => ({
                name: v.name,
                description: v.description ?? "",
                deprecated: v.deprecationReason != null,
              }))
            : [],
          oneOf: isInputObjectType(type) && type.isOneOf,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
    const operations: GraphqlRootField[] = [];
    for (const kind of ["query", "mutation", "subscription"] as const) {
      const root =
        kind === "query"
          ? schema.getQueryType()
          : kind === "mutation"
            ? schema.getMutationType()
            : schema.getSubscriptionType();
      const type = types.find((t) => t.name === root?.name);
      if (root && type)
        type.fields.forEach((field) =>
          operations.push({
            ...field,
            key: `${kind}:${field.name}`,
            kind,
            owner: root.name,
          }),
        );
    }
    return {
      source,
      sdl: format === "sdl" ? source : printSchema(schema),
      format,
      schema,
      types,
      operations,
      fieldCount,
    };
  } catch (error) {
    throw error instanceof GraphqlStudioError
      ? error
      : new GraphqlStudioError(
          error instanceof TransformError && error.code === "limit"
            ? "limit"
            : "schema",
          error instanceof Error ? error.message.slice(0, 3000) : "",
        );
  }
}
const diagnostic = (
  error: GraphQLError,
  phase: GraphqlDiagnostic["phase"],
): GraphqlDiagnostic => ({
  phase,
  message: error.message.slice(0, 3000),
  locations:
    error.locations?.map((l) => ({ line: l.line, column: l.column })) ?? [],
});
export function checkGraphqlRequest(
  contract: GraphqlContract,
  draft: GraphqlDraft,
): GraphqlRequestCheck {
  const variables = jsonObject(
    draft.variables,
    "variables",
    MAX_GRAPHQL_REQUEST_BYTES,
  );
  const base: GraphqlRequestCheck = {
    ready: false,
    document: null,
    operation: null,
    operations: [],
    variables,
    coercedVariables: {},
    issues: [],
    warnings: [],
    ignoredVariableCount: 0,
  };
  let document: DocumentNode;
  try {
    document = parseGraphql(draft.document);
  } catch (error) {
    if (error instanceof GraphqlStudioError) throw error;
    return {
      ...base,
      issues: [
        diagnostic(
          error instanceof GraphQLError
            ? error
            : new GraphQLError("Invalid operation document."),
          "document",
        ),
      ],
    };
  }
  const operations = document.definitions
    .filter(
      (d): d is OperationDefinitionNode => d.kind === Kind.OPERATION_DEFINITION,
    )
    .map((d) => ({
      name: d.name?.value ?? "",
      kind: d.operation as GraphqlKind,
    }));
  const errors = validate(contract.schema, document, undefined, {
    maxErrors: 50,
  });
  const operation =
    getOperationAST(document, draft.operationName || undefined) ?? null;
  const result = {
    ...base,
    document,
    operation,
    operations,
    issues: errors.map((e) => diagnostic(e, "document")),
  };
  if (!operation)
    result.issues.push({
      phase: "selection",
      message:
        "Select an existing operation name; multi-operation documents require a name.",
      locations: [],
    });
  if (result.issues.length || !operation) return result;
  const values = getVariableValues(
    contract.schema,
    operation.variableDefinitions ?? [],
    variables,
    { maxErrors: 50 },
  );
  const names = new Set(
    operation.variableDefinitions?.map((v) => v.variable.name.value) ?? [],
  );
  result.ignoredVariableCount = Object.keys(variables).filter(
    (key) => !names.has(key),
  ).length;
  const warnings = new Map<string, GraphqlWarning>();
  function inputWarnings(input: GraphQLInputType) {
    const pending = [getNamedType(input)],
      seen = new Set<string>();
    while (pending.length) {
      const type = pending.pop()!;
      if (seen.has(type.name)) continue;
      seen.add(type.name);
      if (isScalarType(type) && !isSpecifiedScalarType(type))
        warnings.set(`scalar:${type.name}`, {
          code: "custom-scalar",
          name: type.name,
        });
      if (isInputObjectType(type))
        Object.values(type.getFields()).forEach((field) =>
          pending.push(getNamedType(field.type)),
        );
    }
  }
  contract.schema
    .getDirectives()
    .filter((d) => !isSpecifiedDirective(d))
    .forEach((d) =>
      warnings.set(`directive:${d.name}`, {
        code: "custom-directive",
        name: d.name,
      }),
    );
  const typeInfo = new TypeInfo(contract.schema);
  visit(
    document,
    visitWithTypeInfo(typeInfo, {
      Field() {
        const type = typeInfo.getType();
        if (type) {
          const named = getNamedType(type);
          if (isScalarType(named) && !isSpecifiedScalarType(named))
            warnings.set(`scalar:${named.name}`, {
              code: "custom-scalar",
              name: named.name,
            });
        }
      },
      VariableDefinition() {
        const type = typeInfo.getInputType();
        if (type) inputWarnings(type);
      },
      Argument() {
        const type = typeInfo.getInputType();
        if (type) inputWarnings(type);
      },
      Directive(node) {
        const directive = contract.schema.getDirective(node.name.value);
        if (directive && !isSpecifiedDirective(directive))
          warnings.set(`directive:${directive.name}`, {
            code: "custom-directive",
            name: directive.name,
          });
      },
    }),
  );
  result.warnings = [...warnings.values()];
  if (values.errors)
    result.issues = values.errors.map((e) => diagnostic(e, "variables"));
  else {
    result.coercedVariables = values.coerced;
    result.ready = true;
  }
  return result;
}
function scalarSample(type: GraphQLNamedType): JsonValue {
  if (isEnumType(type))
    return (
      type.getValues().find((v) => v.deprecationReason == null) ??
      type.getValues()[0]
    ).name;
  return type.name === "Int"
    ? 1
    : type.name === "Float"
      ? 1.5
      : type.name === "Boolean"
        ? true
        : type.name === "ID"
          ? "1"
          : type.name === "String"
            ? "example"
            : "custom-value";
}
type GenerationBudget = { remaining: number; defaultBytes: number };
function sampleDefault(value: unknown, budget: GenerationBudget): JsonValue {
  const text = JSON.stringify(value);
  budget.defaultBytes += getByteSize(text);
  if (budget.defaultBytes > MAX_GRAPHQL_REQUEST_BYTES)
    throw new GraphqlStudioError("limit");
  try {
    return parseTransformValue(text);
  } catch {
    throw new GraphqlStudioError("generation");
  }
}
function sampleInput(
  type: GraphQLInputType,
  optional: boolean,
  ancestors = new Set<string>(),
  depth = 0,
  budget: GenerationBudget = { remaining: 2000, defaultBytes: 0 },
): JsonValue {
  if (--budget.remaining < 0) throw new GraphqlStudioError("limit");
  if (isNonNullType(type))
    return sampleInput(type.ofType, optional, ancestors, depth, budget);
  if (depth > 12) throw new GraphqlStudioError("generation");
  if (isListType(type))
    return ancestors.has(getNamedType(type).name)
      ? []
      : [sampleInput(type.ofType, optional, ancestors, depth + 1, budget)];
  if (isInputObjectType(type)) {
    if (ancestors.has(type.name)) return null;
    const path = new Set([...ancestors, type.name]);
    const fields = Object.values(type.getFields());
    const selected = type.isOneOf
      ? [
          fields.find(
            (f) =>
              isListType(f.type) || !isInputObjectType(getNamedType(f.type)),
          ) ?? fields[0],
        ]
      : fields.filter((f) => requiredInput(f) || optional);
    return Object.fromEntries(
      selected.map((f) => [
        f.name,
        f.defaultValue === undefined
          ? sampleInput(f.type, optional, path, depth + 1, budget)
          : sampleDefault(f.defaultValue, budget),
      ]),
    );
  }
  return scalarSample(type);
}
function outputParts(
  contract: GraphqlContract,
  type: GraphQLOutputType,
  depth: number,
  ancestors = new Set<string>(),
  budget: GenerationBudget = { remaining: 2000, defaultBytes: 0 },
): { selection: string; sample: JsonValue } {
  if (--budget.remaining < 0) throw new GraphqlStudioError("limit");
  if (isNonNullType(type))
    return outputParts(contract, type.ofType, depth, ancestors, budget);
  if (isListType(type)) {
    const result = outputParts(contract, type.ofType, depth, ancestors, budget);
    return { ...result, sample: [result.sample] };
  }
  const named = getNamedType(type);
  if (isScalarType(named) || isEnumType(named))
    return { selection: "", sample: scalarSample(named) };
  if (isAbstractType(named)) {
    const possible = contract.schema.getPossibleTypes(named).slice(0, 8);
    const parts = possible.map((t) => ({
      type: t,
      ...outputParts(contract, t, depth, ancestors, budget),
    }));
    return {
      selection: `{ __typename ${parts.map((p) => `... on ${p.type.name} ${p.selection}`).join(" ")} }`,
      sample: parts[0]?.sample ?? null,
    };
  }
  if (!isObjectType(named)) throw new GraphqlStudioError("generation");
  if (depth <= 0 || ancestors.has(named.name))
    return { selection: "{ __typename }", sample: { __typename: named.name } };
  const path = new Set([...ancestors, named.name]);
  const fields = Object.values(named.getFields())
    .filter(
      (f) => f.deprecationReason == null && !f.args.some(isRequiredArgument),
    )
    .slice(0, 8);
  const children = fields.map((f) => ({
    field: f,
    ...outputParts(contract, f.type, depth - 1, path, budget),
  }));
  return {
    selection: children.length
      ? `{ ${children.map((p) => `${p.field.name}${p.selection ? ` ${p.selection}` : ""}`).join(" ")} }`
      : "{ __typename }",
    sample: Object.fromEntries([
      ["__typename", named.name],
      ...children.map((p) => [p.field.name, p.sample]),
    ]),
  };
}
export function generateGraphqlOperation(
  contract: GraphqlContract,
  key: string,
  depth = 2,
  optional = false,
): GraphqlDraft {
  if (!Number.isInteger(depth) || depth < 1 || depth > 4)
    throw new GraphqlStudioError("generation");
  const selected = contract.operations.find((o) => o.key === key);
  if (!selected) throw new GraphqlStudioError("generation");
  const root =
    selected.kind === "query"
      ? contract.schema.getQueryType()
      : selected.kind === "mutation"
        ? contract.schema.getMutationType()
        : contract.schema.getSubscriptionType();
  const field = root!.getFields()[selected.name];
  const args = field.args.filter((a) => isRequiredArgument(a) || optional);
  const operationName = `Studio_${selected.name}`;
  const budget: GenerationBudget = { remaining: 2000, defaultBytes: 0 };
  const output = outputParts(contract, field.type, depth, new Set(), budget);
  const document = `${selected.kind} ${operationName}${args.length ? `(${args.map((a) => `$${a.name}: ${a.type}`).join(", ")})` : ""} { ${field.name}${args.length ? `(${args.map((a) => `${a.name}: $${a.name}`).join(", ")})` : ""}${output.selection ? ` ${output.selection}` : ""} }`;
  const draft: GraphqlDraft = {
    name: selected.name.slice(0, 120),
    document,
    operationName,
    variables: JSON.stringify(
      Object.fromEntries(
        args.map((a) => [
          a.name,
          a.defaultValue === undefined
            ? sampleInput(a.type, optional, new Set(), 0, budget)
            : sampleDefault(a.defaultValue, budget),
        ]),
      ),
      null,
      2,
    ),
    fixtures: JSON.stringify(
      Object.fromEntries([[field.name, output.sample]]),
      null,
      2,
    ),
  };
  jsonObject(draft.fixtures, "fixtures", MAX_GRAPHQL_FIXTURE_BYTES);
  if (!checkGraphqlRequest(contract, draft).ready)
    throw new GraphqlStudioError("generation");
  return draft;
}

// Bound projected work and bytes before GraphQL completion can multiply a large
// fixture through repeated selections, aliases, fragments, or nested lists.
function boundRehearsal(
  check: GraphqlRequestCheck,
  fixtures: Record<string, JsonValue>,
) {
  const fragments = fragmentMap(check.document!);
  let work = 0,
    bytes = 0;
  const account = (value: unknown, overhead = 0) => {
    if (++work > MAX_WORK) throw new GraphqlStudioError("limit");
    bytes += overhead + getByteSize(JSON.stringify(value) ?? "null");
    if (bytes > MAX_GRAPHQL_SOURCE_BYTES) throw new GraphqlStudioError("limit");
  };
  function output(value: unknown, selection?: SelectionSetNode) {
    if (Array.isArray(value)) {
      account(null, 2);
      value.forEach((v) => output(v, selection));
    } else if (selection && record(value)) scan(selection, value);
    else account(value);
  }
  function scan(set: SelectionSetNode, parent: unknown) {
    for (const selection of set.selections) {
      if (
        selection.directives?.some((d) => {
          const argument = d.arguments?.find((a) => a.name.value === "if");
          if (
            !argument ||
            (d.name.value !== "skip" && d.name.value !== "include")
          )
            return false;
          const value = valueFromASTUntyped(
            argument.value,
            check.coercedVariables,
          );
          return (
            (d.name.value === "skip" && value === true) ||
            (d.name.value === "include" && value === false)
          );
        })
      )
        continue;
      if (selection.kind === Kind.FIELD) {
        account(
          null,
          selection.alias?.value.length ?? selection.name.value.length,
        );
        output(own(parent, selection.name.value), selection.selectionSet);
      } else if (selection.kind === Kind.INLINE_FRAGMENT)
        scan(selection.selectionSet, parent);
      else {
        const fragment = fragments.get(selection.name.value);
        if (fragment) scan(fragment.selectionSet, parent);
      }
    }
  }
  scan(check.operation!.selectionSet, fixtures);
}
export function rehearseGraphql(
  contract: GraphqlContract,
  draft: GraphqlDraft,
): GraphqlRehearsal {
  const check = checkGraphqlRequest(contract, draft);
  if (!check.ready)
    return { check, response: null, status: "invalid", fieldSteps: 0 };
  if (check.operation!.operation === "subscription")
    throw new GraphqlStudioError("subscription");
  const fragments = fragmentMap(check.document!);
  function hasIntrospection(set: SelectionSetNode): boolean {
    return set.selections.some((selection) => {
      if (selection.kind === Kind.FIELD)
        return (
          selection.name.value === "__schema" ||
          selection.name.value === "__type" ||
          Boolean(
            selection.selectionSet && hasIntrospection(selection.selectionSet),
          )
        );
      if (selection.kind === Kind.INLINE_FRAGMENT)
        return hasIntrospection(selection.selectionSet);
      const fragment = fragments.get(selection.name.value);
      return Boolean(fragment && hasIntrospection(fragment.selectionSet));
    });
  }
  if (hasIntrospection(check.operation!.selectionSet))
    throw new GraphqlStudioError("introspection");
  const fixtures = jsonObject(
    draft.fixtures,
    "fixtures",
    MAX_GRAPHQL_FIXTURE_BYTES,
  );
  boundRehearsal(check, fixtures);
  let fieldSteps = 0;
  const result = executeSync({
    schema: contract.schema,
    document: check.document!,
    operationName: draft.operationName || undefined,
    variableValues: check.variables,
    rootValue: fixtures,
    fieldResolver(parent, _args, _context, info) {
      fieldSteps++;
      return own(parent, info.fieldName);
    },
    typeResolver(value) {
      const name = own(value, "__typename");
      return typeof name === "string" ? name : undefined;
    },
  });
  const text = JSON.stringify(result);
  bounded(text, MAX_GRAPHQL_SOURCE_BYTES);
  let response: JsonValue;
  try {
    response = parseTransformValue(text);
  } catch {
    throw new GraphqlStudioError("limit");
  }
  return {
    check,
    response,
    status: result.errors?.length ? "errors" : "success",
    fieldSteps,
  };
}
export function graphqlRequestPayload(
  contract: GraphqlContract,
  draft: GraphqlDraft,
): Record<string, JsonValue> {
  const check = checkGraphqlRequest(contract, draft);
  if (!check.ready) throw new GraphqlStudioError("request");
  return {
    query: draft.document,
    ...(check.operation?.name
      ? { operationName: check.operation.name.value }
      : {}),
    variables: check.variables,
  };
}
export function readGraphqlRequestPayload(text: string): GraphqlDraft {
  bounded(text, MAX_GRAPHQL_SOURCE_BYTES);
  let value: JsonValue;
  try {
    value = parseTransformValue(text);
  } catch {
    throw new GraphqlStudioError("request");
  }
  if (
    !record(value) ||
    typeof value.query !== "string" ||
    (value.operationName != null && typeof value.operationName !== "string") ||
    (value.variables != null && !record(value.variables))
  )
    throw new GraphqlStudioError("request");
  bounded(value.query, MAX_GRAPHQL_REQUEST_BYTES);
  const operationName =
    typeof value.operationName === "string" ? value.operationName : "";
  if (operationName.length > 256) throw new GraphqlStudioError("request");
  const variables = JSON.stringify(value.variables ?? {}, null, 2);
  jsonObject(variables, "variables", MAX_GRAPHQL_REQUEST_BYTES);
  return {
    name: operationName.trim().slice(0, 120) || "Imported GraphQL operation",
    document: value.query,
    operationName,
    variables,
    fixtures: "{}",
  };
}
export function graphqlCheckReport(
  check: GraphqlRequestCheck,
  rehearsal?: GraphqlRehearsal | null,
) {
  return {
    kind: "rsswag-graphql-check",
    version: 1,
    ready: check.ready,
    operation: check.operation
      ? {
          name: check.operation.name?.value ?? "",
          kind: check.operation.operation,
        }
      : null,
    ignoredVariableCount: check.ignoredVariableCount,
    warnings: check.warnings,
    issues: check.issues.map((issue) => ({
      phase: issue.phase,
      locations: issue.locations,
    })),
    rehearsal: rehearsal
      ? {
          status: rehearsal.status,
          fieldSteps: rehearsal.fieldSteps,
          errorCount: Array.isArray(own(rehearsal.response, "errors"))
            ? (own(rehearsal.response, "errors") as unknown[]).length
            : 0,
        }
      : null,
  };
}
export function exportGraphqlIntrospection(contract: GraphqlContract): string {
  const text = JSON.stringify(
    introspectionFromSchema(contract.schema, { typeDepth: 17 }),
    null,
    2,
  );
  bounded(text, MAX_GRAPHQL_SOURCE_BYTES);
  return text;
}
export function emptyGraphqlDraft(): GraphqlDraft {
  return {
    name: "GraphQL operation",
    document: "",
    operationName: "",
    variables: "{}",
    fixtures: "{}",
  };
}
export function emptyGraphqlProject(): GraphqlProject {
  return {
    kind: "rsswag-graphql-project",
    version: 1,
    name: "GraphQL API",
    source: "",
    endpoint: "https://example.test/graphql",
    draft: emptyGraphqlDraft(),
    cases: [],
  };
}
function readDraft(value: unknown): GraphqlDraft {
  if (
    !record(value) ||
    typeof value.name !== "string" ||
    !value.name.trim() ||
    value.name.length > 120 ||
    typeof value.document !== "string" ||
    typeof value.operationName !== "string" ||
    value.operationName.length > 256 ||
    typeof value.variables !== "string" ||
    typeof value.fixtures !== "string"
  )
    throw new GraphqlStudioError("project");
  bounded(value.document, MAX_GRAPHQL_REQUEST_BYTES);
  jsonObject(value.variables, "variables", MAX_GRAPHQL_REQUEST_BYTES);
  jsonObject(value.fixtures, "fixtures", MAX_GRAPHQL_FIXTURE_BYTES);
  return {
    name: value.name.trim(),
    document: value.document,
    operationName: value.operationName,
    variables: value.variables,
    fixtures: value.fixtures,
  };
}
export function saveGraphqlCase(
  project: GraphqlProject,
  contract: GraphqlContract,
  draft: GraphqlDraft,
  id?: string,
): GraphqlProject {
  const value = readDraft(draft);
  if (!checkGraphqlRequest(contract, value).ready)
    throw new GraphqlStudioError("request");
  if (id && !project.cases.some((c) => c.id === id))
    throw new GraphqlStudioError("case");
  if (!id && project.cases.length >= MAX_GRAPHQL_CASES)
    throw new GraphqlStudioError("limit");
  let number = 1;
  while (project.cases.some((c) => c.id === `case-${number}`)) number++;
  const item = { ...value, id: id ?? `case-${number}` };
  const next = {
    ...project,
    cases: id
      ? project.cases.map((c) => (c.id === id ? item : c))
      : [...project.cases, item],
  };
  bounded(JSON.stringify(next), MAX_GRAPHQL_PROJECT_BYTES);
  return next;
}
export function parseGraphqlProject(text: string): {
  project: GraphqlProject;
  contract: GraphqlContract;
} {
  bounded(text, MAX_GRAPHQL_PROJECT_BYTES);
  let value: unknown;
  try {
    value = JSON.parse(text.replace(/^\uFEFF/, ""));
  } catch {
    throw new GraphqlStudioError("project");
  }
  const pending: { value: unknown; depth: number }[] = [{ value, depth: 0 }];
  let nodes = 0;
  while (pending.length) {
    const entry = pending.pop()!;
    if (++nodes > 100000 || entry.depth > 64)
      throw new GraphqlStudioError("limit");
    if (entry.value !== null && typeof entry.value === "object")
      for (const child of Object.values(entry.value)) {
        pending.push({ value: child, depth: entry.depth + 1 });
        if (nodes + pending.length > 100000)
          throw new GraphqlStudioError("limit");
      }
  }
  if (
    !record(value) ||
    value.kind !== "rsswag-graphql-project" ||
    value.version !== 1 ||
    typeof value.name !== "string" ||
    !value.name.trim() ||
    value.name.length > 120 ||
    typeof value.source !== "string" ||
    typeof value.endpoint !== "string" ||
    value.endpoint.length > 4096 ||
    !Array.isArray(value.cases)
  )
    throw new GraphqlStudioError("project");
  if (value.cases.length > MAX_GRAPHQL_CASES)
    throw new GraphqlStudioError("limit");
  const seen = new Set<string>();
  const cases = value.cases.map((item): GraphqlCase => {
    if (
      !record(item) ||
      typeof item.id !== "string" ||
      !/^case-[1-9]\d{0,5}$/.test(item.id) ||
      seen.has(item.id)
    )
      throw new GraphqlStudioError("project");
    seen.add(item.id);
    return { ...readDraft(item), id: item.id };
  });
  const contract = readGraphqlContract(value.source);
  return {
    contract,
    project: {
      kind: "rsswag-graphql-project",
      version: 1,
      name: value.name.trim(),
      source: value.source,
      endpoint: value.endpoint,
      draft: readDraft(value.draft),
      cases,
    },
  };
}
export function serializeGraphqlProject(project: GraphqlProject): string {
  const text = JSON.stringify(project, null, 2);
  bounded(text, MAX_GRAPHQL_PROJECT_BYTES);
  parseGraphqlProject(text);
  return text;
}
export function createGraphqlHttpContract(
  contract: GraphqlContract,
  draft: GraphqlDraft,
  endpoint: string,
  title = "GraphQL HTTP API",
): Record<string, JsonValue> {
  const check = checkGraphqlRequest(contract, draft);
  if (!check.ready || !check.operation) throw new GraphqlStudioError("request");
  if (check.operation.operation === "subscription")
    throw new GraphqlStudioError("subscription");
  let url: URL;
  try {
    url = new URL(endpoint);
    if (
      !/^https?:$/.test(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      endpoint.length > 4096
    )
      throw new Error();
  } catch {
    throw new GraphqlStudioError("endpoint");
  }
  const schemas: Record<string, JsonValue> = {};
  function inputSchema(
    type: GraphQLInputType,
    depth = 0,
    nonNull = false,
  ): JsonValue {
    if (depth > 32) throw new GraphqlStudioError("limit");
    if (isNonNullType(type)) return inputSchema(type.ofType, depth, true);
    let result: JsonValue;
    if (isListType(type))
      result = { type: "array", items: inputSchema(type.ofType, depth + 1) };
    else if (isInputObjectType(type)) {
      const name = `GraphQLInput_${type.name}`;
      if (!Object.hasOwn(schemas, name)) {
        Object.defineProperty(schemas, name, {
          value: {},
          enumerable: true,
          writable: true,
        });
        const fields = Object.values(type.getFields());
        const properties = Object.fromEntries(
          fields.map((f) => [f.name, inputSchema(f.type, depth + 1)]),
        );
        const required = fields.filter(requiredInput).map((f) => f.name);
        schemas[name] = {
          type: "object",
          additionalProperties: false,
          properties,
          ...(required.length ? { required } : {}),
          ...(type.isOneOf
            ? {
                minProperties: 1,
                maxProperties: 1,
                oneOf: fields.map((f) => ({
                  required: [f.name],
                  properties: {
                    [f.name]: inputSchema(f.type, depth + 1, true),
                  },
                })),
              }
            : {}),
        };
      }
      result = { $ref: `#/components/schemas/${name}` };
    } else if (isEnumType(type))
      result = { type: "string", enum: type.getValues().map((v) => v.name) };
    else
      result =
        type.name === "Int"
          ? { type: "integer", minimum: -2147483648, maximum: 2147483647 }
          : type.name === "Float"
            ? { type: "number" }
            : type.name === "Boolean"
              ? { type: "boolean" }
              : type.name === "ID"
                ? { anyOf: [{ type: "string" }, { type: "integer" }] }
                : type.name === "String"
                  ? { type: "string" }
                  : {};
    return nonNull ? result : { anyOf: [result, { type: "null" }] };
  }
  const variables: Record<string, JsonValue> = {},
    required: string[] = [];
  for (const definition of check.operation.variableDefinitions ?? []) {
    const type = typeFromAST(contract.schema, definition.type);
    if (!type || !isInputType(type)) throw new GraphqlStudioError("request");
    const name = definition.variable.name.value;
    Object.defineProperty(variables, name, {
      value: inputSchema(type),
      enumerable: true,
      configurable: true,
      writable: true,
    });
    if (isNonNullType(type) && definition.defaultValue === undefined)
      required.push(name);
  }
  const payload = graphqlRequestPayload(contract, draft);
  const requestProperties: Record<string, JsonValue> = {
    query: { type: "string", const: draft.document },
    variables: {
      type: "object",
      properties: variables,
      additionalProperties: true,
      ...(required.length ? { required } : {}),
    },
  };
  if (payload.operationName)
    requestProperties.operationName = {
      type: "string",
      const: payload.operationName,
    };
  return {
    openapi: "3.1.0",
    info: {
      title: title.trim().slice(0, 120) || "GraphQL HTTP API",
      version: "1.0.0",
      description:
        "HTTP envelope for one prepared GraphQL operation. Variables are modeled; response data is intentionally free-form. This contract does not implement a gateway, resolvers, authentication, or custom scalar/directive semantics.",
    },
    servers: [{ url: url.origin }],
    paths: {
      [url.pathname]: {
        post: {
          operationId: `graphql_${check.operation.name?.value ?? "operation"}`,
          tags: ["GraphQL"],
          summary: draft.name,
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: requestProperties,
                  required: [
                    "query",
                    ...(required.length ? ["variables"] : []),
                  ],
                },
                example: payload,
              },
            },
          },
          responses: {
            "200": {
              description:
                "GraphQL result; inspect errors even when the HTTP status is 200.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    anyOf: [{ required: ["data"] }, { required: ["errors"] }],
                    properties: {
                      data: {
                        type: ["object", "null"],
                        additionalProperties: true,
                      },
                      errors: {
                        type: "array",
                        minItems: 1,
                        items: {
                          type: "object",
                          required: ["message"],
                          properties: {
                            message: { type: "string" },
                            path: {
                              type: "array",
                              items: {
                                anyOf: [
                                  { type: "string" },
                                  { type: "integer" },
                                ],
                              },
                            },
                            extensions: {
                              type: "object",
                              additionalProperties: true,
                            },
                          },
                        },
                      },
                    },
                  },
                  example: { data: {} },
                },
              },
            },
          },
        },
      },
    },
    components: { schemas },
  };
}

export const DEMO_GRAPHQL_SCHEMA = `"A small shop API for local GraphQL rehearsal."
schema { query: Query mutation: Mutation subscription: Subscription }
enum ItemStatus { ACTIVE ARCHIVED }
interface Node { id: ID! }
type Item implements Node {
  id: ID!
  name: String!
  price: Float!
  status: ItemStatus!
  related: [Item!]!
  legacyName: String @deprecated(reason: "Use name")
}
input ItemInput { name: String! price: Float! status: ItemStatus = ACTIVE }
type Query {
  "Look up one item."
  item(id: ID!): Item
  "List the catalog."
  items(limit: Int = 10): [Item!]!
}
type Mutation { createItem(input: ItemInput!): Item! }
type Subscription { itemChanged: Item! }
`;
