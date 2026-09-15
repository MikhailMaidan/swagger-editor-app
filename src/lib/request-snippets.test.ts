import { describe, expect, it } from "vitest";
import { createCurlPreview } from "./openapi";
import { getRequestPreviewDownloadMetadata } from "./request-preview-download";
import {
  createRequestCode,
  isRequestCodeFormat,
  isSnippetLanguage,
  REQUEST_CODE_FORMATS,
  SNIPPET_LANGUAGES,
  type RequestCodeInput,
} from "./request-snippets";

const backslash = String.fromCharCode(92);

const jsonRequest: RequestCodeInput = {
  contentType: "application/json",
  method: "post",
  parameters: [
    { location: "path", name: "id", value: "42" },
    { location: "query", name: "q", value: "a b" },
    { location: "header", name: "X-Trace", value: "t-1" },
    { location: "cookie", name: "session", value: "abc" },
  ],
  path: "/users/{id}",
  requestBody: '{\n  "name": "Ada",\n  "admin": false,\n  "team": null\n}',
  serverUrl: "https://api.example.com/",
};

const getRequest: RequestCodeInput = {
  ...jsonRequest,
  method: "GET",
  parameters: [],
  requestBody: '{"ignored":true}',
};

describe("request snippets", () => {
  it("defines metadata for every format and recognizes language ids", () => {
    for (const format of Object.keys(REQUEST_CODE_FORMATS)) {
      expect(
        REQUEST_CODE_FORMATS[format as keyof typeof REQUEST_CODE_FORMATS].id,
      ).toBe(format);
    }

    expect(SNIPPET_LANGUAGES).toHaveLength(12);
    expect(isSnippetLanguage("python")).toBe(true);
    expect(isSnippetLanguage("curl")).toBe(false);
    expect(isRequestCodeFormat("curl")).toBe(true);
    expect(isRequestCodeFormat("toString")).toBe(false);
    expect(
      getRequestPreviewDownloadMetadata("python", "GET", "/users/{id}"),
    ).toEqual({
      contentType: "text/x-python;charset=utf-8",
      fileName: "rsswag-get-users-id.py",
    });
    expect(
      getRequestPreviewDownloadMetadata("http", "GET", "/users/{id}"),
    ).toEqual({
      contentType: "text/plain;charset=utf-8",
      fileName: "rsswag-get-users-id.http",
    });
  });

  it("keeps the existing cURL, fetch, and HTTP previews unchanged", () => {
    expect(createRequestCode("curl", jsonRequest)).toBe(
      createCurlPreview(
        "post",
        "/users/{id}",
        true,
        "https://api.example.com/",
        jsonRequest.parameters,
        jsonRequest.requestBody,
        "application/json",
      ),
    );
  });

  it("generates Python with native JSON literals", () => {
    expect(createRequestCode("python", jsonRequest)).toBe(
      [
        "import requests",
        "",
        'url = "https://api.example.com/users/42?q=a%20b"',
        "headers = {",
        '    "X-Trace": "t-1",',
        '    "Cookie": "session=abc",',
        '    "Content-Type": "application/json",',
        "}",
        "payload = {",
        '    "name": "Ada",',
        '    "admin": False,',
        '    "team": None,',
        "}",
        "",
        'response = requests.request("POST", url, headers=headers, json=payload)',
        "",
        "print(response.status_code)",
        "print(response.text)",
      ].join("\n"),
    );
    expect(createRequestCode("python", getRequest)).not.toContain("payload");
    expect(
      createRequestCode("python", {
        ...jsonRequest,
        contentType: "text/plain",
        requestBody: "hi",
      }),
    ).toContain(
      'payload = "hi"\n\nresponse = requests.request("POST", url, headers=headers, data=payload)',
    );
  });

  it("generates axios and Go requests", () => {
    expect(createRequestCode("javascript-axios", jsonRequest)).toBe(
      [
        'import axios from "axios";',
        "",
        "const response = await axios.request({",
        '  method: "post",',
        '  url: "https://api.example.com/users/42?q=a%20b",',
        "  headers: {",
        '    "X-Trace": "t-1",',
        '    "Cookie": "session=abc",',
        '    "Content-Type": "application/json",',
        "  },",
        "  data: {",
        '    "name": "Ada",',
        '    "admin": false,',
        '    "team": null',
        "  },",
        "});",
        "",
        "console.log(response.status, response.data);",
      ].join("\n"),
    );

    const go = createRequestCode("go", jsonRequest);

    expect(go).toContain('\t"strings"\n)');
    expect(go).toContain(
      `\tbody := strings.NewReader(\`${jsonRequest.requestBody}\`)`,
    );
    expect(go).toContain(
      '\treq, err := http.NewRequest("POST", "https://api.example.com/users/42?q=a%20b", body)',
    );
    expect(go).toContain('\treq.Header.Set("Cookie", "session=abc")');
    expect(createRequestCode("go", getRequest)).toContain(
      'http.NewRequest("GET", "https://api.example.com/users/{id}", nil)',
    );
    expect(
      createRequestCode("go", { ...jsonRequest, requestBody: "has `tick`" }),
    ).toContain('strings.NewReader("has `tick`")');
  });

  it("escapes language-specific interpolation and quoting", () => {
    const tricky: RequestCodeInput = {
      ...jsonRequest,
      contentType: "text/plain",
      parameters: [{ location: "header", name: "X-Empty", value: "" }],
      requestBody: `it's $cost #{tag} ${backslash}n\u0001`,
    };

    expect(createRequestCode("kotlin", tricky)).toContain(
      `val body = "it's \\$cost #{tag} ${backslash}${backslash}n${backslash}u0001".toRequestBody("text/plain".toMediaType())`,
    );
    expect(createRequestCode("ruby", tricky)).toContain(
      `request.body = "it's $cost \\#{tag} ${backslash}${backslash}n${backslash}u0001"`,
    );
    expect(createRequestCode("php", tricky)).toContain(
      `CURLOPT_POSTFIELDS => 'it${backslash}'s $cost #{tag} ${backslash}${backslash}n\u0001',`,
    );
    expect(createRequestCode("powershell", tricky)).toContain(
      `$body = 'it''s $cost #{tag} ${backslash}n\u0001'`,
    );
    expect(createRequestCode("rust", tricky)).toContain(
      `.body("it's $cost #{tag} ${backslash}${backslash}n${backslash}u{1}")`,
    );
    expect(createRequestCode("swift", tricky)).toContain(
      `request.httpBody = Data("it's $cost #{tag} ${backslash}${backslash}n${backslash}u{1}".utf8)`,
    );
    expect(createRequestCode("httpie", tricky)).toBe(
      [
        "http",
        `--raw 'it'\\''s $cost #{tag} ${backslash}n\u0001'`,
        "POST",
        "'https://api.example.com/users/{id}'",
        "'X-Empty;'",
        "'Content-Type:text/plain'",
      ].join(" \\\n  "),
    );
  });

  it("passes content types the way each client expects", () => {
    const csharp = createRequestCode("csharp", jsonRequest);

    expect(csharp).not.toContain('TryAddWithoutValidation("Content-Type"');
    expect(csharp).toContain('Encoding.UTF8, "application/json");');
    expect(
      createRequestCode("csharp", {
        ...jsonRequest,
        contentType: "application/json; charset=utf-8",
      }),
    ).toContain('Encoding.UTF8, "application/json");');
    expect(createRequestCode("powershell", jsonRequest)).toContain(
      "-ContentType 'application/json' -Body $body -UseBasicParsing",
    );
    expect(createRequestCode("kotlin", jsonRequest)).not.toContain(
      '.header("Content-Type"',
    );
    expect(createRequestCode("java", jsonRequest)).toContain(
      '.header("Content-Type", "application/json")',
    );
  });

  it("handles bodiless and non-standard methods", () => {
    const emptyPost = { ...jsonRequest, requestBody: "" };

    expect(createRequestCode("kotlin", emptyPost)).toContain(
      'val body = "".toRequestBody()',
    );
    expect(createRequestCode("kotlin", getRequest)).toContain(
      '.method("GET", null)',
    );
    expect(createRequestCode("java", getRequest)).toContain(
      "HttpRequest.BodyPublishers.noBody()",
    );
    expect(createRequestCode("ruby", emptyPost)).toContain(
      "request = Net::HTTP::Post.new(uri)",
    );

    const custom = { ...jsonRequest, method: "propfind" };

    expect(createRequestCode("ruby", custom)).toContain(
      'Net::HTTPGenericRequest.new("PROPFIND", true, true, uri)',
    );
    expect(createRequestCode("rust", custom)).toContain(
      'Method::from_bytes("PROPFIND".as_bytes())?',
    );
    expect(createRequestCode("rust", jsonRequest)).toContain(
      ".request(Method::POST, ",
    );
  });
});
