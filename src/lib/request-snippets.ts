import {
  createCurlPreview,
  createFetchPreview,
  createHttpPreview,
  type CurlParameter,
} from "./openapi";
import { isJsonMediaType } from "./request-body";
import {
  buildCookieHeaderValue,
  buildRequestUrl,
  hasSendableRequestBody,
} from "./request-url";

export type SnippetLanguage =
  | "csharp"
  | "go"
  | "httpie"
  | "java"
  | "javascript-axios"
  | "kotlin"
  | "php"
  | "powershell"
  | "python"
  | "ruby"
  | "rust"
  | "swift";

export type RequestCodeFormat = "curl" | "fetch" | "http" | SnippetLanguage;

export type RequestCodeInput = {
  contentType: string;
  method: string;
  parameters: CurlParameter[];
  path: string;
  requestBody: string;
  serverUrl: string;
};

type SnippetRequest = {
  body: string | null;
  contentType: string;
  headers: Array<[string, string]>;
  method: string;
  url: string;
};

export type RequestCodeFormatDefinition = {
  codeSampleLang: string;
  contentType: string;
  extension: string;
  fence: string;
  id: RequestCodeFormat;
  label: string;
};

export const SNIPPET_LANGUAGES: SnippetLanguage[] = [
  "python",
  "javascript-axios",
  "go",
  "java",
  "csharp",
  "php",
  "ruby",
  "rust",
  "swift",
  "kotlin",
  "powershell",
  "httpie",
];

export const REQUEST_CODE_FORMATS: Record<
  RequestCodeFormat,
  RequestCodeFormatDefinition
> = {
  csharp: {
    codeSampleLang: "C#",
    contentType: "text/x-csharp;charset=utf-8",
    extension: "cs",
    fence: "csharp",
    id: "csharp",
    label: "C# (HttpClient)",
  },
  curl: {
    codeSampleLang: "Shell",
    contentType: "text/x-shellscript;charset=utf-8",
    extension: "sh",
    fence: "bash",
    id: "curl",
    label: "cURL",
  },
  fetch: {
    codeSampleLang: "JavaScript",
    contentType: "text/javascript;charset=utf-8",
    extension: "js",
    fence: "javascript",
    id: "fetch",
    label: "Fetch",
  },
  go: {
    codeSampleLang: "Go",
    contentType: "text/x-go;charset=utf-8",
    extension: "go",
    fence: "go",
    id: "go",
    label: "Go (net/http)",
  },
  http: {
    codeSampleLang: "HTTP",
    contentType: "text/plain;charset=utf-8",
    extension: "http",
    fence: "http",
    id: "http",
    label: "HTTP",
  },
  httpie: {
    codeSampleLang: "Shell",
    contentType: "text/x-shellscript;charset=utf-8",
    extension: "sh",
    fence: "bash",
    id: "httpie",
    label: "HTTPie",
  },
  java: {
    codeSampleLang: "Java",
    contentType: "text/x-java;charset=utf-8",
    extension: "java",
    fence: "java",
    id: "java",
    label: "Java (HttpClient)",
  },
  "javascript-axios": {
    codeSampleLang: "JavaScript",
    contentType: "text/javascript;charset=utf-8",
    extension: "js",
    fence: "javascript",
    id: "javascript-axios",
    label: "JavaScript (axios)",
  },
  kotlin: {
    codeSampleLang: "Kotlin",
    contentType: "text/x-kotlin;charset=utf-8",
    extension: "kt",
    fence: "kotlin",
    id: "kotlin",
    label: "Kotlin (OkHttp)",
  },
  php: {
    codeSampleLang: "PHP",
    contentType: "text/x-php;charset=utf-8",
    extension: "php",
    fence: "php",
    id: "php",
    label: "PHP (cURL)",
  },
  powershell: {
    codeSampleLang: "PowerShell",
    contentType: "text/plain;charset=utf-8",
    extension: "ps1",
    fence: "powershell",
    id: "powershell",
    label: "PowerShell",
  },
  python: {
    codeSampleLang: "Python",
    contentType: "text/x-python;charset=utf-8",
    extension: "py",
    fence: "python",
    id: "python",
    label: "Python (requests)",
  },
  ruby: {
    codeSampleLang: "Ruby",
    contentType: "text/x-ruby;charset=utf-8",
    extension: "rb",
    fence: "ruby",
    id: "ruby",
    label: "Ruby (Net::HTTP)",
  },
  rust: {
    codeSampleLang: "Rust",
    contentType: "text/x-rust;charset=utf-8",
    extension: "rs",
    fence: "rust",
    id: "rust",
    label: "Rust (reqwest)",
  },
  swift: {
    codeSampleLang: "Swift",
    contentType: "text/x-swift;charset=utf-8",
    extension: "swift",
    fence: "swift",
    id: "swift",
    label: "Swift (URLSession)",
  },
};

