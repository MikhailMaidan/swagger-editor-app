import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ResponseContractReport as ContractReport } from "@/lib/response-contract";
import { ResponseContractReport } from "./response-contract-report";

describe("ResponseContractReport", () => {
  it("renders useful details and copies a contextual JSON report", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
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

    render(
      <ResponseContractReport
        clipboard={{ writeText }}
        endpoint={{ method: "GET", path: "/users/{id}" }}
        report={report}
      />,
    );

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

    await user.click(screen.getByRole("button", { name: "Copy report JSON" }));

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(JSON.parse(writeText.mock.calls[0][0])).toEqual({
      endpoint: { method: "GET", path: "/users/{id}" },
      report,
      version: 1,
    });
    expect(screen.getByRole("status")).toHaveTextContent(
      "Response contract report copied.",
    );

    writeText.mockRejectedValueOnce(new Error("Clipboard unavailable"));
    await user.click(screen.getByRole("button", { name: "Copy report JSON" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not copy the response contract report.",
    );
  });
});
