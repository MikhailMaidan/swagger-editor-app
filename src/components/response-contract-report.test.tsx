import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ResponseContractReport as ContractReport } from "@/lib/response-contract";
import { ResponseContractReport } from "./response-contract-report";

describe("ResponseContractReport", () => {
  it("renders passed, failed, and skipped checks with useful details", () => {
    const report: ContractReport = {
      checkedCount: 2,
      checks: [
        {
          code: "status-matched",
          params: { actual: "200", documented: "2XX" },
          result: "pass",
          type: "status",
        },
        {
          code: "content-type-mismatch",
          params: { actual: "text/plain", expected: "application/json" },
          result: "fail",
          type: "content-type",
        },
        {
          code: "body-not-documented",
          params: {},
          result: "skipped",
          type: "body",
        },
      ],
      failedCount: 1,
      passedCount: 1,
      result: "fail",
    };

    render(<ResponseContractReport report={report} />);

    expect(screen.getByLabelText("Response contract")).toBeVisible();
    expect(screen.getByText("Issues found")).toBeVisible();
    expect(screen.getByText("1 of 2 checked rules failed.")).toBeVisible();
    expect(
      screen.getByText("Received 200, matched documented response 2XX."),
    ).toBeVisible();
    expect(
      screen.getByText("Received text/plain; expected application/json."),
    ).toBeVisible();
    expect(
      screen.getByText("No body shape is documented for this response."),
    ).toBeVisible();
  });
});
