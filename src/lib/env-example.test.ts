import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const envExampleContent = readFileSync(
  path.resolve(__dirname, "../../.env.example"),
  "utf-8",
);

describe(".env.example", () => {
  it("documents the exact Supabase variable names database.ts reads", () => {
    // Regression guard: .env.example previously documented
    // NEXT_PUBLIC_SUPABASE_URL while the code reads SUPABASE_URL, so
    // deployments that copied the example verbatim never actually
    // enabled database persistence.
    expect(envExampleContent).toMatch(/^SUPABASE_URL=/m);
    expect(envExampleContent).toMatch(/^SUPABASE_SECRET_KEY=/m);
  });

  it("never documents the secret key under a NEXT_PUBLIC_ variable", () => {
    expect(envExampleContent).not.toMatch(/^NEXT_PUBLIC_.*SECRET/m);
  });
});
