import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import type { SecuritySchemeSummary } from "@/lib/openapi";
import type { RequestAuthValues } from "@/lib/request-auth";
import { RequestAuthManager } from "./request-auth-manager";

const schemes: SecuritySchemeSummary[] = [
  {
    bearerFormat: "JWT",
    description: "A short-lived token",
    location: "",
    name: "bearerAuth",
    parameterName: "",
    scheme: "bearer",
    type: "http",
  },
  {
    bearerFormat: "",
    description: "",
    location: "",
    name: "basicAuth",
    parameterName: "",
    scheme: "basic",
    type: "http",
  },
  {
    bearerFormat: "",
    description: "",
    location: "",
    name: "certificateAuth",
    parameterName: "",
    scheme: "",
    type: "unsupported",
  },
];

function AuthHarness() {
  const [values, setValues] = useState<RequestAuthValues>({});

  return (
    <RequestAuthManager
      schemes={schemes}
      values={values}
      onChange={setValues}
    />
  );
}

describe("RequestAuthManager", () => {
  it("configures, reveals, and clears session-only bearer credentials", async () => {
    const user = userEvent.setup();

    render(<AuthHarness />);

    expect(
      screen.getByRole("heading", { name: "Authentication" }),
    ).toBeVisible();
    expect(screen.getByText("Configured: 0")).toBeVisible();
    expect(screen.getByText("A short-lived token")).toBeVisible();

    await user.click(
      screen.getByRole("checkbox", {
        name: "Enable bearerAuth authentication",
      }),
    );
    const tokenInput = screen.getByLabelText("Credential for bearerAuth");

    await user.type(tokenInput, "secret-jwt");

    expect(tokenInput).toHaveAttribute("type", "password");
    expect(screen.getByText("Configured: 1")).toBeVisible();
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);

    await user.click(
      screen.getByRole("button", { name: "Show secret for bearerAuth" }),
    );
    expect(tokenInput).toHaveAttribute("type", "text");

    await user.click(screen.getByRole("button", { name: "Clear credentials" }));
    expect(screen.getByText("Configured: 0")).toBeVisible();
    expect(tokenInput).toBeDisabled();
    expect(tokenInput).toHaveValue("");
  });

  it("supports Basic fields and disables unsupported schemes", async () => {
    const user = userEvent.setup();

    render(<AuthHarness />);

    const unsupportedToggle = screen.getByRole("checkbox", {
      name: "Enable certificateAuth authentication",
    });
    expect(unsupportedToggle).toBeDisabled();
    expect(
      screen.getByText("This security scheme cannot be applied automatically."),
    ).toBeVisible();

    await user.click(
      screen.getByRole("checkbox", {
        name: "Enable basicAuth authentication",
      }),
    );
    await user.type(screen.getByLabelText("Username for basicAuth"), "alex");
    await user.type(screen.getByLabelText("Password for basicAuth"), "secret");

    expect(screen.getByText("Configured: 1")).toBeVisible();
  });
});
