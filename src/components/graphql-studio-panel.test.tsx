import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GraphqlStudioPanel } from "./graphql-studio-panel";
import { setAppLanguage } from "./i18n-provider";
import { downloadTextFile } from "@/lib/schema-download";
import {
  DEMO_GRAPHQL_SCHEMA,
  emptyGraphqlProject,
  exportGraphqlIntrospection,
  generateGraphqlOperation,
  MAX_GRAPHQL_SOURCE_BYTES,
  parseGraphqlProject,
  readGraphqlContract,
  serializeGraphqlProject,
} from "@/lib/graphql-studio";
import { DEFAULT_OPENAPI_SCHEMA, parseOpenApiSchema } from "@/lib/openapi";

vi.mock("@/lib/schema-download", () => ({ downloadTextFile: vi.fn() }));
beforeEach(() => vi.mocked(downloadTextFile).mockReset().mockReturnValue(true));
afterEach(() => vi.restoreAllMocks());
const button = (name: string) => screen.getByRole("button", { name });
const change = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const exported = () => vi.mocked(downloadTextFile).mock.calls.at(-1)![0];
const file = (text: string, name = "schema.graphql") => {
  const f = new File([text], name, {
    type: name.endsWith(".json") ? "application/json" : "text/plain",
  });
  Object.defineProperty(f, "text", {
    configurable: true,
    value: async () => text,
  });
  return f;
};
async function setup(demo = true) {
  const user = userEvent.setup();
  let editor = DEFAULT_OPENAPI_SCHEMA;
  const get = vi.fn(() => editor),
    view = render(<GraphqlStudioPanel getSchemaText={get} />);
  await user.click(
    screen.getByText("GraphQL contract studio", { selector: "summary" }),
  );
  if (demo) await user.click(button("Load demo GraphQL contract"));
  return {
    user,
    get,
    ...view,
    edit: (text: string) => {
      editor = text;
    },
    editor: () => editor,
  };
}
async function run(user: ReturnType<typeof userEvent.setup>) {
  await user.click(button("Run offline GraphQL rehearsal"));
}
async function explore(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    screen.getByText("Explore GraphQL types and dependencies", {
      selector: "summary",
    }),
  );
}
const responseText = () =>
  (
    screen.getByLabelText(
      "Offline GraphQL response (first 16,000 characters)",
    ) as HTMLTextAreaElement
  ).value;

