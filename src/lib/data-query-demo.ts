import {
  normalizeDqProject,
  type DQProject,
  type DQExpr,
  type DQColumn,
  type DQExpectation,
  type DQScenario,
  type DQRecord,
} from "./data-query-model";
const get = (pointer: string): DQExpr => ({ op: "get", pointer });
const column = (name: string, pointer: string): DQColumn => ({
  name,
  value: get(pointer),
});
export function demoDqProject(): DQProject {
  const datasets: DQProject["datasets"] = [
    {
      id: "customers",
      name: "Customers",
      rows: [
        { id: "c1", name: "Ada", tier: "gold" },
        { id: "c2", name: "Lin", tier: "silver" },
        { id: 2, name: "Numeric", tier: "gold" },
        { id: "2", name: "String", tier: "bronze" },
      ],
    },
    {
      id: "orders",
      name: "Orders",
      rows: [
        {
          id: "o1",
          customerId: "c1",
          status: "paid",
          total: 250,
          items: [
            { sku: "p1", qty: 2 },
            { sku: "p2", qty: 1 },
          ],
        },
        { id: "o2", customerId: "c1", status: "pending", total: 50, items: [] },
        {
          id: "o3",
          customerId: "c2",
          status: "paid",
          total: 125,
          items: [{ sku: "p1", qty: 1 }],
        },
        {
          id: "o4",
          customerId: "missing",
          status: "paid",
          total: 75,
          items: [{ sku: "missing", qty: 1 }],
        },
        { id: "o5", customerId: 2, status: "paid", total: 10, items: [] },
        { id: "o6", customerId: "2", status: "paid", total: 20, items: [] },
      ],
    },
    {
      id: "products",
      name: "Products",
      rows: [
        { sku: "p1", unitPrice: 100 },
        { sku: "p2", unitPrice: 50 },
      ],
    },
  ];
  const queries: DQProject["queries"] = [
    {
      id: "paid-orders",
      name: "Orders joined to customers",
      from: { kind: "dataset", id: "orders" },
      as: "order",
      steps: [
        {
          op: "filter",
          condition: {
            op: "all",
            conditions: [
              {
                op: "eq",
                left: get("/order/status"),
                right: { op: "param", name: "status" },
              },
              {
                op: "gte",
                left: get("/order/total"),
                right: { op: "param", name: "minTotal" },
              },
            ],
          },
        },
        {
          op: "join",
          source: { kind: "dataset", id: "customers" },
          as: "customer",
          mode: "left",
          nulls: "never",
          keys: [{ left: "/order/customerId", right: "/id" }],
        },
        {
          op: "select",
          columns: [
            column("id", "/order/id"),
            column("customerId", "/order/customerId"),
            {
              name: "customer",
              value: {
                op: "coalesce",
                values: [
                  get("/customer/name"),
                  { op: "literal", value: "Unmatched" },
                ],
              },
            },
            column("total", "/order/total"),
          ],
        },
      ],
    },
    {
      id: "revenue",
      name: "Revenue per customer",
      from: { kind: "query", id: "paid-orders" },
      as: "record",
      steps: [
        {
          op: "group",
          by: [
            column("customerId", "/record/customerId"),
            column("customer", "/record/customer"),
          ],
          measures: [
            { name: "orders", op: "count", value: null },
            { name: "total", op: "sum", value: get("/record/total") },
          ],
        },
        {
          op: "sort",
          keys: [{ value: get("/total"), direction: "desc", nulls: "last" }],
        },
      ],
    },
    {
      id: "line-items",
      name: "Flattened priced order items",
      from: { kind: "dataset", id: "orders" },
      as: "order",
      steps: [
        { op: "unnest", pointer: "/order/items", as: "item", mode: "inner" },
        {
          op: "join",
          source: { kind: "dataset", id: "products" },
          as: "product",
          mode: "inner",
          nulls: "never",
          keys: [{ left: "/item/sku", right: "/sku" }],
        },
        {
          op: "derive",
          columns: [
            {
              name: "lineTotal",
              value: {
                op: "multiply",
                left: get("/item/qty"),
                right: get("/product/unitPrice"),
              },
            },
          ],
        },
        {
          op: "select",
          columns: [
            column("orderId", "/order/id"),
            column("sku", "/item/sku"),
            column("lineTotal", "/lineTotal"),
          ],
        },
        {
          op: "sort",
          keys: [{ value: get("/orderId"), direction: "asc", nulls: "last" }],
        },
      ],
    },
    {
      id: "orphan-orders",
      name: "Orders without a customer",
      from: { kind: "dataset", id: "orders" },
      as: "order",
      steps: [
        {
          op: "join",
          source: { kind: "dataset", id: "customers" },
          as: "match",
          mode: "anti",
          nulls: "never",
          keys: [{ left: "/order/customerId", right: "/id" }],
        },
        { op: "select", columns: [column("id", "/order/id")] },
      ],
    },
    {
      id: "customers-with-orders",
      name: "Customers with at least one order",
      from: { kind: "dataset", id: "customers" },
      as: "customer",
      steps: [
        {
          op: "join",
          source: { kind: "dataset", id: "orders" },
          as: "match",
          mode: "semi",
          nulls: "never",
          keys: [{ left: "/customer/id", right: "/customerId" }],
        },
        {
          op: "select",
          columns: [
            column("id", "/customer/id"),
            column("name", "/customer/name"),
          ],
        },
      ],
    },
    {
      id: "paged-orders",
      name: "Second and third largest paid orders",
      from: { kind: "query", id: "paid-orders" },
      as: "record",
      steps: [
        {
          op: "select",
          columns: [
            column("id", "/record/id"),
            column("total", "/record/total"),
          ],
        },
        {
          op: "sort",
          keys: [{ value: get("/total"), direction: "desc", nulls: "last" }],
        },
        { op: "slice", offset: 1, limit: 2 },
      ],
    },
    {
      id: "distinct-statuses",
      name: "Distinct order statuses",
      from: { kind: "dataset", id: "orders" },
      as: "order",
      steps: [
        { op: "select", columns: [column("status", "/order/status")] },
        { op: "distinct", keys: [] },
      ],
    },
    {
      id: "count-orders",
      name: "Global order count",
      from: { kind: "dataset", id: "orders" },
      as: "order",
      steps: [
        {
          op: "group",
          by: [],
          measures: [
            { name: "count", op: "count", value: null },
            { name: "total", op: "sum", value: get("/order/total") },
          ],
        },
      ],
    },
  ];
  const expect = (
    rows: number,
    checks: DQExpectation["checks"] = [],
  ): DQExpectation => ({
    rows,
    maxWork: 10000,
    error: null,
    exact: null,
    checks,
  });
  const scenario = (
    id: string,
    name: string,
    queryId: string,
    e: DQExpectation,
  ): DQScenario => ({
    id,
    name,
    queryId,
    parameters: {},
    overrides: [],
    expect: e,
  });
  const scenarios = [
    scenario(
      "revenue",
      "Joined revenue with typed customer IDs",
      "revenue",
      expect(5, [
        { row: 0, pointer: "/customer", value: "Ada" },
        { row: 0, pointer: "/total", value: 250 },
        { row: 3, pointer: "/customerId", value: "2" },
        { row: 4, pointer: "/customerId", value: 2 },
      ]),
    ),
    scenario(
      "items",
      "Unnest, product join and arithmetic",
      "line-items",
      expect(3, [
        { row: 0, pointer: "/lineTotal", value: 200 },
        { row: 1, pointer: "/lineTotal", value: 50 },
      ]),
    ),
    scenario(
      "orphans",
      "Anti join reveals missing customer",
      "orphan-orders",
      expect(1, [{ row: 0, pointer: "/id", value: "o4" }]),
    ),
    scenario(
      "pending",
      "Query parameter selects pending orders",
      "revenue",
      expect(1, [{ row: 0, pointer: "/total", value: 50 }]),
    ),
    scenario("threshold", "Minimum total parameter", "paid-orders", expect(2)),
    scenario(
      "renamed",
      "Replace a captured customer dataset",
      "revenue",
      expect(5, [{ row: 0, pointer: "/customer", value: "Grace" }]),
    ),
    scenario(
      "empty",
      "Empty input produces no customer groups",
      "revenue",
      expect(0),
    ),
    scenario(
      "count-empty",
      "Global aggregate over empty input",
      "count-orders",
      expect(1, [
        { row: 0, pointer: "/count", value: 0 },
        { row: 0, pointer: "/total", value: 0 },
      ]),
    ),
    scenario(
      "page",
      "Stable sorting and slicing",
      "paged-orders",
      expect(2, [
        { row: 0, pointer: "/id", value: "o3" },
        { row: 1, pointer: "/id", value: "o4" },
      ]),
    ),
    scenario(
      "invalid-quantity",
      "A bad quantity must fail typed arithmetic",
      "line-items",
      { ...expect(0), error: "expression" },
    ),
  ];
  scenarios[3].parameters = { status: "pending" };
  scenarios[4].parameters = { minTotal: 100 };
  scenarios[5].overrides = [
    {
      id: "customers",
      rows: datasets[0].rows.map((r) =>
        r.id === "c1" ? { ...r, name: "Grace" } : r,
      ),
    },
  ];
  scenarios[6].overrides = scenarios[7].overrides = [
    { id: "orders", rows: [] },
  ];
  scenarios[9].overrides = [
    {
      id: "orders",
      rows: [
        {
          id: "bad",
          customerId: "c1",
          status: "paid",
          total: 10,
          items: [{ sku: "p1", qty: "not-a-number" }],
        } as DQRecord,
      ],
    },
  ];
  return normalizeDqProject({
    kind: "rsswag-data-query-project",
    version: 1,
    name: "Federated shop analytics",
    parameters: [
      { name: "status", value: "paid" },
      { name: "minTotal", value: 0 },
    ],
    datasets,
    queries,
    scenarios,
  });
}