const STANDARD_METHODS = new Set([
  "DELETE",
  "GET",
  "HEAD",
  "OPTIONS",
  "PATCH",
  "POST",
  "PUT",
  "TRACE",
]);
const BODY_REQUIRED_METHODS = new Set(["PATCH", "POST", "PUT"]);

export function isSnippetLanguage(value: string): value is SnippetLanguage {
  return SNIPPET_LANGUAGES.includes(value as SnippetLanguage);
}

export function isRequestCodeFormat(value: string): value is RequestCodeFormat {
  return Object.prototype.hasOwnProperty.call(REQUEST_CODE_FORMATS, value);
}

function toMediaType(contentType: string) {
  return contentType.split(";", 1)[0].trim();
}

function createSnippetRequest(input: RequestCodeInput): SnippetRequest {
  const method = input.method.toUpperCase();
  const hasBody = hasSendableRequestBody(method, input.requestBody);
  const headers: Array<[string, string]> = input.parameters
    .filter((parameter) => parameter.location === "header")
    .map((parameter) => [parameter.name, parameter.value]);
  const cookieHeader = buildCookieHeaderValue(input.parameters);

  if (cookieHeader) {
    headers.push(["Cookie", cookieHeader]);
  }

  if (hasBody) {
    headers.push(["Content-Type", input.contentType]);
  }

  return {
    body: hasBody ? input.requestBody.trim() : null,
    contentType: hasBody ? input.contentType : "",
    headers,
    method,
    // Line breaks never belong in a URL and would break single-line literals.
    url: buildRequestUrl(input.serverUrl, input.path, input.parameters).replace(
      /[\r\n]+/g,
      "",
    ),
  };
}

function withoutContentType(headers: Array<[string, string]>) {
  return headers.filter(([name]) => name.toLowerCase() !== "content-type");
}

function readJsonBody(request: SnippetRequest) {
  if (request.body === null || !isJsonMediaType(request.contentType)) {
    return undefined;
  }

  try {
    return { value: JSON.parse(request.body) as unknown };
  } catch {
    return undefined;
  }
}

/* String literal escaping per language family. */

function quoteJsonStyle(value: string) {
  return JSON.stringify(value);
}

function quoteBraceUnicode(value: string) {
  let result = '"';

  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;

    if (character === "\\" || character === '"') {
      result += `\\${character}`;
    } else if (character === "\n") {
      result += "\\n";
    } else if (character === "\r") {
      result += "\\r";
    } else if (character === "\t") {
      result += "\\t";
    } else if (code < 0x20 || code === 0x7f) {
      result += `\\u{${code.toString(16)}}`;
    } else {
      result += character;
    }
  }

  return `${result}"`;
}

function quoteKotlin(value: string) {
  return quoteJsonStyle(value).replaceAll("$", "\\$");
}

function quoteRuby(value: string) {
  return quoteJsonStyle(value).replaceAll("#", "\\#");
}

