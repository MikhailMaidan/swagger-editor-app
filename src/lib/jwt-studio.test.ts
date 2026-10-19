import {
  createHmac,
  createPrivateKey,
  createPublicKey,
  sign,
  verify,
  constants,
  webcrypto,
  type JsonWebKey as NodeJwk,
} from "node:crypto";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  JWT_ALGORITHMS,
  MAX_JWT_BYTES,
  MAX_JWT_PROJECT_BYTES,
  checkJwtClaims,
  defaultJwtPolicy,
  demoJwtProject,
  emptyJwtProject,
  exportJwtPem,
  generateJwtKeys,
  importJwtPem,
  inspectJwt,
  jwtCanSign,
  jwtCanVerify,
  jwtCasesReport,
  jwtDecode,
  jwtEncode,
  jwtError,
  jwtKeyKind,
  jwtPublicJwks,
  jwtPublicKey,
  jwtSecretKey,
  jwtThumbprint,
  jwtVerificationReport,
  normalizeJwtCase,
  normalizeJwtKey,
  normalizeJwtPolicy,
  parseJwtKeys,
  parseJwtObject,
  parseJwtProject,
  runJwtCases,
  serializeJwtProject,
  signJwt,
  validateJwtKeys,
  verifyJwt,
  type JwtAlgorithm,
  type JwtKey,
  type JwtPolicy,
} from "./jwt-studio";

const keysets = {} as Record<JwtAlgorithm, JwtKey[]>;
const policy = (alg: JwtAlgorithm = "RS256"): JwtPolicy => ({
  ...defaultJwtPolicy(),
  algorithms: [alg],
  issuer: "https://issuer.example",
  audience: "api",
  nowSeconds: 1000,
});
const claims = {
  iss: "https://issuer.example",
  aud: "api",
  sub: "user",
  iat: 900,
  exp: 2000,
};
const encode = (value: unknown) =>
  jwtEncode(new TextEncoder().encode(JSON.stringify(value)));
const signing = (alg: JwtAlgorithm) => keysets[alg].find(jwtCanSign)!;
const publicKeys = (alg: JwtAlgorithm) => keysets[alg].filter(jwtCanVerify);
const mint = (
  alg: JwtAlgorithm = "RS256",
  value: unknown = claims,
  header: unknown = { typ: "JWT" },
) => signJwt(signing(alg), JSON.stringify(header), JSON.stringify(value));
const code = (action: () => unknown, value: string) =>
  expect(action).toThrowError(expect.objectContaining({ code: value }));
