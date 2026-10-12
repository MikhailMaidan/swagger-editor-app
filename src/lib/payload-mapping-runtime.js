/**
 * A self-contained runtime: its function source is also the downloadable mapper.
 * Keep helpers and limits inside this function so exports need no app imports.
 * @param {import('./payload-mapping').MappingRecipe} recipe
 * @param {import('./api-transform').JsonValue} input
 * @param {boolean} [validateOnly]
 * @returns {import('./payload-mapping').MappingExecution}
 */
export function executePayloadMapping(recipe, input, validateOnly = false) {
  const MAX_BYTES = 256 * 1024,
    MAX_NODES = 10000,
    MAX_DEPTH = 32,
    MAX_STEPS = 50000;
  let steps = 0,
    stageId = "",
    ruleId = "",
    path = "";
  function fail(code) {
    const error = new Error(code);
    Object.assign(error, { code, stage: stageId, rule: ruleId, path });
    throw error;
  }
  function work() {
    if (++steps > MAX_STEPS) fail("limit");
  }
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  const object = (value) =>
    value !== null && typeof value === "object" && !Array.isArray(value);
  const bytes = (value) => new TextEncoder().encode(value).length;
  function clone(value) {
    let nodes = 0,
      size = 0;
    const ancestors = new Set();
    function visit(v, depth) {
      work();
      if (++nodes > MAX_NODES || depth > MAX_DEPTH) fail("limit");
      size += typeof v === "string" ? bytes(v) : 8;
      if (size > MAX_BYTES) fail("limit");
      if (v === null || typeof v === "string" || typeof v === "boolean")
        return v;
      if (
        typeof v === "number" &&
        Number.isFinite(v) &&
        (!Number.isInteger(v) || Number.isSafeInteger(v))
      )
        return v;
      if ((!object(v) && !Array.isArray(v)) || ancestors.has(v)) fail("input");
      const proto = Object.getPrototypeOf(v);
      if (
        !Array.isArray(v) &&
        proto !== null &&
        Object.getPrototypeOf(proto) !== null
      )
        fail("input");
      ancestors.add(v);
      const result = Array.isArray(v) ? [] : {};
      for (const key of Object.keys(v)) {
        if (
          Array.isArray(v) &&
          (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= v.length)
        )
          fail("input");
        const descriptor = Object.getOwnPropertyDescriptor(v, key);
        if (!descriptor || !own(descriptor, "value")) fail("input");
        size += bytes(key);
        Object.defineProperty(result, key, {
          value: visit(descriptor.value, depth + 1),
          enumerable: true,
          writable: true,
          configurable: true,
        });
      }
      if (Array.isArray(v) && Object.keys(v).length !== v.length) fail("input");
      ancestors.delete(v);
      return result;
    }
    const result = visit(value, 0);
    if (bytes(JSON.stringify(result)) > MAX_BYTES) fail("limit");
    return result;
  }
  function pointer(text) {
    if (
      typeof text !== "string" ||
      text.length > 2048 ||
      (text !== "" && !text.startsWith("/")) ||
      /~(?![01])/.test(text)
    )
      fail("pointer");
    const parts =
      text === ""
        ? []
        : text
            .slice(1)
            .split("/")
            .map((s) => s.replace(/~1/g, "/").replace(/~0/g, "~"));
    if (parts.length > MAX_DEPTH || parts.filter((s) => s === "*").length > 1)
      fail("pointer");
    return parts;
  }
  const operators = [
    "copy",
    "constant",
    "string",
    "number",
    "integer",
    "boolean",
    "trim",
    "lower",
    "upper",
    "length",
    "join",
    "split",
  ];
  if (
    !object(recipe) ||
    recipe.kind !== "rsswag-payload-mapping" ||
    recipe.version !== 1 ||
    typeof recipe.name !== "string" ||
    !recipe.name.trim() ||
    recipe.name.length > 200 ||
    !Array.isArray(recipe.stages) ||
    !recipe.stages.length ||
    recipe.stages.length > 12
  )
    fail("recipe");
  const ids = new Set();
  let ruleCount = 0;
  const compiled = recipe.stages.map((stage) => {
    if (
      !object(stage) ||
      typeof stage.id !== "string" ||
      !stage.id ||
      stage.id.length > 100 ||
      ids.has(stage.id) ||
      typeof stage.name !== "string" ||
      !stage.name.trim() ||
      stage.name.length > 200 ||
      !["object", "array", "input"].includes(stage.base) ||
      typeof stage.enabled !== "boolean" ||
      !Array.isArray(stage.rules)
    )
      fail("recipe");
    ids.add(stage.id);
    stageId = stage.id;
    const rules = stage.rules.map((rule) => {
      if (++ruleCount > 200) fail("limit");
      if (
        !object(rule) ||
        typeof rule.id !== "string" ||
        !rule.id ||
        rule.id.length > 100 ||
        ids.has(rule.id) ||
        typeof rule.enabled !== "boolean" ||
        !operators.includes(rule.operator) ||
        !["error", "omit", "default"].includes(rule.missing) ||
        typeof rule.argument !== "string" ||
        rule.argument.length > 4096 ||
        typeof rule.value !== "string" ||
        bytes(rule.value) > MAX_BYTES
      )
        fail("recipe");
      ids.add(rule.id);
      ruleId = rule.id;
      const source = pointer(rule.source),
        target = pointer(rule.target);
      if (
        (source.includes("*") ? 1 : 0) !== (target.includes("*") ? 1 : 0) ||
        (rule.operator === "constant" && source.includes("*"))
      )
        fail("pointer");
      let literal = null;
      if (rule.operator === "constant" || rule.missing === "default") {
        try {
          literal = JSON.parse(rule.value);
        } catch {
          fail("literal");
        }
        literal = clone(literal);
      }
      return { rule, source, target, literal };
    });
    const active = stage.enabled ? rules.filter((r) => r.rule.enabled) : [];
    for (let i = 0; i < active.length; i++)
      for (let j = i + 1; j < active.length; j++) {
        work();
        const a = active[i].target,
          b = active[j].target;
        if (
          a
            .slice(0, Math.min(a.length, b.length))
            .every((s, n) => s === b[n] || s === "*" || b[n] === "*")
        ) {
          ruleId = active[j].rule.id;
          path = active[j].rule.target;
          fail("collision");
        }
      }
    return { stage, rules };
  });
  stageId = "";
  ruleId = "";
  path = "";
  if (validateOnly) return { output: null, stages: [], steps };
  let current = clone(input);
  const traces = [];
  let traceBytes = 0;
  function read(value, parts) {
    let v = value;
    for (const segment of parts) {
      work();
      if (Array.isArray(v)) {
        if (!/^(0|[1-9]\d*)$/.test(segment) || Number(segment) >= v.length)
          return { found: false, value: null };
      } else if (!object(v)) return { found: false, value: null };
      if (!own(v, segment)) return { found: false, value: null };
      v = v[segment];
    }
    return { found: true, value: v };
  }
  function set(value, parts, child) {
    if (!parts.length) return child;
    let v = value;
    for (let i = 0; i < parts.length; i++) {
      work();
      const key = parts[i];
      if (Array.isArray(v)) {
        if (
          !/^(0|[1-9]\d*)$/.test(key) ||
          Number(key) > v.length ||
          Number(key) >= 10000
        )
          fail("target");
      } else if (!object(v)) fail("target");
      if (i === parts.length - 1) {
        Object.defineProperty(v, key, {
          value: child,
          writable: true,
          configurable: true,
          enumerable: true,
        });
        return value;
      }
      if (!own(v, key) || v[key] === null)
        Object.defineProperty(v, key, {
          value: /^(0|[1-9]\d*)$/.test(parts[i + 1]) ? [] : {},
          writable: true,
          configurable: true,
          enumerable: true,
        });
      v = v[key];
    }
    return value;
  }
  function convert(v, rule) {
    work();
    if (rule.operator === "copy" || rule.operator === "constant")
      return clone(v);
    if (rule.operator === "string") {
      if (v === null || typeof v === "object") fail("conversion");
      return String(v);
    }
    if (rule.operator === "number" || rule.operator === "integer") {
      if (
        typeof v !== "number" &&
        !(
          typeof v === "string" &&
          /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(v.trim())
        )
      )
        fail("conversion");
      const n = Number(v);
      if (
        !Number.isFinite(n) ||
        (Number.isInteger(n) && !Number.isSafeInteger(n)) ||
        (rule.operator === "integer" && !Number.isSafeInteger(n))
      )
        fail("conversion");
      return n;
    }
    if (rule.operator === "boolean") {
      if (typeof v === "boolean") return v;
      if (v === "true" || v === 1) return true;
      if (v === "false" || v === 0) return false;
      fail("conversion");
    }
    if (["trim", "lower", "upper", "split"].includes(rule.operator)) {
      if (typeof v !== "string") fail("conversion");
      if (rule.operator === "trim") return v.trim();
      if (rule.operator === "lower") return v.toLowerCase();
      if (rule.operator === "upper") return v.toUpperCase();
      if (!rule.argument) fail("conversion");
      return v.split(rule.argument);
    }
    if (rule.operator === "length") {
      if (typeof v === "string") return Array.from(v).length;
      if (Array.isArray(v)) return v.length;
      if (object(v)) return Object.keys(v).length;
      fail("conversion");
    }
    if (rule.operator === "join") {
      if (
        !Array.isArray(v) ||
        v.some((x) => x === null || typeof x === "object")
      )
        fail("conversion");
      return v.join(rule.argument);
    }
    fail("conversion");
  }
  for (const compiledStage of compiled) {
    const { stage, rules } = compiledStage;
    stageId = stage.id;
    ruleId = "";
    path = "";
    if (!stage.enabled) continue;
    let result =
      stage.base === "input"
        ? clone(current)
        : stage.base === "array"
          ? []
          : {};
    const trace = { id: stage.id, rules: [], byteLength: 0 };
    for (const { rule, source, target, literal } of rules) {
      if (!rule.enabled) continue;
      ruleId = rule.id;
      path = rule.source;
      const stat = { id: rule.id, mapped: 0, omitted: 0, defaults: 0 };
      const star = source.indexOf("*");
      let matches;
      if (star >= 0) {
        const collection = read(current, source.slice(0, star));
        if (!collection.found) {
          if (rule.missing === "omit") {
            stat.omitted++;
            trace.rules.push(stat);
            continue;
          }
          fail("missing");
        }
        if (!Array.isArray(collection.value)) fail("array");
        const targetStar = target.indexOf("*");
        path = rule.target;
        const existing = read(result, target.slice(0, targetStar));
        if (
          existing.found &&
          (!Array.isArray(existing.value) ||
            (existing.value.length !== 0 &&
              existing.value.length !== collection.value.length))
        )
          fail("target");
        if (!existing.found || existing.value.length === 0) {
          const rows = collection.value.map(() => {
            work();
            return targetStar === target.length - 1
              ? null
              : /^(0|[1-9]\d*)$/.test(target[targetStar + 1])
                ? []
                : {};
          });
          result = set(result, target.slice(0, targetStar), rows);
        }
        matches = collection.value.map((_, index) => ({
          index,
          ...read(current, [
            ...source.slice(0, star),
            String(index),
            ...source.slice(star + 1),
          ]),
        }));
      } else
        matches = [
          {
            index: -1,
            ...(rule.operator === "constant"
              ? { found: true, value: literal }
              : read(current, source)),
          },
        ];
      for (const match of matches) {
        path = rule.source;
        let v = match.value;
        if (!match.found) {
          if (rule.missing === "omit") {
            stat.omitted++;
            continue;
          }
          if (rule.missing === "error") fail("missing");
          v = literal;
          stat.defaults++;
        }
        const converted = convert(v, rule);
        path = rule.target;
        result = set(
          result,
          target.map((s) => (s === "*" ? String(match.index) : s)),
          converted,
        );
        stat.mapped++;
      }
      trace.rules.push(stat);
    }
    ruleId = "";
    path = "";
    current = clone(result);
    trace.byteLength = bytes(JSON.stringify(current));
    traceBytes += trace.byteLength;
    if (traceBytes > 1024 * 1024) fail("limit");
    trace.output = current;
    traces.push(trace);
  }
  return { output: current, stages: traces, steps };
}