function quotePhp(value: string) {
  return `'${value.replaceAll("\\", "\\\\").replaceAll("'", "\\'")}'`;
}

function quotePowerShell(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function quoteShell(value: string) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function indentLines(text: string, indent: string) {
  return text
    .split("\n")
    .map((line, index) => (index === 0 ? line : `${indent}${line}`))
    .join("\n");
}

function toPythonLiteral(value: unknown, indent = ""): string {
  const nextIndent = `${indent}    `;

  if (value === null) {
    return "None";
  }

  if (value === true || value === false) {
    return value ? "True" : "False";
  }

  if (typeof value === "string") {
    return quoteJsonStyle(value);
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "None";
  }

  if (Array.isArray(value)) {
    return value.length === 0
      ? "[]"
      : `[\n${value
          .map((item) => `${nextIndent}${toPythonLiteral(item, nextIndent)},`)
          .join("\n")}\n${indent}]`;
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);

    return entries.length === 0
      ? "{}"
      : `{\n${entries
          .map(
            ([key, item]) =>
              `${nextIndent}${quoteJsonStyle(key)}: ${toPythonLiteral(item, nextIndent)},`,
          )
          .join("\n")}\n${indent}}`;
  }

  return "None";
}

/* Language generators */

function createPythonSnippet(request: SnippetRequest) {
  const json = readJsonBody(request);
  const lines = ["import requests", "", `url = ${quoteJsonStyle(request.url)}`];
  const args = [quoteJsonStyle(request.method), "url"];

  if (request.headers.length > 0) {
    lines.push(
      "headers = {",
      ...request.headers.map(
        ([name, value]) =>
          `    ${quoteJsonStyle(name)}: ${quoteJsonStyle(value)},`,
      ),
      "}",
    );
    args.push("headers=headers");
  }

  if (request.body !== null) {
    lines.push(
      `payload = ${json ? toPythonLiteral(json.value) : quoteJsonStyle(request.body)}`,
    );
    args.push(json ? "json=payload" : "data=payload");
  }

  lines.push(
    "",
    `response = requests.request(${args.join(", ")})`,
    "",
    "print(response.status_code)",
    "print(response.text)",
  );

  return lines.join("\n");
}

function createAxiosSnippet(request: SnippetRequest) {
  const json = readJsonBody(request);
  const lines = [
    'import axios from "axios";',
    "",
    "const response = await axios.request({",
    `  method: ${quoteJsonStyle(request.method.toLowerCase())},`,
    `  url: ${quoteJsonStyle(request.url)},`,
  ];

  if (request.headers.length > 0) {
    lines.push(
      "  headers: {",
      ...request.headers.map(
        ([name, value]) =>
          `    ${quoteJsonStyle(name)}: ${quoteJsonStyle(value)},`,
      ),
      "  },",
    );
  }

  if (request.body !== null) {
    lines.push(
      `  data: ${
        json
          ? indentLines(JSON.stringify(json.value, null, 2), "  ")
          : quoteJsonStyle(request.body)
      },`,
    );
  }

  lines.push("});", "", "console.log(response.status, response.data);");

  return lines.join("\n");
}