function rawHmac(header: unknown, value: unknown = claims) {
  const input = `${encode(header)}.${encode(value)}`;
  return `${input}.${createHmac(
    "sha256",
    Buffer.from(signing("HS256").jwk.k as string, "base64url"),
  )
    .update(input)
    .digest("base64url")}`;
}
beforeAll(async () => {
  vi.stubGlobal("crypto", webcrypto);
  for (const alg of JWT_ALGORITHMS)
    keysets[alg] = await generateJwtKeys(alg, `Test ${alg}`, `key-${alg}`);
});
beforeEach(() => vi.stubGlobal("crypto", webcrypto));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("JWT cryptographic interoperability", () => {
  it.each(JWT_ALGORITHMS)(
    "signs %s compact JWTs verifiable by Node crypto, with the expected JOSE signature representation",
    async (alg) => {
      const token = await mint(alg),
        parsed = inspectJwt(token),
        key = signing(alg);
      expect(parsed.header).toMatchObject({
        alg,
        typ: "JWT",
        kid: `key-${alg}`,
      });
      expect(parsed.claims).toEqual(claims);
      if (alg === "HS256") {
        const expected = createHmac(
          "sha256",
          Buffer.from(key.jwk.k as string, "base64url"),
        )
          .update(parsed.signingInput)
          .digest();
        expect(Buffer.from(parsed.signature)).toEqual(expected);
      } else {
        const publicKey = createPublicKey({
          key: publicKeys(alg)[0].jwk as NodeJwk,
          format: "jwk",
        });
        expect(
          verify(
            "sha256",
            Buffer.from(parsed.signingInput),
            {
              key: publicKey,
              ...(alg === "PS256"
                ? { padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: 32 }
                : {}),
              ...(alg === "ES256"
                ? { dsaEncoding: "ieee-p1363" as const }
                : {}),
            },
            Buffer.from(parsed.signature),
          ),
        ).toBe(true);
      }
      expect(parsed.signature.length).toBe(
        alg === "HS256" ? 32 : alg === "ES256" ? 64 : 256,
      );
      expect(
        await verifyJwt(token, publicKeys(alg), policy(alg)),
      ).toMatchObject({
        status: "accepted",
        signature: "valid",
        claims: "valid",
      });
    },
  );
  it.each(JWT_ALGORITHMS)(
    "verifies externally signed %s tokens without normalizing signed JSON whitespace",
    async (alg) => {
      const key = signing(alg);
      const header = Buffer.from(
        `{\r\n "typ":"JWT", "alg":"${alg}"\r\n}`,
      ).toString("base64url");
      const payload = Buffer.from(` ${JSON.stringify(claims)} `).toString(
          "base64url",
        ),
        input = `${header}.${payload}`;
      const signature =
        alg === "HS256"
          ? createHmac("sha256", Buffer.from(key.jwk.k as string, "base64url"))
              .update(input)
              .digest()
          : sign("sha256", Buffer.from(input), {
              key: createPrivateKey({ key: key.jwk as NodeJwk, format: "jwk" }),
              ...(alg === "PS256"
                ? { padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: 32 }
                : {}),
              ...(alg === "ES256"
                ? { dsaEncoding: "ieee-p1363" as const }
                : {}),
            });
      expect(
        (
          await verifyJwt(
            `${input}.${signature.toString("base64url")}`,
            publicKeys(alg),
            policy(alg),
          )
        ).status,
      ).toBe("accepted");
    },
  );
  it("rejects modified claims/signatures and does not report claims as checked after an invalid signature", async () => {
    const token = await mint(),
      parts = token.split(".");
    parts[1] = encode({ ...claims, sub: "attacker" });
    expect(
      await verifyJwt(parts.join("."), publicKeys("RS256"), policy()),
    ).toMatchObject({
      status: "rejected",
      signature: "invalid",
      claims: "not-checked",
      findings: [{ code: "signature" }],
    });
    const second = token.split(".");
    second[2] = "AA";
    expect(
      (await verifyJwt(second.join("."), publicKeys("RS256"), policy()))
        .signature,
    ).toBe("invalid");
  });
  it("rejects none, algorithm confusion, unsupported algorithms, and critical/unencoded headers before cryptography", async () => {
    for (const header of [
      { alg: "none", typ: "JWT" },
      { alg: "HS512", typ: "JWT" },
      { alg: "HS256", typ: "JWT", crit: [] },
      { alg: "HS256", typ: "JWT", b64: false },
    ]) {
      const result = await verifyJwt(
        rawHmac(header),
        publicKeys("HS256"),
        policy("HS256"),
      );
      expect(result.status).toBe("rejected");
      expect(result.signature).toBe("not-checked");
    }
    expect(
      (await verifyJwt(await mint("HS256"), publicKeys("HS256"), policy()))
        .findings[0].code,
    ).toBe("algorithm");
    code(
      () =>
        normalizeJwtKey({
          ...publicKeys("RS256")[0],
          algorithm: "HS256",
          jwk: { ...publicKeys("RS256")[0].jwk, alg: "HS256" },
        }),
      "key",
    );
  });
  it("uses only supplied trusted keys and never follows header JWK URLs or embedded keys", async () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    const token = rawHmac({
      alg: "HS256",
      typ: "JWT",
      jku: "https://untrusted.example/keys",
      x5u: "https://untrusted.example/cert",
      jwk: signing("HS256").jwk,
    });
    expect((await verifyJwt(token, [], policy("HS256"))).findings[0].code).toBe(
      "missing-key",
    );
    expect(
      (await verifyJwt(token, publicKeys("HS256"), policy("HS256"))).status,
    ).toBe("accepted");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("resolves kid exactly, rejects ambiguous matches, and permits explicit trusted-key selection", async () => {
    const token = await mint("RS256"),
      key = publicKeys("RS256")[0];
    const duplicate = { ...key, id: "other-entry" };
    expect(
      (await verifyJwt(token, [key, duplicate], policy())).findings[0].code,
    ).toBe("ambiguous-key");
    expect(
      (await verifyJwt(token, [key, duplicate], policy(), key.id)).status,
    ).toBe("accepted");
    const unlabelled = { ...key, jwk: { ...key.jwk } };
    delete unlabelled.jwk.kid;
    expect(
      (await verifyJwt(token, [unlabelled], policy())).findings[0].code,
    ).toBe("missing-key");
    expect(
      (await verifyJwt(token, [unlabelled], policy(), key.id)).status,
    ).toBe("accepted");
  });
  it("refuses signing with public keys, mismatched header algorithms/kids or unsupported extensions", async () => {
    await expect(
      signJwt(publicKeys("RS256")[0], "{}", "{}"),
    ).rejects.toMatchObject({ code: "key-usage" });
    await expect(mint("RS256", claims, { alg: "HS256" })).rejects.toMatchObject(
      { code: "algorithm" },
    );
    await expect(
      mint("RS256", claims, { kid: "wrong-key" }),
    ).rejects.toMatchObject({ code: "key" });
    await expect(
      mint("RS256", claims, { crit: ["custom"] }),
    ).rejects.toMatchObject({ code: "header" });
    expect(
      (
        await verifyJwt(
          rawHmac({ alg: "HS256", typ: 7 }),
          publicKeys("HS256"),
          policy("HS256"),
        )
      ).findings[0].code,
    ).toBe("header");
  });
  it("fails closed when browser cryptography is unavailable", async () => {
    const token = await mint("HS256");
    vi.stubGlobal("crypto", { randomUUID: () => "test" });
    expect(
      (await verifyJwt(token, publicKeys("HS256"), policy("HS256"))).findings[0]
        .code,
    ).toBe("crypto");
    await expect(mint("HS256")).rejects.toMatchObject({ code: "crypto" });
  });
});

describe("JWT decoding and claim policies", () => {
  it("decodes unverified and unsigned tokens separately from signature verification", () => {
    const parsed = inspectJwt(
      `${encode({ alg: "none" })}.${encode({ arbitrary: true })}.`,
    );
    expect(parsed.claims).toEqual({ arbitrary: true });
    expect(parsed.signature).toHaveLength(0);
    expect(parsed).not.toHaveProperty("status");
  });
  it.each(["", "a.b", "a.b.c.d.e", " a.b.c", "a..c", "a.b.c\n"])(
    "rejects malformed compact token %j",
    (token) => code(() => inspectJwt(token), "format"),
  );
  it("rejects padding, noncanonical base64url, non-UTF8, nonobject claims and unsafe numeric values", () => {
    for (const text of ["AA==", "A", "AB", "+/", "a b"])
      code(() => jwtDecode(text), "encoding");
    code(
      () => inspectJwt(`${jwtEncode(Uint8Array.from([255]))}.${encode({})}.`),
      "encoding",
    );
    code(() => inspectJwt(`${encode({})}.${encode([])}.`), "json");
    code(() => parseJwtObject('{"n":9007199254740993}'), "json");
    code(
      () =>
        inspectJwt(
          `${encode({})}.${jwtEncode(new TextEncoder().encode("\uFEFF{}"))}.`,
        ),
      "json",
    );
    code(() => inspectJwt("x".repeat(MAX_JWT_BYTES + 1)), "limit");
  });
  it("preserves prototype-related claim keys as inert own JSON properties", async () => {
    const token = await signJwt(
      signing("HS256"),
      '{"typ":"JWT"}',
      '{"__proto__":{"role":"admin"},"constructor":"claim","exp":2000}',
    );
    expect(Object.hasOwn(inspectJwt(token).claims, "__proto__")).toBe(true);
    expect({}).not.toHaveProperty("role");
    expect(
      (
        await verifyJwt(token, publicKeys("HS256"), {
          ...policy("HS256"),
          issuer: "",
          audience: "",
        })
      ).status,
    ).toBe("accepted");
  });
  it("handles inclusive expiration/not-before boundaries, fractional NumericDates and bounded tolerance", () => {
    expect(
      checkJwtClaims({ ...claims, exp: 1000 }, policy()).map((f) => f.code),
    ).toContain("expired");
    expect(checkJwtClaims({ ...claims, nbf: 1000 }, policy())).toEqual([]);
    expect(
      checkJwtClaims(
        { ...claims, exp: 1000.5 },
        { ...policy(), nowSeconds: 1000.25 },
      ),
    ).toEqual([]);
    expect(
      checkJwtClaims(
        { ...claims, exp: 999, nbf: 1005 },
        { ...policy(), toleranceSeconds: 10 },
      ),
    ).toEqual([]);
    expect(
      checkJwtClaims(
        { ...claims, exp: 990 },
        { ...policy(), toleranceSeconds: 10 },
      ).map((f) => f.code),
    ).toContain("expired");
  });
  it("checks issuer, scalar/array audiences, subject, issued-at and maximum token age", async () => {
    expect(
      checkJwtClaims({ ...claims, aud: ["other", "api"] }, policy()),
    ).toEqual([]);
    expect(
      checkJwtClaims(
        {
          ...claims,
          iss: "https://ISSUER.example",
          aud: ["other"],
          sub: "wrong",
          iat: 1100,
        },
        { ...policy(), subject: "user" },
      ).map((f) => f.code),
    ).toEqual(
      expect.arrayContaining([
        "issuer",
        "audience",
        "subject",
        "issued-future",
      ]),
    );
    expect(
      checkJwtClaims(
        { ...claims, iat: 800 },
        { ...policy(), maxAgeSeconds: 100 },
      ).map((f) => f.code),
    ).toContain("too-old");
    expect(
      checkJwtClaims(
        { exp: 2000 },
        { ...policy(), issuer: "", audience: "", maxAgeSeconds: 100 },
      ).map((f) => f.code),
    ).toContain("issued-at-required");
    expect(
      checkJwtClaims(
        { ...claims, iat: 1100 },
        { ...policy(), checkIssuedAt: false },
      ),
    ).toEqual([]);
    const result = await verifyJwt(
      await mint("RS256", claims, { typ: "at+jwt" }),
      publicKeys("RS256"),
      policy(),
    );
    expect(result).toMatchObject({
      signature: "valid",
      claims: "invalid",
      findings: [{ code: "type" }],
    });
  });
  it("requires expiration by default, validates registered claim types and supports explicitly optional checks", () => {
    expect(checkJwtClaims({}, defaultJwtPolicy()).map((f) => f.code)).toContain(
      "expiration-required",
    );
    const findings = checkJwtClaims(
      {
        exp: null,
        nbf: "1",
        iat: false,
        iss: 1,
        aud: ["api", 1],
        sub: [],
        jti: {},
      },
      policy(),
    );
    expect(findings.filter((f) => f.code === "claim-type")).toHaveLength(7);
    expect(
      checkJwtClaims({}, { ...defaultJwtPolicy(), requireExpiration: false }),
    ).toEqual([]);
    for (const patch of [
      { algorithms: [] },
      { algorithms: ["none"] },
      { algorithms: ["RS256", "RS256"] },
      { toleranceSeconds: 301 },
      { toleranceSeconds: -1 },
      { maxAgeSeconds: 1.5 },
      { nowSeconds: NaN },
      { issuer: 7 },
    ])
      code(
        () => normalizeJwtPolicy({ ...defaultJwtPolicy(), ...patch }),
        "policy",
      );
  });
});

describe("verification clock and report boundaries", () => {
  it("rejects invalid current-time snapshots instead of bypassing time claims", async () => {
    const token = await mint("RS256"),
      currentPolicy = { ...policy(), nowSeconds: null };
    for (const now of [NaN, Infinity, -1, 8640000000001]) {
      code(() => checkJwtClaims(claims, currentPolicy, now), "policy");
      await expect(
        verifyJwt(token, publicKeys("RS256"), currentPolicy, "", now),
      ).rejects.toMatchObject({ code: "policy" });
    }
    expect(
      await verifyJwt(token, publicKeys("RS256"), policy(), "", NaN),
    ).toMatchObject({ status: "accepted", checkedAt: 1000 });
  });
  it("does not reflect arbitrary header values into value-free reports", async () => {
    const token = `${jwtEncode(new TextEncoder().encode('{"alg":"private-header-value"}'))}.${jwtEncode(new TextEncoder().encode("{}"))}.`;
    const result = await verifyJwt(token, [], policy());
    expect(result.findings).toEqual([{ code: "algorithm" }]);
    expect(JSON.stringify(jwtVerificationReport(result))).not.toContain(
      "private-header-value",
    );
  });
});

describe("signing key lifecycle and portable projects", () => {
  it.each(["RS256", "PS256", "ES256"] as const)(
    "round-trips %s public/private PEM and derives the same public thumbprint",
    async (alg) => {
      const privateKey = signing(alg),
        publicKey = publicKeys(alg)[0];
      expect(await jwtThumbprint(privateKey)).toBe(
        await jwtThumbprint(publicKey),
      );
      const privatePem = await exportJwtPem(privateKey, true),
        publicPem = await exportJwtPem(privateKey);
      expect(privatePem).toContain("BEGIN PRIVATE KEY");
      expect(publicPem).toContain("BEGIN PUBLIC KEY");
      const privateImported = await importJwtPem(
        privatePem,
        alg,
        "PEM key",
        `key-${alg}`,
      );
      const publicImported = await importJwtPem(
        publicPem,
        alg,
        "PEM public",
        `key-${alg}`,
      );
      expect(privateImported.map(jwtKeyKind)).toEqual(["private", "public"]);
      expect(
        (
          await verifyJwt(
            await signJwt(
              privateImported[0],
              '{"typ":"JWT"}',
              JSON.stringify(claims),
            ),
            publicImported,
            policy(alg),
          )
        ).status,
      ).toBe("accepted");
    },
  );
  it("imports mixed JWK Sets, canonicalizes fields and automatically derives verification entries for private keys", () => {
    const imported = parseJwtKeys(
      JSON.stringify({
        keys: [
          { ...signing("RS256").jwk, ignored: "metadata" },
          publicKeys("ES256")[0].jwk,
        ],
      }),
      "HS256",
    );
    expect(imported.map((k) => k.algorithm)).toEqual([
      "RS256",
      "RS256",
      "ES256",
    ]);
    expect(imported[0].jwk).not.toHaveProperty("ignored");
    expect(imported[1].jwk).not.toHaveProperty("d");
    expect(imported[1].jwk.key_ops).toEqual(["verify"]);
  });
  it("supports explicit UTF-8/base64url HMAC secret imports and refuses undersized keys", async () => {
    const key = jwtSecretKey("a".repeat(32), "utf8", "Local secret", "secret");
    const other = jwtSecretKey(
      key.jwk.k as string,
      "base64url",
      "Local secret",
      "secret",
    );
    expect(other.jwk.k).toBe(key.jwk.k);
    await validateJwtKeys([key]);
    code(() => jwtSecretKey("short", "utf8", "Weak", "weak"), "key");
    code(() => jwtPublicKey(key), "key-usage");
    await expect(exportJwtPem(key)).rejects.toMatchObject({
      code: "key-usage",
    });
    await expect(jwtThumbprint(key)).rejects.toMatchObject({
      code: "key-usage",
    });
  });
  it("rejects mismatched key algorithms, unsupported curves, encryption-only/contradictory usages and weak RSA moduli", async () => {
    const ec = publicKeys("ES256")[0],
      rsa = publicKeys("RS256")[0];
    for (const jwk of [
      { ...ec.jwk, crv: "P-384" },
      { ...ec.jwk, use: "enc" },
      { ...ec.jwk, alg: "HS256" },
      { ...ec.jwk, x: "AA" },
    ])
      code(() => normalizeJwtKey({ ...ec, jwk }), "key");
    code(
      () => normalizeJwtKey({ ...ec, jwk: { ...ec.jwk, key_ops: ["sign"] } }),
      "key-usage",
    );
    code(
      () => normalizeJwtKey({ ...rsa, jwk: { ...rsa.jwk, n: "AQ", e: "Ag" } }),
      "key",
    );
    code(() => parseJwtKeys('{"keys":[]}', "RS256"), "limit");
    await expect(
      importJwtPem("not a key", "RS256", "PEM", ""),
    ).rejects.toMatchObject({ code: "key" });
    await expect(importJwtPem("", "HS256", "PEM", "")).rejects.toMatchObject({
      code: "key",
    });
  });
  it("omits all signing and shared-secret keys from standard project/JWKS exports, with explicit signing-key exports available", async () => {
    const p = emptyJwtProject();
    p.keys = [...keysets.RS256, ...keysets.HS256, ...keysets.ES256];
    const standard = serializeJwtProject(p),
      restored = parseJwtProject(standard);
    expect(restored.keys.map(jwtKeyKind)).toEqual(["public", "public"]);
    for (const key of p.keys.filter((k) => jwtKeyKind(k) !== "public"))
      expect(standard).not.toContain((key.jwk.d ?? key.jwk.k) as string);
    expect(JSON.parse(jwtPublicJwks(p.keys)).keys).toHaveLength(2);
    expect(parseJwtProject(serializeJwtProject(p, true)).keys).toEqual(p.keys);
  });
  it("discards imported results, rejects duplicate identities and bounds project and case inputs", () => {
    const p = emptyJwtProject();
    p.keys = keysets.RS256;
    const raw = {
      ...p,
      verification: { status: "accepted" },
      casesResults: ["passed"],
    };
    expect(parseJwtProject(JSON.stringify(raw))).not.toHaveProperty(
      "verification",
    );
    for (const patch of [
      { version: 2 },
      { name: "" },
      { keys: [p.keys[0], p.keys[0]] },
      { cases: Array(31).fill({}) },
    ])
      code(
        () => parseJwtProject(JSON.stringify({ ...p, ...patch })),
        "project",
      );
    code(() => parseJwtProject("x".repeat(MAX_JWT_PROJECT_BYTES + 1)), "limit");
    code(
      () =>
        normalizeJwtCase({
          id: "1",
          name: "Case",
          token: "",
          keyId: "",
          expected: "trusted",
        }),
      "case",
    );
    code(
      () =>
        normalizeJwtCase({
          id: "1",
          name: "Case",
          token: "x".repeat(MAX_JWT_BYTES + 1),
          keyId: "",
          expected: "rejected",
        }),
      "limit",
    );
  });
  it("runs the five-case demo after restoring a public-key-only project", async () => {
    const p = await demoJwtProject(),
      results = await runJwtCases(parseJwtProject(serializeJwtProject(p)));
    expect(results.map((r) => r.status)).toEqual(Array(5).fill("passed"));
    expect(results.map((r) => r.verification.signature)).toEqual([
      "valid",
      "valid",
      "valid",
      "valid",
      "invalid",
    ]);
    const report = JSON.stringify(jwtCasesReport(results, 5));
    for (const value of [
      p.token,
      "https://issuer.example",
      "example-user",
      '"jwk"',
      '"token"',
      '"payload"',
      '"audience":',
    ])
      expect(report).not.toContain(value);
    expect(jwtCasesReport(results, 6).complete).toBe(false);
    expect(jwtCasesReport(results, 5).complete).toBe(true);
    expect(jwtVerificationReport(results[0].verification).status).toBe(
      "accepted",
    );
  });
  it("supports cancellation between verification cases without reporting incomplete runs as complete", async () => {
    const p = emptyJwtProject();
    p.keys = keysets.HS256;
    p.policy = policy("HS256");
    p.token = await mint("HS256");
    p.cases = Array.from({ length: 3 }, (_, i) => ({
      id: String(i),
      name: `Case ${i}`,
      token: p.token,
      keyId: "",
      expected: "accepted",
    }));
    const controller = new AbortController();
    const results = await runJwtCases(p, controller.signal, (done) => {
      if (done === 1) controller.abort();
    });
    expect(results).toHaveLength(1);
    expect(jwtCasesReport(results, 3).complete).toBe(false);
    expect(await runJwtCases(p, controller.signal)).toHaveLength(0);
    expect(jwtError(new Error()).code).toBe("crypto");
  });
});
