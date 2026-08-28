import { describe, expect, it, vi } from "vitest";
import {
  createEmptyRequestEnvironmentSettings,
  getActiveRequestEnvironment,
  getEnabledRequestEnvironmentHeaders,
  isValidRequestHeaderName,
  isValidRequestHeaderValue,
  mergeRequestEnvironmentHeaders,
  readRequestEnvironmentSettings,
  removeRequestEnvironment,
  REQUEST_ENVIRONMENTS_STORAGE_KEY,
  saveRequestEnvironmentSettings,
  type RequestEnvironment,
} from "./request-environments";

const developmentEnvironment: RequestEnvironment = {
  headers: [
    {
      enabled: true,
      id: "header-authorization",
      name: "Authorization",
      value: "Bearer local-token",
    },
    {
      enabled: false,
      id: "header-disabled",
      name: "X-Debug",
      value: "true",
    },
  ],
  id: "environment-development",
  name: "Development",
  serverUrl: "https://dev.example.com/v1",
};

describe("request environments", () => {
  it("persists and restores an active versioned environment", () => {
    const settings = {
      activeEnvironmentId: developmentEnvironment.id,
      environments: [developmentEnvironment],
    };

    expect(saveRequestEnvironmentSettings(settings)).toBe(true);
    expect(readRequestEnvironmentSettings()).toEqual(settings);
    expect(getActiveRequestEnvironment(settings)).toEqual(
      developmentEnvironment,
    );
  });

  it("sanitizes malformed storage and clears a missing active profile", () => {
    window.localStorage.setItem(
      REQUEST_ENVIRONMENTS_STORAGE_KEY,
      JSON.stringify({
        settings: {
          activeEnvironmentId: "missing",
          environments: [
            null,
            { id: "", name: "Invalid" },
            {
              headers: [
                {
                  enabled: true,
                  id: "valid-header",
                  name: "X-Client",
                  value: "web",
                },
                {
                  id: "invalid-header",
                  name: "Bad Header",
                  value: "line\nbreak",
                },
              ],
              id: "valid",
              name: "Staging",
              serverUrl: "http://localhost:3001",
            },
          ],
        },
        storageVersion: 1,
      }),
    );

    expect(readRequestEnvironmentSettings()).toEqual({
      activeEnvironmentId: "",
      environments: [
        {
          headers: [
            {
              enabled: true,
              id: "valid-header",
              name: "X-Client",
              value: "web",
            },
          ],
          id: "valid",
          name: "Staging",
          serverUrl: "",
        },
      ],
    });
  });

  it("merges enabled defaults while endpoint headers win regardless of case", () => {
    const headers = getEnabledRequestEnvironmentHeaders(developmentEnvironment);
    const parameters = mergeRequestEnvironmentHeaders(
      [
        { location: "query", name: "page", value: "2" },
        {
          location: "header",
          name: "authorization",
          value: "Bearer endpoint-token",
        },
      ],
      [
        ...headers,
        {
          enabled: true,
          id: "header-client",
          name: "X-Client",
          value: "editor",
        },
      ],
    );

    expect(parameters).toEqual([
      { location: "header", name: "X-Client", value: "editor" },
      { location: "query", name: "page", value: "2" },
      {
        location: "header",
        name: "authorization",
        value: "Bearer endpoint-token",
      },
    ]);
  });

  it("validates HTTP header syntax and blocks line breaks", () => {
    expect(isValidRequestHeaderName("X-Trace-Id")).toBe(true);
    expect(isValidRequestHeaderName("Bad Header")).toBe(false);
    expect(isValidRequestHeaderValue("Bearer token")).toBe(true);
    expect(isValidRequestHeaderValue("first\r\nsecond")).toBe(false);
  });

  it("removes the active environment without disturbing other profiles", () => {
    const settings = removeRequestEnvironment(
      {
        activeEnvironmentId: developmentEnvironment.id,
        environments: [
          developmentEnvironment,
          { ...developmentEnvironment, id: "staging", name: "Staging" },
        ],
      },
      developmentEnvironment.id,
    );

    expect(settings.activeEnvironmentId).toBe("");
    expect(
      settings.environments.map((environment) => environment.name),
    ).toEqual(["Staging"]);
  });

  it("returns safe defaults when storage is unavailable", () => {
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new DOMException("Storage unavailable", "SecurityError");
      });

    try {
      expect(
        saveRequestEnvironmentSettings({
          activeEnvironmentId: developmentEnvironment.id,
          environments: [developmentEnvironment],
        }),
      ).toBe(false);
    } finally {
      setItem.mockRestore();
    }

    window.localStorage.setItem(REQUEST_ENVIRONMENTS_STORAGE_KEY, "not-json");
    expect(readRequestEnvironmentSettings()).toEqual(
      createEmptyRequestEnvironmentSettings(),
    );
  });
});