describe("GraphqlStudioPanel", () => {
  it("rehearses and exports requests, responses, reports, portable projects, and HTTP contracts without fetching, storage writes, or editor changes", async () => {
    const { user, get, editor } = await setup(),
      network = vi.spyOn(globalThis, "fetch"),
      storage = vi.spyOn(Storage.prototype, "setItem");
    expect(button("Download GraphQL HTTP request")).toBeDisabled();
    await run(user);
    expect(JSON.parse(responseText())).toMatchObject({
      data: { item: { id: "1", name: "example" } },
    });
    await user.click(button("Download GraphQL HTTP request"));
    expect(JSON.parse(exported())).toMatchObject({
      operationName: "Studio_item",
      variables: { id: "1" },
    });
    await user.click(button("Download offline GraphQL response"));
    expect(JSON.parse(exported()).data.item.name).toBe("example");
    await user.click(button("Download GraphQL check report"));
    expect(JSON.parse(exported())).toMatchObject({
      ready: true,
      rehearsal: { status: "success" },
    });
    expect(exported()).not.toContain('"example"');
    await user.click(button("Download GraphQL HTTP OpenAPI contract"));
    const parsed = parseOpenApiSchema(exported());
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.value.endpoints[0]).toMatchObject({
      path: "/graphql",
      method: "POST",
    });
    change("GraphQL HTTP OpenAPI output format", "yaml");
    await user.click(button("Download GraphQL HTTP OpenAPI contract"));
    expect(exported()).toContain("openapi: 3.1.0");
    await user.click(button("Download GraphQL studio project"));
    expect(parseGraphqlProject(exported()).project.source).toBe(
      DEMO_GRAPHQL_SCHEMA,
    );
    await explore(user);
    await user.click(button("Download GraphQL SDL"));
    expect(exported()).toBe(DEMO_GRAPHQL_SCHEMA);
    await user.click(button("Download GraphQL introspection JSON"));
    expect(JSON.parse(exported()).__schema.queryType.name).toBe("Query");
    await user.click(button("Download GraphQL schema inventory"));
    expect(JSON.parse(exported()).operations).toHaveLength(4);
    expect(network).not.toHaveBeenCalled();
    expect(storage).not.toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();
    expect(editor()).toBe(DEFAULT_OPENAPI_SCHEMA);
  });
  it("invalidates checks on edits, diagnoses variables and documents, and displays null-bubbling execution errors", async () => {
    const { user } = await setup();
    await run(user);
    change("GraphQL variables (JSON object)", "{}");
    expect(button("Download GraphQL HTTP request")).toBeDisabled();
    expect(
      screen.queryByLabelText(
        "Offline GraphQL response (first 16,000 characters)",
      ),
    ).not.toBeInTheDocument();
    await user.click(button("Validate GraphQL document and variables"));
    expect(
      screen.getByRole("list", { name: "GraphQL request diagnostics" }),
    ).toHaveTextContent('Variable "$id" of required type');
    change("GraphQL variables (JSON object)", '{"id":"1"}');
    change("GraphQL root fixtures (JSON object)", '{"item":{"id":null}}');
    await run(user);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "produced execution errors",
    );
    expect(JSON.parse(responseText())).toMatchObject({
      data: { item: null },
      errors: [{ path: ["item", "id"] }],
    });
    change("GraphQL operation document", "{ unknown }");
    change("GraphQL operation name (blank for one operation)", "");
    await user.click(button("Validate GraphQL document and variables"));
    expect(
      screen.getByRole("list", { name: "GraphQL request diagnostics" }),
    ).toHaveTextContent('Cannot query field "unknown"');
    change("GraphQL variables (JSON object)", "[]");
    await user.click(button("Validate GraphQL document and variables"));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Variables must be a bounded JSON object",
    );
  });
  it("retains the previous schema, draft, and saved operations through invalid source edits, then revalidates against changed schemas", async () => {
    const { user } = await setup();
    await user.click(button("Save as new GraphQL operation"));
    const previous = (
      screen.getByLabelText("GraphQL operation document") as HTMLTextAreaElement
    ).value;
    change("GraphQL schema source (SDL/introspection JSON)", "type Query {");
    expect(button("Run offline GraphQL rehearsal")).toBeDisabled();
    await user.click(button("Load and validate GraphQL schema"));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Unable to load a valid GraphQL schema",
    );
    expect(screen.getByLabelText("GraphQL operation document")).toHaveValue(
      previous,
    );
    change(
      "GraphQL schema source (SDL/introspection JSON)",
      "type Query { version: Int! }",
    );
    await user.click(button("Load and validate GraphQL schema"));
    expect(screen.getByLabelText("GraphQL operation document")).toHaveValue(
      previous,
    );
    expect(screen.getByText(/1\/50 saved operations/)).toBeInTheDocument();
    await user.click(button("Validate GraphQL document and variables"));
    expect(
      screen.getByRole("list", { name: "GraphQL request diagnostics" }),
    ).toHaveTextContent('Cannot query field "item"');
    await user.click(button("Download GraphQL studio project"));
    expect(parseGraphqlProject(exported()).project.cases).toHaveLength(1);
  });
  it("imports introspection and generates a mutation with editable input values and valid offline output", async () => {
    const { user } = await setup(false),
      raw = JSON.parse(
        exportGraphqlIntrospection(readGraphqlContract(DEMO_GRAPHQL_SCHEMA)),
      );
    await user.upload(
      screen.getByLabelText("Import GraphQL schema (SDL/introspection JSON)"),
      file(JSON.stringify({ data: raw }), "schema.json"),
    );
    change("Filter GraphQL operation kind", "mutation");
    await user.click(button("Generate operation, variables, and fixtures"));
    expect(
      (
        screen.getByLabelText(
          "GraphQL operation document",
        ) as HTMLTextAreaElement
      ).value,
    ).toContain("mutation Studio_createItem");
    expect(
      JSON.parse(
        (
          screen.getByLabelText(
            "GraphQL variables (JSON object)",
          ) as HTMLTextAreaElement
        ).value,
      ),
    ).toEqual({ input: { name: "example", price: 1.5 } });
    await run(user);
    expect(JSON.parse(responseText()).data.createItem.name).toBe("example");
  });
  it("explores fields, enum values, deprecation, required arguments, and dependencies with search and filters", async () => {
    const { user } = await setup();
    await explore(user);
    expect(
      screen.getByRole("list", { name: "GraphQL fields" }),
    ).toHaveTextContent("id: ID! (required)");
    change("Search GraphQL types and fields", "legacyName");
    await user.click(screen.getByRole("button", { name: "Item Object" }));
    expect(
      screen.getByRole("list", { name: "GraphQL fields" }),
    ).toHaveTextContent("Deprecated — Use name");
    await user.click(
      within(screen.getByLabelText("GraphQL type dependencies")).getByRole(
        "button",
        { name: "Node" },
      ),
    );
    expect(
      within(
        screen.getByLabelText("GraphQL interface implementations"),
      ).getByRole("button", { name: "Item" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("list", { name: "GraphQL fields" }),
    ).toHaveTextContent("id: ID!");
    change("Filter GraphQL type kind", "enum");
    expect(
      screen.getByRole("list", { name: "GraphQL enum values (first 100)" }),
    ).toHaveTextContent("ACTIVEARCHIVED");
    change("Search GraphQL types and fields", "nothing");
    expect(
      screen.getByText("No types match these filters."),
    ).toBeInTheDocument();
    fireEvent.keyDown(
      screen.getByLabelText("Search GraphQL types and fields"),
      { key: "Escape" },
    );
    expect(
      screen.getByLabelText("Search GraphQL types and fields"),
    ).toHaveValue("");
  });
  it("manages a saved operation library without removing the current draft or unrelated entries", async () => {
    const { user } = await setup();
    await user.click(button("Save as new GraphQL operation"));
    change("GraphQL operation draft name", "Second item query");
    await user.click(button("Save as new GraphQL operation"));
    change("GraphQL operation draft name", "Updated second");
    await user.click(button("Update selected saved operation"));
    change("Saved GraphQL operation", "case-1");
    await user.click(button("Load selected saved operation into draft"));
    expect(screen.getByLabelText("GraphQL operation draft name")).toHaveValue(
      "item",
    );
    expect(button("Download GraphQL HTTP request")).toBeDisabled();
    await user.click(button("Remove selected saved operation"));
    expect(screen.getByLabelText("GraphQL operation draft name")).toHaveValue(
      "item",
    );
    await user.click(button("Download GraphQL studio project"));
    const restored = parseGraphqlProject(exported());
    expect(restored.project.cases).toHaveLength(1);
    expect(restored.project.cases[0].name).toBe("Updated second");
  });
  it("imports HTTP request payloads, preserves current fixtures, and rejects malformed requests atomically", async () => {
    const { user } = await setup(),
      fixtures = (
        screen.getByLabelText(
          "GraphQL root fixtures (JSON object)",
        ) as HTMLTextAreaElement
      ).value;
    const query = "query ById($id: ID!) { item(id:$id) { id name } }";
    await user.upload(
      screen.getByLabelText("Import GraphQL HTTP request (JSON)"),
      file(
        JSON.stringify({
          query,
          operationName: "ById",
          variables: { id: "32" },
        }),
        "request.json",
      ),
    );
    expect(screen.getByLabelText("GraphQL operation document")).toHaveValue(
      query,
    );
    expect(
      screen.getByLabelText("GraphQL root fixtures (JSON object)"),
    ).toHaveValue(fixtures);
    expect(button("Download GraphQL HTTP request")).toBeDisabled();
    await run(user);
    await user.click(button("Download GraphQL HTTP request"));
    expect(JSON.parse(exported()).variables).toEqual({ id: "32" });
    await user.upload(
      screen.getByLabelText("Import GraphQL HTTP request (JSON)"),
      file('{"query":42}', "request.json"),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Use a valid GraphQL request",
    );
    expect(screen.getByLabelText("GraphQL operation document")).toHaveValue(
      query,
    );
  });
  it("restores projects without trusting persisted responses or automatically validating/executing", async () => {
    const { user } = await setup(false),
      contract = readGraphqlContract(DEMO_GRAPHQL_SCHEMA);
    const project = {
        ...emptyGraphqlProject(),
        source: DEMO_GRAPHQL_SCHEMA,
        draft: generateGraphqlOperation(contract, "query:item"),
      },
      raw = JSON.parse(serializeGraphqlProject(project));
    raw.response = { data: "INJECTED" };
    raw.check = { ready: true };
    await user.upload(
      screen.getByLabelText("Restore GraphQL studio project (JSON)"),
      file(JSON.stringify(raw), "project.json"),
    );
    expect(button("Download GraphQL HTTP request")).toBeDisabled();
    expect(
      screen.queryByLabelText(
        "Offline GraphQL response (first 16,000 characters)",
      ),
    ).not.toBeInTheDocument();
    await run(user);
    expect(responseText()).not.toContain("INJECTED");
  });
  it("validates/saves subscriptions but does not simulate streaming execution or export a normal HTTP operation", async () => {
    const { user } = await setup();
    change("Filter GraphQL operation kind", "subscription");
    await user.click(button("Generate operation, variables, and fixtures"));
    await user.click(button("Validate GraphQL document and variables"));
    expect(button("Download GraphQL HTTP request")).toBeEnabled();
    expect(button("Download GraphQL HTTP OpenAPI contract")).toBeDisabled();
    await user.click(button("Save as new GraphQL operation"));
    expect(screen.getByText(/1\/50 saved operations/)).toBeInTheDocument();
    await run(user);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "offline execution and this HTTP export support queries and mutations only",
    );
  });
  it("rejects malformed/oversized files and reports blocked downloads while retaining the current schema", async () => {
    const { user } = await setup();
    const original = (
      screen.getByLabelText(
        "GraphQL schema source (SDL/introspection JSON)",
      ) as HTMLTextAreaElement
    ).value;
    await user.upload(
      screen.getByLabelText("Import GraphQL schema (SDL/introspection JSON)"),
      file("type Query {"),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Unable to load a valid GraphQL schema",
    );
    expect(
      screen.getByLabelText("GraphQL schema source (SDL/introspection JSON)"),
    ).toHaveValue(original);
    const huge = file("{}");
    Object.defineProperty(huge, "size", {
      value: MAX_GRAPHQL_SOURCE_BYTES + 1,
    });
    await user.upload(
      screen.getByLabelText("Import GraphQL schema (SDL/introspection JSON)"),
      huge,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("limits exceeded");
    await run(user);
    vi.mocked(downloadTextFile).mockReturnValue(false);
    await user.click(button("Download GraphQL HTTP request"));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "browser blocked the GraphQL download",
    );
  });
  it("disables mutations during local file reads and discards a late read after unmount", async () => {
    const { user, unmount, get } = await setup();
    let resolve!: (text: string) => void;
    const delayed = file("{}");
    Object.defineProperty(delayed, "text", {
      configurable: true,
      value: () =>
        new Promise<string>((r) => {
          resolve = r;
        }),
    });
    await user.upload(
      screen.getByLabelText("Import GraphQL schema (SDL/introspection JSON)"),
      delayed,
    );
    expect(button("Load demo GraphQL contract")).toBeDisabled();
    expect(screen.getByLabelText("GraphQL operation document")).toBeDisabled();
    unmount();
    await act(async () => resolve(DEMO_GRAPHQL_SCHEMA));
    expect(get).not.toHaveBeenCalled();
  });
  it("pages large type/field inventories and retains work through closing and reopening", async () => {
    const { user } = await setup(),
      source = `type Query { ${Array.from({ length: 35 }, (_, i) => `t${i}: T${i}`).join(" ")} } ${Array.from({ length: 35 }, (_, i) => `type T${i} { id: ID! }`).join(" ")}`;
    change("GraphQL schema source (SDL/introspection JSON)", source);
    await user.click(button("Load and validate GraphQL schema"));
    await explore(user);
    expect(
      within(screen.getByRole("list", { name: "GraphQL types" })).getAllByRole(
        "button",
      ),
    ).toHaveLength(20);
    expect(
      within(screen.getByRole("list", { name: "GraphQL fields" })).getAllByRole(
        "listitem",
      ),
    ).toHaveLength(30);
    await user.click(button("Next GraphQL fields"));
    expect(
      within(screen.getByRole("list", { name: "GraphQL fields" })).getAllByRole(
        "listitem",
      ),
    ).toHaveLength(5);
    await user.click(button("Next GraphQL types"));
    expect(screen.getAllByText("Page 2/2")).toHaveLength(2);
    const title = screen.getByText("GraphQL contract studio", {
      selector: "summary",
    });
    await user.click(title);
    await user.click(title);
    expect(
      screen.getByLabelText("GraphQL schema source (SDL/introspection JSON)"),
    ).toHaveValue(source);
    expect(
      (
        screen.getByLabelText(
          "GraphQL operation document",
        ) as HTMLTextAreaElement
      ).value,
    ).toContain("query Studio_item");
  });
  it("reads editor SDL explicitly and never rewrites the editor", async () => {
    const { user, edit, editor, get } = await setup(false);
    edit("type Query { version: Int! }");
    await user.click(button("Read editor as GraphQL schema"));
    expect(get).toHaveBeenCalledTimes(1);
    expect(editor()).toBe("type Query { version: Int! }");
    expect(
      screen.getByLabelText("GraphQL schema source (SDL/introspection JSON)"),
    ).toHaveValue(editor());
  });
  it("localizes the interface and error feedback into Russian without changing the operation", async () => {
    const { user } = await setup();
    act(() => setAppLanguage("ru"));
    expect(
      screen.getByText("Студия контрактов GraphQL", { selector: "summary" }),
    ).toBeInTheDocument();
    expect(
      (
        screen.getByLabelText(
          "Документ операции GraphQL",
        ) as HTMLTextAreaElement
      ).value,
    ).toContain("query Studio_item");
    change("Переменные GraphQL (JSON-объект)", "[]");
    await user.click(button("Проверить документ и переменные GraphQL"));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Переменные должны быть JSON-объектом",
    );
  });
});