function createGoSnippet(request: SnippetRequest) {
  const hasBody = request.body !== null;
  const bodyLiteral =
    request.body !== null && !/[`\r]/.test(request.body)
      ? `\`${request.body}\``
      : quoteJsonStyle(request.body ?? "");
  const imports = ['"fmt"', '"io"', '"net/http"'];

  if (hasBody) {
    imports.push('"strings"');
  }

  const lines = [
    "package main",
    "",
    "import (",
    ...imports.map((item) => `\t${item}`),
    ")",
    "",
    "func main() {",
  ];

  if (hasBody) {
    lines.push(`\tbody := strings.NewReader(${bodyLiteral})`);
  }

  lines.push(
    `\treq, err := http.NewRequest(${quoteJsonStyle(request.method)}, ${quoteJsonStyle(request.url)}, ${hasBody ? "body" : "nil"})`,
    "\tif err != nil {",
    "\t\tpanic(err)",
    "\t}",
    ...request.headers.map(
      ([name, value]) =>
        `\treq.Header.Set(${quoteJsonStyle(name)}, ${quoteJsonStyle(value)})`,
    ),
    "",
    "\tres, err := http.DefaultClient.Do(req)",
    "\tif err != nil {",
    "\t\tpanic(err)",
    "\t}",
    "\tdefer res.Body.Close()",
    "",
    "\tdata, err := io.ReadAll(res.Body)",
    "\tif err != nil {",
    "\t\tpanic(err)",
    "\t}",
    "",
    "\tfmt.Println(res.StatusCode)",
    "\tfmt.Println(string(data))",
    "}",
  );

  return lines.join("\n");
}

function createJavaSnippet(request: SnippetRequest) {
  const publisher =
    request.body !== null
      ? `HttpRequest.BodyPublishers.ofString(${quoteJsonStyle(request.body)})`
      : "HttpRequest.BodyPublishers.noBody()";

  return [
    "import java.net.URI;",
    "import java.net.http.HttpClient;",
    "import java.net.http.HttpRequest;",
    "import java.net.http.HttpResponse;",
    "",
    "public class Main {",
    "    public static void main(String[] args) throws Exception {",
    "        HttpRequest request = HttpRequest.newBuilder()",
    `            .uri(URI.create(${quoteJsonStyle(request.url)}))`,
    ...request.headers.map(
      ([name, value]) =>
        `            .header(${quoteJsonStyle(name)}, ${quoteJsonStyle(value)})`,
    ),
    `            .method(${quoteJsonStyle(request.method)}, ${publisher})`,
    "            .build();",
    "",
    "        HttpResponse<String> response = HttpClient.newHttpClient()",
    "            .send(request, HttpResponse.BodyHandlers.ofString());",
    "",
    "        System.out.println(response.statusCode());",
    "        System.out.println(response.body());",
    "    }",
    "}",
  ].join("\n");
}

function createCSharpSnippet(request: SnippetRequest) {
  const lines = [
    "using System;",
    "using System.Net.Http;",
    "using System.Text;",
    "",
    "using var client = new HttpClient();",
    `using var request = new HttpRequestMessage(new HttpMethod(${quoteJsonStyle(request.method)}), ${quoteJsonStyle(request.url)});`,
    ...withoutContentType(request.headers).map(
      ([name, value]) =>
        `request.Headers.TryAddWithoutValidation(${quoteJsonStyle(name)}, ${quoteJsonStyle(value)});`,
    ),
  ];

  if (request.body !== null) {
    lines.push(
      `request.Content = new StringContent(${quoteJsonStyle(request.body)}, Encoding.UTF8, ${quoteJsonStyle(toMediaType(request.contentType))});`,
    );
  }

  lines.push(
    "",
    "using var response = await client.SendAsync(request);",
    "Console.WriteLine((int)response.StatusCode);",
    "Console.WriteLine(await response.Content.ReadAsStringAsync());",
  );

  return lines.join("\n");
}

function createPhpSnippet(request: SnippetRequest) {
  const lines = [
    "<?php",
    "",
    "$curl = curl_init();",
    "",
    "curl_setopt_array($curl, [",
    `    CURLOPT_URL => ${quotePhp(request.url)},`,
    `    CURLOPT_CUSTOMREQUEST => ${quotePhp(request.method)},`,
    "    CURLOPT_RETURNTRANSFER => true,",
  ];

  if (request.headers.length > 0) {
    lines.push(
      "    CURLOPT_HTTPHEADER => [",
      ...request.headers.map(
        ([name, value]) => `        ${quotePhp(`${name}: ${value}`)},`,
      ),
      "    ],",
    );
  }

  if (request.body !== null) {
    lines.push(`    CURLOPT_POSTFIELDS => ${quotePhp(request.body)},`);
  }

  lines.push(
    "]);",
    "",
    "$response = curl_exec($curl);",
    "$status = curl_getinfo($curl, CURLINFO_HTTP_CODE);",
    "curl_close($curl);",
    "",
    "echo $status . PHP_EOL . $response . PHP_EOL;",
  );

  return lines.join("\n");
}

function createRubySnippet(request: SnippetRequest) {
  const className = STANDARD_METHODS.has(request.method)
    ? `Net::HTTP::${request.method.charAt(0)}${request.method.slice(1).toLowerCase()}`
    : "";
  const lines = [
    'require "net/http"',
    'require "uri"',
    "",
    `uri = URI(${quoteRuby(request.url)})`,
    className
      ? `request = ${className}.new(uri)`
      : `request = Net::HTTPGenericRequest.new(${quoteRuby(request.method)}, ${request.body !== null}, true, uri)`,
    ...request.headers.map(
      ([name, value]) => `request[${quoteRuby(name)}] = ${quoteRuby(value)}`,
    ),
  ];

  if (request.body !== null) {
    lines.push(`request.body = ${quoteRuby(request.body)}`);
  }

  lines.push(
    "",
    'response = Net::HTTP.start(uri.hostname, uri.port, use_ssl: uri.scheme == "https") do |http|',
    "  http.request(request)",
    "end",
    "",
    "puts response.code",
    "puts response.body",
  );

  return lines.join("\n");
}

function createRustSnippet(request: SnippetRequest) {
  const method = STANDARD_METHODS.has(request.method)
    ? `Method::${request.method}`
    : `Method::from_bytes(${quoteBraceUnicode(request.method)}.as_bytes())?`;
  const lines = [
    "use reqwest::blocking::Client;",
    "use reqwest::Method;",
    "",
    "fn main() -> Result<(), Box<dyn std::error::Error>> {",
    "    let response = Client::new()",
    `        .request(${method}, ${quoteBraceUnicode(request.url)})`,
    ...request.headers.map(
      ([name, value]) =>
        `        .header(${quoteBraceUnicode(name)}, ${quoteBraceUnicode(value)})`,
    ),
  ];

  if (request.body !== null) {
    lines.push(`        .body(${quoteBraceUnicode(request.body)})`);
  }

  lines.push(
    "        .send()?;",
    "",
    '    println!("{}", response.status());',
    '    println!("{}", response.text()?);',
    "",
    "    Ok(())",
    "}",
  );

  return lines.join("\n");
}

function createSwiftSnippet(request: SnippetRequest) {
  const lines = [
    "import Foundation",
    "",
    `var request = URLRequest(url: URL(string: ${quoteBraceUnicode(request.url)})!)`,
    `request.httpMethod = ${quoteBraceUnicode(request.method)}`,
    ...request.headers.map(
      ([name, value]) =>
        `request.setValue(${quoteBraceUnicode(value)}, forHTTPHeaderField: ${quoteBraceUnicode(name)})`,
    ),
  ];

  if (request.body !== null) {
    lines.push(
      `request.httpBody = Data(${quoteBraceUnicode(request.body)}.utf8)`,
    );
  }

  lines.push(
    "",
    "let (data, response) = try await URLSession.shared.data(for: request)",
    "",
    "if let httpResponse = response as? HTTPURLResponse {",
    "    print(httpResponse.statusCode)",
    "}",
    "print(String(decoding: data, as: UTF8.self))",
  );

  return lines.join("\n");
}

function createKotlinSnippet(request: SnippetRequest) {
  const needsEmptyBody =
    request.body === null && BODY_REQUIRED_METHODS.has(request.method);
  const imports = ["import okhttp3.OkHttpClient", "import okhttp3.Request"];

  if (request.body !== null) {
    imports.unshift("import okhttp3.MediaType.Companion.toMediaType");
  }

  if (request.body !== null || needsEmptyBody) {
    imports.push("import okhttp3.RequestBody.Companion.toRequestBody");
  }

  const lines = [
    ...imports,
    "",
    "fun main() {",
    "    val client = OkHttpClient()",
  ];

  if (request.body !== null) {
    lines.push(
      `    val body = ${quoteKotlin(request.body)}.toRequestBody(${quoteKotlin(request.contentType)}.toMediaType())`,
    );
  } else if (needsEmptyBody) {
    // OkHttp rejects POST, PUT, and PATCH requests without a body object.
    lines.push('    val body = "".toRequestBody()');
  }

  lines.push(
    "    val request = Request.Builder()",
    `        .url(${quoteKotlin(request.url)})`,
    `        .method(${quoteKotlin(request.method)}, ${request.body !== null || needsEmptyBody ? "body" : "null"})`,
    ...withoutContentType(request.headers).map(
      ([name, value]) =>
        `        .header(${quoteKotlin(name)}, ${quoteKotlin(value)})`,
    ),
    "        .build()",
    "",
    "    client.newCall(request).execute().use { response ->",
    "        println(response.code)",
    "        println(response.body?.string())",
    "    }",
    "}",
  );

  return lines.join("\n");
}

function createPowerShellSnippet(request: SnippetRequest) {
  const headers = withoutContentType(request.headers);
  const lines: string[] = [];
  const args = [
    `-Uri ${quotePowerShell(request.url)}`,
    `-Method ${quotePowerShell(request.method)}`,
  ];

  if (headers.length > 0) {
    lines.push(
      "$headers = @{",
      ...headers.map(
        ([name, value]) =>
          `    ${quotePowerShell(name)} = ${quotePowerShell(value)}`,
      ),
      "}",
    );
    args.push("-Headers $headers");
  }

  if (request.body !== null) {
    lines.push(`$body = ${quotePowerShell(request.body)}`);
    args.push(
      `-ContentType ${quotePowerShell(request.contentType)}`,
      "-Body $body",
    );
  }

  if (lines.length > 0) {
    lines.push("");
  }

  lines.push(
    `$response = Invoke-WebRequest ${args.join(" ")} -UseBasicParsing`,
    "$response.StatusCode",
    "$response.Content",
  );

  return lines.join("\n");
}

function createHttpieSnippet(request: SnippetRequest) {
  const parts = ["http"];

  if (request.body !== null) {
    parts.push(`--raw ${quoteShell(request.body)}`);
  }

  parts.push(request.method, quoteShell(request.url));

  for (const [name, value] of request.headers) {
    // HTTPie removes a header written as `Name:`; `Name;` sends it empty.
    parts.push(quoteShell(value ? `${name}:${value}` : `${name};`));
  }

  return parts.join(" \\\n  ");
}

const SNIPPET_GENERATORS: Record<
  SnippetLanguage,
  (request: SnippetRequest) => string
> = {
  csharp: createCSharpSnippet,
  go: createGoSnippet,
  httpie: createHttpieSnippet,
  java: createJavaSnippet,
  "javascript-axios": createAxiosSnippet,
  kotlin: createKotlinSnippet,
  php: createPhpSnippet,
  powershell: createPowerShellSnippet,
  python: createPythonSnippet,
  ruby: createRubySnippet,
  rust: createRustSnippet,
  swift: createSwiftSnippet,
};

export function createRequestCode(
  format: RequestCodeFormat,
  input: RequestCodeInput,
) {
  if (format === "curl" || format === "fetch" || format === "http") {
    const create =
      format === "curl"
        ? createCurlPreview
        : format === "fetch"
          ? createFetchPreview
          : createHttpPreview;

    return create(
      input.method,
      input.path,
      hasSendableRequestBody(input.method, input.requestBody),
      input.serverUrl,
      input.parameters,
      input.requestBody,
      input.contentType,
    );
  }

  return SNIPPET_GENERATORS[format](createSnippetRequest(input));
}
