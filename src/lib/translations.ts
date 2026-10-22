import { resilienceTranslations } from "./resilience-translations";
import { streamingTranslations } from "./streaming-translations";

export const LANGUAGE_STORAGE_KEY = "rsswagger-language";
export const LANGUAGE_COOKIE = "rsswagger-language";

export const translations = {
  en: {
    ...resilienceTranslations.en,
    ...streamingTranslations.en,
    "jwtStudio.title": "JWT and signing-key studio",
    "jwtStudio.description":
      "Decode compact JWTs, verify signatures and claim policies, generate signing keys and test tokens, and maintain reusable verification cases entirely in this tab.",
    "jwtStudio.help":
      "Decoding alone does not verify a signature. Verification checks the supplied keys and your saved policy; it does not grant access or establish an issuer's trustworthiness. Tokens, keys and work stay in tab memory. No keys are fetched from token headers, and nothing is added to login credentials or request history.",
    "jwtStudio.project": "JWT verification project",
    "jwtStudio.projectName": "JWT project name",
    "jwtStudio.newProject": "New JWT project",
    "jwtStudio.demo": "Load JWT verification demo",
    "jwtStudio.demoLoaded":
      "RSA demo loaded with five verification cases and a fixed clock for reproducible checks.",
    "jwtStudio.importProject": "Restore JWT project (JSON)",
    "jwtStudio.projectLoaded":
      "JWT project restored. Imported results were discarded; verify again with the supplied keys and policy.",
    "jwtStudio.busy":
      "Working locally… case checks completed: {count}/{total}.",
    "jwtStudio.cancel": "Cancel JWT work",
    "jwtStudio.cancelled":
      "Work cancelled. Native cryptography already running may finish, but cancelled results are not applied; batch checks retain completed cases.",
    "jwtStudio.tokenSection": "Inspect and verify a token",
    "jwtStudio.token": "Compact JWT",
    "jwtStudio.verificationKey": "Trusted verification key",
    "jwtStudio.autoKey": "Match supplied keys by algorithm and kid",
    "jwtStudio.decode": "Decode JWT without verification",
    "jwtStudio.verify": "Verify JWT signature and claims",
    "jwtStudio.decoded":
      "Token decoded. Its signature has not been verified by decoding.",
    "jwtStudio.decodedOnly":
      "Decoded content is untrusted; consult the separate signature and policy result.",
    "jwtStudio.decodedSizes":
      "Decoded header: {header} bytes; claims: {claims} bytes; signature: {signature} bytes.",
    "jwtStudio.decodedHeader": "Decoded JWT header",
    "jwtStudio.decodedClaims": "Decoded JWT claims",
    "jwtStudio.dateOutsideRange": "Outside the displayable UTC date range",
    "jwtStudio.copyToken": "Copy compact JWT",
    "jwtStudio.copyHeader": "Copy Authorization header",
    "jwtStudio.downloadToken": "Download compact JWT",
    "jwtStudio.copied": "Copied to clipboard.",
    "jwtStudio.copyFailed": "Could not copy to clipboard.",
    "jwtStudio.verificationResult": "JWT verification result",
    "jwtStudio.verificationSummary":
      "Token {status}; signature {signature}; claims {claims}.",
    "jwtStudio.checkedAt":
      "Checked at Unix second {time}; algorithm {algorithm}.",
    "jwtStudio.outcome.accepted": "accepted by policy",
    "jwtStudio.outcome.rejected": "rejected",
    "jwtStudio.check.valid": "valid",
    "jwtStudio.check.invalid": "invalid",
    "jwtStudio.check.not-checked": "not checked",
    "jwtStudio.downloadReport": "Download value-free JWT verification report",
    "jwtStudio.policy": "JWT verification policy",
    "jwtStudio.policyHelp":
      "Algorithms are explicitly allowed and bound to supplied key types. Issuer, audience, subject and token type use exact matches; blank values skip those requirements. Expiration is required by default. Empty clock uses current time; fixed Unix seconds make regression cases reproducible. Save policy edits before verification or exports.",
    "jwtStudio.allowedAlgorithms": "Allowed JWT algorithms",
    "jwtStudio.issuer": "Expected issuer (iss)",
    "jwtStudio.audience": "Expected audience (aud)",
    "jwtStudio.subject": "Expected subject (sub)",
    "jwtStudio.type": "Expected token type (typ)",
    "jwtStudio.tolerance": "Clock tolerance (seconds, 0–300)",
    "jwtStudio.maxAge": "Maximum token age (seconds, 0 disables)",
    "jwtStudio.now": "Verification time (Unix seconds, blank uses now)",
    "jwtStudio.requireExpiration": "Require expiration claim (exp)",
    "jwtStudio.checkIssuedAt": "Reject future issued-at claims (iat)",
    "jwtStudio.policyDirty":
      "Policy has unsaved edits. Save or discard them before changing other project contexts, verifying or exporting.",
    "jwtStudio.savePolicy": "Save JWT verification policy",
    "jwtStudio.discardPolicy": "Discard policy edits",
    "jwtStudio.policySaved":
      "Verification policy saved; previous results cleared.",
    "jwtStudio.keys": "Local signing and verification keys",
    "jwtStudio.keysHelp":
      "Generate HS256, RS256, PS256 or ES256 keys, or import JWK/JWKS, SPKI/PKCS8 PEM, or a 32–128 byte HS256 secret. Private asymmetric imports also create a public verification entry. Public keys do not sign; HMAC secrets both sign and verify. Import candidates are not saved until Add keys. Signing material is hidden until explicitly revealed.",
    "jwtStudio.keyName": "Key label",
    "jwtStudio.keyKid": "Key identifier (kid)",
    "jwtStudio.keyAlgorithm": "Generation / JWK fallback algorithm",
    "jwtStudio.keyFormat": "Key import format",
    "jwtStudio.keySource": "Key import material",
    "jwtStudio.addKeys": "Add imported JWT keys",
    "jwtStudio.discardKey": "Discard key import material",
    "jwtStudio.generate": "Generate JWT signing keys",
    "jwtStudio.importKeyFile": "Read key file (JWK/JWKS/PEM/text)",
    "jwtStudio.keyFileLoaded":
      "Key file loaded into the import form. Select its format and add keys to validate it.",
    "jwtStudio.keysAdded":
      "Keys validated and added locally. Verification still uses the saved algorithm policy.",
    "jwtStudio.selectedKey": "Selected JWT key",
    "jwtStudio.noKeys": "No key selected",
    "jwtStudio.keyKind.secret": "shared secret",
    "jwtStudio.keyKind.private": "private signing key",
    "jwtStudio.keyKind.public": "public verification key",
    "jwtStudio.reveal": "Reveal selected signing material",
    "jwtStudio.keyPreview": "Selected JWK material",
    "jwtStudio.keyHidden":
      "Signing material hidden. Ordinary project exports omit it.",
    "jwtStudio.thumbprint": "Calculate public JWK thumbprint",
    "jwtStudio.thumbprintValue": "SHA-256 JWK thumbprint: {value}",
    "jwtStudio.removeKey": "Remove selected JWT key",
    "jwtStudio.downloadKey": "Download selected JWK",
    "jwtStudio.publicPem": "Download public PEM",
    "jwtStudio.privatePem": "Download private PEM",
    "jwtStudio.forgetSigning": "Forget signing keys and import material",
    "jwtStudio.signing": "Create a signed test JWT",
    "jwtStudio.signingHelp":
      "Header alg must match the selected key; kid is filled when absent and must match when both are supplied. Build buttons explicitly replace their JSON drafts. Signing does not enforce claim policy, so expired or negative test tokens can be created. Builder drafts remain in tab memory; projects save the current compact token and verification cases.",
    "jwtStudio.signingKey": "JWT signing key",
    "jwtStudio.noSigningKey": "No signing key available",
    "jwtStudio.buildHeader": "Build header for signing key",
    "jwtStudio.buildClaims": "Build one-hour claims from policy",
    "jwtStudio.signHeader": "JOSE header JSON to sign",
    "jwtStudio.signClaims": "JWT claims JSON to sign",
    "jwtStudio.sign": "Sign JWT locally",
    "jwtStudio.useDecoded": "Copy decoded token into signing drafts",
    "jwtStudio.signed":
      "JWT signed locally and placed in the token inspector; verify its saved policy separately.",
    "jwtStudio.cases": "JWT verification regression cases",
    "jwtStudio.casesHelp":
      "Save tokens with an expected accepted/rejected outcome and optional explicit verification key. Every run uses the saved policy and a common clock snapshot. A matching expected rejection is a passing case; inspect findings to confirm the reason. Incomplete/cancelled reports show completed counts.",
    "jwtStudio.selectedCase": "Selected JWT verification case",
    "jwtStudio.newCase": "New verification case",
    "jwtStudio.caseName": "Verification case name",
    "jwtStudio.caseToken": "Verification case token",
    "jwtStudio.caseExpected": "Expected verification outcome",
    "jwtStudio.caseKey": "Case verification key",
    "jwtStudio.missingCaseKey":
      "Saved key is unavailable; reimport it or select another key",
    "jwtStudio.caseDirty":
      "Case has unsaved edits. Save or discard them before switching context, verifying or exporting the project.",
    "jwtStudio.currentToCase": "Use current token in case",
    "jwtStudio.saveCase": "Save JWT verification case",
    "jwtStudio.discardCase": "Discard verification case edits",
    "jwtStudio.removeCase": "Remove JWT verification case",
    "jwtStudio.loadCase": "Load case token into inspector",
    "jwtStudio.caseSaved": "Verification case saved.",
    "jwtStudio.runCases": "Run JWT verification cases",
    "jwtStudio.downloadCases": "Download value-free JWT case report",
    "jwtStudio.casesSummary":
      "Completed {completed}/{total} cases: {passed} passed, {failed} failed.",
    "jwtStudio.caseSearch": "Search JWT verification cases",
    "jwtStudio.caseStatus.passed": "case passed",
    "jwtStudio.caseStatus.failed": "case failed",
    "jwtStudio.exports": "Portable JWT projects and key exports",
    "jwtStudio.exportHelp":
      "Projects contain token values, policy, keys and saved cases. Ordinary exports keep only public verification keys. Select signing-key export explicitly to include private/HMAC material or download a private PEM. Selected-JWK downloads use public material by default. Reports omit token/claim values, policy literals and all key material. Nothing is saved to browser storage.",
    "jwtStudio.includeSigning":
      "Include private and shared-secret signing keys in exports",
    "jwtStudio.omittedKeys":
      "Signing/shared-secret key entries omitted from ordinary project exports: {count}.",
    "jwtStudio.downloadProject": "Download JWT verification project",
    "jwtStudio.downloadJwks": "Download public verification JWKS",
    "jwtStudio.downloaded": "Download started.",
    "jwtStudio.downloadFailed": "Download was blocked. Try again.",
    "jwtStudio.error.format":
      "Use a compact JWT with exactly three dot-separated segments and no surrounding whitespace; encrypted/nested forms are unsupported.",
    "jwtStudio.error.encoding":
      "Use canonical unpadded base64url and valid UTF-8 token JSON.",
    "jwtStudio.error.json":
      "Use bounded JSON objects with finite numbers and safe integers for headers and claims.",
    "jwtStudio.error.limit":
      "A JWT, key, case, project or processing limit was exceeded.",
    "jwtStudio.error.algorithm":
      "Use an allowed supported algorithm matching the selected signing key and token header.",
    "jwtStudio.error.key":
      "Use a valid matching JWK/JWKS or unencrypted SPKI/PKCS8 key; RSA requires 2048–4096 bits, EC requires P-256, and HS256 requires 32–128 secret bytes.",
    "jwtStudio.error.key-usage":
      "This key's type or declared usage does not support that operation.",
    "jwtStudio.error.missing-key":
      "No supplied verification key matches the algorithm and key selection.",
    "jwtStudio.error.ambiguous-key":
      "Multiple supplied verification keys match. Select one trusted key explicitly.",
    "jwtStudio.error.header":
      "The token header contains invalid fields or unsupported critical/unencoded-payload extensions.",
    "jwtStudio.error.crypto":
      "Native Web Crypto is unavailable or could not complete the operation. Use a supported secure browser context.",
    "jwtStudio.error.policy":
      "Use a valid policy with supported algorithms, bounded clock tolerance/age and a finite verification time.",
    "jwtStudio.error.project":
      "Use a valid RSSwag JWT project with unique key/case identities. Existing work was retained.",
    "jwtStudio.error.case":
      "Use a valid verification case with a name, token and expected accepted/rejected outcome.",
    "jwtStudio.finding.format": "Unsupported or malformed compact JWT.",
    "jwtStudio.finding.encoding": "Invalid base64url or UTF-8 encoding.",
    "jwtStudio.finding.json": "Invalid header or claims JSON.",
    "jwtStudio.finding.limit": "A token/key processing limit was exceeded.",
    "jwtStudio.finding.algorithm":
      "Algorithm is unsupported or not allowed by policy.",
    "jwtStudio.finding.key":
      "Supplied verification key is invalid or incompatible.",
    "jwtStudio.finding.key-usage":
      "Supplied key usage does not permit verification.",
    "jwtStudio.finding.missing-key": "No matching supplied verification key.",
    "jwtStudio.finding.ambiguous-key":
      "Multiple supplied keys match; choose one explicitly.",
    "jwtStudio.finding.header":
      "Invalid or unsupported protected-header extension.",
    "jwtStudio.finding.crypto":
      "Cryptographic verification could not complete.",
    "jwtStudio.finding.policy": "Verification policy is invalid.",
    "jwtStudio.finding.project": "Project input is invalid.",
    "jwtStudio.finding.case": "Case input is invalid.",
    "jwtStudio.finding.signature": "Signature verification failed.",
    "jwtStudio.finding.claim-type": "Registered claim has the wrong JSON type.",
    "jwtStudio.finding.expired": "Token has expired.",
    "jwtStudio.finding.not-active": "Token is not active yet.",
    "jwtStudio.finding.issued-future": "Token was issued in the future.",
    "jwtStudio.finding.expiration-required":
      "Policy requires an expiration claim.",
    "jwtStudio.finding.issued-at-required":
      "Maximum-age policy requires an issued-at claim.",
    "jwtStudio.finding.too-old": "Token exceeds the maximum permitted age.",
    "jwtStudio.finding.issuer": "Issuer does not match policy.",
    "jwtStudio.finding.audience": "Audience does not match policy.",
    "jwtStudio.finding.subject": "Subject does not match policy.",
    "jwtStudio.finding.type": "Token type does not match policy.",
    "wsStudio.title": "WebSocket session studio",
    "wsStudio.description":
      "Explore bidirectional APIs with live text, JSON and binary messages, reusable conversations, offline replay, captures and searchable transcripts.",
    "wsStudio.help":
      "Connections start only with Connect or Run live conversation. Work stays in this tab, including while the panel is closed; disconnect to stop an interactive session. Download a project before leaving. This studio works independently of the OpenAPI editor.",
    "wsStudio.loading": "Reading WebSocket file…",
    "wsStudio.project": "WebSocket project",
    "wsStudio.projectName": "WebSocket project name",
    "wsStudio.newProject": "New WebSocket project",
    "wsStudio.demo": "Load realtime conversation demo",
    "wsStudio.demoLoaded":
      "Demo loaded. Replay it offline or configure your own compatible WebSocket endpoint.",
    "wsStudio.importProject": "Restore WebSocket project (JSON)",
    "wsStudio.importTranscript": "Import WebSocket transcript (JSON)",
    "wsStudio.projectLoaded":
      "WebSocket project restored without connections or imported run results.",
    "wsStudio.transcriptLoaded":
      "Transcript loaded without sending messages or opening a connection.",
    "wsStudio.exportProject": "Download WebSocket project",
    "wsStudio.connection": "Live WebSocket connection",
    "wsStudio.connectionHelp":
      "Use an explicit ws:// or wss:// URL and optional comma-separated subprotocols. The browser manages cookies and connection permissions; custom HTTP headers and protocol Ping/Pong controls are unavailable. HTTPS pages generally require wss://. There are no automatic reconnects or resends.",
    "wsStudio.url": "WebSocket URL",
    "wsStudio.protocols": "WebSocket subprotocols (comma-separated)",
    "wsStudio.connectTimeout": "Connection timeout (ms)",
    "wsStudio.connectionStatus":
      "Connection: {status}; negotiated protocol: {protocol}",
    "wsStudio.state.closed": "closed",
    "wsStudio.state.connecting": "connecting",
    "wsStudio.state.open": "open",
    "wsStudio.state.closing": "closing",
    "wsStudio.cleanClose": "clean close",
    "wsStudio.uncleanClose": "unclean close",
    "wsStudio.connect": "Connect WebSocket",
    "wsStudio.disconnect": "Disconnect WebSocket",
    "wsStudio.composerFormat": "Outgoing message format",
    "wsStudio.composer": "Outgoing WebSocket message",
    "wsStudio.send": "Send WebSocket message",
    "wsStudio.sent":
      "Message queued for transmission. This does not confirm server processing.",
    "wsStudio.format.json": "JSON",
    "wsStudio.format.text": "Text",
    "wsStudio.format.binary": "Binary (base64)",
    "wsStudio.format.any": "Any format",
    "wsStudio.conversations": "Reusable WebSocket conversations",
    "wsStudio.conversationHelp":
      "Order send, expect and pause steps. JSON Pointer checks use the existing assertion operators; captures become variables for later steps. Whole JSON string placeholders such as {{taskId}} retain the captured value's type. Text substitutions accept scalar values. Save or discard pending edits before switching context or running.",
    "wsStudio.selectedConversation": "Selected WebSocket conversation",
    "wsStudio.conversationName": "Conversation name",
    "wsStudio.addConversation": "Add conversation",
    "wsStudio.duplicateConversation": "Duplicate conversation",
    "wsStudio.removeConversation": "Remove conversation",
    "wsStudio.selectedStep": "Selected conversation step",
    "wsStudio.newStep": "New conversation step",
    "wsStudio.type.send": "Send",
    "wsStudio.type.expect": "Expect",
    "wsStudio.type.pause": "Pause",
    "wsStudio.add.send": "Add send step",
    "wsStudio.add.expect": "Add expect step",
    "wsStudio.add.pause": "Add pause step",
    "wsStudio.move.up": "Move step up",
    "wsStudio.move.down": "Move step down",
    "wsStudio.removeStep": "Remove conversation step",
    "wsStudio.stepName": "Conversation step name",
    "wsStudio.stepFormat": "Step message format",
    "wsStudio.stepPayload": "Step message payload",
    "wsStudio.template": "Substitute conversation variables in this step",
    "wsStudio.pauseMs": "Pause duration (ms)",
    "wsStudio.receiveTimeout": "Receive deadline (ms)",
    "wsStudio.matchMode": "Receive matching policy",
    "wsStudio.match.next": "Check next message",
    "wsStudio.match.matching": "Skip unrelated messages until a match",
    "wsStudio.textMode": "Text / base64 comparison",
    "wsStudio.text.any": "No text comparison",
    "wsStudio.text.equals": "Equals",
    "wsStudio.text.contains": "Contains",
    "wsStudio.expectedText": "Expected text / base64",
    "wsStudio.checks": "Message JSON Pointer checks (JSON array)",
    "wsStudio.checksHelp":
      'Example: [{"name":"Event type","target":"body","path":"/type","operator":"equals","expected":"\\\"task\\\""}]. Operators: exists, absent, equals (JSON), contains, type, length, gte, lte. An empty pointer checks the entire JSON message; escape / as ~1 and ~ as ~0.',
    "wsStudio.captures": "Captured variables (JSON array)",
    "wsStudio.capturesHelp":
      'Example: [{"name":"taskId","pointer":"/task/id"}]. Capture requires a JSON message and an existing own field. Names contain letters, numbers and underscores and cannot start with a number. Later captures can replace earlier variables.',
    "wsStudio.dirtyStep":
      "This step has unsaved edits. Save or discard them before navigating, importing, exporting the project or running.",
    "wsStudio.saveStep": "Save conversation step",
    "wsStudio.discardStep": "Discard step edits",
    "wsStudio.stepSaved": "Conversation step saved.",
    "wsStudio.discarded": "Step edits discarded.",
    "wsStudio.replaySettings": "Variables and offline replay",
    "wsStudio.variables": "Initial conversation variables (JSON object)",
    "wsStudio.fixtures": "Incoming replay messages (JSON array)",
    "wsStudio.fixturesHelp":
      'Fixtures use {"format":"json","data":"..."}, text, or canonical binary base64. Replay consumes them in order and records outgoing messages locally. Pauses advance replay time without waiting. Fixtures do not simulate a server or prove live timing and behavior.',
    "wsStudio.dirtySettings":
      "Variables or fixtures have unsaved edits. Save or discard them before editing steps, navigating, exporting the project or running.",
    "wsStudio.saveSettings": "Save replay settings",
    "wsStudio.discardSettings": "Discard replay settings edits",
    "wsStudio.settingsSaved": "Variables and replay messages saved.",
    "wsStudio.execution": "Run WebSocket conversation",
    "wsStudio.executionHelp":
      "Offline replay uses saved incoming messages. A live run opens a fresh connection, executes the selected conversation and closes it afterward. Disconnect any interactive session first. The first failing step stops the run; remaining steps are skipped. A matching receive shares one deadline across all skipped messages.",
    "wsStudio.replay": "Replay conversation offline",
    "wsStudio.runLive": "Run live WebSocket conversation",
    "wsStudio.cancel": "Cancel WebSocket conversation",
    "wsStudio.running": "Conversation running…",
    "wsStudio.exportReport": "Download value-free conversation report",
    "wsStudio.runSummary": "{mode}: {status} · {duration} ms",
    "wsStudio.receivedCount": "received {received}, skipped {skipped}",
    "wsStudio.mode.live": "Live conversation",
    "wsStudio.mode.replay": "Offline replay",
    "wsStudio.result.passed": "passed",
    "wsStudio.result.failed": "failed",
    "wsStudio.result.cancelled": "cancelled",
    "wsStudio.result.skipped": "skipped",
    "wsStudio.transcript": "WebSocket message transcript",
    "wsStudio.transcriptHelp":
      "The latest session/replay replaces the previous transcript. Retention is limited to 200 messages and 256 KiB of encoded payload text; the list displays the latest 50 matches. Project and transcript files include your configured URL, variables or message values as applicable. Reports contain step outcomes and counts without URLs, payloads or captured values.",
    "wsStudio.search": "Search WebSocket messages",
    "wsStudio.direction": "Message direction filter",
    "wsStudio.direction.all": "Both directions",
    "wsStudio.direction.send": "Sent",
    "wsStudio.direction.receive": "Received",
    "wsStudio.formatFilter": "Message format filter",
    "wsStudio.messageCount":
      "{count} matching retained messages; {dropped} older messages dropped.",
    "wsStudio.selectMessage": "Select WebSocket message {sequence}",
    "wsStudio.messagePreview":
      "Selected message preview (first 16,000 characters)",
    "wsStudio.composeSelected": "Copy selected message to composer",
    "wsStudio.recordConversation": "Create conversation from transcript",
    "wsStudio.recorded":
      "Transcript saved as an editable conversation with exact message checks and incoming replay fixtures. Review dynamic fields before live reuse.",
    "wsStudio.useFixtures": "Use received messages as replay fixtures",
    "wsStudio.fixturesSaved": "Received messages saved as replay fixtures.",
    "wsStudio.exportTranscript": "Download WebSocket transcript",
    "wsStudio.exportNdjson": "Download WebSocket messages (NDJSON)",
    "wsStudio.clearTranscript": "Clear WebSocket transcript",
    "wsStudio.downloaded": "Download started.",
    "wsStudio.downloadFailed": "Download was blocked. Try again.",
    "wsStudio.error.project":
      "Use a valid RSSwag WebSocket project with at least one conversation; the previous work was retained.",
    "wsStudio.error.connection":
      "The WebSocket connection could not be used. Check the URL, server, origin permissions, subprotocols and browser connection restrictions.",
    "wsStudio.error.url":
      "Use an explicit ws:// or wss:// URL without embedded credentials, whitespace or a fragment.",
    "wsStudio.error.protocol":
      "Use up to 10 distinct valid WebSocket subprotocol tokens.",
    "wsStudio.error.message":
      "Use a supported text, JSON or binary message/transcript.",
    "wsStudio.error.json":
      "Use bounded JSON with finite numbers and safe integers; JSON checks and captures require a JSON message.",
    "wsStudio.error.binary": "Use canonical padded base64 for binary messages.",
    "wsStudio.error.limit":
      "A WebSocket message, project, transcript, conversation or processing limit was exceeded.",
    "wsStudio.error.step":
      "Save a valid conversation step and include at least one step before running.",
    "wsStudio.error.check":
      "Use valid body JSON Pointer assertion rules with supported operators and expected values.",
    "wsStudio.error.variable":
      "Use declared/captured variables and valid names; only exact JSON placeholders accept object/array values.",
    "wsStudio.error.pointer":
      "Use a valid JSON Pointer to an existing own field; inherited object fields are unavailable.",
    "wsStudio.error.closed": "The WebSocket connection is closed.",
    "wsStudio.error.timeout": "The connection or receive deadline expired.",
    "wsStudio.error.buffer":
      "The WebSocket send buffer or incoming conversation queue is full.",
    "wsStudio.error.cancelled": "The WebSocket operation was cancelled.",
    "wsStudio.error.exhausted":
      "No incoming replay messages remain for this expect step.",
    "wsStudio.error.mismatch":
      "The next message did not satisfy this step's format or checks.",
    "designer.title": "API design studio",
    "designer.description":
      "Create and edit REST contracts with forms for operations, parameters, payloads, reusable models and authentication; keep a reversible draft and review changes before updating the editor.",
    "designer.help":
      "Work in an independent OpenAPI 3.0–3.2 draft. Source capture, imports, and form saves do not change the main editor. Save or discard unfinished form edits before navigating or exporting; download a project before leaving the page.",
    "designer.loading": "Reading API design file…",
    "designer.imports": "Design source imports",
    "designer.importContract": "Import design OpenAPI (JSON/YAML)",
    "designer.importProject": "Restore API design project (JSON)",
    "designer.new": "Start new OpenAPI 3.1 draft",
    "designer.created": "New API draft created.",
    "designer.demo": "Load task-board design demo",
    "designer.demoLoaded": "Task-board API design loaded.",
    "designer.capture": "Capture editor into API designer",
    "designer.source": "OpenAPI source to load into designer",
    "designer.load": "Load OpenAPI into designer",
    "designer.loaded": "OpenAPI contract loaded into the design draft.",
    "designer.restored":
      "API design project restored. Prepare a fresh editor preview before applying.",
    "designer.discardSource": "Discard import source edits",
    "designer.sourceDirty":
      "Import source has unvalidated edits. Load it or discard those edits to continue designing and exporting.",
    "designer.projectName": "API design project name",
    "designer.summary":
      "OpenAPI {version}: {operations} editable operations, {models} models.",
    "designer.undo": "Undo draft change",
    "designer.redo": "Redo draft change",
    "designer.undone": "Draft change undone.",
    "designer.redone": "Draft change redone.",
    "designer.context": "Choose design context",
    "designer.operationSearch": "Search designer operations",
    "designer.operation": "Selected designer operation",
    "designer.model": "Selected reusable model",
    "designer.newOperation": "New operation",
    "designer.newModel": "New model",
    "designer.editor": "Design form",
    "designer.editor.info": "API information",
    "designer.editor.server": "Add server",
    "designer.editor.operation": "Operation metadata",
    "designer.editor.parameter": "Operation parameters",
    "designer.editor.payload": "Request / response payload",
    "designer.editor.model": "Reusable model schema",
    "designer.editor.property": "Model properties",
    "designer.editor.security": "Operation authentication",
    "designer.apiTitle": "API title",
    "designer.apiVersion": "API version",
    "designer.apiDescription": "API description",
    "designer.serverUrl": "New server URL",
    "designer.serverDescription": "New server description",
    "designer.serverHelp":
      "Append a concrete HTTP(S) or relative server URL. Existing server order, defaults, variables and metadata are preserved; templated server definitions can be edited in the raw editor.",
    "designer.path": "Operation path",
    "designer.method": "Operation method",
    "designer.operationSummary": "Operation summary",
    "designer.operationId": "Operation identifier",
    "designer.tags": "Operation tags (comma-separated)",
    "designer.operationDescription": "Operation description",
    "designer.deprecated": "Operation is deprecated",
    "designer.operationHelp":
      "Existing paths, methods and established operation identifiers stay fixed. New operations get a 200 response and any missing required string path parameters. Metadata edits retain schemas, examples, security, links, callbacks, extensions and sibling methods.",
    "designer.selectOperation": "Select or create an operation first.",
    "designer.parameter": "Selected operation parameter",
    "designer.newParameter": "New parameter",
    "designer.inherited":
      "{count} path-level parameters are retained unchanged.",
    "designer.referenceHelp":
      "Referenced objects and content-based parameters stay intact. Property forms require an inline object model. Edit other definitions through complete schema JSON or the existing editor/tools.",
    "designer.parameterName": "Parameter name",
    "designer.parameterLocation": "Parameter location",
    "designer.parameterDescription": "Parameter description",
    "designer.required": "Required",
    "designer.parameterSchema": "Parameter schema JSON",
    "designer.payloadKind": "Payload direction",
    "designer.request": "Request body",
    "designer.response": "Response body",
    "designer.responseStatus": "Response status / default",
    "designer.mediaType": "Payload media type",
    "designer.payloadDescription": "Payload description",
    "designer.payloadSchema": "Payload schema JSON",
    "designer.modelName": "Reusable model name",
    "designer.modelSchema": "Model schema JSON",
    "designer.modelHelp":
      "Save a new component or explicitly replace this model's JSON schema. For a focused property change, use the Model properties form to retain other properties and model metadata.",
    "designer.selectModel": "Select or create a reusable model first.",
    "designer.property": "Selected model property",
    "designer.newProperty": "New property",
    "designer.propertyName": "Property name",
    "designer.propertySchema": "Property schema JSON",
    "designer.templateType": "Schema template type",
    "designer.templateModel": "Referenced / array item model",
    "designer.noModel": "No model (arrays use string items)",
    "designer.templateEnum": "Template enum (JSON array, optional)",
    "designer.templateFormat": "Template format (optional)",
    "designer.nullable": "Allow null",
    "designer.buildSchema": "Build schema draft",
    "designer.schemaHelp":
      "Building a template explicitly replaces this schema text. Review JSON before saving. Advanced constraints, compositions, nested models and references can be written here; this studio does not fully certify JSON Schema.",
    "designer.type.string": "String",
    "designer.type.integer": "Integer",
    "designer.type.number": "Number",
    "designer.type.boolean": "Boolean",
    "designer.type.object": "Object",
    "designer.type.array": "Array",
    "designer.type.reference": "Model reference",
    "designer.securityHelp":
      "Authentication changes are explicit and separate from operation metadata. Choose inheritance, public access, or JSON security requirements using declared schemes. Existing complex requirements remain available in the JSON form.",
    "designer.securityMode": "Operation security policy",
    "designer.security.inherit": "Inherit API security",
    "designer.security.public": "Public (empty requirements)",
    "designer.security.custom": "Custom requirements JSON",
    "designer.securityJson": "Security requirements JSON",
    "designer.securitySchemes": "Declared security schemes",
    "designer.formDirty":
      "This form has unsaved changes. Save to the design draft or discard them before navigating, exporting or preparing an editor update.",
    "designer.saveForm": "Save form to design draft",
    "designer.saved": "Form saved to the design draft.",
    "designer.discardForm": "Discard form edits",
    "designer.discarded": "Form edits discarded.",
    "designer.publish": "Review and use the API design",
    "designer.publishHelp":
      "Downloads and editor updates use saved draft changes only. Prepare a fresh preview, review changed pointers and reference counts, then apply. Apply and editor undo stop if the editor changed since the preview or update. Reference counts and parsing are advisory, not complete OpenAPI certification.",
    "designer.exportFormat": "API design output format",
    "designer.downloadContract": "Download designed OpenAPI",
    "designer.downloadProject": "Download API design project",
    "designer.prepare": "Prepare API design editor preview",
    "designer.prepared": "Editor preview prepared. Review it before applying.",
    "designer.apply": "Apply API design to editor",
    "designer.applied": "API design applied to the editor.",
    "designer.undoEditor": "Undo API design editor update",
    "designer.editorUndone": "Previous editor text restored.",
    "designer.reviewSummary":
      "{changes} listed changes; {operations} operations, {models} models, {broken} broken and {external} external references.",
    "designer.replaceInvalid":
      "The current editor text is invalid; applying this reviewed draft will replace it.",
    "designer.change.added": "Added",
    "designer.change.removed": "Removed",
    "designer.change.changed": "Changed",
    "designer.truncated": "The change list is limited to 200 entries.",
    "designer.preview": "API design preview (first 16,000 characters)",
    "designer.downloadReview": "Download value-free API design review",
    "designer.downloaded": "Download started.",
    "designer.downloadFailed": "Download was blocked. Try again.",
    "designer.error.source":
      "Use a valid local OpenAPI contract, nonempty API title/version, or concrete HTTP(S)/relative server URL.",
    "designer.error.version":
      "The designer supports OpenAPI 3.0–3.2. Use the existing upgrade tool for Swagger 2.",
    "designer.error.limit":
      "A design file, schema, history or processing limit was exceeded.",
    "designer.error.operation":
      "Choose an existing operation or a valid new HTTP operation; existing paths, methods and established identifiers stay fixed.",
    "designer.error.exists":
      "That operation, identifier, model, property, parameter or server already exists.",
    "designer.error.path":
      "Use a valid /path with well-formed template names and no equivalent existing template route.",
    "designer.error.schema":
      "Use valid schema-object JSON; boolean schemas require OpenAPI 3.1 or later.",
    "designer.error.model":
      "Choose a valid reusable model/property and avoid changing a referenced or non-object model through the property form.",
    "designer.error.parameter":
      "Use a valid parameter. Path parameters must match the operation path.",
    "designer.error.payload":
      "Use a valid media type and response status/description.",
    "designer.error.reference":
      "This referenced/content-based object stays intact. Edit its reusable or advanced definition in the existing tools.",
    "designer.error.security":
      "Use JSON requirement objects with declared schemes and arrays of scope strings.",
    "designer.error.project": "Invalid API design project or project name.",
    "designer.error.stale":
      "The editor or design changed. Prepare a new preview; undo only works while the editor still matches the last applied output.",
    "designer.error.file": "Could not read the design file.",
    "mappingStudio.direction.request": "request",
    "mappingStudio.direction.response": "response",
    "mappingStudio.root": "(root)",
    "mappingStudio.patternHelp":
      "Contract pattern checks support a conservative subset of anchored expressions. Complex or unsupported patterns are skipped and marked partial; they remain in the saved OpenAPI snapshot.",
    "mappingStudio.title": "Payload mapping studio",
    "mappingStudio.description":
      "Build reusable JSON adapters between API shapes, inspect each stage, validate against OpenAPI contracts, and export a standalone mapper.",
    "mappingStudio.help":
      "Mappings, examples, and OpenAPI snapshots stay in this panel until downloaded. Execution is local and never changes the editor or sends requests.",
    "mappingStudio.loading": "Reading mapping file…",
    "mappingStudio.name": "Mapping recipe name",
    "mappingStudio.demo": "Load customer mapping demo",
    "mappingStudio.demoLoaded":
      "Customer adapter, two stages, and a regression case loaded.",
    "mappingStudio.import.project": "Restore mapping project (JSON)",
    "mappingStudio.import.recipe": "Import mapping recipe (JSON)",
    "mappingStudio.import.input": "Import mapping input (JSON)",
    "mappingStudio.import.contract": "Import mapping OpenAPI snapshot",
    "mappingStudio.imported.project":
      "Mapping project restored; run it again to generate results.",
    "mappingStudio.imported.recipe":
      "Mapping recipe imported; current examples and contract are retained.",
    "mappingStudio.imported.input": "Mapping input imported.",
    "mappingStudio.imported.contract": "OpenAPI snapshot imported.",
    "mappingStudio.export.recipe": "Download mapping recipe",
    "mappingStudio.export.project": "Download mapping project",
    "mappingStudio.export.module": "Download JavaScript mapper",
    "mappingStudio.export.output": "Download selected output",
    "mappingStudio.export.report": "Download value-free mapping report",
    "mappingStudio.export.cases": "Download value-free case report",
    "mappingStudio.downloaded": "Download started.",
    "mappingStudio.downloadFailed": "Download was blocked. Try again.",
    "mappingStudio.pipeline": "Mapping pipeline",
    "mappingStudio.pipelineHelp":
      "Stages read the previous stage's output. Rules within a stage read the same input. Select an empty object/array or preserve that input, then write fields. Source and target patterns can each contain one * array segment; rows keep their positions. Overlapping writes are rejected.",
    "mappingStudio.count": "{stages}/12 stages, {rules}/200 rules.",
    "mappingStudio.stage": "Selected mapping stage",
    "mappingStudio.disabled": "disabled",
    "mappingStudio.addStage": "Add mapping stage",
    "mappingStudio.removeStage": "Remove mapping stage",
    "mappingStudio.stageUp": "Move stage earlier",
    "mappingStudio.stageDown": "Move stage later",
    "mappingStudio.stageName": "Mapping stage name",
    "mappingStudio.base": "Stage starting shape",
    "mappingStudio.base.object": "Empty object",
    "mappingStudio.base.array": "Empty array",
    "mappingStudio.base.input": "Preserve stage input",
    "mappingStudio.enableStage": "Enable mapping stage",
    "mappingStudio.ruleSearch": "Search mapping rules",
    "mappingStudio.rules": "Mapping rules",
    "mappingStudio.addRule": "Add mapping rule",
    "mappingStudio.removeRule": "Remove mapping rule",
    "mappingStudio.ruleUp": "Move rule earlier",
    "mappingStudio.ruleDown": "Move rule later",
    "mappingStudio.sourcePointer": "Source pointer / array pattern",
    "mappingStudio.targetPointer": "Target pointer / array pattern",
    "mappingStudio.operator": "Mapping conversion",
    "mappingStudio.operator.copy": "Copy JSON value",
    "mappingStudio.operator.constant": "Constant JSON value",
    "mappingStudio.operator.string": "Convert to string",
    "mappingStudio.operator.number": "Convert to number",
    "mappingStudio.operator.integer": "Convert to integer",
    "mappingStudio.operator.boolean": "Convert to boolean",
    "mappingStudio.operator.trim": "Trim string",
    "mappingStudio.operator.lower": "Lowercase string",
    "mappingStudio.operator.upper": "Uppercase string",
    "mappingStudio.operator.length": "Count items / characters / keys",
    "mappingStudio.operator.join": "Join array values",
    "mappingStudio.operator.split": "Split string",
    "mappingStudio.missing": "Missing source policy",
    "mappingStudio.missing.error": "Fail mapping",
    "mappingStudio.missing.omit": "Omit this write",
    "mappingStudio.missing.default": "Use default JSON value",
    "mappingStudio.literal": "Constant / default value (JSON)",
    "mappingStudio.argument": "Join / split separator",
    "mappingStudio.enableRule": "Enable mapping rule",
    "mappingStudio.contract": "Optional OpenAPI contract checks",
    "mappingStudio.contractHelp":
      "Load a local contract and select an input/output model or JSON operation body. Checks are advisory and respect request/response direction. External references and unsupported constraints produce partial results; no reference is fetched. The generated mapper includes mapping only, without these contract checks.",
    "mappingStudio.contractSource": "Mapping OpenAPI snapshot source",
    "mappingStudio.capture": "Capture editor OpenAPI for mapping",
    "mappingStudio.loadContract": "Load mapping OpenAPI snapshot",
    "mappingStudio.clearContract": "Clear mapping contract bindings",
    "mappingStudio.contractLoaded":
      "OpenAPI snapshot and schema choices loaded.",
    "mappingStudio.dirty":
      "The contract source has unvalidated changes. Load it or clear bindings before running mappings or downloading a project.",
    "mappingStudio.bindingCount": "{count} schema choices",
    "mappingStudio.inputBinding": "Mapping input schema",
    "mappingStudio.outputBinding": "Mapping output schema",
    "mappingStudio.noBinding": "No contract check",
    "mappingStudio.rehearsal": "Local mapping rehearsal",
    "mappingStudio.input": "Mapping input JSON",
    "mappingStudio.pointers": "Input pointer inventory (first 300)",
    "mappingStudio.pointerHelp":
      "Pointers use / for nesting, ~0 for ~, and ~1 for /. Empty pointer selects the root. * is this studio's array extension; literal * property names cannot be addressed. This inventory shows the first three elements of each array and does not include values.",
    "mappingStudio.run": "Run payload mapping",
    "mappingStudio.finished":
      "Payload mapping completed. Review the contract checks below.",
    "mappingStudio.runSummary":
      "{stages} stages executed, {steps} processing steps.",
    "mappingStudio.inputValidation": "Input contract",
    "mappingStudio.outputValidation": "Output contract",
    "mappingStudio.validation.none": "Not selected",
    "mappingStudio.validation.valid": "Passed supported checks",
    "mappingStudio.validation.warning": "Passed with warnings",
    "mappingStudio.validation.invalid": "Contract issues",
    "mappingStudio.validation.partial": "Partial checks",
    "mappingStudio.severity.error": "error",
    "mappingStudio.severity.warning": "warning",
    "mappingStudio.previewStage": "Inspect mapping stage output",
    "mappingStudio.finalOutput": "Final mapped output",
    "mappingStudio.output": "Mapping output (first 16,000 characters)",
    "mappingStudio.trace": "Mapping rule execution counts",
    "mappingStudio.ruleSummary":
      "{mapped} writes, {omitted} omitted, {defaults} defaults.",
    "mappingStudio.cases": "Mapping regression cases",
    "mappingStudio.casesHelp":
      "Save the current input, optionally capturing its current output as an expected result. Cases run independently against the active recipe and contract. Expected JSON compares structure and values, ignoring object-key order. Editing cases or recipes clears old results.",
    "mappingStudio.caseCount": "{count}/{max} saved mapping cases.",
    "mappingStudio.newCaseName": "New mapping case name",
    "mappingStudio.saveCase": "Save current input as mapping case",
    "mappingStudio.caseSaved": "Mapping case saved in this project.",
    "mappingStudio.runCases": "Run all mapping cases",
    "mappingStudio.casesFinished": "Mapping cases completed.",
    "mappingStudio.selectedCase": "Selected mapping case",
    "mappingStudio.caseName": "Saved mapping case name",
    "mappingStudio.caseInput": "Saved case input JSON",
    "mappingStudio.expected": "Expected mapped output JSON",
    "mappingStudio.compareExpected": "Compare expected mapped output",
    "mappingStudio.loadCase": "Load saved case input",
    "mappingStudio.captureExpected": "Use current output as case expectation",
    "mappingStudio.removeCase": "Remove mapping case",
    "mappingStudio.casesSummary":
      "{passed} passed, {failed} failed, {partial} partial.",
    "mappingStudio.caseStatus.passed": "Passed",
    "mappingStudio.caseStatus.failed": "Failed",
    "mappingStudio.caseStatus.partial": "Partial",
    "mappingStudio.expectedStatus.none": "No expected-output check",
    "mappingStudio.expectedStatus.match": "Expected output matches",
    "mappingStudio.expectedStatus.mismatch": "Expected output differs",
    "mappingStudio.inspectCase": "Inspect mapping case result",
    "mappingStudio.caseOutput": "Mapping case output (first 16,000 characters)",
    "mappingStudio.error.limit":
      "A mapping file, payload, or processing limit was exceeded.",
    "mappingStudio.error.input":
      "Use valid JSON with finite numbers and safe integers.",
    "mappingStudio.error.pointer":
      "Invalid pointer or array pattern. Use at most one * in both source and target.",
    "mappingStudio.error.recipe":
      "Invalid mapping recipe, stage, rule, or identifier.",
    "mappingStudio.error.literal":
      "Constant/default values must contain valid JSON.",
    "mappingStudio.error.collision":
      "Enabled rules have overlapping target paths.",
    "mappingStudio.error.missing":
      "A required source value or array is missing.",
    "mappingStudio.error.array": "The wildcard source must select an array.",
    "mappingStudio.error.target":
      "The target shape is incompatible or would create sparse/misaligned arrays.",
    "mappingStudio.error.conversion":
      "The source cannot be converted with this operator.",
    "mappingStudio.error.project": "Invalid mapping project or saved case.",
    "mappingStudio.error.source":
      "Use a valid local OpenAPI JSON/YAML contract.",
    "mappingStudio.error.binding":
      "A selected schema is missing from the loaded contract.",
    "mappingStudio.error.case":
      "Provide a name and valid JSON for the mapping case.",
    "protoStudio.codecNote":
      "Proto3 implicit defaults may disappear during binary normalization. Unknown enum numbers are accepted for proto3 open enums; proto2 closed enums reject them in JSON and discard them on decode. Non-finite floating-point values are unsupported in this JSON editor.",
    "protoStudio.import.folder": "Import .proto project folder",
    "protoStudio.explicit": "explicit presence",
    "protoStudio.implicit": "implicit presence",
    "protoStudio.title": "Protocol Buffers and gRPC studio",
    "protoStudio.description":
      "Explore .proto projects, validate JSON messages, inspect binary payloads, rehearse RPC exchanges, and review contract evolution.",
    "protoStudio.help":
      "Everything runs locally. Add/import proto2 or proto3 files, choose an entry file, and load the contract. Projects stay in memory until you download them; the OpenAPI editor is independent.",
    "protoStudio.import.files": "Import .proto files (multiple)",
    "protoStudio.import.project": "Restore Protobuf project (JSON)",
    "protoStudio.importHelp":
      "Imports merge files by path, replacing matching files. Missing strong imports block loading; supported Google well-known types are bundled. Only the entry file and its dependencies are compiled.",
    "protoStudio.projectName": "Protobuf project name",
    "protoStudio.loading": "Reading Protobuf files…",
    "protoStudio.demo": "Load demo Protobuf contract",
    "protoStudio.capture": "Read editor into selected .proto file",
    "protoStudio.load": "Load and validate Protobuf contract",
    "protoStudio.file": "Selected .proto file",
    "protoStudio.entry": "Entry .proto file",
    "protoStudio.source": "Selected .proto source",
    "protoStudio.newPath": "New .proto file path",
    "protoStudio.addFile": "Add .proto file",
    "protoStudio.removeFile": "Remove selected .proto file",
    "protoStudio.dirty":
      "Files have unvalidated changes. Load the contract before using its tools; the previous contract and saved exchanges are retained.",
    "protoStudio.loaded": "Protobuf contract loaded.",
    "protoStudio.demoLoaded": "Demo contract and RPC draft loaded.",
    "protoStudio.imported":
      "Files imported. Select the entry file and load the contract.",
    "protoStudio.restored":
      "Protobuf project restored; results must be generated again.",
    "protoStudio.summary":
      "{types} types, {fields} fields, {methods} RPC methods, {files} project files.",
    "protoStudio.tools": "Protobuf contract tools",
    "protoStudio.export.file": "Download selected .proto",
    "protoStudio.export.inventory": "Download Protobuf inventory",
    "protoStudio.export.descriptor": "Download protobuf.js reflection JSON",
    "protoStudio.export.project": "Download Protobuf project",
    "protoStudio.export.codec": "Download codec results",
    "protoStudio.export.exchange": "Download RPC exchange and frames",
    "protoStudio.export.report": "Download value-free rehearsal report",
    "protoStudio.export.comparison": "Download compatibility report",
    "protoStudio.downloaded": "Download started.",
    "protoStudio.downloadFailed": "Download was blocked. Try again.",
    "protoStudio.imports": "Local import resolution (first 100)",
    "protoStudio.builtin": "(bundled Google type)",
    "protoStudio.weakMissing": "(missing weak import)",
    "protoStudio.explorer": "Explore Protobuf types and dependencies",
    "protoStudio.search": "Search Protobuf types and fields",
    "protoStudio.kind": "Filter Protobuf type kind",
    "protoStudio.kind.all": "All types",
    "protoStudio.kind.message": "Message",
    "protoStudio.kind.enum": "Enum",
    "protoStudio.types": "Protobuf types",
    "protoStudio.noTypes": "No matching Protobuf types.",
    "protoStudio.previous": "Previous",
    "protoStudio.next": "Next",
    "protoStudio.page": "Page {page}/{total}",
    "protoStudio.dependencies": "Protobuf type dependencies",
    "protoStudio.fields": "Protobuf fields",
    "protoStudio.number": "Tag",
    "protoStudio.fieldName": "Field",
    "protoStudio.fieldType": "Type",
    "protoStudio.rules": "Presence / cardinality",
    "protoStudio.required": "required",
    "protoStudio.repeated": "repeated",
    "protoStudio.reserved": "Reserved names / ranges",
    "protoStudio.codec": "Protobuf message codec",
    "protoStudio.codecHelp":
      "JSON uses field names as written in .proto, decimal strings for 64-bit integers, enum names or int32 numbers, and canonical base64 bytes. Omit unset fields; null, unknown fields, and multiple oneof members are rejected. Google well-known types use their ordinary message fields, not special ProtoJSON representations. Unknown wire fields are discarded. Frames must be complete and uncompressed.",
    "protoStudio.codecType": "Codec message type",
    "protoStudio.depth": "Sample nesting depth",
    "protoStudio.payload": "Protobuf JSON message",
    "protoStudio.format": "Binary text format",
    "protoStudio.binary": "Protobuf binary or gRPC frames",
    "protoStudio.action.sample": "Generate JSON message",
    "protoStudio.action.check": "Validate JSON message",
    "protoStudio.action.encode": "Encode and round-trip message",
    "protoStudio.action.decode": "Decode binary message",
    "protoStudio.action.frames": "Decode gRPC message frames",
    "protoStudio.generated": "JSON message generated.",
    "protoStudio.valid": "JSON message matches the contract.",
    "protoStudio.invalid": "JSON message has contract issues.",
    "protoStudio.encoded": "Message encoded and decoded successfully.",
    "protoStudio.decoded": "Binary input decoded successfully.",
    "protoStudio.codecSummary":
      "{messages} decoded messages, {bytes} payload bytes.",
    "protoStudio.codecOutput": "Codec results (first 16,000 characters)",
    "protoStudio.issues": "Protobuf payload issues",
    "protoStudio.issue.object": "Expected a JSON object.",
    "protoStudio.issue.unknown": "Unknown field.",
    "protoStudio.issue.required": "Required field is missing.",
    "protoStudio.issue.oneof": "Only one member of this oneof may be present.",
    "protoStudio.issue.array": "Expected an array.",
    "protoStudio.issue.map": "Expected a map object.",
    "protoStudio.issue.key": "Invalid map key.",
    "protoStudio.issue.scalar": "Invalid scalar value or range.",
    "protoStudio.issue.enum": "Expected an enum name or int32 number.",
    "protoStudio.issue.null": "Omit unset fields instead of using null.",
    "protoStudio.rpc": "Offline gRPC exchange rehearsal",
    "protoStudio.rpcHelp":
      "Generate a draft for an RPC method, then edit request and response message arrays. Unary sides require one message; streaming sides accept 1–100. Rehearsal validates, encodes, decodes, and frames each side independently. It does not run server logic, authenticate, send HTTP/2 traffic, or infer request/response ordering.",
    "protoStudio.methodSearch": "Search gRPC methods",
    "protoStudio.method": "Selected gRPC method",
    "protoStudio.noMethods": "No matching RPC methods.",
    "protoStudio.stream.unary": "Unary",
    "protoStudio.stream.client": "Client streaming",
    "protoStudio.stream.server": "Server streaming",
    "protoStudio.stream.bidi": "Bidirectional streaming",
    "protoStudio.generateExchange": "Generate RPC exchange draft",
    "protoStudio.exchangeGenerated": "RPC exchange draft generated.",
    "protoStudio.caseName": "RPC exchange name",
    "protoStudio.draftMethod": "Draft RPC method",
    "protoStudio.requests": "RPC request messages (JSON array)",
    "protoStudio.responses": "RPC response messages (JSON array)",
    "protoStudio.run": "Run offline RPC rehearsal",
    "protoStudio.save": "Save as new RPC exchange",
    "protoStudio.update": "Update selected RPC exchange",
    "protoStudio.rehearsed": "Offline RPC rehearsal passed.",
    "protoStudio.saved": "RPC exchange saved in this project.",
    "protoStudio.rehearsalSummary":
      "{requests} requests, {responses} responses, {bytes} framed bytes; offline checks passed.",
    "protoStudio.rehearsalOutput":
      "RPC rehearsal results (first 16,000 characters)",
    "protoStudio.library": "Saved RPC exchanges",
    "protoStudio.caseCount": "{count}/{max} saved exchanges.",
    "protoStudio.loadCase": "Load RPC exchange",
    "protoStudio.removeCase": "Remove RPC exchange",
    "protoStudio.compatibility": "Protobuf contract compatibility",
    "protoStudio.compatibilityHelp":
      "Pin the loaded contract, edit/import and load a candidate, then compare. This conservative advisory checks field tags, declared types, cardinality, required/oneof membership, enum names/numbers, and RPC signatures. Removals/renames can affect data or JSON clients even when binary readers accept them. It is not a complete protoc/Buf compatibility certification.",
    "protoStudio.pin": "Pin current Protobuf baseline",
    "protoStudio.compare": "Compare with Protobuf baseline",
    "protoStudio.clearBaseline": "Clear Protobuf baseline",
    "protoStudio.pinned": "Current contract pinned for comparison.",
    "protoStudio.baseline": "Baseline: {entry}, {fields} fields (memory only).",
    "protoStudio.comparisonSummary":
      "{errors} potentially breaking changes, {warnings} warnings, {additions} additions.",
    "protoStudio.first100":
      "First 100 changes shown; download includes all findings.",
    "protoStudio.severity.error": "Risk",
    "protoStudio.severity.warning": "Warning",
    "protoStudio.severity.info": "Addition",
    "protoStudio.change.typeRemoved": "Type removed or kind changed.",
    "protoStudio.change.methodRemoved": "RPC method removed.",
    "protoStudio.change.methodChanged":
      "RPC types or streaming signature changed.",
    "protoStudio.change.fieldRemoved":
      "Field removed; review lost data and reserve its tag.",
    "protoStudio.change.fieldReserved":
      "Field removed with its tag reserved; review lost data.",
    "protoStudio.change.fieldAdded": "Optional/repeated field added.",
    "protoStudio.change.requiredAdded": "Required field added.",
    "protoStudio.change.fieldChanged":
      "Declared type, cardinality, required flag, map key, or oneof changed.",
    "protoStudio.change.fieldRenamed":
      "Field renamed at the same tag; JSON clients may break.",
    "protoStudio.change.tagChanged": "Existing field moved to a different tag.",
    "protoStudio.change.enumRemoved": "Enum number removed.",
    "protoStudio.change.enumRenamed": "Enum name changed or renumbered.",
    "protoStudio.change.added": "New type or RPC method.",
    "protoStudio.error.schema": "Could not load this proto2/proto3 contract.",
    "protoStudio.error.import":
      "A local import is missing or cannot be resolved.",
    "protoStudio.error.path":
      "Use a unique relative .proto path within the project.",
    "protoStudio.error.limit":
      "A file, payload, binary, or processing limit was exceeded.",
    "protoStudio.error.payload":
      "Invalid JSON message for the selected Protobuf type.",
    "protoStudio.error.binary":
      "Invalid binary data for this Protobuf type or text format.",
    "protoStudio.error.frame": "Use complete uncompressed gRPC message frames.",
    "protoStudio.error.project":
      "Invalid Protobuf project. Names and JSON drafts must be valid.",
    "protoStudio.error.case":
      "RPC exchange does not match the method or message cardinality.",
    "protoStudio.error.generation":
      "This recursive required message needs a manual payload.",
    "protoStudio.error.file": "Could not read this file.",
    "graphqlStudio.error.introspection":
      "Use the dedicated schema/introspection export for __schema and __type queries. Offline fixture rehearsal supports ordinary operations and __typename.",
    "graphqlStudio.implementations": "GraphQL interface implementations",
    "graphqlStudio.title": "GraphQL contract studio",
    "graphqlStudio.description":
      "Design and explore GraphQL schemas, build reusable operations, validate documents and variables, rehearse responses locally, and export HTTP contracts for the REST workspace.",
    "graphqlStudio.help":
      "Use SDL or introspection JSON. This studio stays separate from the OpenAPI editor and makes no network requests. Load the demo or import your schema, generate an operation, then validate or rehearse it with editable JSON fixtures.",
    "graphqlStudio.loading": "Reading GraphQL file…",
    "graphqlStudio.import.schema":
      "Import GraphQL schema (SDL/introspection JSON)",
    "graphqlStudio.import.project": "Restore GraphQL studio project (JSON)",
    "graphqlStudio.import.request": "Import GraphQL HTTP request (JSON)",
    "graphqlStudio.projectName": "GraphQL project name",
    "graphqlStudio.source": "GraphQL schema source (SDL/introspection JSON)",
    "graphqlStudio.load": "Load and validate GraphQL schema",
    "graphqlStudio.demo": "Load demo GraphQL contract",
    "graphqlStudio.capture": "Read editor as GraphQL schema",
    "graphqlStudio.dirty":
      "Schema source has unvalidated changes. Load and validate it before using the operation tools; the previous schema and saved operations are retained.",
    "graphqlStudio.schemaSummary":
      "{types} types, {fields} fields, {operations} root operations; source: {format}.",
    "graphqlStudio.workspace": "GraphQL operations and exports",
    "graphqlStudio.explorer": "Explore GraphQL types and dependencies",
    "graphqlStudio.typeSearch": "Search GraphQL types and fields",
    "graphqlStudio.typeFilter": "Filter GraphQL type kind",
    "graphqlStudio.allTypes": "All type kinds",
    "graphqlStudio.type.object": "Object",
    "graphqlStudio.type.input": "Input object",
    "graphqlStudio.type.interface": "Interface",
    "graphqlStudio.type.union": "Union",
    "graphqlStudio.type.enum": "Enum",
    "graphqlStudio.type.scalar": "Scalar",
    "graphqlStudio.types": "GraphQL types",
    "graphqlStudio.noTypes": "No types match these filters.",
    "graphqlStudio.previousTypes": "Previous GraphQL types",
    "graphqlStudio.nextTypes": "Next GraphQL types",
    "graphqlStudio.previousFields": "Previous GraphQL fields",
    "graphqlStudio.nextFields": "Next GraphQL fields",
    "graphqlStudio.page": "Page {page}/{total}",
    "graphqlStudio.oneOf": "OneOf input: provide exactly one non-null field.",
    "graphqlStudio.dependencies": "GraphQL type dependencies",
    "graphqlStudio.members": "Members / implemented interfaces: {names}",
    "graphqlStudio.enumValues": "GraphQL enum values (first 100)",
    "graphqlStudio.fields": "GraphQL fields",
    "graphqlStudio.deprecated": "Deprecated",
    "graphqlStudio.default": "Default: {value}",
    "graphqlStudio.required": "required",
    "graphqlStudio.exportSdl": "Download GraphQL SDL",
    "graphqlStudio.exportIntrospection": "Download GraphQL introspection JSON",
    "graphqlStudio.exportInventory": "Download GraphQL schema inventory",
    "graphqlStudio.operationSearch": "Search GraphQL root operations",
    "graphqlStudio.operationFilter": "Filter GraphQL operation kind",
    "graphqlStudio.allOperations": "All operation kinds",
    "graphqlStudio.operation.query": "Query",
    "graphqlStudio.operation.mutation": "Mutation",
    "graphqlStudio.operation.subscription": "Subscription",
    "graphqlStudio.rootOperation": "GraphQL root operation",
    "graphqlStudio.depth": "Generated selection depth",
    "graphqlStudio.optionalArguments":
      "Include optional arguments and input fields",
    "graphqlStudio.generate": "Generate operation, variables, and fixtures",
    "graphqlStudio.generatorHelp":
      "Generation replaces the current draft. It selects up to eight nondeprecated fields per object, skips nested fields requiring arguments, uses __typename at cycles/depth limits, and supplies editable sample values. Review custom scalars and generated inputs.",
    "graphqlStudio.draftName": "GraphQL operation draft name",
    "graphqlStudio.operationName":
      "GraphQL operation name (blank for one operation)",
    "graphqlStudio.document": "GraphQL operation document",
    "graphqlStudio.variables": "GraphQL variables (JSON object)",
    "graphqlStudio.fixtures": "GraphQL root fixtures (JSON object)",
    "graphqlStudio.validate": "Validate GraphQL document and variables",
    "graphqlStudio.rehearse": "Run offline GraphQL rehearsal",
    "graphqlStudio.rehearsalHelp":
      "Fixtures provide values by actual field name; aliases, fragments, built-in directives, enum/scalar completion, and null propagation use GraphQL execution rules. Add __typename for interface/union objects. Arguments are validated but fixtures do not implement filtering, business logic, authentication, or mutation side effects. Custom scalar/directive semantics are not executed. Subscriptions can be designed and validated, but streaming transport is not simulated.",
    "graphqlStudio.checkSummary":
      "{issues} request issues, {warnings} custom-rule notes, {ignored} ignored extra variable keys.",
    "graphqlStudio.availableOperations":
      "Operation names in this document: {names}",
    "graphqlStudio.anonymous": "anonymous",
    "graphqlStudio.issues": "GraphQL request diagnostics",
    "graphqlStudio.phase.document": "Document",
    "graphqlStudio.phase.selection": "Operation selection",
    "graphqlStudio.phase.variables": "Variables",
    "graphqlStudio.warning.custom-scalar":
      "Custom scalar {name}: provide representative values; server parsing/serialization rules are not available here.",
    "graphqlStudio.warning.custom-directive":
      "Custom directive {name}: its application behavior is not simulated.",
    "graphqlStudio.response":
      "Offline GraphQL response (first 16,000 characters)",
    "graphqlStudio.exportRequest": "Download GraphQL HTTP request",
    "graphqlStudio.exportResponse": "Download offline GraphQL response",
    "graphqlStudio.exportReport": "Download GraphQL check report",
    "graphqlStudio.reportHelp":
      "Check reports omit query text, variables, fixtures, response values, and diagnostic messages. They still include operation/type/directive names and source locations. Editing a draft or schema clears previous check results.",
    "graphqlStudio.library": "Saved GraphQL operation library",
    "graphqlStudio.savedOperation": "Saved GraphQL operation",
    "graphqlStudio.chooseCase": "Choose a saved operation",
    "graphqlStudio.saveNew": "Save as new GraphQL operation",
    "graphqlStudio.updateCase": "Update selected saved operation",
    "graphqlStudio.loadCase": "Load selected saved operation into draft",
    "graphqlStudio.removeCase": "Remove selected saved operation",
    "graphqlStudio.libraryHelp":
      "{count}/50 saved operations. Saving requires a valid document/variables and JSON fixtures. Loading explicitly replaces the draft; removing a saved entry leaves the current draft. Schema refresh keeps entries, which must be checked again against the new schema.",
    "graphqlStudio.httpContract": "GraphQL HTTP contract for REST tools",
    "graphqlStudio.endpoint": "GraphQL HTTP endpoint URL",
    "graphqlStudio.bridgeFormat": "GraphQL HTTP OpenAPI output format",
    "graphqlStudio.exportBridge": "Download GraphQL HTTP OpenAPI contract",
    "graphqlStudio.bridgeHelp":
      "Exports an OpenAPI 3.1 POST contract for this validated query or mutation, with typed variables, the prepared request example, and a generic data/errors response envelope. Response selections, custom scalar rules, and authentication are not modeled. This creates no gateway or resolvers. Import the download or combine it using the API gateway composer; exporting does not change the editor.",
    "graphqlStudio.exportProject": "Download GraphQL studio project",
    "graphqlStudio.exportHelp":
      "Projects include schema source, the active draft, variables, fixtures, endpoint URL, and saved operations. Requests and response downloads include values; schema inventories include descriptions/defaults. Restored projects rebuild the schema and require fresh checks. Limits: 2 MiB schema/result/artifact, 128 KiB document/variables, 256 KiB fixtures, 8 MiB project, 50 saved operations, plus bounded nesting, tokens, fields, and rehearsal work.",
    "graphqlStudio.loaded":
      "GraphQL schema loaded; existing draft and saved operations retained.",
    "graphqlStudio.demoLoaded":
      "Demo schema loaded with an editable sample operation and fixtures.",
    "graphqlStudio.requestImported":
      "GraphQL HTTP request imported; current root fixtures retained. Validate it against the loaded schema.",
    "graphqlStudio.restored":
      "GraphQL project restored. Validate or rehearse again before exporting checked requests.",
    "graphqlStudio.generated":
      "Operation, variable values, and fixtures generated. Review and validate before use.",
    "graphqlStudio.valid":
      "Document and variables are valid for the loaded schema.",
    "graphqlStudio.invalid":
      "GraphQL request has issues; review the diagnostics below.",
    "graphqlStudio.rehearsal.success":
      "Offline GraphQL rehearsal completed with data and no execution errors.",
    "graphqlStudio.rehearsal.errors":
      "Offline GraphQL rehearsal produced execution errors. Review fixture values and nullability.",
    "graphqlStudio.rehearsal.invalid":
      "Request validation failed; no fixture execution was performed.",
    "graphqlStudio.saved": "GraphQL operation saved.",
    "graphqlStudio.caseLoaded":
      "Saved operation loaded into the current draft; fresh checks are required.",
    "graphqlStudio.caseRemoved":
      "Selected saved operation removed; current draft retained.",
    "graphqlStudio.downloaded": "GraphQL download started.",
    "graphqlStudio.error.schema":
      "Unable to load a valid GraphQL schema. Check the SDL or introspection structure and details below.",
    "graphqlStudio.error.limit":
      "GraphQL studio limits exceeded. Reduce input size, nesting, selection expansion, or fixture/output work.",
    "graphqlStudio.error.variables":
      "Variables must be a bounded JSON object with supported JSON values.",
    "graphqlStudio.error.fixtures":
      "Root fixtures must be a bounded JSON object with supported JSON values.",
    "graphqlStudio.error.generation":
      "Could not generate this operation within supported limits. Choose another field/depth or write the operation and input values manually.",
    "graphqlStudio.error.request":
      "Use a valid GraphQL request document and variables before saving or exporting. Imported HTTP requests need query text and object variables.",
    "graphqlStudio.error.subscription":
      "Subscriptions can be designed, validated, and saved, but offline execution and this HTTP export support queries and mutations only.",
    "graphqlStudio.error.endpoint":
      "Use an absolute HTTP(S) endpoint URL without credentials, query parameters, or a fragment.",
    "graphqlStudio.error.project":
      "Invalid GraphQL project. Check the format/version, names, schema source, drafts, unique saved IDs, and JSON values.",
    "graphqlStudio.error.case": "Select an existing saved GraphQL operation.",
    "graphqlStudio.error.file":
      "Unable to read the selected GraphQL file. Try selecting it again.",
    "graphqlStudio.error.download":
      "The browser blocked the GraphQL download. Try again.",
    "localeStudio.catalogHelp":
      "Catalog rows keep the source their translation was based on. currentSource (JSON) / current_source (CSV) shows today’s text. When reviewing an updated translation in a catalog, copy that text into source and set reviewed to true. The current-source column is informational; imports still verify source against the captured API.",
    "localeStudio.title": "API documentation localization studio",
    "localeStudio.description":
      "Maintain documentation in multiple languages with translation catalogs, review status, source-change tracking, and localized OpenAPI and offline HTML exports.",
    "localeStudio.help":
      "Capture or import an API, add a language, translate its documentation, then mark each translation reviewed. Routes, identifiers, references, schema constraints, and example values are preserved. Everything stays in memory until you download a file or explicitly apply an output.",
    "localeStudio.loading": "Reading localization file…",
    "localeStudio.import.source":
      "Import documentation source (OpenAPI JSON/YAML)",
    "localeStudio.import.project": "Restore localization project (JSON)",
    "localeStudio.import.catalog": "Import translation catalog (JSON/CSV)",
    "localeStudio.capture": "Capture or refresh documentation from editor",
    "localeStudio.overwrite": "Replace matching translations on catalog import",
    "localeStudio.importHelp":
      "Catalog imports merge by language and document location; existing nonempty translations are kept by default. Enable replacement to update matching rows. Other translations remain. CSV supports quoted multiline text and uses apostrophes to protect formula-like cells.",
    "localeStudio.name": "Localization project name",
    "localeStudio.inventory": "{title}: {count} documentation fields.",
    "localeStudio.sourceDetails": "Captured documentation source",
    "localeStudio.sourceText": "Captured OpenAPI documentation source",
    "localeStudio.newLocale": "New translation language code",
    "localeStudio.addLocale": "Add translation language",
    "localeStudio.localeHelp":
      "Use a language tag such as fr, ru, pt-BR, or zh-Hant. Up to 20 languages and 5,000 documentation fields. Refreshing the source retains translations; changed text becomes outdated and moved or removed locations become orphaned.",
    "localeStudio.progress": "Translation progress by language",
    "localeStudio.locale": "Language",
    "localeStudio.coverage": "Reviewed / total",
    "localeStudio.orphaned": "Orphaned",
    "localeStudio.status.missing": "Missing",
    "localeStudio.status.draft": "Draft",
    "localeStudio.status.stale": "Outdated",
    "localeStudio.status.reviewed": "Reviewed",
    "localeStudio.search": "Search documentation and translations",
    "localeStudio.filter": "Filter translation status",
    "localeStudio.allStatuses": "All statuses",
    "localeStudio.section": "Documentation section",
    "localeStudio.allSections": "All sections",
    "localeStudio.section.info": "API information",
    "localeStudio.section.operations": "Operations and webhooks",
    "localeStudio.section.schemas": "Schemas and properties",
    "localeStudio.section.other": "Components, tags, and servers",
    "localeStudio.noEntries": "No documentation fields match these filters.",
    "localeStudio.entries": "Documentation fields",
    "localeStudio.previous": "Previous documentation fields",
    "localeStudio.next": "Next documentation fields",
    "localeStudio.page": "Page {page}/{total}",
    "localeStudio.original": "Current source text",
    "localeStudio.previousSource":
      "Source text when this translation was written",
    "localeStudio.translation": "Translation ({locale})",
    "localeStudio.review": "Mark translation reviewed for current source",
    "localeStudio.unreview": "Return translation to draft",
    "localeStudio.copySource": "Copy source into translation draft",
    "localeStudio.clear": "Clear selected translation",
    "localeStudio.reviewHelp":
      "Editing text makes it a draft. Reviewing confirms that it matches the current source, including when the previous source has changed. Empty, draft, and outdated translations are never published.",
    "localeStudio.orphanDetails": "Orphaned translation locations (first 30)",
    "localeStudio.orphanHelp":
      "These locations no longer contain documentation in the captured source. Their translations remain in projects and catalogs, but are excluded from localized output. Reuse them by editing a catalog and importing it at the new location.",
    "localeStudio.exportCatalog": "Download translation catalog JSON",
    "localeStudio.exportCsv": "Download translation catalog CSV",
    "localeStudio.policy": "Localization publication policy",
    "localeStudio.policy.fallback":
      "Use reviewed translations with source fallback",
    "localeStudio.policy.strict": "Require all documentation fields reviewed",
    "localeStudio.format": "Localized OpenAPI output format",
    "localeStudio.preview": "Preview localized documentation",
    "localeStudio.policyHelp":
      "Fallback retains source text for missing, draft, or outdated translations. Strict mode blocks export and application until every active field has a current reviewed translation. Orphaned entries are retained separately.",
    "localeStudio.previewSummary":
      "{locale}: {translated}/{total} fields use reviewed translations.",
    "localeStudio.previewText":
      "Localized API preview (first 16,000 characters)",
    "localeStudio.needsPreview":
      "Preview again after changing a language, translation, source, format, or publication policy.",
    "localeStudio.exportApi": "Download localized OpenAPI",
    "localeStudio.exportHtml": "Download localized offline HTML documentation",
    "localeStudio.apply": "Apply localized OpenAPI to editor",
    "localeStudio.htmlHelp":
      "Offline HTML uses translated API content and the app language for navigation labels. It includes the existing documentation renderer’s supported endpoints, models, and security schemes.",
    "localeStudio.exportProject": "Download localization project with source",
    "localeStudio.exportProgress": "Download translation progress report",
    "localeStudio.exportHelp":
      "Projects include the complete API source and all translations. Catalogs include documentation text and locations, including retained outdated/orphaned rows. Progress reports include complete counters and bounded location/status lists with truncation flags; paths and names may still be sensitive. Imported reports and previews are never trusted as published output.",
    "localeStudio.undo": "Undo last localization application",
    "localeStudio.captured":
      "Documentation source captured; existing translations retained.",
    "localeStudio.restored":
      "Localization project restored. Generate a fresh preview before applying it.",
    "localeStudio.imported":
      "Catalog merged: {imported} rows imported, {kept} existing translations kept.",
    "localeStudio.ready":
      "Localized documentation is ready for review and export.",
    "localeStudio.blocked":
      "Strict publication is blocked: review every active documentation field first.",
    "localeStudio.downloaded": "Localization download started.",
    "localeStudio.staleEditor":
      "The editor changed after this preview. Generate a fresh preview before applying.",
    "localeStudio.staleUndo":
      "The editor changed after application. Undo is blocked to preserve those edits.",
    "localeStudio.unchanged":
      "The editor already contains this localized output.",
    "localeStudio.applied":
      "Localized documentation applied. Undo is available while the editor remains unchanged.",
    "localeStudio.undone":
      "The editor was restored to its exact previous text.",
    "localeStudio.error.source":
      "Use a valid supported OpenAPI or Swagger document in JSON or YAML.",
    "localeStudio.error.limit":
      "Localization limits exceeded: sources/outputs 2 MiB, catalogs 8 MiB, projects 16 MiB, 5,000 fields/rows, 20 languages, and bounded nesting.",
    "localeStudio.error.locale":
      "Use a valid, unique language tag such as fr, ru, pt-BR, or zh-Hant.",
    "localeStudio.error.catalog":
      "Invalid translation catalog. Check its version, unique documentation pointers, text, and boolean review flags.",
    "localeStudio.error.project":
      "Invalid localization project. Check its format, version, name, source, and language catalogs.",
    "localeStudio.error.csv":
      "Invalid catalog CSV. Use unique locale,pointer,source,current_source,translation,reviewed columns, one language, matching row widths, true/false review flags, and valid quoting.",
    "localeStudio.error.text":
      "Each translation must fit within 64 KiB of UTF-8 text.",
    "localeStudio.error.result":
      "Localized output cannot be published. Complete required reviews and keep the result within supported document limits.",
    "localeStudio.error.download":
      "The browser blocked the localization download. Try again.",
    "mergeStudio.title": "OpenAPI three-way merge studio",
    "mergeStudio.description":
      "Reconcile parallel edits to the same API using a shared base and two edited versions. Merge independent changes, inspect conflicts, choose explicit resolutions, and preview a combined contract before exporting or applying it.",
    "mergeStudio.help":
      "Work stays in this tab with no requests or automatic storage. Projects contain all three source documents and custom resolutions. Decision reports omit full source/value bodies but include titles and merge locations; keyed locations can contain parameter/tag names and server URLs. Review before sharing. Limits: 2 MiB per source/output, 8 MiB per project/report, 500 conflicts, and 64 KiB per custom value.",
    "mergeStudio.loading": "Reading merge file…",
    "mergeStudio.importProject": "Restore three-way merge project (JSON)",
    "mergeStudio.sources": "Merge versions",
    "mergeStudio.name": "Merge project name",
    "mergeStudio.side.base": "Base",
    "mergeStudio.side.ours": "Ours",
    "mergeStudio.side.theirs": "Theirs",
    "mergeStudio.sideHelp.base":
      "The common version before either branch changed it.",
    "mergeStudio.sideHelp.ours":
      "Your edited version. Keyed-array ordering prefers this side when neither branch reorders shared entries.",
    "mergeStudio.sideHelp.theirs":
      "The other edited version whose changes should be reconciled with yours.",
    "mergeStudio.capture.base": "Use editor as Base",
    "mergeStudio.capture.ours": "Use editor as Ours",
    "mergeStudio.capture.theirs": "Use editor as Theirs",
    "mergeStudio.import.base": "Import Base OpenAPI (JSON/YAML)",
    "mergeStudio.import.ours": "Import Ours OpenAPI (JSON/YAML)",
    "mergeStudio.import.theirs": "Import Theirs OpenAPI (JSON/YAML)",
    "mergeStudio.source.base": "Base source (JSON/YAML)",
    "mergeStudio.source.ours": "Ours source (JSON/YAML)",
    "mergeStudio.source.theirs": "Theirs source (JSON/YAML)",
    "mergeStudio.keyedArrays": "Merge supported OpenAPI arrays by identity",
    "mergeStudio.arrayHelp":
      "Matches inline parameters by in/name, root tags by name, and servers by URL at root and supported path/operation scopes. Unique identities are required; referenced, duplicate, oversized, or other arrays stay atomic. Examples and schemas are not treated as keyed collections. Conflicting shared-entry orders and different default-server choices require a separate order resolution.",
    "mergeStudio.preview": "Analyse and preview three-way merge",
    "mergeStudio.exportProject": "Download merge project with sources",
    "mergeStudio.summary":
      "Conflicts resolved: {resolved}/{conflicts} · automatic decisions: {automatic} · keyed arrays: {keyed} · atomic array conflicts: {atomic}",
    "mergeStudio.needsPreview":
      "Resolutions changed or a project was restored. Preview again before exporting or applying the merged API or decision report.",
    "mergeStudio.conflicts": "Merge conflicts",
    "mergeStudio.search": "Search merge conflicts",
    "mergeStudio.filter": "Filter conflict resolution",
    "mergeStudio.filter.all": "All conflicts",
    "mergeStudio.filter.unresolved": "Unresolved conflicts",
    "mergeStudio.filter.resolved": "Resolved conflicts",
    "mergeStudio.bulk.base": "Use Base for remaining conflicts",
    "mergeStudio.bulk.ours": "Use Ours for remaining conflicts",
    "mergeStudio.bulk.theirs": "Use Theirs for remaining conflicts",
    "mergeStudio.clearResolutions": "Clear all conflict resolutions",
    "mergeStudio.noConflicts": "No matching conflicts.",
    "mergeStudio.unresolved": "Unresolved",
    "mergeStudio.kind.value": "Different value edits",
    "mergeStudio.kind.add-add": "Different additions",
    "mergeStudio.kind.delete-edit": "Deletion versus edit",
    "mergeStudio.kind.type": "Incompatible value types",
    "mergeStudio.kind.array": "Atomic array edits",
    "mergeStudio.kind.array-order": "Collection ordering",
    "mergeStudio.choice.base": "Use Base",
    "mergeStudio.choice.ours": "Use Ours",
    "mergeStudio.choice.theirs": "Use Theirs",
    "mergeStudio.choice.custom": "Custom JSON",
    "mergeStudio.selected": "Conflict at {location}",
    "mergeStudio.orderHelp":
      "This conflict contains ordered identity lists, not whole definitions. Choose an ordering from a branch or Base; independently merged item contents are preserved and remaining items are appended. Custom order JSON is disabled. Keyed merge locations use @item and @order markers and are not ordinary JSON Pointers.",
    "mergeStudio.sidePreview":
      "{side} conflict value (first 16,000 characters)",
    "mergeStudio.missing": "Absent in this version (different from JSON null)",
    "mergeStudio.choose.base": "Choose Base value",
    "mergeStudio.choose.ours": "Choose Ours value",
    "mergeStudio.choose.theirs": "Choose Theirs value",
    "mergeStudio.custom": "Custom conflict value (JSON)",
    "mergeStudio.customHelp":
      "Save a complete JSON value for this conflict. JSON null is a real value; to delete a field choose a version where it is absent. Editing an active custom resolution clears it until saved again. Choosing a side preserves all its nested content for this conflict.",
    "mergeStudio.saveCustom": "Validate and use custom JSON",
    "mergeStudio.clearSelected": "Clear selected conflict resolution",
    "mergeStudio.previous": "Previous merge conflicts",
    "mergeStudio.next": "Next merge conflicts",
    "mergeStudio.page": "Page {page}/{total}",
    "mergeStudio.output": "Merged contract review",
    "mergeStudio.review":
      "Operations added: {added} · removed: {removed} · modified: {modified} · potentially breaking: {breaking} · broken references: {broken} · external references: {external}",
    "mergeStudio.reviewHelp":
      "This advisory review reuses operation comparison and reference checks. It is not full OpenAPI validation, deep schema compatibility analysis, or API testing. Broken/external references and potentially breaking changes need review even after structural conflicts are resolved. External references are never fetched.",
    "mergeStudio.referenceFindings": "Reference findings (first 50 shown)",
    "mergeStudio.changeCount": "Changed document locations: {count}",
    "mergeStudio.truncatedChanges": "first 200 changes shown",
    "mergeStudio.changes": "Changes compared with Base",
    "mergeStudio.format": "Merged API output format",
    "mergeStudio.previewLabel": "Merged API preview (first 16,000 characters)",
    "mergeStudio.blocked":
      "Resolve every conflict and preview a valid result before exporting or applying an API.",
    "mergeStudio.exportApi": "Download merged OpenAPI",
    "mergeStudio.apply": "Apply merged OpenAPI to editor",
    "mergeStudio.exportReport": "Download merge decision JSON report",
    "mergeStudio.exportMarkdown": "Download merge decision Markdown report",
    "mergeStudio.undo": "Undo last merge application",
    "mergeStudio.captured":
      "Current editor captured as a merge version. Previous resolutions cleared.",
    "mergeStudio.imported":
      "Merge version imported. Previous resolutions cleared.",
    "mergeStudio.restored":
      "Merge project restored and decisions recomputed. Preview again before applying.",
    "mergeStudio.ready":
      "All structural conflicts resolved; merged API is ready for review.",
    "mergeStudio.conflictsFound":
      "Merge conflicts found. Choose resolutions, then preview again.",
    "mergeStudio.downloaded": "Merge download started.",
    "mergeStudio.stale":
      "The editor changed after preview. Preview again before applying the merge.",
    "mergeStudio.staleUndo":
      "The editor changed after merge application. Undo would overwrite later edits.",
    "mergeStudio.unchanged": "The editor already contains this merged output.",
    "mergeStudio.applied":
      "Merged OpenAPI applied. The previous editor content can be restored with Undo.",
    "mergeStudio.undone":
      "Previous editor content restored. Preview again before applying another merge.",
    "mergeStudio.error.source":
      "Provide three valid, bounded OpenAPI or Swagger 2 JSON/YAML versions. Check the indicated source.",
    "mergeStudio.error.limit":
      "A source, output, conflict count, traversal, or export exceeds merge limits. Reduce its size or try JSON output.",
    "mergeStudio.error.resolution":
      "A resolution is invalid, duplicated, or no longer matches a current conflict. Reset decisions or restore a matching project.",
    "mergeStudio.error.custom":
      "Use valid JSON within the custom-value size limit, with safe numbers and bounded nesting.",
    "mergeStudio.error.project":
      "Use a valid version 1 merge project with a name, three sources, array settings, and resolutions.",
    "mergeStudio.error.result":
      "The resolved result is not accepted by the OpenAPI parser. Review choices and custom values before applying.",
    "mergeStudio.error.download":
      "The merge download could not start. Try again.",
    "asyncStudio.title": "AsyncAPI event studio",
    "asyncStudio.description":
      "Design and inspect event-driven contracts, check JSON messages, and rehearse send/receive operations in a local journal. Import AsyncAPI 2.x or 3.x, or build a new 3.1 contract from examples.",
    "asyncStudio.help":
      "Everything stays in this tab, with no broker connections or automatic storage. The OpenAPI editor is separate. Documents and projects may contain private examples and server details; projects and full journals include message values. Reports omit payload/header values, concrete addresses, and correlation IDs. Labels and field paths remain visible.",
    "asyncStudio.importDocument": "Import AsyncAPI document (JSON/YAML)",
    "asyncStudio.importProject": "Restore event studio project (JSON)",
    "asyncStudio.loading": "Reading event studio file…",
    "asyncStudio.contract": "Event contract",
    "asyncStudio.source": "AsyncAPI source (JSON or YAML)",
    "asyncStudio.sourceHelp":
      "Load checks supported versions and structure, then resolves local references for inspection. It is not full AsyncAPI certification. Loading a contract replaces the active contract and clears its journal. Unknown fields are preserved in document exports. External references are reported without fetching.",
    "asyncStudio.dirty":
      "Contract edits are pending. Load or discard them before building, checking messages, replaying, or exporting.",
    "asyncStudio.load": "Load event contract and reset journal",
    "asyncStudio.discard": "Discard event contract edits",
    "asyncStudio.create": "Start an empty AsyncAPI 3.1 contract",
    "asyncStudio.summary":
      "{title} · AsyncAPI {version} · channels: {channels} · operations: {operations} · messages: {messages}",
    "asyncStudio.exports": "Contract and rehearsal exports",
    "asyncStudio.projectName": "Event studio project name",
    "asyncStudio.export.json": "Download AsyncAPI JSON",
    "asyncStudio.export.yaml": "Download AsyncAPI YAML",
    "asyncStudio.export.markdown": "Download event inventory Markdown",
    "asyncStudio.export.project": "Download event project with message values",
    "asyncStudio.export.journal": "Download full journal with message values",
    "asyncStudio.export.report":
      "Download rehearsal report without message values",
    "asyncStudio.builder": "Add a channel from a JSON example",
    "asyncStudio.builderHelp":
      "Adds a channel, message with inferred schema, example, and send/receive operation. Existing contract fields are kept. Inference describes observed types, not business rules. Use the source editor for constraints, parameterized addresses, headers, correlation IDs, and additional message variants.",
    "asyncStudio.builderV3":
      "The additive channel builder supports AsyncAPI 3.x. Imported 2.x contracts can still be edited, checked, rehearsed, and exported in their original version.",
    "asyncStudio.channelKey": "New channel identifier",
    "asyncStudio.address": "New channel address (without parameters)",
    "asyncStudio.messageName": "New message name",
    "asyncStudio.action": "New operation action",
    "asyncStudio.send": "Application sends",
    "asyncStudio.receive": "Application receives",
    "asyncStudio.seed": "JSON payload example for schema inference",
    "asyncStudio.captureSeeds": "Read JSON examples from OpenAPI editor",
    "asyncStudio.seedChoice": "OpenAPI example to reuse",
    "asyncStudio.useSeed": "Use selected OpenAPI example",
    "asyncStudio.addChannel": "Add event channel and operation",
    "asyncStudio.findings":
      "Contract review findings ({count}; first 100 shown)",
    "asyncStudio.servers": "Documented servers (no connections)",
    "asyncStudio.operations": "Channel operations",
    "asyncStudio.search": "Search event operations",
    "asyncStudio.direction": "Filter operation direction",
    "asyncStudio.all": "All",
    "asyncStudio.noOperations": "No matching event operations.",
    "asyncStudio.rehearsal": "Local message rehearsal",
    "asyncStudio.rehearsalHelp":
      "Checks payload/header schemas and correlation IDs, resolves address parameters, and records a local attempt. Invalid messages are recorded with their errors. Supported checks cover common JSON Schema constraints; unsupported features produce partial results. No real messages are sent, received, delivered, or acknowledged. In 2.x, subscribe means the application sends, and publish means it receives.",
    "asyncStudio.dynamic": "Dynamic address",
    "asyncStudio.message": "Message variant to rehearse",
    "asyncStudio.messageDetails":
      "Message schema and correlation definition (first 16,000 characters)",
    "asyncStudio.example": "Documented message example",
    "asyncStudio.useExample": "Load message example into rehearsal",
    "asyncStudio.parameters": "Channel parameter values (JSON string object)",
    "asyncStudio.payload": "Rehearsal payload (JSON)",
    "asyncStudio.headers": "Application message headers (JSON object)",
    "asyncStudio.validate": "Check message without recording",
    "asyncStudio.record": "Record local message rehearsal",
    "asyncStudio.checkStatus": "Message check: {status}",
    "asyncStudio.status.valid": "Valid for supported checks",
    "asyncStudio.status.invalid": "Invalid",
    "asyncStudio.status.partial": "Partial — review findings",
    "asyncStudio.journal": "Local event journal ({count}/200)",
    "asyncStudio.journalHelp":
      "Replay rechecks a prior envelope and appends a new attempt. Edit loads its values into the rehearsal form. Undo removes the last attempt. Journals remain in memory across closing the panel; download a project to restore them. Limits: 2 MiB per document/project/journal, 128 KiB per payload or header object, 100 channels, 200 operations, and 400 message variants.",
    "asyncStudio.eventSearch": "Search rehearsal journal",
    "asyncStudio.eventFilter": "Filter rehearsal outcome",
    "asyncStudio.noEvents": "No matching journal entries.",
    "asyncStudio.replayOf": "replay of {sequence}",
    "asyncStudio.inspectEvent": "Inspect event {sequence}",
    "asyncStudio.replayEvent": "Replay event {sequence}",
    "asyncStudio.editEvent": "Edit event {sequence} inputs",
    "asyncStudio.inspect": "Inspect",
    "asyncStudio.replay": "Replay locally",
    "asyncStudio.edit": "Edit inputs",
    "asyncStudio.selectedEvent": "Event {sequence} details",
    "asyncStudio.eventPreview":
      "Selected event values (first 16,000 characters)",
    "asyncStudio.undo": "Undo last journal entry",
    "asyncStudio.clear": "Clear local journal",
    "asyncStudio.previous": "Previous journal entries",
    "asyncStudio.next": "Next journal entries",
    "asyncStudio.page": "Page {page}/{total}",
    "asyncStudio.loaded": "Event contract loaded; journal reset.",
    "asyncStudio.restored":
      "Event project restored and journal checks recomputed.",
    "asyncStudio.created":
      "Empty AsyncAPI 3.1 contract created; journal reset.",
    "asyncStudio.built":
      "Event channel, inferred message schema, and operation added.",
    "asyncStudio.seedsLoaded":
      "JSON examples captured from the OpenAPI editor.",
    "asyncStudio.noSeeds":
      "No reusable JSON examples found in the current editor.",
    "asyncStudio.recorded":
      "Local rehearsal recorded. Review its check outcome.",
    "asyncStudio.checked": "Message checked without adding a journal entry.",
    "asyncStudio.replayed":
      "Prior message rechecked and recorded as a new attempt.",
    "asyncStudio.downloaded": "Event studio download started.",
    "asyncStudio.finding.reference": "Unresolved or invalid local reference",
    "asyncStudio.finding.external-reference":
      "External reference requires review",
    "asyncStudio.finding.structure": "Missing or unsupported structure",
    "asyncStudio.finding.traits": "Trait merging is not evaluated",
    "asyncStudio.finding.reply": "Reply routing is not rehearsed",
    "asyncStudio.finding.schema-format": "Schema format is not evaluated",
    "asyncStudio.finding.schema-keyword":
      "Schema keyword needs independent review",
    "asyncStudio.finding.schema-limit":
      "Schema traversal was bounded or recursive",
    "asyncStudio.finding.content-type":
      "Only JSON messages can be checked here",
    "asyncStudio.finding.correlation": "Unsupported correlation expression",
    "asyncStudio.finding.address":
      "Dynamic address needs an explicit concrete definition",
    "asyncStudio.error.document":
      "Use a bounded JSON/YAML AsyncAPI document with an info title/version and object maps. Existing work is preserved.",
    "asyncStudio.error.version":
      "Supported versions are AsyncAPI 2.0–2.6, 3.0, and 3.1.",
    "asyncStudio.error.limit":
      "An input, export, channel, operation, or message count exceeds the event studio limits.",
    "asyncStudio.error.json":
      "Use valid bounded JSON with safe numbers. Header values must be in an object.",
    "asyncStudio.error.selection":
      "Select an operation and a message belonging to its channel before checking or replaying.",
    "asyncStudio.error.parameters":
      "Supply all address parameters as nonempty strings, respecting documented enum values. Dynamic addresses and unresolved braces cannot be rehearsed.",
    "asyncStudio.error.builder":
      "Use a unique channel identifier, a concrete address, a message name, and a 3.x contract for the builder.",
    "asyncStudio.error.project":
      "Use a valid version 1 event studio project with an ordered, restorable journal.",
    "asyncStudio.error.journal":
      "The local journal reached its entry or byte limit. Download it, then undo an entry or clear it before recording more.",
    "asyncStudio.error.openapi":
      "Use a valid OpenAPI editor document to capture reusable JSON examples.",
    "asyncStudio.error.download":
      "The event studio download could not start. Try again.",
    "matrix.title": "Data-driven workflow tests",
    "matrix.description":
      "Run one reusable API workflow across JSON or CSV test cases with isolated variables, per-case expectations, and response assertions. Rehearse with Mock or execute a controlled Live batch, then export JSON or JUnit results.",
    "matrix.help":
      "Matrix definitions and datasets remain in this tab until downloaded. Projects and scenario exports contain request examples and row values; review them before sharing. Reports omit those values, response bodies, and session headers, but names and path templates may be private. Up to 100 cases, 20 steps, 500 step attempts per batch, 4 concurrent cases, and a 5-minute maximum budget.",
    "matrix.import.project":
      "Restore matrix project (replaces configuration and cases)",
    "matrix.import.scenario":
      "Import API scenario as workflow (keeps cases, clears bindings)",
    "matrix.import.dataset": "Import test cases (JSON/CSV; replaces cases)",
    "matrix.loading": "Reading matrix file…",
    "matrix.configuration": "Workflow and test cases",
    "matrix.name": "Matrix project name",
    "matrix.workflow": "Reusable workflow",
    "matrix.capture": "Read endpoint choices from editor",
    "matrix.endpoint": "Endpoint to add to workflow",
    "matrix.addStep": "Add endpoint workflow step",
    "matrix.templateHelp":
      "New steps template parameter values with {{columnName}} when the parameter name is a valid variable, filling missing case columns from examples. Existing values are preserved. Edit the workflow JSON for step order, request bodies, extraction, status, timing, and contract checks, or import an existing scenario.",
    "matrix.editWorkflow": "Edit workflow and expectation bindings",
    "matrix.workflowJson": "Workflow JSON (ApiScenario object)",
    "matrix.bindingsJson": "Per-step expectation bindings (JSON array)",
    "matrix.addBinding": "Add binding for next unconfigured step",
    "matrix.bindingHelp":
      "Each binding has stepId, statusVariable, mockStatusVariable, durationVariable (blank skips the override), and assertions. Assertions use name, target, path, operator, expected, and valueVariable (blank uses the literal expected). Body equals checks preserve JSON types from valueVariable. Assertions can use case values and prior-step extracted variables. A body path such as /items/{{index}}/id templates individual pointer segments safely. Status/duration/Mock overrides use case columns only.",
    "matrix.saveDefinitions": "Validate and save workflow/bindings",
    "matrix.discardDefinitions": "Discard workflow/binding edits",
    "matrix.data": "Case dataset",
    "matrix.dataFormat": "Pasted dataset format",
    "matrix.inferCsv": "Infer canonical CSV numbers, booleans, and null",
    "matrix.dataset": "Test-case dataset to load",
    "matrix.useDataset": "Replace cases with pasted dataset",
    "matrix.dataHelp":
      'JSON is an array of objects with scalar variable values, for example [{"id":1,"wantedId":1},{"id":2,"wantedId":2}]. CSV needs unique variable-name headers; cells stay strings unless inference is enabled. Quoted commas/newlines and escaped quotes are supported. Up to 32 columns and 64 KiB per case. Generic case labels avoid copying data into reports; labels can be edited separately.',
    "matrix.addCase": "Add or duplicate selected case",
    "matrix.enableAll": "Enable all cases",
    "matrix.disableAll": "Disable all cases",
    "matrix.selectCase": "Case to configure",
    "matrix.caseName": "Case display name",
    "matrix.caseEnabled": "Include case in runs",
    "matrix.caseValues": "Selected case variables (JSON object)",
    "matrix.saveCase": "Validate and save case variables",
    "matrix.discardCase": "Discard case variable edits",
    "matrix.removeCase": "Remove selected case",
    "matrix.concurrency": "Concurrent cases (1–4)",
    "matrix.budget": "Total run budget (1,000–300,000 ms)",
    "matrix.stopOnFailure":
      "Stop launching new cases after a failure (active cases finish)",
    "matrix.negativeInputs":
      "Allow missing required query/header/cookie/body inputs for negative tests",
    "matrix.dirty":
      "Some workflow, binding, or case JSON edits are pending. Validate or discard them before previewing, running, or exporting. Switching cases preserves drafts.",
    "matrix.exportProject": "Download matrix project with data",
    "matrix.exportScenario": "Download reusable API scenario",
    "matrix.execution": "Batch execution",
    "matrix.mode": "Matrix execution mode",
    "matrix.liveHelp":
      "Live runs send each enabled case through the existing request proxy. POST/PUT/PATCH/DELETE can change server data and require the checkbox below. Session headers override matching workflow headers and apply to every step; supply a static HTTP(S) server override when using them. Imports reset Live mode and session credentials. Mock uses documented responses and does not simulate behavior for different input values.",
    "matrix.server": "Live server override (required for session headers)",
    "matrix.headers": "Session-only shared headers (JSON string values)",
    "matrix.allowWrites": "Allow Live methods that may change server data",
    "matrix.caseCount":
      "Enabled cases: {enabled}/{total} · workflow steps: {steps}",
    "matrix.preview": "Validate and preview matrix batch",
    "matrix.run": "Run enabled cases",
    "matrix.rerun": "Rerun prior failed/error cases only",
    "matrix.previewSummary":
      "Validated batch: {cases} cases · up to {requests} step attempts",
    "matrix.progress":
      "Cases completed: {completed}/{total} · active: {active}",
    "matrix.cancel": "Cancel matrix run",
    "matrix.results": "Matrix case results",
    "matrix.summary":
      "Passed: {passed} · failed: {failed} · errors: {error} · cancelled: {cancelled} · skipped: {skipped}",
    "matrix.stop.cancelled":
      "The run was cancelled; queued cases were not started.",
    "matrix.stop.budget":
      "The total run budget expired; active work was cancelled.",
    "matrix.stop.failure":
      "A case was unsuccessful; no further cases were launched.",
    "matrix.exportReport": "Download matrix JSON results",
    "matrix.exportJUnit": "Download JUnit XML results",
    "matrix.search": "Search matrix case results",
    "matrix.filter": "Filter case outcome",
    "matrix.all": "All outcomes",
    "matrix.outcome.passed": "Passed",
    "matrix.outcome.failed": "Failed",
    "matrix.outcome.error": "Error",
    "matrix.outcome.cancelled": "Cancelled",
    "matrix.outcome.skipped": "Skipped",
    "matrix.noMatches": "No matching case results.",
    "matrix.unnamedAssertion": "Response assertion",
    "matrix.previous": "Previous matrix cases",
    "matrix.next": "Next matrix cases",
    "matrix.page": "Page {page}/{total}",
    "matrix.inspectInvalid": "Inspect invalid case {key}",
    "matrix.choicesLoaded": "Endpoint choices captured from the editor.",
    "matrix.definitionsSaved": "Workflow and bindings validated and saved.",
    "matrix.datasetLoaded": "Test-case dataset loaded.",
    "matrix.caseSaved": "Case variables validated and saved.",
    "matrix.projectLoaded":
      "Matrix project restored. Execution mode reset to Mock.",
    "matrix.scenarioLoaded":
      "Scenario imported as workflow; data retained and bindings cleared.",
    "matrix.previewReady": "The enabled cases passed matrix preflight checks.",
    "matrix.completed": "Matrix run completed. Review individual outcomes.",
    "matrix.cancelled": "Matrix run stopped; partial results are available.",
    "matrix.downloaded": "Matrix download started.",
    "matrix.error.project":
      "Use a valid version 1 matrix project with a valid scenario, enabled cases, and supported run settings.",
    "matrix.error.dataset":
      "Use scalar case variables with valid variable names, unique case keys, and valid JSON. Existing data is preserved.",
    "matrix.error.csv":
      "Check CSV quoting, unique variable-name headers, and matching column counts on every row.",
    "matrix.error.limit":
      "The matrix input, case/step count, request budget, or export exceeds its limits. Reduce the batch or report size.",
    "matrix.error.variables":
      "A case is missing a template/assertion variable, has an invalid JSON body, or omits an input required by the workflow. Inspect the affected case before running.",
    "matrix.error.binding":
      "Check step IDs, expectation variables, assertion definitions, concrete case expectations, and documented Mock response choices.",
    "matrix.error.endpoint":
      "Every workflow step must match exactly one current editor operation. Refresh the API or update the workflow before running.",
    "matrix.error.writes":
      "Enable the Live write-method checkbox before running methods that may change server data.",
    "matrix.error.headers":
      "Use a bounded JSON object of unique, valid header names and string values without line breaks. Shared Live headers also require a static HTTP(S) server override without URL credentials.",
    "matrix.error.source":
      "Use a valid, bounded OpenAPI editor document or server override before running the matrix.",
    "matrix.error.download": "The matrix download could not start. Try again.",
    "redaction.title": "Data redaction studio",
    "redaction.description":
      "Prepare API artifacts for sharing with scoped credential masking, optional personal-data pseudonyms, custom pointer rules, and consistent replacements across multiple files.",
    "redaction.help":
      "Processing stays in this tab, with no requests or automatic storage. Automatic OpenAPI rules target examples, not schema constraints or names; HAR rules target headers, cookies, queries, URLs, and JSON bodies. Detection is based on known field names and does not guarantee every private value is removed. Projects contain original data; rule sets omit source files. Review redacted outputs before sharing.",
    "redaction.import.sources": "Add artifacts (OpenAPI, HAR, JSON)",
    "redaction.import.project":
      "Restore redaction project (replaces current work)",
    "redaction.import.rules":
      "Import rule set (replaces rules/options, keeps sources)",
    "redaction.loading": "Reading redaction files…",
    "redaction.inputs": "Artifacts and project",
    "redaction.name": "Redaction project name",
    "redaction.capture": "Add current editor for redaction",
    "redaction.exportProject": "Download project with original inputs",
    "redaction.exportRules": "Download reusable rule set",
    "redaction.undo": "Undo redacted API application",
    "redaction.pasteHeading": "Paste an artifact",
    "redaction.pasteKind": "Pasted artifact type",
    "redaction.kind.auto": "Detect type automatically",
    "redaction.kind.openapi": "OpenAPI 3.0/3.1",
    "redaction.kind.har": "HAR capture",
    "redaction.kind.json": "JSON data",
    "redaction.paste": "Artifact text to add",
    "redaction.addPasted": "Add pasted artifact",
    "redaction.source": "Artifact to inspect",
    "redaction.sourceHeading": "Edit original artifact inside this project",
    "redaction.sourceName": "Artifact display name",
    "redaction.sourceText": "Selected original artifact",
    "redaction.saveSource": "Validate and save artifact edits",
    "redaction.discardSource": "Discard artifact edits",
    "redaction.removeSource": "Remove artifact from project",
    "redaction.automatic": "Automatic redaction",
    "redaction.option.secrets":
      "Mask known credential fields and URL credentials",
    "redaction.option.personal": "Include common personal-data fields",
    "redaction.option.dropOpaqueBodies": "Remove opaque HAR body text",
    "redaction.strategy": "Automatic replacement strategy",
    "redaction.action.mask": "Mask values",
    "redaction.action.pseudonymize": "Use consistent pseudonyms",
    "redaction.action.remove": "Remove field or array item",
    "redaction.action.replace": "Replace with custom JSON",
    "redaction.automaticHelp":
      "Masking preserves JSON types, keys, and container shape: strings become [redacted], numbers 0, and booleans false. Pseudonyms are repeatable aliases within a preview and are not encryption or irreversible anonymization. They may violate formats, enums, or example constraints. Common personal fields include email, phone, name, address, IP, and user/customer/account IDs. Arbitrary text, binary bodies, extensions, schema constraints, and metadata need review.",
    "redaction.rules": "Ordered custom rules",
    "redaction.ruleDefault": "Custom rule",
    "redaction.addRule": "Add custom redaction rule",
    "redaction.rule": "Rule to configure",
    "redaction.ruleName": "Rule name",
    "redaction.enableRule": "Enable rule",
    "redaction.selector": "Rule pointer pattern",
    "redaction.ruleAction": "Rule action",
    "redaction.replacement": "Custom replacement (JSON value)",
    "redaction.saveReplacement": "Validate and save replacement",
    "redaction.discardReplacement": "Discard replacement edits",
    "redaction.moveUp": "Move rule earlier",
    "redaction.moveDown": "Move rule later",
    "redaction.removeRule": "Remove rule",
    "redaction.ruleHelp":
      "Use JSON Pointer escapes (~1 for slash, ~0 for tilde), * for one segment, and ** for any depth; /**/privateNote matches that field anywhere. HAR JSON bodies use virtual paths ending in /text/$json/field. The first matching rule at a node wins. Parent replacements/removals stop child rules and automatic detection there. Custom rules can target structural fields; deleting essential OpenAPI fields blocks API export/application.",
    "redaction.dirty":
      "Artifact or replacement edits are pending. Validate or discard them before previewing or exporting. Switching selections keeps drafts.",
    "redaction.generate": "Preview redacted artifacts",
    "redaction.result": "Redaction preview and audit",
    "redaction.summary":
      "Files: {files} · changed targets: {changes} · review items: {diagnostics}",
    "redaction.reviewHelp":
      "Preview shows outputs only. Original values are excluded from audit reports, but names and pointers may still contain private information. A clean diagnostic list is not a completeness guarantee. Use the existing example checks to review transformed examples. Applying an OpenAPI output replaces the editor explicitly and checks for intervening edits.",
    "redaction.exportReport": "Download redaction audit report",
    "redaction.exportBundle": "Download bundle of redacted outputs",
    "redaction.output": "Redacted output: {name} · changes: {count}",
    "redaction.preview": "Redacted output preview (first 16,000 characters)",
    "redaction.exportFile": "Download selected redacted artifact",
    "redaction.apply": "Apply selected redacted API to editor",
    "redaction.search": "Search redaction findings",
    "redaction.findingCount":
      "Changed targets: {total} · retained findings: {shown} · visible review items: {diagnostics}",
    "redaction.findings": "Redaction findings",
    "redaction.noMatches": "No matching redaction findings.",
    "redaction.previous": "Previous redaction findings",
    "redaction.next": "Next redaction findings",
    "redaction.page": "Page {page}/{total}",
    "redaction.category.credential": "Credentials",
    "redaction.category.email": "Email",
    "redaction.category.phone": "Phone",
    "redaction.category.name": "Name",
    "redaction.category.address": "Address",
    "redaction.category.ip": "IP address",
    "redaction.category.identifier": "Identifier",
    "redaction.category.custom": "Custom rule/body removal",
    "redaction.diagnostic.extension":
      "Opaque extension retained; inspect or target it with a custom rule.",
    "redaction.diagnostic.constraint-values":
      "Potentially sensitive schema constraint values retained to preserve the contract.",
    "redaction.diagnostic.external-example":
      "Referenced/external example not expanded; inspect its source separately.",
    "redaction.diagnostic.opaque-body":
      "Opaque, encoded, oversized, or non-JSON body text requires review (or explicit omission).",
    "redaction.diagnostic.url-unparsed":
      "URL could not be analyzed; its original value was retained.",
    "redaction.diagnostic.url-template":
      "Templated URL retained; use a custom replacement if needed.",
    "redaction.diagnostic.invalid-openapi":
      "The custom rules removed required API structure. API export and application are blocked.",
    "redaction.diagnostic.custom-structure":
      "A custom rule targets API structure or metadata. Review contract validity beyond the basic parser check.",
    "redaction.diagnostic.external-reference":
      "External reference URL retained to preserve reference semantics; inspect it separately.",
    "redaction.imported": "Redaction artifacts added.",
    "redaction.rulesImported": "Rule set imported; current artifacts retained.",
    "redaction.projectImported": "Redaction project restored.",
    "redaction.sourceSaved": "Artifact edits validated and saved.",
    "redaction.replacementSaved": "Custom replacement validated and saved.",
    "redaction.generated":
      "Redacted previews generated. Review outputs and diagnostics before sharing.",
    "redaction.downloaded": "Redaction download started.",
    "redaction.applied": "Redacted API applied to the editor.",
    "redaction.undone": "Previous editor document restored.",
    "redaction.error.json":
      "Use valid JSON within the structure and size limits. Existing work is preserved.",
    "redaction.error.source":
      "Use valid JSON data, a HAR log with an entries array, or OpenAPI 3.0/3.1 JSON/YAML. Upgrade Swagger 2 with the existing tool first.",
    "redaction.error.project":
      "Use a valid version 1 RSSwag redaction project or rule set with unique keys and valid options.",
    "redaction.error.rule":
      "Check rule names, unique keys, pointer escapes, actions, and required custom replacements.",
    "redaction.error.limit":
      "Redaction exceeds its count, byte, nesting, pointer, or processing limits. Reduce the project size or rule complexity.",
    "redaction.error.root":
      "A rule would remove an entire document. Target a field or use a replacement instead.",
    "redaction.error.read":
      "Could not read these redaction files. Existing work is preserved.",
    "redaction.error.download":
      "The redaction download could not start. Try again.",
    "redaction.error.changed":
      "The editor changed since preview. Preview again before applying.",
    "redaction.error.undo":
      "The editor changed after application. Undo stopped to preserve those edits.",
    "consumer.title": "Consumer compatibility workbench",
    "consumer.description":
      "Record what each API client depends on, then check a candidate definition for changes that affect those consumers. Track response fields, request examples, and public-access requirements across reusable profiles.",
    "consumer.help":
      "Analysis runs locally and leaves the editor untouched. Compatible means the tracked requirements passed the supported checks; it is not a runtime guarantee. Unsupported schemas require review. Projects include request examples and allowed enum values; reports omit those values. Up to 20 consumers, 100 dependencies, 1,000 fields, and 2 MiB per file. Work stays in this tab until downloaded.",
    "consumer.import": "Restore consumer project (replaces current profiles)",
    "consumer.loading": "Reading consumer compatibility file…",
    "consumer.profiles": "Consumer profiles",
    "consumer.projectName": "Consumer project name",
    "consumer.selectConsumer": "Consumer to configure",
    "consumer.defaultName": "API client",
    "consumer.addConsumer": "Add consumer",
    "consumer.removeConsumer": "Remove consumer and dependencies",
    "consumer.consumerName": "Consumer name",
    "consumer.enableConsumer": "Include consumer in checks",
    "consumer.captureHeading": "Capture dependencies from a reference API",
    "consumer.readReference": "Capture current editor as reference",
    "consumer.referenceTitle": "Reference: {title} ({version})",
    "consumer.operation": "Reference operation",
    "consumer.variant": "Reference response variant",
    "consumer.noBody": "No media requirement",
    "consumer.captureStatus": "Concrete expected response status",
    "consumer.fieldsHelp":
      "Select only the fields this client uses. Pointers use /* for every existing array item; the root pointer is empty. Captured types, requiredness, and scalar enum values become editable expectations. Required fields must remain present through every parent; arrays may be empty. Inventory shows up to 200 fields and 10 levels. A dependency with no fields still checks operation, status, media, and public access.",
    "consumer.selectAll": "Select all response fields",
    "consumer.clearFields": "Clear response field selection",
    "consumer.fieldChoices": "Response field choices",
    "consumer.selectField": "Track response field {pointer}",
    "consumer.root": "Response root",
    "consumer.anyType": "Any type",
    "consumer.required": "Required",
    "consumer.optional": "Optional",
    "consumer.noFields": "No inspectable response fields for this variant.",
    "consumer.capture": "Add dependency to selected consumer",
    "consumer.dependencies": "Consumer dependencies",
    "consumer.selectContract": "Dependency to configure",
    "consumer.contractName": "Dependency name",
    "consumer.method": "Dependency HTTP method",
    "consumer.path": "Dependency path template",
    "consumer.status": "Required documented status",
    "consumer.media": "Required response media type (blank to skip)",
    "consumer.enableContract": "Include dependency in checks",
    "consumer.requirePublic": "Require an authentication-free alternative",
    "consumer.fieldJson": "Response field expectations (JSON array)",
    "consumer.requestJson":
      "Request example (JSON; blank to skip request checks)",
    "consumer.requestHelp":
      'Use {"parameters":[{"name":"id","location":"path","value":1}],"body":{"mediaType":"application/json","value":{}}}. Omit body when absent. Values are typed JSON examples, not serialized HTTP inputs. Only supplied examples are checked; leave blank to track responses alone. Save or discard JSON edits before checking/exporting. Changing clients preserves pending edits.',
    "consumer.save": "Validate and save dependency JSON",
    "consumer.discard": "Discard dependency JSON edits",
    "consumer.removeContract": "Remove dependency",
    "consumer.dirty":
      "Some dependency JSON edits are pending. Save or discard them before capturing more dependencies, checking candidates, or exporting.",
    "consumer.exportProject": "Download consumer project",
    "consumer.checkHeading": "Check a candidate API",
    "consumer.checkEditor": "Check current editor against consumers",
    "consumer.candidate": "Candidate OpenAPI definition (JSON/YAML)",
    "consumer.checkPasted": "Check pasted candidate",
    "consumer.candidateFile": "Import and check candidate definition",
    "consumer.report": "Consumer impact report",
    "consumer.summary":
      "Consumers · compatible: {compatible} · affected: {breaking} · review: {review} · untracked: {untracked}",
    "consumer.status.compatible": "Compatible",
    "consumer.status.breaking": "Affected by breaking changes",
    "consumer.status.review": "Needs review",
    "consumer.status.untracked": "Not checked",
    "consumer.search": "Search consumer dependencies",
    "consumer.filter": "Filter dependency outcome",
    "consumer.all": "All outcomes",
    "consumer.noMatches": "No matching dependencies.",
    "consumer.fieldCount": "Tracked fields: {count}",
    "consumer.hidden": "Additional findings: {count}",
    "consumer.previous": "Previous dependencies",
    "consumer.next": "Next dependencies",
    "consumer.page": "Page {page}/{total}",
    "consumer.exportReport": "Download consumer impact JSON",
    "consumer.exportMarkdown": "Download release review checklist",
    "consumer.preview": "Impact JSON preview (first 12,000 characters)",
    "consumer.referenceLoaded":
      "Reference captured. Choose an operation, response, and fields to track.",
    "consumer.captured": "Consumer dependency captured.",
    "consumer.saved": "Dependency JSON validated and saved.",
    "consumer.checked": "Candidate checked against the consumer project.",
    "consumer.imported": "Consumer project restored.",
    "consumer.downloaded": "Consumer compatibility download started.",
    "consumer.error.source":
      "Use a valid OpenAPI 3.0 or 3.1 JSON/YAML document with the standard dialect. Bundle external references and upgrade Swagger 2 with the existing tools first.",
    "consumer.error.project":
      "Use a valid version 1 RSSwag consumer project with unique consumer/dependency keys and names.",
    "consumer.error.json":
      "Use valid JSON within the nesting and size limits. Existing work is preserved.",
    "consumer.error.limit":
      "The consumer project, input, or export exceeds its count, size, or structure limits.",
    "consumer.error.contract":
      "Check dependency settings, unique pointers, supported types, scalar enums, and typed request examples. Status must be a concrete 100–599 code.",
    "consumer.error.read":
      "Could not read this compatibility file. Existing work is preserved.",
    "consumer.error.download":
      "The compatibility download could not start. Try again.",
    "consumer.finding.operation-missing":
      "The operation is no longer documented.",
    "consumer.finding.response-missing":
      "The required status has no documented response.",
    "consumer.finding.media-missing":
      "The required response media type is no longer documented.",
    "consumer.finding.schema-unknown":
      "The schema does not provide enough information to prove this expectation.",
    "consumer.finding.field-missing": "A required field is no longer declared.",
    "consumer.finding.field-optional":
      "A field or parent is no longer guaranteed to be present.",
    "consumer.finding.nullable-parent":
      "A parent may now be null, so this field may be unavailable.",
    "consumer.finding.type-expanded":
      "The provider may return a type the consumer does not accept.",
    "consumer.finding.enum-expanded":
      "The provider may return an enum value the consumer does not accept.",
    "consumer.finding.security-required":
      "The operation no longer offers an authentication-free alternative.",
    "consumer.finding.request-parameter-missing":
      "The request example omits a required parameter.",
    "consumer.finding.request-body-missing":
      "The request example omits a required body.",
    "consumer.finding.request-media-missing":
      "The request body media type is unavailable or undocumented.",
    "consumer.finding.request-invalid":
      "The request example violates a documented constraint.",
    "consumer.finding.parameter-removed":
      "A supplied request parameter is no longer documented; review whether it is still accepted.",
    "consumer.finding.schema-unsupported":
      "This schema uses a construct that requires manual review.",
    "consumer.finding.reference-unresolved":
      "A schema or object reference could not be resolved locally.",
    "consumer.finding.limit": "The schema analysis reached its safety budget.",
    "consumer.finding.deprecated":
      "The consumer depends on a deprecated operation.",
    "sandbox.title": "Stateful API sandbox",
    "sandbox.description":
      "Build a local mock service whose records survive between requests. Rehearse create, read, update, and delete workflows with editable resources and endpoint bindings.",
    "sandbox.help":
      "Everything runs in this tab: no HTTP requests, server, authentication, or automatic storage. The editor is untouched. Start with the task example or bind your own endpoints. Projects and record downloads contain seed data; logs contain request paths. Review exports before sharing.",
    "sandbox.import":
      "Restore sandbox project (replaces configuration and running state)",
    "sandbox.loading": "Reading sandbox project…",
    "sandbox.configuration": "Service configuration",
    "sandbox.name": "Sandbox name",
    "sandbox.resources": "Seeded resources",
    "sandbox.resource": "Resource to configure",
    "sandbox.resourceKey": "Resource key",
    "sandbox.addResource": "Add resource",
    "sandbox.removeResource": "Remove resource and its routes",
    "sandbox.idField": "Record ID field",
    "sandbox.idType": "Record ID type",
    "sandbox.number": "Integer",
    "sandbox.string": "String",
    "sandbox.seed": "Seed records (JSON array)",
    "sandbox.seedHelp":
      "Each record needs a unique ID within its resource. Creates without IDs generate increasing integers or sandbox-N strings. Up to 10 resources, 500 records per resource, 2,000 records total, and 512 KiB of state.",
    "sandbox.routes": "Endpoint bindings",
    "sandbox.capture": "Read endpoints from editor",
    "sandbox.operation": "Endpoint for a new binding",
    "sandbox.manual": "Enter a route manually",
    "sandbox.route": "Binding to configure",
    "sandbox.addRoute": "Add binding to selected resource",
    "sandbox.removeRoute": "Remove binding",
    "sandbox.routeMethod": "Binding HTTP method",
    "sandbox.routePath": "Binding path template",
    "sandbox.routeResource": "Binding resource",
    "sandbox.action": "Resource action",
    "sandbox.action.list": "List records",
    "sandbox.action.read": "Read one record",
    "sandbox.action.create": "Create record",
    "sandbox.action.replace": "Replace record",
    "sandbox.action.merge": "Update record fields",
    "sandbox.action.delete": "Delete record",
    "sandbox.idParameter": "ID path parameter (blank for list/create)",
    "sandbox.scope": "Parent scope mapping (JSON object)",
    "sandbox.routeHelp":
      'Bind GET/HEAD to list/read, POST to create, PUT to replace, PATCH to field updates, and DELETE to delete. For /teams/{teamId}/tasks/{id}, map {"teamId":"teamId"} to scope records by that field. Account for every path parameter. Static routes take priority over overlapping parameter routes. Up to 100 bindings.',
    "sandbox.dirty":
      "Configuration has pending changes. Start/restart to apply them and reset records, or discard edits to continue the current run.",
    "sandbox.start": "Validate and start/restart sandbox",
    "sandbox.discard": "Discard configuration edits",
    "sandbox.exportProject": "Download sandbox project",
    "sandbox.console": "Local request console",
    "sandbox.consoleHelp":
      "Use a concrete local path, such as /tasks/1. List requests support exact scalar filters, repeated values as alternatives, and _offset/_limit (default 0/100, limit up to 500). PUT replaces fields; PATCH merges top-level fields and keeps null values. Responses use 200, 201 for creates, and 204 for deletes. This simulates resource behavior, not the complete OpenAPI contract.",
    "sandbox.method": "Sandbox request method",
    "sandbox.path": "Sandbox request path and query",
    "sandbox.body": "Sandbox request JSON body",
    "sandbox.send": "Send local request",
    "sandbox.undo": "Undo last sandbox request",
    "sandbox.reset": "Reset records to seeds",
    "sandbox.response": "Sandbox response",
    "sandbox.state": "Current resource state",
    "sandbox.inspectResource": "Resource to inspect",
    "sandbox.records": "Current records preview (first 16,000 characters)",
    "sandbox.recordCount": "Records: {count}",
    "sandbox.exportState": "Download all current records",
    "sandbox.checkpoint": "Use current records as seeds and restart",
    "sandbox.history": "Sandbox request log",
    "sandbox.historyHelp":
      "The last 20 requests retain undo snapshots. Undo removes the most recent request, including failed/read requests. Reset and restart clear the log. Logs exclude bodies and record values; paths can contain private IDs or query values.",
    "sandbox.emptyHistory": "Send a request to begin a workflow.",
    "sandbox.changed": "Records changed",
    "sandbox.unchanged": "Records unchanged",
    "sandbox.exportLog": "Download sandbox run log",
    "sandbox.started": "Sandbox started from its seed records.",
    "sandbox.resetDone": "Seed records restored and request log cleared.",
    "sandbox.undone": "Last sandbox request undone.",
    "sandbox.checkpointed":
      "Current records saved as project seeds; the request log has been cleared.",
    "sandbox.captured":
      "Editor endpoint choices refreshed. Select an endpoint and add a binding; review its action and scope settings.",
    "sandbox.imported": "Sandbox project restored and started from seeds.",
    "sandbox.downloaded": "Sandbox download started.",
    "sandbox.error.json":
      "Use valid JSON within the size and nesting limits. Current running state is preserved.",
    "sandbox.error.project":
      "This is not a valid version 1 RSSwag stateful sandbox project.",
    "sandbox.error.limit":
      "The sandbox exceeds its file, record, route, or structure limits. Projects are limited to 1 MiB and request bodies to 64 KiB.",
    "sandbox.error.resource":
      "Resources need unique keys (lowercase letters, digits, hyphens; starting with a letter), an ID field/type, and a JSON array of records.",
    "sandbox.error.identity":
      "Every seed record needs a unique ID of the configured type: a safe integer or a nonempty string of at most 256 characters. String IDs cannot be dot segments or contain control characters.",
    "sandbox.error.route":
      "Check binding paths, methods, actions, resource choices, ID parameters, and scope mappings. Every path parameter must map to the ID or one distinct non-ID field.",
    "sandbox.error.ambiguous":
      "Two bindings for the same HTTP method overlap with equal specificity. Change or remove one before starting.",
    "sandbox.error.source":
      "Could not read endpoint choices. Use a valid OpenAPI document within the import limits.",
    "sandbox.error.read":
      "Could not read this sandbox project. Current work is preserved.",
    "sandbox.error.download":
      "The sandbox download could not start. Try again.",
    "composer.title": "API gateway composer",
    "composer.description":
      "Combine independent service definitions into one OpenAPI gateway contract with route prefixes, isolated components, security requirements, and a source routing inventory.",
    "composer.help":
      "This designs a contract; it does not deploy or configure a gateway. Primary routes use the gateway URL, so configure matching gateway routes before execution. Work stays in this tab until explicitly exported or applied. Projects contain original schemas, examples, and URLs; review them before sharing. Up to 8 services, 1 MiB per source, 1.5 MiB combined source text, and 2 MiB per project/output.",
    "composer.files": "Add service definitions (JSON/YAML)",
    "composer.projectFile":
      "Restore composition project (replaces current project)",
    "composer.loading": "Reading composition files…",
    "composer.capture": "Add current editor as a service",
    "composer.exportProject": "Download composition project",
    "composer.pasteHeading": "Paste a service definition",
    "composer.paste": "Service definition to add",
    "composer.addPasted": "Add pasted service",
    "composer.apiTitle": "Gateway API title",
    "composer.version": "Gateway API version",
    "composer.gateway": "Gateway server URL",
    "composer.serviceCount": "Services: {count}/{max}",
    "composer.enable": "Include {name} ({key})",
    "composer.serviceEditor": "Service configuration",
    "composer.name": "Service display name",
    "composer.namespace": "Service namespace",
    "composer.prefix": "Gateway route prefix",
    "composer.namespaceHelp":
      "Namespaces must be unique: lowercase letters, digits, or hyphens, starting with a letter (32 characters maximum). Prefixes are static paths such as /billing; leave blank for original paths. Services must use the same OpenAPI 3.0 or 3.1 family and JSON Schema dialect.",
    "composer.moveUp": "Move service earlier",
    "composer.moveDown": "Move service later",
    "composer.remove": "Remove service from composition",
    "composer.sourceHeading": "Edit this service definition",
    "composer.source": "Selected service source",
    "composer.saveSource": "Validate and use source edits",
    "composer.revertSource": "Discard pending source edits",
    "composer.dirty":
      "Some service source edits are pending. Validate or discard them before composing or exporting. Switching services keeps those edits.",
    "composer.generate": "Preview gateway composition",
    "composer.result": "Gateway composition result",
    "composer.summary":
      "Composition · {services} services · {routes} routes · {components} components",
    "composer.search": "Search composed routes",
    "composer.route": "Gateway route and operation ID",
    "composer.upstream": "Original service route and servers",
    "composer.noServer": "No upstream server declared",
    "composer.noRoutes": "No matching routes.",
    "composer.previous": "Previous composed routes",
    "composer.next": "Next composed routes",
    "composer.page": "Page {page}/{total}",
    "composer.diagnosticCount":
      "Composition diagnostics: {count} (showing {shown})",
    "composer.severity.error": "Error",
    "composer.severity.warning": "Review",
    "composer.inspect": "Inspect service",
    "composer.blocked":
      "Composition is incomplete. Fix the errors or exclude the affected services, then preview again. API export and application are disabled.",
    "composer.exportInventory": "Download routing inventory and diagnostics",
    "composer.format": "Composed API format",
    "composer.preview": "Composed OpenAPI preview (first 12,000 characters)",
    "composer.copy": "Copy composed OpenAPI",
    "composer.download": "Download composed OpenAPI",
    "composer.apply": "Apply composed API to editor",
    "composer.applyHelp":
      "Applying replaces the editor document and keeps an undo snapshot. If the editor changed since preview, preview again first. Undo stops if later editor edits would be overwritten.",
    "composer.undo": "Undo composition application",
    "composer.imported": "Composition sources imported.",
    "composer.sourceSaved":
      "Validated source edits are now part of the composition.",
    "composer.copied": "Composed API copied.",
    "composer.downloaded": "Composition download started.",
    "composer.applied": "Composed API applied to the editor.",
    "composer.undone": "Previous editor document restored.",
    "composer.error.source":
      "Use a valid OpenAPI 3.0 or 3.1 JSON/YAML document. Upgrade Swagger 2 with the existing upgrade tool first.",
    "composer.error.limit":
      "The composition exceeds its file, service count, operation count, or structure limits. Reduce the project size or complexity.",
    "composer.error.project":
      "The composition project or service settings are invalid. Current work has been preserved.",
    "composer.error.settings":
      "Enter a title, version, and absolute HTTP(S) gateway URL without credentials, query strings, fragments, or variables.",
    "composer.error.empty": "Include at least one service in the composition.",
    "composer.error.output":
      "The composition cannot be exported. Resolve its diagnostics or reduce the output size/complexity (2 MiB maximum).",
    "composer.error.read":
      "The files could not be read. Current work has been preserved.",
    "composer.error.copy":
      "Clipboard access failed. Download the composed API instead.",
    "composer.error.download":
      "The download was blocked. Try copying the API or downloading again.",
    "composer.error.stale":
      "The editor changed since preview. Preview the composition again before applying.",
    "composer.error.undo":
      "The editor changed after application. Undo was stopped to preserve those edits.",
    "composer.issue.settings":
      "Correct this service's namespace or static route prefix. Prefix segments cannot be . or .., variables, queries, or fragments.",
    "composer.issue.version":
      "Services must use the same OpenAPI minor version family and declared JSON Schema dialect. Convert them to a common version first.",
    "composer.issue.namespace":
      "Another included service uses this namespace. Choose a unique namespace.",
    "composer.issue.collision":
      "This gateway path overlaps another path, including equivalent parameter templates. Change a service prefix or its source paths; no path is overwritten.",
    "composer.issue.reference":
      "A local reference is broken, points outside retained components/paths/webhooks, or targets metadata removed by gateway routing. Correct the reference before composing.",
    "composer.issue.external":
      "External or relative references cannot be safely relocated. Bundle the service's files first; no references are fetched automatically.",
    "composer.issue.pathRef":
      "Referenced path items require expansion before composition. Inline the path item so routing and inherited settings can be reviewed explicitly.",
    "composer.issue.operationId":
      "This operation ID is duplicated within the service. Give operations unique IDs before composing.",
    "composer.issue.link":
      "A response link does not resolve to a known operation in this service. Correct its operationId or local operationRef.",
    "composer.issue.security":
      "A security requirement is malformed or names a missing scheme. Define the scheme or correct the requirement.",
    "composer.issue.schemaScope":
      "Custom schema dialects, schema IDs, anchors, and dynamic/recursive references need manual normalization before namespacing; their resolution scope cannot be safely relocated.",
    "composer.issue.discriminator":
      "Implicit discriminator mappings can change when schemas are renamed. Provide explicit mappings for every discriminator value before composing.",
    "composer.issue.extensions":
      "Vendor extension values are retained as opaque data. Review embedded names, references, and gateway-specific settings manually. Root extensions are kept in service metadata.",
    "composer.issue.shape":
      "This path, operation, or component has an unsupported or invalid structure. Correct the source definition.",
    "migration.title": "Postman migration studio",
    "migration.description":
      "Turn a Postman Collection v2.1 into an OpenAPI 3.1 draft with folder tags, editable paths, request and response schemas, authentication definitions, and conversion diagnostics.",
    "migration.privacy":
      "Conversion runs locally in this tab. Collections and environments are not saved automatically. Scripts, dynamic variables, and file contents are never executed or loaded. Up to 500 requests and 5 MiB per import; generated documents are limited to 2 MiB.",
    "migration.file": "Import Postman collection",
    "migration.pasteHeading": "Paste collection JSON",
    "migration.paste": "Postman collection JSON",
    "migration.import": "Import pasted collection",
    "migration.loading": "Reading Postman file…",
    "migration.imported":
      "Import complete. Generate a draft to review the conversion.",
    "migration.selected": "Selected requests: {count}/{total}",
    "migration.apiTitle": "Migrated API title",
    "migration.version": "Migrated API version",
    "migration.variablesHeading": "Variables and environment",
    "migration.variablesHelp":
      "String overrides take priority over enabled environment values, then request, folder, and collection variables. Standalone path variables become OpenAPI parameters; other static variables are resolved. A new collection clears environment values and overrides.",
    "migration.environment": "Import Postman environment",
    "migration.environmentCount": "Enabled environment values: {count}",
    "migration.clearEnvironment": "Clear imported environment",
    "migration.overrides": "Migration variable overrides (JSON string map)",
    "migration.fallback":
      "Fallback server for relative or unresolved base URLs",
    "migration.examples": "Include resolved query/header and raw-body examples",
    "migration.examplesHelp":
      "Examples are off by default. Enabling them can include private request and response values. Auth helper credentials and Authorization/Cookie headers are excluded; URLs, names, descriptions, and other fields still require review before sharing.",
    "migration.required":
      "Mark consistently observed JSON and form properties as required",
    "migration.search": "Search collection requests",
    "migration.selectFiltered": "Select filtered requests",
    "migration.deselectFiltered": "Deselect filtered requests",
    "migration.pathHelp":
      "Leave a path override blank to use the source path. Use /users/{id} to combine concrete routes. Matching method/path requests merge into one operation, combining observed shapes, statuses, servers, and authentication alternatives.",
    "migration.selectRequest": "Select {name} ({id})",
    "migration.pathOverride": "Path override for {name} ({id})",
    "migration.noMatches": "No matching requests.",
    "migration.previous": "Previous requests",
    "migration.next": "Next requests",
    "migration.page": "Page {page}/{total}",
    "migration.generate": "Generate migrated OpenAPI",
    "migration.result": "Postman migration result",
    "migration.summary":
      "Migration draft · {requests} requests · {operations} operations",
    "migration.review":
      "Inferred schemas describe the supplied examples, not a verified API contract. Query/header parameters and bodies remain optional. Review required fields, authentication, content types, and all conversion diagnostics before use.",
    "migration.operations": "Converted operations (source request count)",
    "migration.diagnostics":
      "Conversion diagnostics: {count} (showing {shown})",
    "migration.severity.warning": "Review",
    "migration.severity.error": "Error",
    "migration.blocked":
      "Fix or deselect requests with errors, then regenerate. Export and editor application are disabled to prevent an incomplete migration.",
    "migration.format": "Migrated definition format",
    "migration.preview": "Migrated OpenAPI preview (first 12,000 characters)",
    "migration.copy": "Copy migrated OpenAPI",
    "migration.download": "Download migrated OpenAPI",
    "migration.apply": "Apply migrated API to editor",
    "migration.applyHelp":
      "Applying replaces the editor document. Undo is available until you change that document. If the editor changed since generation, generate a fresh draft first.",
    "migration.undo": "Undo migration application",
    "migration.copied": "Migrated OpenAPI copied.",
    "migration.downloaded": "Migrated OpenAPI download started.",
    "migration.applied": "Migrated API applied to the editor.",
    "migration.undone": "Previous editor document restored.",
    "migration.error.json":
      "Enter valid JSON with finite, safely represented numbers.",
    "migration.error.limit":
      "The import exceeds the supported size, request count, nesting, or structure limits.",
    "migration.error.collection":
      "Import a Postman Collection v2.1 JSON file containing at least one valid request.",
    "migration.error.environment":
      "Import a Postman environment JSON object with a values array of named string, number, or boolean values.",
    "migration.error.overrides":
      "Variable overrides must be a JSON object with nonempty keys and string values.",
    "migration.error.selection":
      "Select at least one request from the imported collection.",
    "migration.error.metadata":
      "Enter an API title (up to 200 characters), version (up to 80), and a valid HTTP(S) fallback server if supplied.",
    "migration.error.output":
      "The draft cannot be exported: resolve conversion errors or reduce its size/complexity (2 MiB maximum).",
    "migration.error.read":
      "The Postman file could not be read. Your current migration is still available.",
    "migration.error.copy":
      "Clipboard access failed. Download the document instead.",
    "migration.error.download":
      "The browser blocked the download. Copy the document instead.",
    "migration.error.stale":
      "The editor changed since generation. Generate a fresh draft before applying.",
    "migration.error.undo":
      "The editor changed after application. Undo would overwrite those edits, so it was stopped.",
    "migration.diagnostic.scripts":
      "Scripts are present. Pre-request and test scripts are not executed or translated; recreate their behavior manually.",
    "migration.diagnostic.settings":
      "Postman protocol settings are present and are not translated into the API contract.",
    "migration.diagnostic.method":
      "This request method cannot be represented as an OpenAPI operation.",
    "migration.diagnostic.url":
      "The URL could not be converted. Supply missing static variables or a valid fallback server, then check the path.",
    "migration.diagnostic.path":
      "Use an absolute path without query/fragment text. Parameters must occupy a full segment, have unique names, and use letters, digits, or underscores.",
    "migration.diagnostic.unresolved":
      "A variable is unresolved, dynamic, cyclic, or beyond the expansion limit. Supply static overrides and review the inferred output.",
    "migration.diagnostic.auth":
      "This authentication helper needs manual configuration. The operation is marked x-postman-auth-review-required; do not interpret it as a public endpoint.",
    "migration.diagnostic.headers":
      "Authorization, Cookie, or invalid header names were excluded. Review authentication requirements; only supported auth helpers generate security schemes.",
    "migration.diagnostic.body":
      "This request body mode is not supported. Add its contract manually.",
    "migration.diagnostic.sample":
      "A JSON body could not be safely inferred or exceeded the sample limits. Its media type is retained with an unconstrained schema.",
    "migration.diagnostic.file":
      "File payloads are represented as binary schemas. Local filenames and file contents are not imported.",
    "migration.diagnostic.response":
      "A saved response has an invalid HTTP status and was skipped. Review response coverage.",
    "migration.diagnostic.merged":
      "Requests with the same method and path were merged. Review combined schemas and security alternatives; examples use the first available value per media type.",
    "migration.diagnostic.conflict":
      "Equivalent path templates use different parameter names. Give these requests the same path override or deselect one.",
    "migration.diagnostic.credentials":
      "Credentials embedded in the URL were removed from the server URL. Configure authentication separately.",
    "benchmark.title": "API performance lab",
    "benchmark.description":
      "Measure GET/HEAD endpoint performance with a bounded workload, warm-up traffic, concurrent requests, latency percentiles, and reusable performance budgets.",
    "benchmark.privacy":
      "Plans, session headers, and results stay in this tab. Nothing runs or saves automatically. Reports retain operation names and paths, statuses, sizes, and timings; they exclude target URLs, parameter values, response bodies, and headers.",
    "benchmark.configure": "Configure API benchmark",
    "benchmark.name": "Benchmark plan name",
    "benchmark.mode": "Benchmark execution mode",
    "benchmark.mode.mock": "Mock",
    "benchmark.mode.live": "Live",
    "benchmark.mockHelp":
      "Mock rehearses the scheduler and budgets offline using documented response variants and configured delays. It sends no API requests and does not measure a deployed service.",
    "benchmark.liveHelp":
      "Run Live benchmark sends the configured GET/HEAD traffic through the app’s existing proxy. Use an API you are authorized to test. The target overrides schema servers. Up to 200 requests including warm-up, 5 concurrent requests, and 10 launches per second; an elapsed-time limit stops remaining work.",
    "benchmark.target": "Benchmark target server URL",
    "benchmark.headers": "Benchmark session headers (JSON)",
    "benchmark.headersHelp":
      "Use a public HTTP(S) base URL without credentials, query strings, or fragments. Session headers override case headers by name and are never exported. Changing the target or importing a plan clears them.",
    "benchmark.clearHeaders": "Clear benchmark headers",
    "benchmark.workload": "Workload settings",
    "benchmark.setting.requests": "Measured requests",
    "benchmark.setting.warmup": "Warm-up requests",
    "benchmark.setting.concurrency": "Maximum concurrency",
    "benchmark.setting.ratePerSecond": "Maximum launches per second",
    "benchmark.setting.timeoutMs": "Request timeout (ms)",
    "benchmark.setting.maxRunMs": "Run time limit (ms)",
    "benchmark.setting.stopAfterErrors":
      "Stop after measured failures (0 disables)",
    "benchmark.setting.maxP95Ms": "Maximum p95 latency (ms; 0 disables)",
    "benchmark.setting.maxErrorPercent": "Maximum failure rate (%)",
    "benchmark.setting.minThroughput":
      "Minimum throughput (requests/s; 0 disables)",
    "benchmark.workloadHelp":
      "Warm-up finishes before measurement begins. Cases use weighted round robin, restarting for each phase. The launch rate is a ceiling, not guaranteed throughput. Browser scheduling, proxy overhead, and network conditions affect results; keep this tab active. Timeouts and stop limits cancel in-flight requests.",
    "benchmark.budgets": "Performance budgets",
    "benchmark.search": "Search benchmark endpoints",
    "benchmark.endpoint": "Endpoint for benchmark case",
    "benchmark.chooseEndpoint": "Choose a GET/HEAD endpoint",
    "benchmark.add": "Add benchmark case",
    "benchmark.addVisible": "Add visible benchmark endpoints",
    "benchmark.caseCount": "Benchmark cases: {count}/10",
    "benchmark.case": "Benchmark case to edit",
    "benchmark.caseName": "Benchmark case name",
    "benchmark.weight": "Traffic weight (1–10)",
    "benchmark.expected": "Expected statuses",
    "benchmark.caseHelp":
      "Weights control each case’s share of the request schedule. Small runs may not reach every case. Expected statuses accept codes, ranges, or any, separated by commas (for example 200,204 or 2xx). Responses outside this set count as failures.",
    "benchmark.mockStatus": "Benchmark Mock response",
    "benchmark.mockLatency": "Simulated response delay (ms)",
    "benchmark.parameters": "Benchmark request parameters",
    "benchmark.parametersHelp":
      "Values are literal and are included in plan exports. Repeated query keys are supported; blank values are omitted. Put credentials in session headers when possible. Mock mode does not require request inputs.",
    "benchmark.parameter": "Request parameter {index}",
    "benchmark.parameterLocation": "Parameter location",
    "benchmark.parameterName": "Parameter name",
    "benchmark.parameterValue": "Parameter value",
    "benchmark.removeParameter": "Remove benchmark parameter",
    "benchmark.addParameter": "Add benchmark parameter",
    "benchmark.viewEndpoint": "View benchmark endpoint",
    "benchmark.moveUp": "Move benchmark case up",
    "benchmark.moveDown": "Move benchmark case down",
    "benchmark.remove": "Remove benchmark case",
    "benchmark.endpointMissing":
      "This operation is missing from the current schema. Restore it or remove this case before running.",
    "benchmark.runMock": "Run Mock benchmark",
    "benchmark.runLive": "Run Live benchmark",
    "benchmark.running": "Running…",
    "benchmark.stop": "Stop benchmark",
    "benchmark.progress": "{phase}: {done}/{total} completed · {active} active",
    "benchmark.progressLabel": "Benchmark progress",
    "benchmark.phase.warmup": "Warm-up",
    "benchmark.phase.measured": "Measured",
    "benchmark.finished":
      "Benchmark finished. Review the metrics and performance budgets below.",
    "benchmark.results": "Benchmark results",
    "benchmark.runSummary":
      "{mode} · Started {started} · Elapsed {elapsed} ms · Measurement window {window} ms · Peak concurrency {peak}",
    "benchmark.mockResults":
      "Mock rehearsal: timings describe simulated browser delays and local processing, not a deployed API. Do not interpret these results as server performance.",
    "benchmark.stop.completed": "Completed",
    "benchmark.stop.cancelled": "Stopped by user",
    "benchmark.stop.time-limit": "Time limit reached",
    "benchmark.stop.error-limit": "Failure limit reached",
    "benchmark.metric.completed": "Completed attempts",
    "benchmark.metric.errorRate": "Failure rate (%)",
    "benchmark.metric.throughput": "Throughput (requests/s)",
    "benchmark.metric.p95": "p95 latency (ms)",
    "benchmark.metric.mean": "Mean latency (ms)",
    "benchmark.metric.operation": "Operation",
    "benchmark.countSummary":
      "Successful: {success} · Failed: {failed} · Cancelled: {cancelled} · Warm-up: {warmup} ({warmupErrors} failed)",
    "benchmark.metricsHelp":
      "Latency is measured from client dispatch to completion, including proxy and network overhead. All completed measured attempts, including HTTP failures, timeouts, and network errors, contribute to latency and throughput. Cancelled and warm-up requests are excluded. Percentiles use nearest rank; small samples are descriptive, not a capacity benchmark. Per-case throughput uses the same overall measurement window.",
    "benchmark.stat.minMs": "Min",
    "benchmark.stat.meanMs": "Mean",
    "benchmark.stat.p50Ms": "p50",
    "benchmark.stat.p90Ms": "p90",
    "benchmark.stat.p95Ms": "p95",
    "benchmark.stat.p99Ms": "p99",
    "benchmark.stat.maxMs": "Max",
    "benchmark.chart": "Latency by measured request number",
    "benchmark.chartHelp":
      "Purple points indicate successful requests; red points indicate failures or transport errors. Hover over a point for details, or inspect the sample table.",
    "benchmark.budget.p95": "p95 latency (ms)",
    "benchmark.budget.errors": "Failure rate (%)",
    "benchmark.budget.throughput": "Throughput (requests/s)",
    "benchmark.budget.passed": "Passed",
    "benchmark.budget.failed": "Failed",
    "benchmark.budget.disabled": "Disabled",
    "benchmark.budget.incomplete": "Incomplete run / insufficient data",
    "benchmark.perCase": "Benchmark metrics by case",
    "benchmark.comparison": "Benchmark baseline comparison",
    "benchmark.baseline": "Baseline",
    "benchmark.current": "Current",
    "benchmark.delta": "Current minus baseline",
    "benchmark.metricLabel": "Metric",
    "benchmark.incompatible":
      "Run modes, workload settings, case definitions, or completion states differ. These deltas are not a like-for-like comparison.",
    "benchmark.comparisonHelp":
      "Latency deltas use milliseconds, failure-rate deltas use percentage points, and throughput deltas use requests/s. Reports omit targets, parameters, and credentials; matching recorded settings cannot verify equivalent inputs or network conditions.",
    "benchmark.reportActions": "Benchmark report actions",
    "benchmark.pin": "Pin benchmark as baseline",
    "benchmark.baselinePinned": "Benchmark pinned as the comparison baseline.",
    "benchmark.pinned": "Baseline: {name} · {mode} · {date}",
    "benchmark.clearBaseline": "Clear benchmark baseline",
    "benchmark.downloadJson": "Download benchmark JSON",
    "benchmark.downloadCsv": "Download benchmark CSV",
    "benchmark.copyReport": "Copy benchmark report",
    "benchmark.copied": "Benchmark report copied.",
    "benchmark.downloaded": "Benchmark download started.",
    "benchmark.samples": "Benchmark request samples",
    "benchmark.sampleCase": "Filter benchmark case",
    "benchmark.allCases": "All benchmark cases",
    "benchmark.sampleOutcome": "Filter sample outcome",
    "benchmark.outcome.all": "All outcomes",
    "benchmark.outcome.success": "Successful",
    "benchmark.outcome.failed": "Unexpected status",
    "benchmark.outcome.error": "Transport error",
    "benchmark.outcome.cancelled": "Cancelled",
    "benchmark.showWarmup": "Include warm-up samples",
    "benchmark.sampleCount": "Matching samples: {count}",
    "benchmark.column.number": "#",
    "benchmark.column.phase": "Phase",
    "benchmark.column.operation": "Operation",
    "benchmark.column.status": "HTTP status",
    "benchmark.column.duration": "Client latency (ms)",
    "benchmark.column.proxy": "Proxy timing (ms)",
    "benchmark.column.outcome": "Outcome",
    "benchmark.previous": "Previous benchmark samples",
    "benchmark.next": "Next benchmark samples",
    "benchmark.downloadPlan": "Download benchmark plan",
    "benchmark.importExport": "Benchmark plan and baseline import",
    "benchmark.importHelp":
      "Import a plan to replace the current configuration; execution returns to Mock and clears session headers. Plans include target URLs and literal request inputs. Import a report to set the comparison baseline without changing the plan. Files are limited to 2 MiB. Imported summaries are recalculated from samples.",
    "benchmark.importKind": "Benchmark import type",
    "benchmark.importPlanOption": "Workload plan",
    "benchmark.importBaselineOption": "Report as baseline",
    "benchmark.importJson": "Benchmark import JSON",
    "benchmark.import": "Import benchmark JSON",
    "benchmark.importFile": "Import benchmark file",
    "benchmark.loading": "Reading benchmark file…",
    "benchmark.cancelImport": "Cancel benchmark import",
    "benchmark.importCancelled": "Benchmark import cancelled.",
    "benchmark.planImported":
      "Benchmark plan imported in Mock mode. Session headers were cleared.",
    "benchmark.baselineImported": "Benchmark report imported as the baseline.",
    "benchmark.error.invalid-plan":
      "Invalid benchmark plan. Check names, unique case IDs, request limits, weights, expected statuses, and parameter values.",
    "benchmark.error.limit":
      "The benchmark plan, request, or file exceeds its size or processing limit.",
    "benchmark.error.headers":
      "Session headers must be a JSON object of string values without duplicate names or transport-controlled headers.",
    "benchmark.error.target":
      "Use a valid public HTTP(S) base URL without credentials, query strings, or fragments. The proxy may also reject unavailable or private destinations.",
    "benchmark.error.missing-endpoint":
      "A workload operation is missing or ambiguous in the current schema. Case: {index}",
    "benchmark.error.missing-parameter":
      "A required request parameter is missing. Case: {index}",
    "benchmark.error.mock-response":
      "The selected Mock response is missing from the schema. Case: {index}",
    "benchmark.error.network": "The request could not be completed.",
    "benchmark.error.timeout": "The request timed out.",
    "benchmark.error.invalid-response":
      "The request returned an invalid proxy response.",
    "benchmark.error.response-limit":
      "The response exceeded the supported size.",
    "benchmark.error.cancelled": "The request was cancelled.",
    "benchmark.error.invalid-report":
      "Invalid benchmark report. Import an unchanged report exported by this performance lab.",
    "benchmark.error.read": "The benchmark operation could not be completed.",
    "benchmark.error.export":
      "Export failed. Try copying or downloading the report again.",
    "fixtures.title": "API fixture studio",
    "fixtures.description":
      "Generate repeatable test datasets from your OpenAPI schemas. Link records across datasets, customize fields, and export data for frontend development and automated tests.",
    "fixtures.privacy":
      "Runs offline in this tab. Nothing is sent to an API or saved automatically. Examples and defaults are not sampled; enum values, constants, and your overrides can contain real data. Review exports before sharing.",
    "fixtures.configure": "Configure fixture datasets",
    "fixtures.capture": "Use current editor as fixture source",
    "fixtures.captured":
      "Fixture source captured. Your recipe is ready to configure.",
    "fixtures.sourceSummary": "{title} · {count} schema sources",
    "fixtures.snapshot":
      "Generation uses the captured source. Capture again after editing the API; your recipe is retained.",
    "fixtures.sourcesLimited":
      "Source discovery was capped at 500 schemas or its scan limit. Use a smaller document to access omitted schemas.",
    "fixtures.noSources":
      "No component models or JSON request/response schemas were found.",
    "fixtures.seed": "Generation seed",
    "fixtures.optional": "Include optional properties",
    "fixtures.search": "Search fixture schemas",
    "fixtures.source": "Schema for new dataset",
    "fixtures.chooseSource": "Choose a schema",
    "fixtures.add": "Add fixture dataset",
    "fixtures.counts": "Datasets: {datasets}/10 · Rows: {rows}/2000",
    "fixtures.dataset": "Dataset to edit",
    "fixtures.name": "Dataset name",
    "fixtures.rows": "Rows to generate",
    "fixtures.direction": "Schema direction",
    "fixtures.direction.none": "Model (all fields)",
    "fixtures.direction.request": "Request (omit read-only fields)",
    "fixtures.direction.response": "Response (omit write-only fields)",
    "fixtures.nameHelp":
      "Use unique names with letters, digits, underscores, or hyphens, starting with a letter or underscore (up to 64 characters).",
    "fixtures.rules": "Field overrides",
    "fixtures.rulesHelp":
      "Override top-level object fields with a sequence, JSON constant, or a scalar field from another dataset. References cycle through parent rows in order. Dependencies are generated first; circular references are rejected.",
    "fixtures.rule": "Field rule {index}",
    "fixtures.field": "Target field",
    "fixtures.ruleType": "Override type",
    "fixtures.kind.sequence": "Sequence",
    "fixtures.kind.constant": "JSON constant",
    "fixtures.kind.reference": "Dataset reference",
    "fixtures.start": "Sequence start",
    "fixtures.step": "Sequence step",
    "fixtures.asString": "Generate string IDs",
    "fixtures.prefix": "ID prefix",
    "fixtures.constant": "Constant value (JSON)",
    "fixtures.parent": "Referenced dataset",
    "fixtures.chooseDataset": "Choose a dataset",
    "fixtures.parentField": "Referenced field name",
    "fixtures.removeRule": "Remove field rule",
    "fixtures.addRule": "Add field rule",
    "fixtures.removeDataset": "Remove dataset",
    "fixtures.generate": "Generate fixtures",
    "fixtures.generated":
      "Fixtures generated. Review diagnostics before using the data.",
    "fixtures.progress": "Generating fixtures: {done}/{total} rows",
    "fixtures.loading": "Reading fixture recipe…",
    "fixtures.cancel": "Cancel fixture operation",
    "fixtures.exportRecipe": "Download fixture recipe",
    "fixtures.limits":
      "Up to 10 datasets, 500 rows each, and 2,000 rows total. Nested arrays are capped at 50 items; objects at 100 properties. Sources and recipes: 2 MiB; each export: 8 MiB. Large or complex schemas may reach processing limits.",
    "fixtures.importExport": "Fixture recipe import and export",
    "fixtures.recipeHelp":
      "Recipes include seeds, schema pointers, dataset settings, and overrides, including constant values. They exclude the source document and generated rows. Import replaces the current recipe; capture a compatible schema before generating.",
    "fixtures.recipeJson": "Fixture recipe JSON",
    "fixtures.importRecipe": "Import fixture recipe",
    "fixtures.importFile": "Import fixture recipe file",
    "fixtures.imported":
      "Fixture recipe imported. Capture a compatible source to generate data.",
    "fixtures.results": "Generated fixture datasets",
    "fixtures.resultSeed": "Seed: {seed}",
    "fixtures.resultSummary":
      "{name}: {rows} rows · {invalid} invalid · {review} need review",
    "fixtures.validationHelp":
      "Rows are checked with the app’s supported schema validator, not a complete JSON Schema implementation. Complex compositions may produce invalid rows. Patterns, recursion, unresolved references, and unsupported keywords need review. Exports include all rows, including invalid ones.",
    "fixtures.exportScope": "Dataset to export",
    "fixtures.allDatasets": "All datasets (JSON object)",
    "fixtures.format": "Fixture export format",
    "fixtures.download": "Download fixture data",
    "fixtures.copy": "Copy fixture data",
    "fixtures.copied": "Fixture data copied.",
    "fixtures.downloaded": "Fixture download started.",
    "fixtures.preview":
      "Preview: {name}, rows {start}–{end} of {total}. Large previews are shortened; exports contain all rows.",
    "fixtures.previewLabel": "Fixture data preview",
    "fixtures.previous": "Previous fixture rows",
    "fixtures.next": "Next fixture rows",
    "fixtures.issues": "Fixture diagnostics ({count})",
    "fixtures.issueLocation": "{name}, row {row}:",
    "fixtures.issuesLimited":
      "Showing the first 200 diagnostics. Counts include all diagnostics.",
    "fixtures.issue.unsupported": "This schema keyword needs manual review.",
    "fixtures.issue.reference": "The reference could not be resolved locally.",
    "fixtures.issue.recursive": "A recursive reference was replaced with null.",
    "fixtures.issue.depth": "The nesting limit was reached.",
    "fixtures.issue.pattern":
      "Pattern-based generation is not supported; review this value.",
    "fixtures.issue.constraint":
      "The generator could not satisfy this constraint.",
    "fixtures.issue.validation": "The generated value failed a schema check.",
    "fixtures.issue.validation-limit":
      "Schema checking reached its processing limit.",
    "fixtures.error.recipe":
      "Invalid recipe. Check unique names, row limits, seeds, field rules, and JSON constants. Dataset: {dataset}",
    "fixtures.error.source":
      "The editor must contain a valid OpenAPI or Swagger document in JSON or YAML.",
    "fixtures.error.limit":
      "The source, recipe, generated data, or processing work exceeds a fixture limit. Reduce its size or complexity.",
    "fixtures.error.missing-source":
      "A dataset schema is missing from the captured source. Dataset: {dataset}",
    "fixtures.error.cycle":
      "Dataset references form a cycle. Remove a circular reference. Dataset: {dataset}",
    "fixtures.error.reference":
      "A referenced dataset or field is missing, null, or not a scalar value. Dataset: {dataset}",
    "fixtures.error.field":
      "Field overrides require an object schema with the selected top-level field. Dataset: {dataset}",
    "fixtures.error.cancelled": "Fixture operation cancelled.",
    "fixtures.error.csv":
      "Choose one dataset for NDJSON or CSV. CSV supports up to 64 columns.",
    "fixtures.error.read": "The fixture operation could not be completed.",
    "fixtures.error.export":
      "Export failed. Try the other copy or download option.",
    "parity.title": "Environment comparison runner",
    "parity.description":
      "Compare the same GET/HEAD requests against two deployments. Find status, response, contract, and latency differences before promoting an API change.",
    "parity.privacy":
      "Plans and results stay in this tab's memory. Export them before leaving. Response values are discarded after comparison; reports retain field paths and metadata. Nothing is added to request history, and no requests run automatically.",
    "parity.configure": "Configure environment comparison",
    "parity.name": "Comparison plan name",
    "parity.mode": "Comparison execution mode",
    "parity.mock": "Mock",
    "parity.live": "Live",
    "parity.baseline": "Baseline",
    "parity.candidate": "Candidate",
    "parity.baselineUrl": "Baseline server URL",
    "parity.candidateUrl": "Candidate server URL",
    "parity.liveHelp":
      "Run Live comparison sends up to two requests per case, baseline first, through the existing server proxy. Only GET and HEAD are supported. Use public HTTP(S) base URLs without credentials, query strings, or fragments. Each URL overrides the schema's servers.",
    "parity.mockHelp":
      "Mock compares documented response variants offline. Server URLs, authentication, and required request values are not needed. Choose different variants to rehearse a mismatch. Mock results do not verify deployed environments or latency.",
    "parity.credentials": "Session headers for each target",
    "parity.credentialsHelp":
      "Enter a JSON object of string header values, for example an Authorization header. Target headers override case headers by name. These values are never exported or saved. Changing a target URL clears its headers; importing a plan clears both targets' headers and selects Mock mode.",
    "parity.baselineHeaders": "Baseline session headers (JSON)",
    "parity.candidateHeaders": "Candidate session headers (JSON)",
    "parity.clearHeaders": "Clear session headers",
    "parity.rules": "Comparison rules",
    "parity.timeout": "Timeout per request (ms)",
    "parity.slowdown": "Allowed candidate slowdown (ms; 0 disables)",
    "parity.ignorePaths": "Ignored body JSON Pointers (one per line)",
    "parity.ignoreHeaders": "Ignored response headers (comma separated)",
    "parity.rulesHelp":
      "A pointer ignores that field and its descendants in structural JSON comparisons; wildcards are not supported. Invalid or unsafe-number JSON is compared as text. Header names are case insensitive. Latency checks use a single sequential sample, not a benchmark. Ignoring differences does not disable contract checks.",
    "parity.checkContract": "Check both response contracts",
    "parity.compareHeaders": "Compare response headers",
    "parity.stopOnFailure": "Stop after the first non-matching case",
    "parity.search": "Search comparison endpoints",
    "parity.endpoint": "Endpoint to compare",
    "parity.noEndpoints": "No matching GET/HEAD endpoints",
    "parity.add": "Add comparison case",
    "parity.addVisible": "Add visible GET/HEAD endpoints",
    "parity.clear": "Clear comparison cases",
    "parity.count": "Comparison cases: {count}/{max}",
    "parity.cases": "Ordered comparison cases",
    "parity.up": "Move comparison case {index} up",
    "parity.down": "Move comparison case {index} down",
    "parity.remove": "Remove comparison case {index}",
    "parity.editCase": "Edit comparison case",
    "parity.caseName": "Comparison case name",
    "parity.viewEndpoint": "View comparison endpoint",
    "parity.duplicate": "Duplicate comparison case",
    "parity.parametersHelp":
      "Case values are sent to both targets and included in plan exports. Put credentials in session headers. Blank values are omitted; Live runs require all documented required parameters.",
    "parity.parameterLocation": "Parameter {index} location",
    "parity.parameterName": "Parameter {index} name",
    "parity.parameterValue": "Parameter {index} value",
    "parity.removeParameter": "Remove parameter {index}",
    "parity.addParameter": "Add comparison parameter",
    "parity.baselineMock": "Baseline mock response",
    "parity.candidateMock": "Candidate mock response",
    "parity.portable": "Comparison plan import and export",
    "parity.portableHelp":
      "Definitions include target URLs, literal case parameters, and comparison rules. Review these before sharing. Session headers and results are excluded. Imports replace the current plan only after successful validation.",
    "parity.file": "Import comparison plan file",
    "parity.input": "Comparison plan JSON",
    "parity.import": "Import comparison plan",
    "parity.imported":
      "Comparison plan imported. Session headers cleared and Mock mode selected.",
    "parity.copyPlan": "Copy comparison plan",
    "parity.downloadPlan": "Download comparison plan",
    "parity.runLive": "Run Live comparison",
    "parity.runMock": "Run Mock comparison",
    "parity.loading": "Reading comparison plan…",
    "parity.caseNumber": "Case {index}",
    "parity.results": "Environment comparison results",
    "parity.progress": "Completed cases: {done}/{total}",
    "parity.finished": "{mode} comparison: {outcome}",
    "parity.report.matched": "all cases matched",
    "parity.report.failed": "review required",
    "parity.report.cancelled": "cancelled",
    "parity.resultHelp":
      "Matching means the configured checks agree; equal error responses can also match. Contract checks use the schema captured at run start and inspect documented status, media type, top-level shape, and required fields. They are not full schema validation. Use the endpoint tools to inspect response values separately.",
    "parity.resultSearch": "Search comparison results",
    "parity.resultFilter": "Filter comparison results",
    "parity.outcome.all": "All results",
    "parity.outcome.issues": "Needs review",
    "parity.outcome.matched": "Matched",
    "parity.outcome.different": "Different",
    "parity.outcome.inconclusive": "Inconclusive",
    "parity.outcome.error": "Request error",
    "parity.outcome.cancelled": "Cancelled",
    "parity.outcome.skipped": "Skipped",
    "parity.column.case": "Case",
    "parity.column.outcome": "Result",
    "parity.column.baseline": "Baseline status / time",
    "parity.column.candidate": "Candidate status / time",
    "parity.column.delta": "Candidate time delta",
    "parity.noResults": "No results match these filters.",
    "parity.limited":
      "Comparison limits were reached. These results cannot establish full equality.",
    "parity.slowdownFailed":
      "The candidate exceeded the allowed latency increase.",
    "parity.bodyMode": "Body comparison mode: {mode}",
    "parity.bytes": "Body: {bytes} bytes",
    "parity.contractCounts":
      "Contract: {passed} passed, {failed} failed, {skipped} skipped",
    "parity.contractOff": "Contract checks disabled",
    "parity.differences": "Reported differences: {count}",
    "parity.area.body": "Body",
    "parity.area.headers": "Headers",
    "parity.area.status": "Status",
    "parity.kind.added": "Added",
    "parity.kind.removed": "Removed",
    "parity.kind.changed": "Changed",
    "parity.root": "(body root)",
    "parity.copyReport": "Copy comparison report",
    "parity.downloadReport": "Download comparison report",
    "parity.running": "Comparing case {index}/{total} · {side}",
    "parity.starting": "Preparing comparison…",
    "parity.cancel": "Cancel environment comparison",
    "parity.copied": "Copied to clipboard.",
    "parity.downloaded": "Download started.",
    "parity.error.invalid-plan":
      "Invalid comparison plan. Check the name, GET/HEAD cases, unique IDs, parameters, pointers, timeout (1,000–30,000 ms), and slowdown allowance (0–60,000 ms).",
    "parity.error.limit":
      "The comparison limit was reached: 20 cases or 2 MiB per plan.",
    "parity.error.headers":
      "Session headers must be a JSON object of string values with unique header names. Use characters supported by HTTP headers (Latin-1); control characters and transport headers such as Host are not allowed.",
    "parity.error.target":
      "Use a public HTTP(S) server URL without credentials, query strings, or fragments. The server proxy also rejects private network targets.",
    "parity.error.missing-endpoint":
      "A case no longer identifies exactly one GET/HEAD operation in the current schema. Update the plan before running.",
    "parity.error.missing-parameter":
      "A required parameter is missing for this target, or a path placeholder is unresolved. Complete the case values or session headers.",
    "parity.error.mock-response":
      "A selected mock response is no longer documented. Choose an available response variant.",
    "parity.error.network":
      "The request could not be completed. Check the target and connection, then run again.",
    "parity.error.timeout": "The request timed out.",
    "parity.error.invalid-response":
      "The request returned an invalid result that could not be compared.",
    "parity.error.response-limit":
      "The response exceeded the body or header size limit.",
    "parity.error.cancelled":
      "Comparison cancelled; no more requests will be started.",
    "parity.error.stopped": "Skipped because an earlier case did not match.",
    "parity.error.read":
      "Unable to read the plan. Try pasting its JSON instead.",
    "parity.error.copy": "Copy failed. Try downloading instead.",
    "parity.error.download":
      "The browser blocked the download. Try copying instead.",
    "transform.title": "API transformation workbench",
    "transform.description":
      "Create reusable JSON Patch recipes to produce API variants, update metadata, or reorganize a definition. Preview every change before applying it.",
    "transform.help":
      "Runs locally using a captured editor snapshot. Recipes and snapshots stay in memory; export them before leaving. Applying uses the editor's normal save behavior. Values may contain sensitive data. JSON/YAML formatting and comments are not preserved. References are not automatically rewritten; review the result with the existing quality tools.",
    "transform.capture": "Use current editor as source",
    "transform.source": "Captured source: {title}",
    "transform.captured":
      "Source captured. Your recipe is preserved; generate a new preview before applying.",
    "transform.undo": "Undo transformation application",
    "transform.importHeading": "Import a JSON Patch recipe",
    "transform.file": "Recipe JSON file",
    "transform.input": "Recipe JSON",
    "transform.import": "Import pasted recipe",
    "transform.loading": "Reading recipe…",
    "transform.imported":
      "Recipe imported. Existing steps were replaced; the editor is unchanged.",
    "transform.add": "Add transformation step",
    "transform.versionTemplate": "Add version change",
    "transform.serverTemplate": "Add root server change",
    "transform.clear": "Clear recipe",
    "transform.steps": "Recipe steps: {count}/{max}",
    "transform.empty":
      "Add a step, choose a starter, or import an existing JSON Patch array.",
    "transform.recipe": "Ordered transformation steps",
    "transform.root": "(document root)",
    "transform.up": "Move step {step} up",
    "transform.down": "Move step {step} down",
    "transform.remove": "Remove step {step}",
    "transform.edit": "Edit step {step}",
    "transform.operation": "Patch operation",
    "transform.path": "Target JSON Pointer",
    "transform.from": "Source JSON Pointer",
    "transform.value": "Step value (JSON)",
    "transform.duplicate": "Duplicate selected step",
    "transform.op.add": "Insert or set a value",
    "transform.op.replace": "Replace an existing value",
    "transform.op.remove": "Remove an existing value",
    "transform.op.copy": "Copy a value",
    "transform.op.move": "Move a value",
    "transform.op.test": "Require an expected value",
    "transform.opHelp.add":
      "Sets an object member or inserts an array item. The parent must already exist. Use /- to append to an array.",
    "transform.opHelp.replace":
      "Replaces an existing target. An absent target stops the entire recipe.",
    "transform.opHelp.remove":
      "Deletes an existing target. Array indices shift after removal.",
    "transform.opHelp.copy":
      "Copies the source value to the target using add semantics. Later edits to the copy do not affect the original.",
    "transform.opHelp.move":
      "Removes the source, then adds it at the target. Array target indices refer to the array after removal. References are not rewritten.",
    "transform.opHelp.test":
      "Stops the recipe unless the target equals this JSON value. Use this to guard the API version or other assumptions.",
    "transform.browser": "Browse source JSON Pointers",
    "transform.pointerHelp":
      "Browse the captured source, before recipe steps. Escape / as ~1 and ~ as ~0. An empty pointer addresses the whole document; / addresses an empty property name. URI fragments (#/…) are not accepted.",
    "transform.search": "Search source pointers",
    "transform.matches": "Showing {shown} of {count} matching pointers",
    "transform.use": "Use as target",
    "transform.useSource": "Use as source",
    "transform.usePath": "Use {path} as target pointer",
    "transform.useFrom": "Use {path} as source pointer",
    "transform.preview": "Preview transformation",
    "transform.copyRecipe": "Copy recipe JSON",
    "transform.downloadRecipe": "Download recipe JSON",
    "transform.ready":
      "Preview ready. The result passed the editor's structural checks; review references and API semantics before applying.",
    "transform.stepError": "Step {step}:",
    "transform.result": "Transformation preview",
    "transform.changeCount": "Document changes: {count}",
    "transform.truncated":
      "Only the first 200 changes are listed. The exported document contains all changes.",
    "transform.noChanges": "The recipe leaves the document data unchanged.",
    "transform.kind.added": "Added",
    "transform.kind.removed": "Removed",
    "transform.kind.changed": "Changed",
    "transform.before": "Before",
    "transform.after": "After",
    "transform.format": "Transformed definition format",
    "transform.output": "View transformed definition",
    "transform.previewLimit":
      "Showing the first 50,000 characters. Copy and download include the full definition.",
    "transform.copyDocument": "Copy transformed OpenAPI",
    "transform.downloadDocument": "Download transformed OpenAPI",
    "transform.apply": "Apply transformation to editor",
    "transform.applied":
      "Transformation applied. Undo is available until the editor changes.",
    "transform.undone": "Previous editor text restored.",
    "transform.copied": "Copied to clipboard.",
    "transform.downloaded": "Download started.",
    "transform.error.limit":
      "A processing limit was reached: 2 MiB input/recipe, 100 steps, 50,000 JSON nodes, or 64 levels of nesting. Output is limited to 8 MiB.",
    "transform.error.json":
      "Enter valid JSON with finite, safely represented numbers and no circular values.",
    "transform.error.recipe":
      "Expected a JSON Patch array containing add, remove, replace, copy, move, or test operations with the required fields.",
    "transform.error.pointer":
      "Invalid JSON Pointer. Use an empty pointer or a path beginning with /, with ~0 and ~1 escapes.",
    "transform.error.missing":
      "A target, source, or parent does not exist. Check the path and the order of earlier steps.",
    "transform.error.index":
      "Invalid array index. Use an existing nonnegative index without leading zeros; add accepts the array length or - for append.",
    "transform.error.descendant": "A value cannot be moved inside itself.",
    "transform.error.test":
      "The expected value does not match. The recipe stopped without changing the editor.",
    "transform.error.source":
      "The source must be a valid OpenAPI JSON or YAML document accepted by the editor.",
    "transform.error.result":
      "The transformed result is not an OpenAPI document accepted by the editor. Revise the recipe before exporting or applying it.",
    "transform.error.read":
      "Unable to read the recipe. Try pasting its JSON instead.",
    "transform.error.copy": "Copy failed. Try downloading instead.",
    "transform.error.download":
      "The browser blocked the download. Try copying instead.",
    "transform.error.stale":
      "The editor changed after the source was captured. Use the current editor as source, then preview the recipe again.",
    "transform.error.undo":
      "The editor changed after application. Undo was stopped to preserve those edits.",
    "discovery.title": "Traffic-to-OpenAPI studio",
    "discovery.description":
      "Build an OpenAPI 3.1 draft from a browser HAR capture, review route templates, and infer request and response shapes. Everything runs locally; importing never sends API requests.",
    "discovery.privacy":
      "Body, query, header, and cookie values are not included as examples or saved. Hostnames, paths, and field names remain visible and are included in the generated document. Review them before sharing. This work stays in memory; export the definition before leaving.",
    "discovery.file": "Import HAR for API discovery",
    "discovery.paste": "Paste a HAR capture",
    "discovery.input": "HAR JSON for discovery",
    "discovery.import": "Discover API from pasted HAR",
    "discovery.clear": "Clear discovery capture",
    "discovery.loading": "Reading traffic capture…",
    "discovery.configure": "Configure discovered API",
    "discovery.counts":
      "Captured requests: {count} · Skipped entries: {skipped} · Warnings: {warnings}",
    "discovery.origin": "API origin",
    "discovery.prefix": "Move path prefix into server URL",
    "discovery.apiTitle": "Discovered API title",
    "discovery.version": "Discovered API version",
    "discovery.scopeHelp":
      "Choose one origin. A prefix such as /api selects that path subtree and moves it into the server URL. Changing origin, prefix, or grouping resets route edits and selections.",
    "discovery.parameterize":
      "Suggest path parameters for numeric and UUID segments",
    "discovery.required":
      "Mark fields present in every observation as required",
    "discovery.inferenceHelp":
      "This is an observed draft, not a complete contract. Review suggested IDs, optional fields, authentication, and constraints. Edit whole path segments to {parameterName}; literals must still match the captured paths. Matching method/template pairs are merged.",
    "discovery.routes": "Selected routes: {selected}/{total}",
    "discovery.search": "Search discovered routes",
    "discovery.searchPlaceholder":
      "Method, path template, captured path, or HTTP status",
    "discovery.select": "Select matching routes",
    "discovery.exclude": "Exclude matching routes",
    "discovery.table": "Discovered API routes",
    "discovery.include": "Include",
    "discovery.route": "Method and path template",
    "discovery.evidence": "Observed traffic",
    "discovery.includeRoute": "Include {route}",
    "discovery.template": "Path template for {route}",
    "discovery.observedPaths": "Observed paths (up to 10)",
    "discovery.samples": "{count} observations",
    "discovery.noMatches": "No routes match this scope or search.",
    "discovery.previous": "Previous routes",
    "discovery.next": "Next routes",
    "discovery.page": "Page {current} of {total}",
    "discovery.build": "Generate OpenAPI draft",
    "discovery.warnings": "Capture and inference warnings",
    "discovery.warningHelp":
      "Warnings cover the whole imported capture, including excluded routes. Showing the first 100. Missing, invalid, unsupported, or limited bodies keep their media type with a broad schema.",
    "discovery.warningRow": "Entry {entry} · {part}",
    "discovery.part.request": "request",
    "discovery.part.response": "response",
    "discovery.part.entry": "entry",
    "discovery.warning.skipped":
      "Skipped an invalid request, unsupported method, or response without an HTTP status.",
    "discovery.warning.missing": "JSON body content was not captured.",
    "discovery.warning.invalid":
      "Body is not supported JSON, contains unsafe numbers, or has invalid encoding.",
    "discovery.warning.unsupported":
      "Only JSON body shapes are inferred; other content keeps a broad schema.",
    "discovery.warning.limit":
      "Body inference or query parameter limits were reached.",
    "discovery.warning.media":
      "Body has no usable media type; its content was omitted.",
    "discovery.ready":
      "Draft ready · {count} operations · {observations} observations",
    "discovery.format": "Discovered definition format",
    "discovery.preview": "Preview generated definition",
    "discovery.previewText": "Generated OpenAPI definition",
    "discovery.previewLimit":
      "Preview limited to 50,000 characters. Copy and download include the full definition.",
    "discovery.copy": "Copy discovered OpenAPI",
    "discovery.download": "Download discovered OpenAPI",
    "discovery.applyHelp":
      "Applying replaces the main editor with this draft and uses its normal save behavior. Undo is available while the editor still matches the applied draft.",
    "discovery.apply": "Apply discovered API to editor",
    "discovery.undo": "Undo discovered API application",
    "discovery.imported":
      "Capture imported. Review the routes before generating a draft.",
    "discovery.exported": "Generated definition exported.",
    "discovery.applied": "Discovered API applied to the editor.",
    "discovery.restored": "Previous editor content restored.",
    "discovery.error.invalid-har": "Enter a HAR object containing log.entries.",
    "discovery.error.too-large":
      "Input must be at most 5 MiB; generated output must be at most 10 MiB.",
    "discovery.error.too-many":
      "Discovery supports up to 1,000 captured entries and 500 routes. Narrow the capture or scope.",
    "discovery.error.no-requests":
      "No supported HTTP requests with responses were found.",
    "discovery.error.origin": "Select an origin present in the capture.",
    "discovery.error.prefix":
      "Use a path prefix starting with /, without spaces, query, fragment, backslashes, or braces.",
    "discovery.error.template":
      "A path template must match every source path. Use unique whole-segment parameter names such as {userId}; keep literal segments unchanged.",
    "discovery.error.conflict":
      "Equivalent paths use different parameter names. Give them the same template or exclude one.",
    "discovery.error.empty": "Select at least one route.",
    "discovery.error.metadata":
      "Enter an API title (up to 200 characters) and version (up to 80 characters).",
    "discovery.error.read":
      "Could not read the capture. The current discovery draft has been preserved.",
    "discovery.error.export":
      "Could not export the definition. Try the other export action.",
    "discovery.error.undo":
      "The editor has changed since application. Undo would overwrite those edits.",
    "bundle.title": "Multi-file OpenAPI workbench",
    "bundle.description":
      "Import or create local YAML/JSON files, resolve references, and build a single-file API document. Files stay in this tab until you export the project; no files or URLs are fetched automatically.",
    "bundle.edit": "Edit multi-file project",
    "bundle.importFiles": "Import definition files",
    "bundle.importFolder": "Import definition folder",
    "bundle.importHelp":
      "Folder imports preserve relative paths and include .json, .yaml, and .yml files only. Choose the root API document after importing. File paths are case-sensitive.",
    "bundle.replace": "Replace matching files on import or add",
    "bundle.newPath": "New file path",
    "bundle.addFile": "Create project file",
    "bundle.useEditor": "Copy editor into project file",
    "bundle.fileCount": "Project files: {count}/50",
    "bundle.root": "Root API document",
    "bundle.chooseRoot": "Choose a root document",
    "bundle.selected": "Selected project file",
    "bundle.removeFile": "Remove selected project file",
    "bundle.source": "Source: {file}",
    "bundle.build": "Build reference bundle",
    "bundle.projectSharing": "Save or restore multi-file project",
    "bundle.projectHelp":
      "Project exports include every file and its full contents, including unused files and any sensitive examples. Project imports replace this workbench, without changing the main editor. Export before leaving the page.",
    "bundle.copyProject": "Copy project JSON",
    "bundle.downloadProject": "Download project JSON",
    "bundle.importProject": "Restore project JSON file",
    "bundle.imported":
      "Files imported. Review the root document and build the bundle.",
    "bundle.loading": "Reading project files…",
    "bundle.exported": "Export completed.",
    "bundle.exportFailed": "Export failed. Try copying or downloading again.",
    "bundle.ready": "Bundle ready · {refs} references · {files} files used",
    "bundle.blocked": "Bundle blocked · {issues} issues to fix",
    "bundle.issues": "Bundle diagnostics",
    "bundle.issueLimit":
      "Showing the first 100 diagnostics. Fix these and rebuild to review the remaining issues.",
    "bundle.unused": "Unused files: {files}",
    "bundle.search": "Search bundle references",
    "bundle.filter": "Reference resolution filter",
    "bundle.all": "All references",
    "bundle.resolved": "Resolved",
    "bundle.unresolved": "Unresolved",
    "bundle.matches": "Matching references: {count}",
    "bundle.references": "Bundle reference map",
    "bundle.from": "Source location",
    "bundle.to": "Original reference",
    "bundle.outputRef": "Bundled reference",
    "bundle.tableLimit":
      "Showing the first 100 matches. Refine the search to find more references.",
    "bundle.outputHelp":
      "Referenced fragments are stored under {namespace}; original fields and reference siblings are preserved. Cycles remain references. Relative references use their source file's directory. Unsupported resource identifiers and anchor references must be resolved before bundling.",
    "bundle.format": "Bundle output format",
    "bundle.preview": "Preview bundled document",
    "bundle.previewText": "Bundled document preview",
    "bundle.previewLimit":
      "Preview limited to 50,000 characters; exports contain the full bundle.",
    "bundle.copy": "Copy bundled document",
    "bundle.download": "Download bundled document",
    "bundle.applyHelp":
      "Apply replaces the main editor with this bundle. The previous editor text is kept in this tab for one undo; later editor changes prevent undo from overwriting them. Copy or download a backup for longer-term recovery.",
    "bundle.apply": "Apply bundle to editor",
    "bundle.applied": "Bundle applied to the editor.",
    "bundle.invalidOutput":
      "The bundle does not meet this editor's minimum document requirements. You can still export it for review.",
    "bundle.undo": "Undo bundle application",
    "bundle.undoChanged":
      "The main editor changed after applying the bundle. Undo is blocked to preserve those edits.",
    "bundle.restored": "The previous editor document was restored.",
    "bundle.error.path":
      "Use a relative project path without backslashes, URL syntax, or traversal outside the project.",
    "bundle.error.duplicate":
      "A file with this path already exists. Enable replacement or choose a different path.",
    "bundle.error.limit":
      "A project or bundle limit was exceeded: 50 files, 2 MiB per file, 8 MiB total source, 16 MiB output, 1,000 embedded fragments, 5,000 references, or bounded nesting and node counts.",
    "bundle.error.parse":
      "This file is not usable JSON/YAML. Check syntax, duplicate keys, YAML tags or alias cycles, and unsafe numbers.",
    "bundle.error.root":
      "Choose an imported root document declaring OpenAPI 3.0–3.2 or Swagger 2.0.",
    "bundle.error.missing-file":
      "The referenced file is not in this project. Import it at the matching relative path.",
    "bundle.error.missing-pointer":
      "The JSON Pointer does not identify an existing value in the referenced file.",
    "bundle.error.reference":
      "The reference or target is unsupported. Use a file path with an optional JSON Pointer; named anchors and URL queries are not supported.",
    "bundle.error.remote":
      "Remote and absolute URI references are not fetched. Import the file and use a relative project reference.",
    "bundle.error.dialect":
      "Schema resource identifiers, anchors, and dynamic or recursive references require URI-aware processing and cannot be bundled here.",
    "bundle.error.discriminator":
      "Add an explicit discriminator mapping before bundling this schema.",
    "bundle.error.relative-resource":
      "A relative example resource or a relocated relative server/documentation URL needs an absolute URL or an inline value before bundling.",
    "bundle.error.project":
      "This is not a valid version 1 multi-file project, or no supported definition files were selected.",
    "bundle.error.read":
      "The file could not be read. The existing project has been preserved.",
    "scenario.title": "API scenario runner",
    "scenario.description":
      "Build a workflow of up to 20 requests, pass response values between steps, and check the results. Drafts and variables stay in memory. Runs use the schema as it was when you started; no request history is written.",
    "scenario.edit": "Edit API scenario",
    "scenario.name": "Scenario name",
    "scenario.mode": "Scenario execution mode",
    "scenario.mock": "Mock rehearsal",
    "scenario.live": "Live requests",
    "scenario.stopOnFailure": "Stop after the first unsuccessful step",
    "scenario.variables": "Session variables (JSON object)",
    "scenario.variableHelp":
      "Use {{name}} in parameter values, server URLs, or body strings. An entire JSON string placeholder preserves the variable’s number, boolean, null, or string type. Extract scalar values with JSON Pointers (empty selects the root). Only successful steps publish outputs. Configure auth headers here; workspace auth and environments are not applied automatically.",
    "scenario.search": "Search scenario endpoints",
    "scenario.endpoint": "Endpoint to add",
    "scenario.noEndpoints": "No supported endpoints match",
    "scenario.addStep": "Add scenario step",
    "scenario.new": "New empty scenario",
    "scenario.stepCount": "Scenario steps: {count}/20",
    "scenario.steps": "Ordered scenario steps",
    "scenario.editStep": "Edit scenario step {number}",
    "scenario.moveUp": "Move step {number} up",
    "scenario.moveDown": "Move step {number} down",
    "scenario.duplicate": "Duplicate step {number}",
    "scenario.duplicateLabel": "Duplicate",
    "scenario.removeStep": "Remove step {number}",
    "scenario.remove": "Remove",
    "scenario.stepEditor": "Selected step",
    "scenario.viewEndpoint": "View scenario endpoint",
    "scenario.stepName": "Step name",
    "scenario.server": "Server URL override (blank uses schema)",
    "scenario.parameters": "Step parameters",
    "scenario.parameterLocation": "Parameter {number} location",
    "scenario.parameterName": "Parameter {number} name",
    "scenario.parameterValue": "Parameter {number} value",
    "scenario.removeParameter": "Remove parameter {number}",
    "scenario.addParameter": "Add step parameter",
    "scenario.contentType": "Step request content type",
    "scenario.body": "Step request body template",
    "scenario.expectedStatus": "Expected status (200, 2xx, or any)",
    "scenario.mockStatus": "Documented response for Mock",
    "scenario.timeoutLabel": "Step timeout (1,000–30,000 ms)",
    "scenario.timeout": "The step reached its timeout.",
    "scenario.maxDuration": "Maximum response duration (ms; 0 disables)",
    "scenario.checkContract":
      "Check documented status, media type, and body shape",
    "scenario.extracts": "Extract response variables for later steps",
    "scenario.extractName": "Extraction {number} variable name",
    "scenario.extractPointer": "Extraction {number} JSON Pointer",
    "scenario.removeExtract": "Remove extraction {number}",
    "scenario.addExtract": "Add response extraction",
    "scenario.unavailable": "Unavailable",
    "scenario.mockHelp":
      "Mock rehearsals use documented response examples or generated bodies, send no requests, and use a synthetic duration of 0 ms. They do not prove that a live workflow will succeed.",
    "scenario.liveHelp":
      "Live runs send every listed request, including write and delete operations. Only public HTTP(S) targets are supported. Redirects are reported without following them, and response bodies are limited to 1 MiB. Cancelling stops the active request and later steps; completed changes are not rolled back.",
    "scenario.runMock": "Run Mock scenario",
    "scenario.runLive": "Run Live scenario",
    "scenario.running": "Running scenario · {count}/{total} steps finished",
    "scenario.cancel": "Cancel scenario",
    "scenario.sharing": "Scenario import and export",
    "scenario.sharingHelp":
      "Definition exports include authored request templates, which may contain sensitive literals. Session variable values and captured responses are excluded. Imports replace the current draft and initialize declared variables as empty strings. Reports contain outcomes and schema paths, without request or response values.",
    "scenario.copyDefinition": "Copy scenario definition",
    "scenario.downloadDefinition": "Download scenario definition",
    "scenario.importFile": "Import scenario JSON file",
    "scenario.importText": "Scenario JSON to import",
    "scenario.import": "Import scenario definition",
    "scenario.imported":
      "Scenario imported. Fill in session variables before running.",
    "scenario.loading": "Reading scenario file…",
    "scenario.exported": "Scenario export completed.",
    "scenario.exportFailed": "Could not export the scenario. Try again.",
    "scenario.result": "Scenario {outcome} · {passed}/{total} steps passed",
    "scenario.results": "Scenario step results",
    "scenario.column.step": "Step",
    "scenario.column.outcome": "Outcome",
    "scenario.column.status": "HTTP status",
    "scenario.column.duration": "Duration",
    "scenario.column.outputs": "Published variables",
    "scenario.contractResult": "Contract: {result}",
    "scenario.copyReport": "Copy scenario report",
    "scenario.downloadReport": "Download scenario report",
    "scenario.passed": "passed",
    "scenario.failed": "failed",
    "scenario.error": "error",
    "scenario.cancelled": "cancelled",
    "scenario.skipped": "skipped",
    "scenario.partial": "partial",
    "scenario.invalid-plan":
      "Check the scenario definition: names, endpoints, statuses, timeouts, parameters, and unique extraction names must be valid.",
    "scenario.limit":
      "Scenario limits exceeded: 20 steps, 2 MiB definitions, 64 variables, 64 parameters and 10 extractions per step, or bounded template expansion.",
    "scenario.invalid-variables":
      "Variables must be a JSON object with at most 64 named scalar values. Names use letters, digits, and underscores; values must be safe numbers, booleans, null, or strings up to 8,192 characters (128 KiB total).",
    "scenario.missing-variable":
      "A template variable is unavailable. Define it or publish it from an earlier successful step.",
    "scenario.missing-endpoint":
      "A scenario endpoint is missing or ambiguous in the current schema. Restore it before running.",
    "scenario.invalid-body":
      "The request body is missing or invalid. Put JSON placeholders inside quoted strings.",
    "scenario.missing-parameter": "A required request parameter has no value.",
    "scenario.invalid-server":
      "The live target or request is invalid. Use a public HTTP(S) server without URL credentials, query, or fragment.",
    "scenario.network":
      "The live request failed. Check the server and request configuration.",
    "scenario.invalid-response":
      "No usable response was returned, or the selected Mock response no longer exists.",
    "scenario.response-limit": "The response exceeds the 1 MiB limit.",
    "scenario.status-mismatch":
      "The response status did not match the expectation.",
    "scenario.duration-exceeded":
      "The response exceeded the configured duration limit.",
    "scenario.contract-failed":
      "The response failed a documented contract check.",
    "scenario.assertion-failed": "The response failed a configured assertion.",
    "scenario.extraction-failed":
      "A response variable could not be extracted. Use an existing JSON Pointer to a safe scalar value.",
    "scenario.stopped": "Not run because an earlier step was unsuccessful.",
    "inference.title": "Response schema builder",
    "inference.heading": "Build a schema from JSON examples",
    "inference.description":
      "Capture a response or paste JSON examples to infer a shared schema. Samples stay in this endpoint’s memory until removed or the endpoint closes; no requests are sent and the editor stays unchanged.",
    "inference.limits":
      "Up to 10 samples, 1 MiB per sample, 2 MiB combined, 20,000 values, and 64 nesting levels.",
    "inference.capture": "Capture current response",
    "inference.paste": "JSON schema example",
    "inference.add": "Add JSON example",
    "inference.samples": "Captured examples: {count}/10",
    "inference.sampleList": "Schema examples",
    "inference.sample": "Example {number} · {bytes} bytes",
    "inference.remove": "Remove example {number}",
    "inference.removeLabel": "Remove",
    "inference.clear": "Clear schema examples",
    "inference.empty":
      "Add an example to start. An array counts as one example; its items are analyzed together.",
    "inference.review":
      "Review this inferred draft before using it as a contract. Examples cannot prove which fields are required or establish formats, ranges, enums, or business rules. Exports include field names and types, but no example values. YAML exports are component fragments for OpenAPI 3.1, not complete API documents.",
    "inference.name": "Schema component name",
    "inference.format": "Inferred schema format",
    "inference.json": "JSON Schema 2020-12",
    "inference.yaml": "OpenAPI 3.1 component (YAML)",
    "inference.invalidName":
      "Use 1–80 letters, digits, underscores, dots, or hyphens, starting with a letter or underscore.",
    "inference.required": "Require fields present in every observed object",
    "inference.additional": "Allow additional object properties",
    "inference.fields": "{count} fields · {optional} optional",
    "inference.search": "Search inferred schema paths and types",
    "inference.fieldTable": "Inferred fields",
    "inference.path": "Schema path",
    "inference.types": "Types",
    "inference.observed": "Present / objects",
    "inference.presence": "Requirement",
    "inference.requiredLabel": "Required",
    "inference.optionalLabel": "Optional",
    "inference.noFields":
      "No object fields match. Scalar and empty-array schemas are available in the preview.",
    "inference.previous": "Previous schema fields",
    "inference.next": "Next schema fields",
    "inference.page": "Page {current} of {total}",
    "inference.copy": "Copy inferred schema",
    "inference.download": "Download inferred schema",
    "inference.copied": "Inferred schema copied.",
    "inference.copyFailed":
      "Could not copy the inferred schema. Try downloading it.",
    "inference.downloaded": "Inferred schema download started.",
    "inference.downloadFailed": "Could not download the inferred schema.",
    "inference.preview": "Inferred schema preview",
    "inference.shortened":
      "Preview shortened to 12,000 characters. Copy and download include the full schema.",
    "inference.invalid-json":
      "This example is not valid JSON. Existing examples were kept.",
    "inference.size-limit":
      "Example size limit exceeded: 1 MiB per example and 2 MiB combined.",
    "inference.structure-limit":
      "Examples exceed 20,000 values combined or 64 nesting levels.",
    "inference.unsafe-number":
      "This example contains a number that cannot be represented safely. Use strings for large identifiers.",
    "inference.sample-limit": "Remove an example before adding more than 10.",
    "plan.exportTooLarge":
      "This JSON report exceeds the 16 MiB import limit. Narrow the endpoint scope before exporting so progress can be restored.",
    "plan.title": "API test-plan workbench",
    "plan.description":
      "Build a manual QA checklist from documented inputs, record results and notes, and share or restore progress. No requests are sent and results stay in memory.",
    "plan.help":
      "Start with a working request in Try It Out, change only the selected input, then record the observed result. Suggested values target one rule at a time: review other constraints, authentication, and documented responses before testing. Pattern cases require you to choose matching and nonmatching values. This is a bounded checklist, not exhaustive contract validation.",
    "plan.limits":
      "Plan limited to 1,000 cases; {skipped} operations with oversized constraints or paths were skipped.",
    "plan.scope": "Test-plan endpoint scope",
    "plan.allEndpoints": "All endpoints",
    "plan.visibleEndpoints": "Current endpoint view",
    "plan.search": "Search test-plan endpoints, inputs, or values",
    "plan.resultFilter": "Filter QA results",
    "plan.allResults": "All QA results",
    "plan.expectationFilter": "Filter test intent",
    "plan.allExpectations": "All test intents",
    "plan.pending": "Pending",
    "plan.passed": "Passed",
    "plan.failed": "Failed",
    "plan.blocked": "Blocked",
    "plan.accept": "Positive case: satisfy the target rule",
    "plan.reject": "Negative case: violate the target rule",
    "plan.review": "Manual pattern review",
    "plan.summary":
      "{total} cases · {pending} pending · {passed} passed · {failed} failed · {blocked} blocked",
    "plan.count": "{count} matching test cases",
    "plan.cases": "API test cases",
    "plan.endpoint": "Endpoint",
    "plan.scenario": "Scenario",
    "plan.target": "Target input",
    "plan.value": "Suggested value or pattern",
    "plan.expectation": "Test intent",
    "plan.result": "QA result",
    "plan.notes": "QA notes",
    "plan.previous": "Previous test-plan page",
    "plan.next": "Next test-plan page",
    "plan.page": "Page {page} of {total}",
    "plan.selected": "Selected test case",
    "plan.openEndpoint": "Open test-case endpoint",
    "plan.empty": "No cases match this view.",
    "plan.copy": "Copy test plan as Markdown",
    "plan.json": "Download test plan JSON",
    "plan.markdown": "Download test plan Markdown",
    "plan.import": "Restore test-plan JSON",
    "plan.reset": "Reset QA results",
    "plan.undo": "Undo progress import or reset",
    "plan.exportHelp":
      "Exports contain the selected endpoint scope, suggested values, and your notes; table filters and search do not narrow exports. JSON imports merge results only for matching case identities and leave other results intact. Notes may contain sensitive data. Progress survives panel closing and temporary schema errors, but is not saved when the page closes. Export JSON to keep it.",
    "plan.loading": "Reading test-plan progress…",
    "plan.restored":
      "Restored {restored} matching cases · Ignored {ignored} unknown or changed cases",
    "plan.invalid": "Invalid test-plan JSON. Existing results are unchanged.",
    "plan.too-large":
      "Test-plan imports are limited to 16 MiB. Existing results are unchanged.",
    "plan.readError":
      "Could not read the test-plan file. Existing results are unchanged.",
    "plan.resetDone": "QA results reset. You can undo this change.",
    "plan.copySuccess": "Test plan copied as Markdown.",
    "plan.copyError": "Could not copy the test plan. Try downloading it.",
    "plan.downloadSuccess": "Test-plan download started.",
    "plan.downloadError": "Could not download the test plan. Try copying it.",
    "plan.kind.happy": "Documented happy path",
    "plan.kind.omit": "Omit required input",
    "plan.kind.enum-valid": "Use a documented enum value",
    "plan.kind.enum-invalid": "Use an unlisted enum value",
    "plan.kind.minimum": "Use the lower boundary",
    "plan.kind.below-minimum": "Go below the minimum",
    "plan.kind.maximum": "Use the upper boundary",
    "plan.kind.above-maximum": "Go above the maximum",
    "plan.kind.min-length": "Use the minimum string length",
    "plan.kind.shorter": "Use a string shorter than allowed",
    "plan.kind.max-length": "Use the maximum string length",
    "plan.kind.longer": "Use a string longer than allowed",
    "plan.kind.pattern": "Review the pattern constraint",
    "plan.kind.body-property": "Omit a required body property",
    "har.title": "HAR traffic inspector",
    "har.description":
      "Inspect a browser network capture locally without sending requests. Headers, cookies, query values, and bodies are discarded after import; request paths and origins stay in memory until cleared or this page is closed.",
    "har.file": "Import HAR file",
    "har.clear": "Clear traffic capture",
    "har.paste": "Paste HAR JSON",
    "har.json": "HAR JSON",
    "har.import": "Inspect pasted HAR",
    "har.loading": "Reading traffic capture…",
    "har.invalid-har":
      "Enter valid HAR JSON containing a log.entries array. The previous capture is unchanged.",
    "har.too-large":
      "HAR imports are limited to 5 MiB. The previous capture is unchanged.",
    "har.too-many":
      "HAR imports are limited to 5,000 entries. The previous capture is unchanged.",
    "har.no-requests":
      "No usable HTTP requests were found. The previous capture is unchanged.",
    "har.read-error":
      "The HAR file could not be read. Try selecting it again; the previous capture is unchanged.",
    "har.loaded":
      "Imported {accepted} requests · Skipped {skipped} invalid or non-HTTP entries",
    "har.scope": "Match against endpoints",
    "har.allEndpoints": "All endpoints",
    "har.visibleEndpoints": "Current endpoint view",
    "har.origin": "Capture origin",
    "har.allOrigins": "All captured origins",
    "har.prefix": "Strip captured path prefix",
    "har.matchHelp":
      "Matching uses method and path, with whole-segment placeholders such as {id}. Static routes take priority; ties are ambiguous. Trailing slashes are significant. Choose an origin and strip a prefix such as /api when needed; schema server URLs are not applied automatically.",
    "har.invalidPrefix":
      "Use an empty prefix or a path starting with /, without whitespace, query strings, fragments, backslashes, or braces.",
    "har.summary":
      "{total} requests · {matched} matched · {undocumented} undocumented statuses · {failed} HTTP or network failures",
    "har.timing":
      "Average {average} · P95 {p95} · Maximum {max} · {count} known durations",
    "har.coverage":
      "Observed {observed} of {total} operations · {unmatched} unmatched requests · {ambiguous} ambiguous requests",
    "har.operations": "Operation traffic coverage",
    "har.endpoint": "Endpoint",
    "har.requests": "Requests",
    "har.failed": "HTTP or network failures",
    "har.unknown": "Unknown",
    "har.search": "Search captured method, path, or status",
    "har.filter": "Traffic result filter",
    "har.all": "All traffic",
    "har.matched": "Matched",
    "har.unmatched": "Unmatched",
    "har.ambiguous": "Ambiguous",
    "har.undocumented": "Undocumented status",
    "har.sort": "Traffic order",
    "har.captureOrder": "Capture order",
    "har.slowest": "Slowest first",
    "har.rowCount": "{count} matching requests",
    "har.traffic": "Captured traffic",
    "har.request": "Request",
    "har.status": "Status",
    "har.duration": "Duration",
    "har.match": "Endpoint match",
    "har.previous": "Previous traffic page",
    "har.page": "Page {current} of {total}",
    "har.next": "Next traffic page",
    "har.copy": "Copy traffic report",
    "har.download": "Download traffic report",
    "har.exportHelp":
      "Reports include aggregate counts, durations, and schema operation paths for the selected scope, origin, and prefix; table search and result filters do not narrow reports. Captured URLs and values are omitted. Status checks use exact, range, or default responses, without body validation. Status 0 and HTTP 400–599 count as failures; unknown durations are excluded and P95 uses nearest rank.",
    "har.copySuccess": "Traffic report copied.",
    "har.copyError": "Could not copy the traffic report. Try downloading it.",
    "har.downloadSuccess": "Traffic report download started.",
    "har.downloadError":
      "Could not download the traffic report. Try copying it.",
    "explorer.title": "Response data explorer",
    "explorer.navigator": "JSON data navigator",
    "explorer.description":
      "Navigate response fields or search the entire JSON body by path, key, and scalar value. Use an empty JSON Pointer for the root; escape / as ~1 and ~ as ~0. Data stays in memory, and a changed response body resets navigation.",
    "explorer.pointer": "Explore JSON Pointer",
    "explorer.go": "Go to JSON value",
    "explorer.pointerError":
      "Enter a valid JSON Pointer that exists in this response.",
    "explorer.breadcrumbs": "Response JSON location",
    "explorer.root": "Root",
    "explorer.selected":
      "Selected: {type} · {children} children · {total} indexed values",
    "explorer.copyPointer": "Copy selected JSON Pointer",
    "explorer.copyJson": "Copy selected JSON",
    "explorer.downloadJson": "Download selected JSON",
    "explorer.view": "Array display",
    "explorer.browse": "Browse fields",
    "explorer.table": "Table",
    "explorer.columns": "Choose table columns",
    "explorer.value": "Value",
    "explorer.filterRows": "Filter response table rows",
    "explorer.rowCount": "{count} matching rows of {total}",
    "explorer.tableCaption": "Response array data",
    "explorer.exploreRow": "Explore row {number}",
    "explorer.missing": "(missing)",
    "explorer.downloadCsv": "Download filtered CSV",
    "explorer.csvHelp":
      "CSV includes all matching rows and selected columns, with original zero-based row indices. Nested values are exported as JSON. Missing fields are empty cells; null is written as null. Formula-like strings and column names are prefixed with an apostrophe for spreadsheets. Exports contain response values.",
    "explorer.search": "Search response paths and values",
    "explorer.typeFilter": "Filter JSON value type",
    "explorer.allTypes": "All JSON types",
    "explorer.matches": "{count} matching values in the whole response",
    "explorer.children": "{count} direct children",
    "explorer.preview": "Preview selected JSON",
    "explorer.previewLabel": "Selected JSON preview",
    "explorer.truncated":
      "Preview shortened to 8,000 characters. Copy and JSON download include the complete selected value.",
    "explorer.previous": "Previous data page",
    "explorer.next": "Next data page",
    "explorer.page": "Page {page} of {total}",
    "explorer.copySuccess": "Response data copied.",
    "explorer.copyError": "Copy failed. Try downloading instead.",
    "explorer.downloadSuccess": "Response data download started.",
    "explorer.downloadError": "Download failed. Try copying instead.",
    "explorer.invalid-json":
      "This response is not valid JSON. The original response view remains available.",
    "explorer.size-limit":
      "This response exceeds the 1 MiB explorer limit. Use the original response view or download.",
    "explorer.structure-limit":
      "This JSON exceeds 20,000 values or 64 nesting levels. Use the original response view or download.",
    "explorer.unsafe-number":
      "This JSON contains a nonfinite number or an integer outside JavaScript’s safe range. Exploration is unavailable to avoid exporting rounded values; use the original response download.",
    "explorer.not-array": "Select an array to view a table.",
    "explorer.row-limit":
      "This array exceeds the 5,000-row table limit. Browse its fields or export the selected JSON instead.",
    "explorer.column-limit":
      "This array exceeds the 64-column table limit. Browse its fields or export the selected JSON instead.",
    "smoke.title": "CI smoke-test exporter",
    "smoke.description":
      "Generate a standalone Node.js 20+ runner and configuration template for GET and HEAD endpoints. Run the exported file locally or in CI to check real responses without package dependencies.",
    "smoke.scope": "Smoke-test scope",
    "smoke.visible": "Current endpoint view",
    "smoke.all": "All endpoints",
    "smoke.timeout": "Request timeout (ms)",
    "smoke.budget": "Response-time budget (ms)",
    "smoke.deprecated": "Include deprecated smoke tests",
    "smoke.checkJson": "Check JSON shape and required properties",
    "smoke.enableBudget": "Enforce a response-time budget",
    "smoke.invalid":
      "Use whole milliseconds: timeout 100–120,000 and response-time budget 1–120,000.",
    "smoke.summary": "{count} smoke tests · {excluded} excluded operations",
    "smoke.empty":
      "No GET or HEAD endpoints match this scope and these options.",
    "smoke.manifest": "Generated smoke-test inventory",
    "smoke.operation": "Operation",
    "smoke.inputs": "Required input placeholders",
    "smoke.auth": "Documented authentication",
    "smoke.authRequired": "Configure credentials at runtime",
    "smoke.authNotRequired": "Not required",
    "smoke.downloadScript": "Download smoke-test runner",
    "smoke.downloadConfig": "Download smoke-test configuration",
    "smoke.preview": "Preview smoke-test files",
    "smoke.previewFile": "Smoke-test preview file",
    "smoke.script": "Node.js runner",
    "smoke.config": "Configuration template",
    "smoke.copy": "Copy smoke-test preview",
    "smoke.source": "Generated smoke-test source",
    "smoke.copySuccess": "Smoke-test file copied.",
    "smoke.copyError": "Copy failed. Try downloading instead.",
    "smoke.downloadSuccess": "Smoke-test download started.",
    "smoke.downloadError": "Download failed. Try copying instead.",
    "smoke.instructions": "Running smoke tests in CI",
    "smoke.step1":
      "Download both files. Set baseUrl in the configuration to your target server, including any API path prefix, and fill required path, query, header, and cookie placeholders. Set enabled to false to skip an operation.",
    "smoke.step2":
      "Set RSSWAG_SMOKE_CONFIG to the configuration file path. RSSWAG_BASE_URL overrides its base URL. Supply secrets through RSSWAG_HEADERS_JSON, a JSON object of HTTP headers; these headers override configuration headers case-insensitively.",
    "smoke.step3":
      "Run the exported file with Node.js 20 or later. Save standard output as a JSON report. Requests run sequentially, and each must return a documented 2xx response.",
    "smoke.exit":
      "Exit code 0 requires at least one passed test and no failed or blocked tests. Invalid configuration, missing required inputs, and an entirely skipped suite cannot produce a successful run.",
    "smoke.limits":
      "Checks cover documented status, media type, optional top-level JSON type and required properties, and an optional timing budget. This is not full JSON Schema validation. Bodies are limited to 1 MiB; redirects are not followed. Reports exclude response bodies, headers, and parameter values. Configure authentication at runtime; editor environments, examples, and stored credentials are not embedded.",
    "assertions.title": "Response assertions",
    "assertions.builder": "Custom response checks",
    "assertions.description":
      "Build checks for this endpoint. Every displayed Live or Mock response is evaluated automatically. Checks stay in memory while this endpoint remains in view.",
    "assertions.add.status": "Add status check",
    "assertions.add.header": "Add header check",
    "assertions.add.body": "Add JSON check",
    "assertions.add.duration": "Add timing check",
    "assertions.summary":
      "{pass} passed · {fail} failed · {error} errors · {source} response",
    "assertions.live": "Live",
    "assertions.mock": "Mock",
    "assertions.awaiting":
      "Checks ready. Run this endpoint to evaluate a response.",
    "assertions.empty": "No checks yet. Add a check or import a saved set.",
    "assertions.filter": "Filter assertion results",
    "assertions.all": "All checks",
    "assertions.pass": "Passed",
    "assertions.fail": "Failed",
    "assertions.error": "Error",
    "assertions.pending": "Waiting for response",
    "assertions.noMatches": "No checks match this filter.",
    "assertions.check": "Check {number}",
    "assertions.name": "Check name (optional)",
    "assertions.target": "Check target",
    "assertions.target.status": "Status code",
    "assertions.target.header": "Response header",
    "assertions.target.body": "JSON body",
    "assertions.target.duration": "Response time (ms)",
    "assertions.path": "JSON Pointer (empty = whole body)",
    "assertions.header": "Header name",
    "assertions.operator": "Condition",
    "assertions.operator.equals": "Equals",
    "assertions.operator.exists": "Exists",
    "assertions.operator.absent": "Is absent",
    "assertions.operator.contains": "Contains text",
    "assertions.operator.type": "Has JSON type",
    "assertions.operator.length": "Has length",
    "assertions.operator.gte": "Greater than or equal to",
    "assertions.operator.lte": "Less than or equal to",
    "assertions.expected": "Expected value",
    "assertions.expectedJson": "Expected value (JSON)",
    "assertions.remove": "Remove check {number}",
    "assertions.removeButton": "Remove check",
    "assertions.pathHelp":
      "JSON Pointers select exact fields: /items/0/id. Leave empty for the whole body; use ~1 for / and ~0 for ~ in keys. Equals uses JSON values and ignores object-key order. Contains text is case-sensitive. Length counts array items or Unicode code points in strings.",
    "assertions.transfer": "Import and export checks",
    "assertions.exportHelp":
      "Check sets include your names and expected values. Import appends checks. Reports contain numbered outcomes only, without response values or expected values; keep the check set alongside its report.",
    "assertions.copySet": "Copy check set",
    "assertions.downloadSet": "Download check set",
    "assertions.importLabel": "Check set JSON",
    "assertions.import": "Append imported checks",
    "assertions.import.invalid-set":
      "Use a valid version 1 RSSwag response assertion set with valid checks.",
    "assertions.import.too-large":
      "The imported check set must be at most 2 MiB.",
    "assertions.import.too-many":
      "An endpoint can have at most 50 checks. Remove some checks before importing.",
    "assertions.copyReport": "Copy assertion report",
    "assertions.downloadReport": "Download assertion report",
    "assertions.copySuccess": "Copied to clipboard.",
    "assertions.copyError": "Copy failed. Try downloading instead.",
    "assertions.downloadSuccess": "Download started.",
    "assertions.downloadError": "Download failed. Try copying instead.",
    "assertions.limits":
      "Up to 50 checks per endpoint. JSON checks accept bodies up to 1 MiB, 20,000 values, and 64 nesting levels; numbers must be finite and integers safely representable. Clearing a response keeps checks. Export checks to keep them after the endpoint leaves view or the page closes.",
    "assertions.issue.invalid-rule":
      "This check is invalid. Review its target, condition, and field lengths.",
    "assertions.issue.invalid-path":
      "Use a valid JSON Pointer or HTTP header name.",
    "assertions.issue.invalid-expected":
      "Enter a valid expected value: JSON for body equality, a JSON type for type checks, or a finite number for numeric checks. Status codes must be 100–599; time and integer lengths must be nonnegative.",
    "assertions.issue.unreadable-body":
      "The response body is not valid JSON. This check could not be evaluated.",
    "assertions.issue.body-limit":
      "The response JSON exceeds the size, depth, or value limit. This check could not be evaluated.",
    "assertions.issue.unsafe-number":
      "The response JSON contains a number that cannot be represented reliably. This check could not be evaluated.",
    "assertions.issue.missing": "The selected field is missing.",
    "assertions.issue.wrong-type":
      "The selected value has the wrong type for this condition.",
    "assertions.issue.unavailable":
      "The response status or timing value is unavailable.",
    "comparison.title": "Response comparison",
    "comparison.description":
      "Pin a response, then run this endpoint again to review changes. The baseline stays in memory while this endpoint remains in view.",
    "comparison.pin": "Pin response baseline",
    "comparison.replace": "Use current as baseline",
    "comparison.clear": "Clear response baseline",
    "comparison.baselineSummary": "Baseline: status {status} · {source}",
    "comparison.mock": "Mock",
    "comparison.live": "Live",
    "comparison.awaiting":
      "Baseline retained. Run this endpoint again to compare a response.",
    "comparison.options": "Comparison settings",
    "comparison.ignorePaths": "Ignored JSON paths (one per line)",
    "comparison.ignoreHeaders": "Ignored response headers (comma-separated)",
    "comparison.ignoreHelp":
      "Use JSON Pointers such as /timestamp or /items/0/id. Matching paths and their descendants are skipped; parent additions or removals still appear. Escape / as ~1 and ~ as ~0. Arrays are compared by index.",
    "comparison.invalidOptions":
      "Use at most 64 JSON paths and 64 header names. Each path must start with /, use valid ~0 or ~1 escapes, and be at most 512 characters.",
    "comparison.partial": "Partial comparison: {count} changes found",
    "comparison.differenceCount": "{count} response changes",
    "comparison.identical": "No response changes under the current settings.",
    "comparison.bodyMode": "Body comparison: {mode}",
    "comparison.jsonMode": "JSON structure",
    "comparison.textMode": "Text",
    "comparison.largeMode": "Skipped (over 1 MiB)",
    "comparison.latency": "Latency: {before} → {after} ms (Δ {delta} ms)",
    "comparison.size": "Body size: {before} → {after} B",
    "comparison.mixedModes":
      "This comparison includes both a Mock response and a Live response.",
    "comparison.textHelp":
      "Bodies are compared as text when structural JSON comparison is unavailable. Ignored JSON paths apply only to JSON comparisons.",
    "comparison.limitHelp":
      "Comparison limits: 1 MiB per body, 500 changes, 20,000 visited values, and 60 nesting levels. A partial comparison cannot establish that responses match.",
    "comparison.areaFilter": "Change area",
    "comparison.kindFilter": "Change type",
    "comparison.allAreas": "All areas",
    "comparison.allKinds": "All changes",
    "comparison.body": "Body",
    "comparison.headers": "Headers",
    "comparison.status": "Status",
    "comparison.added": "Added",
    "comparison.removed": "Removed",
    "comparison.changed": "Changed",
    "comparison.search": "Search changed paths",
    "comparison.table": "Response differences",
    "comparison.path": "Path",
    "comparison.before": "Baseline value",
    "comparison.after": "Current value",
    "comparison.root": "(body root)",
    "comparison.noMatches": "No changes match these filters.",
    "comparison.copy": "Copy comparison report",
    "comparison.download": "Download comparison report",
    "comparison.includeValues": "Include value previews in report",
    "comparison.exportHelp":
      "Exports include all detected changes, regardless of table filters. Values are omitted by default. Previews are limited to 1,000 characters; changed containers show their size. Standard authentication and cookie header values are always redacted.",
    "comparison.copySuccess": "Response comparison copied.",
    "comparison.copyError":
      "Could not copy the comparison. Try downloading it.",
    "comparison.downloadSuccess": "Response comparison download started.",
    "comparison.downloadError":
      "Could not download the comparison. Try copying it.",
    "common.clearSearchShortcut": "Press Escape to clear search",
    "workspace.apiSliceTitle": "API slice exporter",
    "workspace.apiSliceFileDetails": "Export file: {fileName} ({size} B)",
    "workspace.apiSliceSerializationError":
      "This document cannot be serialized. Replace circular YAML aliases with OpenAPI references before exporting.",
    "workspace.apiSliceDescription":
      "Share a focused OpenAPI contract using your endpoint filters, tags, or favorites. Keeps document metadata, shared parameters, and required components. Uses the schema's server URLs. JSON/YAML output preserves data, but not source comments or formatting.",
    "workspace.apiSliceScope": "Slice scope",
    "workspace.apiSliceVisible": "Current view ({count})",
    "workspace.apiSliceAll": "All endpoints ({count})",
    "workspace.apiSliceFormat": "Slice format",
    "workspace.apiSlicePrune": "Remove unused components",
    "workspace.apiSliceDeprecated": "Include deprecated operations",
    "workspace.apiSliceWebhooks": "Include all top-level webhooks",
    "workspace.apiSliceOperations": "Exported operations",
    "workspace.apiSlicePaths": "Exported paths",
    "workspace.apiSliceRetained": "Retained components",
    "workspace.apiSliceRemoved": "Removed components",
    "workspace.apiSliceIssues": "Review notes ({count})",
    "workspace.apiSliceBrokenReference":
      "A local reference or security definition is missing. Include its target or fix the source contract.",
    "workspace.apiSliceExternalReference":
      "This reference needs an external document. It is preserved and has not been bundled; relative references may need a new base URL.",
    "workspace.apiSliceLinkedOperation":
      "A response link cannot resolve to an operation in this slice. Review the target before sharing.",
    "workspace.apiSlicePreservedComponents":
      "All components were retained because polymorphism, schema resource IDs, or references to whole containers may have implicit dependencies.",
    "workspace.apiSlicePathReference":
      "This path uses a referenced path item, which may introduce unselected operations. Inline the path item in the source before exporting.",
    "workspace.apiSliceEmpty":
      "No operations selected. Adjust your endpoint filters or include deprecated operations.",
    "workspace.apiSliceBlocked":
      "Resolve missing local references and referenced path items to enable export. The preview is available for inspection.",
    "workspace.apiSlicePreview": "Preview OpenAPI slice",
    "workspace.apiSliceCopy": "Copy slice",
    "workspace.apiSliceDownload": "Download slice",
    "workspace.apiSliceCopySuccess": "OpenAPI slice copied.",
    "workspace.apiSliceCopyError":
      "Could not copy the slice. Try downloading it.",
    "workspace.apiSliceDownloadSuccess": "OpenAPI slice download started.",
    "workspace.apiSliceDownloadError":
      "Could not download the slice. Try copying it.",
    "about.courseTextAfter": ".",
    "about.courseTextBefore":
      "RS School React module final task. Learn more at ",
    "about.courseTitle": "Course",
    "about.description":
      "RSSwag is a team project for the RS School React course. The app is being built as an OpenAPI editor, viewer, REST client, and request history workspace.",
    "about.githubLabel": "GitHub:",
    "about.label": "About",
    "about.roleLabel": "Role:",
    "about.roleText": "responsible for everything.",
    "about.schoolLink": "RS School",
    "about.stackText": "Next.js, React, TypeScript, and Tailwind CSS.",
    "about.stackTitle": "Stack",
    "about.teamTitle": "Team",
    "about.title": "RSSwag OpenAPI UI",
    "apiReference.description":
      "The main editor and viewer live on the home page. This route is ready for a separate reference view if the team decides to split it later.",
    "apiReference.label": "API Reference",
    "apiReference.title": "Endpoint Documentation",
    "auth.account": "RSSwag Account",
    "auth.alreadyHaveAccount": "Already have an account?",
    "auth.email": "Email",
    "auth.errors.emailInvalid": "Enter a valid email address.",
    "auth.errors.emailRequired": "Email is required.",
    "auth.errors.passwordDigit": "Password must contain at least one digit.",
    "auth.errors.passwordLetter": "Password must contain at least one letter.",
    "auth.errors.passwordLength":
      "Password must contain at least 8 characters.",
    "auth.errors.passwordRequired": "Password is required.",
    "auth.errors.passwordSpecial":
      "Password must contain at least one special character.",
    "auth.hidePassword": "Hide password",
    "auth.hidePasswordShort": "Hide",
    "auth.needAccount": "Need an account?",
    "auth.password": "Password",
    "auth.passwordPlaceholder": "Password",
    "auth.signIn": "Sign In",
    "auth.signInShort": "Sign in",
    "auth.signInHelper": "Welcome back to your OpenAPI workspace.",
    "auth.signOut": "Sign Out",
    "auth.signUp": "Sign Up",
    "auth.signUpShort": "Join",
    "auth.signUpHelper":
      "Start your workspace for saved schemas and request history.",
    "auth.showPassword": "Show password",
    "auth.showPasswordShort": "Show",
    "common.goHome": "Go Home",
    "common.openEditor": "Open Editor",
    "error.description":
      "The app could not finish this action. Try again or return to the main editor page.",
    "error.errorId": "Error ID: {digest}",
    "error.label": "Error",
    "error.title": "Something went wrong",
    "error.tryAgain": "Try Again",
    "footer.copyright":
      "© {year} RSSwag. Built for the RS School React course.",
    "footer.course": "RS School Course",
    "footer.github": "View Source on GitHub",
    "footer.navigate": "Navigate",
    "footer.navigation": "Footer navigation",
    "footer.resources": "Resources",
    "footer.tagline":
      "An OpenAPI editor, viewer, REST client, and request history workspace.",
    "footer.workspace": "RSSwag OpenAPI workspace",
    "history.duration": "Duration",
    "history.analytics": "History Analytics",
    "history.averageDuration": "Average duration",
    "history.averageDurationValue": "{duration} ms",
    "history.backToHistory": "Back to History",
    "history.allDurations": "All durations",
    "history.allMethods": "All methods",
    "history.allOutcomes": "All",
    "history.allTime": "All time",
    "history.ageFilterLabel": "Filter history by age",
    "history.clearAll": "Clear all",
    "history.clearAllConfirm":
      "Delete all {count} history records? This cannot be undone.",
    "history.clearAllError": "Could not clear history. Try again.",
    "history.clearing": "Clearing...",
    "history.copyDetails": "Copy request details",
    "history.copyDetailsError": "Could not copy request details.",
    "history.copyingVisible": "Copying...",
    "history.copyVisible": "Copy visible",
    "history.copyVisibleError": "Could not copy visible request history.",
    "history.copyVisibleSuccess": "Visible request history copied.",
    "history.delete": "Delete",
    "history.deleteAriaLabel": "Delete {summary}",
    "history.deleteConfirm": 'Delete "{summary}"? This cannot be undone.',
    "history.deleteError": "Could not delete this record. Try again.",
    "history.deleting": "Deleting...",
    "history.detailsCopied": "Request details copied.",
    "history.detailsTitle": "Request Details",
    "history.downloadDetails": "Download JSON",
    "history.downloadDetailsError": "Could not export this request.",
    "history.downloadDetailsSuccess": "Request export started.",
    "history.duration100To499": "100-499 ms",
    "history.duration500Plus": "500 ms or more",
    "history.durationFilterLabel": "Filter history by request duration",
    "history.durationUnder100": "Under 100 ms",
    "history.empty":
      "You have not executed any requests yet. Start from the editor or open the API reference to explore the current schema.",
    "history.endpoint": "Endpoint",
    "history.errorDetails": "Error details",
    "history.exportAriaLabel": "Export visible request history",
    "history.exportVisible": "Export visible",
    "history.exportVisibleError": "Could not export visible request history.",
    "history.exportVisibleSuccess": "Visible request history exported.",
    "history.failedRequests": "Failed",
    "history.filterLabel": "Filter request history",
    "history.filterPlaceholder": "Search request history",
    "history.filterSummary": "Showing {visible} of {total} requests",
    "history.history": "History",
    "history.last24Hours": "Last 24 hours",
    "history.last7Days": "Last 7 days",
    "history.last30Days": "Last 30 days",
    "history.method": "Method",
    "history.methodFilterLabel": "Filter history by HTTP method",
    "history.noErrors": "No errors were recorded.",
    "history.noMatches": "No history records match the current filters.",
    "history.notFound": "This history record is not available.",
    "history.openEndpoint": "Open endpoint in editor",
    "history.outcomeFilterLabel": "Filter history by outcome",
    "history.privateRoute": "Private Route",
    "history.recent": "Review previously executed requests and their details.",
    "history.requestSize": "Request size",
    "history.resetFilters": "Reset filters",
    "history.responseSize": "Response size",
    "history.sortFastest": "Fastest first",
    "history.sortFailures": "Failures first",
    "history.sortLabel": "Sort request history",
    "history.sortNewest": "Newest first",
    "history.sortOldest": "Oldest first",
    "history.sortSlowest": "Slowest first",
    "history.status": "Status",
    "history.statsLabel": "Visible request statistics",
    "history.summary": "Summary",
    "history.successRate": "Success rate",
    "history.successfulRequests": "Successful",
    "history.timestamp": "Timestamp",
    "history.totalRequests": "Total requests",
    "history.viewDetails": "View details for {summary}",
    "i18n.enShort": "EN",
    "i18n.english": "English",
    "i18n.ruShort": "RU",
    "i18n.russian": "Russian",
    "nav.about": "About",
    "nav.apiReference": "API Reference",
    "nav.home": "Home",
    "nav.mainNavigation": "Main navigation",
    "nav.schemas": "Schemas",
    "notFound.description":
      "The page does not exist or the link is no longer available.",
    "notFound.label": "404",
    "notFound.title": "Page not found",
    "schemas.allEndpointStates": "All endpoint states",
    "schemas.allFormats": "All formats",
    "schemas.characters": "Characters",
    "schemas.clearAll": "Clear all",
    "schemas.clearAllConfirm":
      "Delete all {count} saved schemas? This cannot be undone.",
    "schemas.clearAllError": "Could not clear saved schemas. Try again.",
    "schemas.clearing": "Clearing...",
    "schemas.copied": "Schema copied.",
    "schemas.copy": "Copy",
    "schemas.copyAriaLabel": "Copy {title}",
    "schemas.copyError": "Could not copy this schema.",
    "schemas.copying": "Copying...",
    "schemas.delete": "Delete",
    "schemas.deleteAriaLabel": "Delete {title}",
    "schemas.deleteConfirm": 'Delete "{title}"? This cannot be undone.',
    "schemas.deleteError": "Could not delete this schema. Try again.",
    "schemas.deleting": "Deleting...",
    "schemas.description":
      "Saved schemas from the editor are shown here newest first.",
    "schemas.download": "Download",
    "schemas.downloadAriaLabel": "Download {title}",
    "schemas.downloadError": "Could not start download.",
    "schemas.downloadStarted": "Download started.",
    "schemas.duplicate": "Duplicate",
    "schemas.duplicateAriaLabel": "Duplicate {title}",
    "schemas.duplicateError": "Could not duplicate this schema. Try again.",
    "schemas.duplicateTitle": "{title} copy",
    "schemas.duplicating": "Duplicating...",
    "schemas.empty":
      "You have not saved any schemas yet. Save a valid OpenAPI schema from the editor to see it here.",
    "schemas.endpointFilterLabel":
      "Filter saved schemas by endpoint availability",
    "schemas.endpoints": "Endpoints",
    "schemas.exportAll": "Export all",
    "schemas.exportVisible": "Export visible",
    "schemas.filterLabel": "Filter saved schemas",
    "schemas.filterPlaceholder": "Search schemas",
    "schemas.filterSummary": "Showing {visible} of {total} schemas",
    "schemas.format": "Format",
    "schemas.formatFilterLabel": "Filter saved schemas by format",
    "schemas.hidePreview": "Hide preview",
    "schemas.hidePreviewAriaLabel": "Hide preview for {title}",
    "schemas.label": "Schemas",
    "schemas.lines": "Lines",
    "schemas.noMatches": "No saved schemas match the current filters.",
    "schemas.openEditor": "Open in editor",
    "schemas.openEditorAriaLabel": "Open {title} in editor",
    "schemas.openEditorError": "Could not open this schema in the editor.",
    "schemas.preview": "Preview",
    "schemas.previewAriaLabel": "Preview {title}",
    "schemas.previewContentAriaLabel": "Schema preview for {title}",
    "schemas.rename": "Rename",
    "schemas.renameAriaLabel": "Rename {title}",
    "schemas.renameCancel": "Cancel",
    "schemas.renameError": "Could not rename this schema. Try again.",
    "schemas.renameInputLabel": "New title",
    "schemas.renameSave": "Save",
    "schemas.renameTitleRequired": "Enter a title.",
    "schemas.renaming": "Saving...",
    "schemas.resetFilters": "Reset filters",
    "schemas.schemaSize": "Size",
    "schemas.sortEndpoints": "Most endpoints",
    "schemas.sortLabel": "Sort saved schemas",
    "schemas.sortLargest": "Largest first",
    "schemas.sortNewest": "Newest first",
    "schemas.sortOldest": "Oldest first",
    "schemas.sortTitle": "Title A-Z",
    "schemas.title": "Saved OpenAPI Schemas",
    "schemas.unavailable": "Unavailable",
    "schemas.updated": "Updated",
    "schemas.version": "Version",
    "schemas.withEndpoints": "With endpoints",
    "schemas.withoutEndpoints": "No endpoints",
    "workspace.addValidSchema":
      "Add a valid OpenAPI schema to populate the viewer.",
    "workspace.addEndpointFavorite": "Add {method} {path} to favorites",
    "workspace.allEndpoints": "All endpoints",
    "workspace.allResponses": "All response coverage",
    "workspace.allMethods": "All methods",
    "workspace.allTags": "All tags",
    "workspace.applyServerOverride": "Apply server",
    "workspace.auditCoverage": "Audit coverage",
    "workspace.auditCoverageValue": "{passed}/{total}",
    "workspace.auditCopy": "Copy audit summary",
    "workspace.auditCopyError": "Could not copy the audit summary.",
    "workspace.auditCopySuccess": "Audit summary copied.",
    "workspace.auditExport": "Export audit JSON",
    "workspace.auditExportError": "Could not export the audit report.",
    "workspace.auditExportSuccess": "Audit export started.",
    "workspace.auditFilterAll": "All ({count})",
    "workspace.auditFilterErrors": "Errors ({count})",
    "workspace.auditFilterInfo": "Info ({count})",
    "workspace.auditFilterLabel": "Audit findings",
    "workspace.auditFilterWarnings": "Warnings ({count})",
    "workspace.auditIssueDuplicateOperationId":
      'operationId "{operationId}" is duplicated.',
    "workspace.auditIssueMissingDocumentation": "Add a summary or description.",
    "workspace.auditIssueMissingErrorResponse":
      "Document a 4xx, 5xx, or default error response.",
    "workspace.auditIssueMissingOperationId": "Add a unique operationId.",
    "workspace.auditIssueMissingPathParameter":
      'Define path parameter "{parameter}".',
    "workspace.auditIssueMissingSuccessResponse":
      "Document a 2xx success response.",
    "workspace.auditIssueMissingTags": "Add at least one operation tag.",
    "workspace.auditIssueNoEndpoints": "Add at least one API operation.",
    "workspace.auditMetricDocumentation": "Documented",
    "workspace.auditMetricErrorResponses": "Error responses",
    "workspace.auditMetricOperationIds": "Unique operation IDs",
    "workspace.auditMetricPathParameters": "Path parameter coverage",
    "workspace.auditMetricSuccessResponses": "Success responses",
    "workspace.auditMetricTags": "Tagged",
    "workspace.auditMarkdownCoverage": "Coverage",
    "workspace.auditMarkdownFindings": "Findings",
    "workspace.auditMarkdownScore":
      "Quality score: {score}% ({passed}/{total} checks passed)",
    "workspace.auditMarkdownTitle": "{title} quality audit",
    "workspace.auditMarkdownVersion": "Schema version: {version}",
    "workspace.auditNoFilteredIssues": "No findings for this severity.",
    "workspace.auditNoIssues": "All quality checks passed.",
    "workspace.auditScore": "{score}% quality score",
    "workspace.auditSeverityError": "Error",
    "workspace.auditSeverityInfo": "Info",
    "workspace.auditSeverityWarning": "Warning",
    "workspace.auditShowAll": "Show all ({count})",
    "workspace.auditShowLess": "Show fewer",
    "workspace.auditTitle": "API quality audit",
    "workspace.auditViewEndpoint": "View endpoint",
    "workspace.authRequired": "Auth: {schemes}",
    "workspace.changeAddedLabel": "Added",
    "workspace.changeBaseline": "Baseline: {title} v{version} | {date}",
    "workspace.changeBreakingLabel": "Breaking",
    "workspace.changeClearBaseline": "Clear baseline",
    "workspace.changeDetailDeprecated": "Operation marked deprecated.",
    "workspace.changeDetailDocumentationChanged":
      "Summary or description changed.",
    "workspace.changeDetailOperationIdAdded": 'operationId "{current}" added.',
    "workspace.changeDetailOperationIdChanged":
      'operationId changed from "{previous}" to "{current}".',
    "workspace.changeDetailOperationIdRemoved":
      'operationId "{previous}" removed.',
    "workspace.changeDetailOptionalParameterAdded":
      "Optional {location} parameter {name} added.",
    "workspace.changeDetailParameterBecameOptional":
      "{location} parameter {name} became optional.",
    "workspace.changeDetailParameterBecameRequired":
      "{location} parameter {name} became required.",
    "workspace.changeDetailParameterRemoved":
      "{location} parameter {name} removed.",
    "workspace.changeDetailRequestBodyAdded":
      "Request body {contentType} added.",
    "workspace.changeDetailRequestBodyBecameOptional":
      "Request body {contentType} became optional.",
    "workspace.changeDetailRequestBodyBecameRequired":
      "Request body {contentType} became required.",
    "workspace.changeDetailRequestBodyRemoved":
      "Request body {contentType} removed.",
    "workspace.changeDetailRequiredParameterAdded":
      "Required {location} parameter {name} added.",
    "workspace.changeDetailResponseAdded": "Response {status} added.",
    "workspace.changeDetailResponseRemoved": "Response {status} removed.",
    "workspace.changeDetailSecurityAdded": "Authentication is now required.",
    "workspace.changeDetailSecurityRemoved":
      "Authentication is no longer required.",
    "workspace.changeDetailTagsChanged": "Operation tags changed.",
    "workspace.changeDetailUndeprecated": "Deprecated marker removed.",
    "workspace.changeEndpointAdded": "Operation added.",
    "workspace.changeEndpointModified": "{count} contract changes.",
    "workspace.changeEndpointRemoved": "Operation removed.",
    "workspace.changeExport": "Export change report",
    "workspace.changeExportError": "Could not export the change report.",
    "workspace.changeExportSuccess": "Change report export started.",
    "workspace.changeFilterAdded": "Added ({count})",
    "workspace.changeFilterAll": "All ({count})",
    "workspace.changeFilterBreaking": "Breaking ({count})",
    "workspace.changeFilterLabel": "Filter API changes",
    "workspace.changeFilterModified": "Modified ({count})",
    "workspace.changeFilterRemoved": "Removed ({count})",
    "workspace.changeImpactBreaking": "Breaking",
    "workspace.changeImpactNonBreaking": "Non-breaking",
    "workspace.changeInvalidBaseline":
      "Fix schema errors before setting the comparison baseline.",
    "workspace.changeModifiedLabel": "Modified",
    "workspace.changeMoreDetails": "{count} more changes",
    "workspace.changeNoBaseline": "No comparison baseline",
    "workspace.changeNoChanges": "No API changes from the baseline.",
    "workspace.changeNoFilteredChanges": "No changes match this filter.",
    "workspace.changeRemovedLabel": "Removed",
    "workspace.changeSetBaseline": "Set current as baseline",
    "workspace.changeShowAll": "Show all ({count})",
    "workspace.changeShowLess": "Show fewer",
    "workspace.changeStorageError":
      "Baseline changed for this session, but local storage could not be updated.",
    "workspace.changeTitle": "API change review",
    "workspace.changeUnchangedLabel": "Unchanged",
    "workspace.changeUpdateBaseline": "Update baseline",
    "workspace.checkpointCount": "{count}/{limit} checkpoints",
    "workspace.checkpointCreate": "Create checkpoint",
    "workspace.checkpointCreated": 'Checkpoint "{name}" created.',
    "workspace.checkpointCreateForm": "Create a schema checkpoint",
    "workspace.checkpointDelete": "Delete",
    "workspace.checkpointDeleteAriaLabel": "Delete checkpoint {name}",
    "workspace.checkpointDeleteConfirm": 'Delete checkpoint "{name}"?',
    "workspace.checkpointDeleted": 'Checkpoint "{name}" deleted.',
    "workspace.checkpointDownload": "Download",
    "workspace.checkpointDownloadAriaLabel": "Download checkpoint {name}",
    "workspace.checkpointDownloadError": "Could not download this checkpoint.",
    "workspace.checkpointDownloadStarted": "Checkpoint download started.",
    "workspace.checkpointEndpoints": "Endpoints: {count}",
    "workspace.checkpointInvalid": "Invalid draft",
    "workspace.checkpointName": "Checkpoint name",
    "workspace.checkpointNamePlaceholder": "Before risky changes",
    "workspace.checkpointNameRequired": "Enter a checkpoint name.",
    "workspace.checkpointNoItems": "No checkpoints yet.",
    "workspace.checkpointRestore": "Restore",
    "workspace.checkpointRestoreAriaLabel": "Restore checkpoint {name}",
    "workspace.checkpointRestoreConfirm":
      'Restore "{name}" in the editor? Current editor changes will be replaced.',
    "workspace.checkpointRestored":
      'Checkpoint "{name}" restored in the editor.',
    "workspace.checkpointSchemaFallback": "OpenAPI schema",
    "workspace.checkpointStorageError":
      "Checkpoint changed for this session, but local storage could not be updated.",
    "workspace.checkpointTitle": "Schema checkpoints",
    "workspace.checkpointTooLarge":
      "This schema exceeds the 2 MB checkpoint limit.",
    "workspace.checkpointValid": "Valid schema",
    "workspace.cancelRequest": "Cancel request",
    "workspace.clearEndpointFilter": "Clear search",
    "workspace.clearResponse": "Clear response",
    "workspace.clearServerOverride": "Clear custom server",
    "workspace.clientErrorResponseOnly": "Documents 4xx",
    "workspace.collapseEndpointDetails": "Hide details",
    "workspace.collapseEndpointDetailsAriaLabel":
      "Hide details for {method} {path}",
    "workspace.collapseVisibleEndpointDetails": "Collapse visible",
    "workspace.content": "Content:",
    "workspace.convertTo": "Convert to {format}",
    "workspace.copyCurl": "Copy cURL",
    "workspace.copyEndpointLink": "Copy link",
    "workspace.copyEndpointLinkAriaLabel": "Copy link to {method} {path}",
    "workspace.copyEndpointViewLink": "Copy filter link",
    "workspace.copyEndpointViewLinkAriaLabel":
      "Copy current endpoint filters as a link",
    "workspace.copyFetch": "Copy fetch",
    "workspace.copyHttp": "Copy HTTP",
    "workspace.copyRequestUrl": "Copy request URL",
    "workspace.copyResponse": "Copy response body",
    "workspace.copyResponseHeaders": "Copy response headers",
    "workspace.copySchema": "Copy schema",
    "workspace.cookie": "Cookie",
    "workspace.contractBody": "Body shape",
    "workspace.contractBodyEmpty":
      "Expected a {expected} response body, but it was empty.",
    "workspace.contractBodyInvalidJson":
      "The response body could not be parsed as {expected}.",
    "workspace.contractBodyMatched": "Top-level {type} shape matches.",
    "workspace.contractBodyMissingRequired":
      "Missing required properties: {properties}.",
    "workspace.contractBodyNotDocumented":
      "No body shape is documented for this response.",
    "workspace.contractBodyNotExpected":
      "No response body is expected for this method or status.",
    "workspace.contractBodyTypeMismatch":
      "Expected {expected}, received {actual}.",
    "workspace.contractCheckFailed": "Failed",
    "workspace.contractContentType": "Media type",
    "workspace.contractContentTypeMatched":
      "Received {actual}, documented as {documented}.",
    "workspace.contractContentTypeMismatch":
      "Received {actual}; expected {expected}.",
    "workspace.contractContentTypeMissing":
      "No Content-Type header was returned; expected {expected}.",
    "workspace.contractContentTypeNotDocumented":
      "No response media type is documented.",
    "workspace.contractCopy": "Copy report JSON",
    "workspace.contractCopyError":
      "Could not copy the response contract report.",
    "workspace.contractCopying": "Copying...",
    "workspace.contractCopySuccess": "Response contract report copied.",
    "workspace.contractFailed": "Issues found",
    "workspace.contractPassed": "Passed",
    "workspace.contractSkipped": "Not checked",
    "workspace.contractStatus": "Status",
    "workspace.contractStatusMatched":
      "Received {actual}, matched documented response {documented}.",
    "workspace.contractStatusUndocumented":
      "Status {actual} is not documented.",
    "workspace.contractSummaryFailed":
      "{failed} of {checked} checked rules failed.",
    "workspace.contractSummaryPassed": "All {checked} checked rules passed.",
    "workspace.contractTitle": "Response contract",
    "workspace.curl": "cURL",
    "workspace.curlCopied": "cURL copied.",
    "workspace.customServerUrl": "Custom server URL",
    "workspace.customServerUrlPlaceholder": "https://staging.example.com",
    "workspace.deprecated": "Deprecated",
    "workspace.deprecatedEndpoint": "Deprecated",
    "workspace.deprecatedOnly": "Deprecated only",
    "workspace.download": "Download",
    "workspace.downloadRequestCode": "Download snippet",
    "workspace.downloadRequestCodeAriaLabel":
      "Download {format} snippet for {method} {path}",
    "workspace.downloadResponse": "Download response",
    "workspace.responseDownloadSuccess": "Response download started.",
    "workspace.responseDownloadError":
      "Could not download the response. Try again or copy the response body.",
    "workspace.draftSaveFailed": "Draft could not be saved.",
    "workspace.draftSaved": "Draft saved locally.",
    "workspace.draftSaving": "Saving draft...",
    "workspace.editor": "Editor",
    "workspace.editorCursorPosition": "Line {line}, column {column}",
    "workspace.editorDocumentStats":
      "Lines {lines}, {characters} characters, {size} B",
    "workspace.editorDocumentStatsLabel": "Schema document statistics",
    "workspace.editorFontSize": "Editor font size",
    "workspace.editorFontSizeLarge": "Large",
    "workspace.editorFontSizeMedium": "Medium",
    "workspace.editorFontSizeSmall": "Small",
    "workspace.editorIndentSize": "Indent size",
    "workspace.editorIndentSizeFourSpaces": "4 spaces",
    "workspace.editorIndentSizeTwoSpaces": "2 spaces",
    "workspace.editorSelectionStats": "Selected {count}",
    "workspace.environmentAddHeader": "Add header",
    "workspace.environmentBaseUrlSummary": "Base URL: {url}",
    "workspace.environmentCancel": "Cancel",
    "workspace.environmentCustomOverrideNotice":
      "The one-off custom server URL currently takes priority.",
    "workspace.environmentDelete": "Delete",
    "workspace.environmentDeleteConfirm":
      'Delete the "{name}" request environment?',
    "workspace.environmentDescription":
      "Switch reusable base URLs and shared request headers across every endpoint.",
    "workspace.environmentEdit": "Edit",
    "workspace.environmentEditForm": "Edit request environment",
    "workspace.environmentHeaderCount": "Shared headers: {count}",
    "workspace.environmentHeaderEnabled": "Enable header {index}",
    "workspace.environmentHeaderEnabledLabel": "On",
    "workspace.environmentHeaderInvalid":
      "Each populated header needs a valid HTTP name and a single-line value.",
    "workspace.environmentHeaderName": "Name",
    "workspace.environmentHeaderNameLabel": "Header {index} name",
    "workspace.environmentHeaderNamePlaceholder": "Authorization",
    "workspace.environmentHeaderValue": "Value",
    "workspace.environmentHeaderValueLabel": "Header {index} value",
    "workspace.environmentHeaderValuePlaceholder": "Bearer token",
    "workspace.environmentLocalOnly":
      "Profiles stay in this browser. Endpoint header inputs override matching shared headers.",
    "workspace.environmentName": "Profile name",
    "workspace.environmentNamePlaceholder": "Staging",
    "workspace.environmentNameRequired": "Enter a profile name.",
    "workspace.environmentNew": "New environment",
    "workspace.environmentNewForm": "Create request environment",
    "workspace.environmentNone": "Schema server (no environment)",
    "workspace.environmentRemove": "Remove",
    "workspace.environmentRemoveHeader": "Remove header {index}",
    "workspace.environmentSave": "Save environment",
    "workspace.environmentSaved": "Request environments saved locally.",
    "workspace.environmentSchemaServer": "Use schema server",
    "workspace.environmentSelector": "Active request environment",
    "workspace.environmentServerInvalid":
      "Enter a public HTTP or HTTPS base URL, or leave it empty.",
    "workspace.environmentServerUrl": "Base URL (optional)",
    "workspace.environmentServerUrlPlaceholder":
      "https://staging.example.com/v1",
    "workspace.environmentSharedHeaders": "Shared request headers",
    "workspace.environmentStorageError":
      "Environment changed for this session, but local storage could not be updated.",
    "workspace.environmentTitle": "Request environments",
    "workspace.requestAuthAccessToken": "Access token",
    "workspace.requestAuthApiKey": "API key",
    "workspace.requestAuthApiKeySummary": "API key · {location}: {name}",
    "workspace.requestAuthApplied": "Auth configured",
    "workspace.requestAuthBasicSummary": "HTTP Basic authentication",
    "workspace.requestAuthBearerSummary": "HTTP Bearer · {format}",
    "workspace.requestAuthClear": "Clear credentials",
    "workspace.requestAuthConfiguredCount": "Configured: {count}",
    "workspace.requestAuthDescription":
      "Use security schemes declared by this API in request previews and Try It Out.",
    "workspace.requestAuthEnable": "Enable {name} authentication",
    "workspace.requestAuthHide": "Hide",
    "workspace.requestAuthHideFor": "Hide secret for {name}",
    "workspace.requestAuthOAuthSummary": "OAuth 2 access token",
    "workspace.requestAuthOpenIdSummary": "OpenID Connect access token",
    "workspace.requestAuthPassword": "Password",
    "workspace.requestAuthPasswordFor": "Password for {name}",
    "workspace.requestAuthSecretFor": "Credential for {name}",
    "workspace.requestAuthSecretPlaceholder": "Enter credential",
    "workspace.requestAuthSessionOnly":
      "Credentials stay in memory in this tab. They are never saved in environments, presets, or request history.",
    "workspace.requestAuthShow": "Show",
    "workspace.requestAuthShowFor": "Show secret for {name}",
    "workspace.requestAuthTitle": "Authentication",
    "workspace.requestAuthToken": "token",
    "workspace.requestAuthUnsupportedSummary":
      "This security scheme cannot be applied automatically.",
    "workspace.requestAuthUsername": "Username",
    "workspace.requestAuthUsernameFor": "Username for {name}",
    "workspace.wordWrap": "Word wrap",
    "workspace.endpointStats": "Endpoint statistics",
    "workspace.endpointFilterSummary": "Showing {visible} of {total} endpoints",
    "workspace.endpointCollapseSaveError":
      "Endpoint details changed for this session, but could not be saved locally.",
    "workspace.endpointInventoryExportError":
      "Could not export the visible endpoint inventory.",
    "workspace.endpointInventoryExportSuccess":
      "Visible endpoint CSV export started.",
    "workspace.endpointLinkCopied": "Link copied.",
    "workspace.endpointResponseFilterLabel":
      "Filter endpoints by documented responses",
    "workspace.endpointSortLabel": "Sort endpoints",
    "workspace.endpointTraitFilterLabel": "Filter endpoints by characteristic",
    "workspace.endpointViewLinkCopied": "Filter link copied.",
    "workspace.endpointViewLinkCopyError": "Could not copy filter link.",
    "workspace.errorPosition": "Error at line {line}, column {column}",
    "workspace.executionMode": "Execution mode",
    "workspace.executionModeLive": "Live",
    "workspace.executionModeMock": "Mock",
    "workspace.executionModeStorageError":
      "Mode changed for this session but could not be saved.",
    "workspace.executing": "Executing...",
    "workspace.goToLine": "Go to line",
    "workspace.goToLineAction": "Go",
    "workspace.lineEndings": "Line endings",
    "workspace.lineEndingsCr": "CR (legacy)",
    "workspace.lineEndingsMixed": "Mixed",
    "workspace.lineEndingsNone": "None",
    "workspace.matchCase": "Match case",
    "workspace.wholeWord": "Whole word",
    "workspace.errors.fileReadFailed": "Could not read that file.",
    "workspace.confirmLargeImport":
      "This file is larger than 5 MB and may slow the editor. Import it anyway?",
    "workspace.errors.infoTitleRequired": "Schema info.title is required.",
    "workspace.errors.pathsRequired": "Schema paths object is required.",
    "workspace.errors.schemaObject": "Schema must be an object.",
    "workspace.errors.versionRequired":
      "Schema must include an openapi or swagger version.",
    "workspace.expandEndpointDetails": "Show details",
    "workspace.expandEndpointDetailsAriaLabel":
      "Show details for {method} {path}",
    "workspace.expandVisibleEndpointDetails": "Expand visible",
    "workspace.exportEndpointInventory": "Export visible CSV",
    "workspace.exportEndpointInventoryAriaLabel":
      "Export visible endpoints as CSV",
    "workspace.fetch": "Fetch",
    "workspace.fetchCopied": "Fetch snippet copied.",
    "workspace.favoriteEndpoints": "Favorites ({count})",
    "workspace.favoriteSaveError":
      "Favorite updated for this session, but could not be saved locally.",
    "workspace.filterEndpoints":
      "Filter endpoints by method, path, summary, operation ID, tag, parameter, or auth",
    "workspace.formatSchema": "Format schema",
    "workspace.generateMockResponse": "Generate Mock",
    "workspace.goToError": "Go to error",
    "workspace.guestRun": "Guest run",
    "workspace.generatedMockResponse": "Generated mock response",
    "workspace.header": "Header",
    "workspace.http": "HTTP",
    "workspace.httpCopied": "HTTP request copied.",
    "workspace.import": "Import",
    "workspace.invalid": "Invalid",
    "workspace.invalidServerOverride":
      "Enter a public HTTP or HTTPS server URL.",
    "workspace.methodFilterLabel": "Filter endpoints by HTTP method",
    "workspace.methods": "Methods",
    "workspace.registryAllKinds": "All component kinds",
    "workspace.registryBroken": "Broken",
    "workspace.registryBrokenDependencies": "{count} broken dependencies",
    "workspace.registryCopyError": "Could not copy the Mermaid graph.",
    "workspace.registryCopyMermaid": "Copy Mermaid",
    "workspace.registryCopyReference": "Copy reference",
    "workspace.registryCopySuccess": "Component dependency graph copied.",
    "workspace.registryCycle": "Cycle",
    "workspace.registryDependsOn": "Depends on",
    "workspace.registryExport": "Export report",
    "workspace.registryExportError": "Could not export the component registry.",
    "workspace.registryExportSuccess": "Component registry export started.",
    "workspace.registryExternal": "External",
    "workspace.registryExternalDependencies": "{count} external dependencies",
    "workspace.registryFilterAll": "All ({count})",
    "workspace.registryFilterIssues": "Needs review ({count})",
    "workspace.registryFilterLabel": "Filter reusable components",
    "workspace.registryFilterUnused": "Unused ({count})",
    "workspace.registryFilterUsed": "Reachable ({count})",
    "workspace.registryFindingBroken":
      "Local reference cannot be resolved: {reference}.",
    "workspace.registryFindingExternal":
      "External reference is outside this document: {reference}.",
    "workspace.registryFindingsTitle": "Reference findings",
    "workspace.registryHideDetails": "Hide details",
    "workspace.registryKindCallback": "Callback",
    "workspace.registryKindExample": "Example",
    "workspace.registryKindHeader": "Header",
    "workspace.registryKindLink": "Link",
    "workspace.registryKindMediaType": "Media type",
    "workspace.registryKindParameter": "Parameter",
    "workspace.registryKindPathItem": "Path item",
    "workspace.registryKindRequestBody": "Request body",
    "workspace.registryKindResponse": "Response",
    "workspace.registryKindSchema": "Schema",
    "workspace.registryKindSecurityScheme": "Security scheme",
    "workspace.registryKindFilterLabel": "Filter components by kind",
    "workspace.registryNoMatches": "No components match this view.",
    "workspace.registryNoUsage": "No component references point here directly.",
    "workspace.registryNone": "None",
    "workspace.registryReferenceCopyError":
      "Could not copy the {name} reference.",
    "workspace.registryReferenceCopySuccess": "{name} reference copied.",
    "workspace.registryReferenceCount": "{count} references",
    "workspace.registryReferencedBy": "Referenced by components",
    "workspace.registryRelationships": "Component relationships",
    "workspace.registryRootReferenceCount": "{count} from API surface",
    "workspace.registrySearch": "Search reusable components",
    "workspace.registrySearchPlaceholder":
      "Search names, pointers, or dependencies",
    "workspace.registryShowAll": "Show all {count} components",
    "workspace.registryShowAllFindings": "Show all {count} findings",
    "workspace.registryShowDetails": "Show details",
    "workspace.registryShowLess": "Show fewer components",
    "workspace.registryShowLessFindings": "Show fewer findings",
    "workspace.registryStatComponents": "Components",
    "workspace.registryStatReferenceIssues": "Reference issues",
    "workspace.registryStatUnused": "Unused",
    "workspace.registryStatUsed": "Reachable",
    "workspace.registrySummary":
      "{unused} unused, {broken} broken refs, {external} external refs, {cycles} cycles.",
    "workspace.registryTitle": "Reusable component registry",
    "workspace.registryUnused": "Unused",
    "workspace.registryUsageSources": "Direct reference sources",
    "workspace.registryUsed": "Reachable",
    "workspace.registryUsedSummary": "{used}/{total} reachable",
    "workspace.modelsCopyExample": "Copy example",
    "workspace.modelsCopyTypeScript": "Copy TypeScript",
    "workspace.modelsDeprecated": "Deprecated",
    "workspace.modelsEnum": "Enum: {values}",
    "workspace.modelsExample": "Example",
    "workspace.modelsExampleCopyError": "Could not copy the {name} example.",
    "workspace.modelsExampleCopySuccess": "{name} example copied.",
    "workspace.modelsExport": "Export TypeScript",
    "workspace.modelsExportError": "Could not export the data models.",
    "workspace.modelsExportSuccess": "TypeScript model export started.",
    "workspace.modelsFilterAll": "All ({count})",
    "workspace.modelsFilterLabel": "Filter data models",
    "workspace.modelsFilterUnused": "Unused ({count})",
    "workspace.modelsFilterUsed": "Used ({count})",
    "workspace.modelsFormat": "Format: {format}",
    "workspace.modelsHideDetails": "Hide details",
    "workspace.modelsNoMatches": "No data models match this view.",
    "workspace.modelsNoProperties": "No object properties are declared.",
    "workspace.modelsNone": "None",
    "workspace.modelsNoUsage": "Not referenced by an API operation.",
    "workspace.modelsNullable": "Nullable",
    "workspace.modelsOptional": "Optional",
    "workspace.modelsProperties": "Properties",
    "workspace.modelsPropertyCount": "{count} properties",
    "workspace.modelsReadOnly": "Read only",
    "workspace.modelsReferencedBy": "Referenced by",
    "workspace.modelsReferences": "References",
    "workspace.modelsRelationships": "Model relationships",
    "workspace.modelsRequired": "Required",
    "workspace.modelsSearch": "Search data models",
    "workspace.modelsSearchPlaceholder": "Search models or properties",
    "workspace.modelsShowAll": "Show all ({count})",
    "workspace.modelsShowDetails": "Show details",
    "workspace.modelsShowLess": "Show fewer",
    "workspace.modelsSummary": "{used}/{total} used by API operations",
    "workspace.modelsTitle": "Data model explorer",
    "workspace.modelsTypeScript": "TypeScript",
    "workspace.modelsTypeScriptCopyError":
      "Could not copy the {name} TypeScript declaration.",
    "workspace.modelsTypeScriptCopySuccess":
      "{name} TypeScript declaration copied.",
    "workspace.modelsUnused": "Unused",
    "workspace.modelsUsageRequest": "Request",
    "workspace.modelsUsageResponse": "Response",
    "workspace.modelsUsed": "Used",
    "workspace.modelsUsedBy": "Used by operations",
    "workspace.modelsWriteOnly": "Write only",
    "workspace.mockLatency": "Mock latency",
    "workspace.mockLatencyInstant": "Instant",
    "workspace.mockLatencyMilliseconds": "{milliseconds} ms",
    "workspace.mockResponse": "Mock response",
    "workspace.mockSuiteBodyDocumented": "Documented example.",
    "workspace.mockSuiteBodyGenerated": "Generated example.",
    "workspace.mockSuiteBodyNone": "No response body example.",
    "workspace.mockSuiteChecks":
      "{passed} passed, {failed} failed, {skipped} skipped.",
    "workspace.mockSuiteEmpty": "No suite results yet.",
    "workspace.mockSuiteExport": "Export suite JSON",
    "workspace.mockSuiteExportError": "Could not export the suite report.",
    "workspace.mockSuiteExportSuccess": "Suite export started.",
    "workspace.mockSuiteFailed": "Failed",
    "workspace.mockSuiteFilterAll": "All ({count})",
    "workspace.mockSuiteFilterFailed": "Failed ({count})",
    "workspace.mockSuiteFilterLabel": "Filter mock contract suite results",
    "workspace.mockSuiteFilterPartial": "Partial ({count})",
    "workspace.mockSuiteFilterPassed": "Passed ({count})",
    "workspace.mockSuiteNoEndpoints": "No endpoints in this scope.",
    "workspace.mockSuiteNoFilteredResults":
      "No suite results match this filter.",
    "workspace.mockSuitePartial": "Partial",
    "workspace.mockSuitePassed": "Passed",
    "workspace.mockSuiteResponse": "Response {status}",
    "workspace.mockSuiteResultFailed": "Failed",
    "workspace.mockSuiteResultPartial": "Partial",
    "workspace.mockSuiteResultPassed": "Passed",
    "workspace.mockSuiteResults": "Mock contract suite results",
    "workspace.mockSuiteRun": "Run mock suite",
    "workspace.mockSuiteScope": "Suite scope",
    "workspace.mockSuiteScopeAll": "All endpoints ({count})",
    "workspace.mockSuiteScopeVisible": "Visible endpoints ({count})",
    "workspace.mockSuiteTitle": "Mock contract suite",
    "workspace.mockSuiteTotal": "Cases",
    "workspace.missingErrorResponseOnly": "Missing error response",
    "workspace.namedExample": "Example: {name}",
    "workspace.noEndpointsMatch": "No endpoints match the current filters.",
    "workspace.noFavoriteEndpoints":
      "No favorite endpoints in the current schema.",
    "workspace.nextMatch": "Next match",
    "workspace.noResponseExample":
      "No response example available for {method} {path}.",
    "workspace.none": "None",
    "workspace.openApiSchema": "OpenAPI schema",
    "workspace.previousMatch": "Previous match",
    "workspace.operationId": "Operation ID: {id}",
    "workspace.parameters": "parameters",
    "workspace.parameterExamplePlaceholder": "Example: {value}",
    "workspace.parameterBoolean": "{name} must be true or false.",
    "workspace.parameterEnum": "{name} must be one of: {values}.",
    "workspace.parameterInputLabel": "{location} parameter {name}",
    "workspace.parameterInteger": "{name} must be a whole number.",
    "workspace.parameterMaximum": "{name} must be at most {maximum}.",
    "workspace.parameterMaxLength":
      "{name} must contain at most {maximum} characters.",
    "workspace.parameterMinimum": "{name} must be at least {minimum}.",
    "workspace.parameterMinLength":
      "{name} must contain at least {minimum} characters.",
    "workspace.parameterNumber": "{name} must be a number.",
    "workspace.parameterPattern": "{name} must match {pattern}.",
    "workspace.parameterRequired": "{name} is required.",
    "workspace.parameterValuePlaceholder": "Enter value",
    "workspace.path": "Path",
    "workspace.eventCopy": "Copy summary",
    "workspace.eventCopyError": "Could not copy the event contract summary.",
    "workspace.eventCopySuccess": "Event contract summary copied.",
    "workspace.eventDeprecated": "Deprecated",
    "workspace.eventDocumentedSummary": "{documented}/{total} documented",
    "workspace.eventExample": "Payload example",
    "workspace.eventExport": "Export report",
    "workspace.eventExportError": "Could not export the event contract report.",
    "workspace.eventExportSuccess": "Event contract report export started.",
    "workspace.eventFilterAll": "All operations ({count})",
    "workspace.eventFilterCallbacks": "Callbacks ({count})",
    "workspace.eventFilterIssues": "Needs review ({count})",
    "workspace.eventFilterLabel": "Filter event contract operations",
    "workspace.eventFilterWebhooks": "Webhooks ({count})",
    "workspace.eventFindingEmptyChannel":
      "{name} does not declare an HTTP operation.",
    "workspace.eventFindingExternalReference":
      "External reference for {name} cannot be resolved: {reference}.",
    "workspace.eventFindingUnresolvedReference":
      "Local reference for {name} could not be resolved: {reference}.",
    "workspace.eventFindingsTitle": "Definition findings",
    "workspace.eventIndependent": "Independent provider event",
    "workspace.eventIssueExternalReference":
      "An external contract reference cannot be resolved here: {reference}.",
    "workspace.eventIssueMissingDocumentation":
      "Add a summary or description for this event operation.",
    "workspace.eventIssueMissingOperationId":
      "Add an operationId for stable code generation and tooling.",
    "workspace.eventIssueMissingResponses":
      "Document at least one receiver response.",
    "workspace.eventIssueUnresolvedReference":
      "A local contract reference could not be resolved: {reference}.",
    "workspace.eventKindCallback": "Callback",
    "workspace.eventKindWebhook": "Webhook",
    "workspace.eventMarkdownSummary":
      "{operations} operations across {channels} channels ({callbacks} callbacks, {webhooks} webhooks).",
    "workspace.eventMarkdownTitle": "{title} event contracts",
    "workspace.eventMarkdownVersion": "Schema version: {version}",
    "workspace.eventNoFindings": "No definition findings.",
    "workspace.eventNoOperations": "No event operations match this filter.",
    "workspace.eventOperationId": "Operation ID",
    "workspace.eventOperationsTitle": "Event operations",
    "workspace.eventOptional": "Optional",
    "workspace.eventPayloads": "Payloads",
    "workspace.eventRequired": "Required",
    "workspace.eventResponses": "Receiver responses",
    "workspace.eventSecurity": "Security",
    "workspace.eventShowAll": "Show all {count} operations",
    "workspace.eventShowLess": "Show fewer operations",
    "workspace.eventSource": "Source operation",
    "workspace.eventStatCallbacks": "Callback operations",
    "workspace.eventStatOperations": "Event operations",
    "workspace.eventStatPayloads": "With payload",
    "workspace.eventStatWebhooks": "Webhook operations",
    "workspace.eventSummary":
      "{channels} channels, {issues} contracts need review.",
    "workspace.eventTitle": "Events & callbacks",
    "workspace.eventUrlExpression": "Receiver URL expression",
    "workspace.postmanCollectionExportError":
      "Could not export the Postman collection.",
    "workspace.postmanCollectionExportSuccess":
      "Postman collection export started.",
    "workspace.postmanEnvironmentExportError":
      "Could not export the Postman environment.",
    "workspace.postmanEnvironmentExportSuccess":
      "Postman environment export started.",
    "workspace.postmanExportCollection": "Export collection",
    "workspace.postmanExportEnvironment": "Export environment",
    "workspace.postmanGroupByTags": "Group requests by tags",
    "workspace.postmanIncludeResponses": "Include response examples",
    "workspace.postmanNoEndpoints":
      "No endpoints are available in this export scope.",
    "workspace.postmanScopeAll": "All endpoints ({count})",
    "workspace.postmanScopeLabel": "Postman export scope",
    "workspace.postmanScopeVisible": "Current view ({count})",
    "workspace.postmanStatFolders": "Folders",
    "workspace.postmanStatRequests": "Requests",
    "workspace.postmanStatResponses": "Saved responses",
    "workspace.postmanStatVariables": "Variables",
    "workspace.postmanTitle": "Postman collection",
    "workspace.postmanVersion": "Collection 2.1",
    "workspace.coverageBadge": "{percentage}% operations tested",
    "workspace.coverageDocumentedResponses":
      "Documented responses observed: {observed}/{total}",
    "workspace.coverageExport": "Export coverage",
    "workspace.coverageExportError": "Could not export request coverage.",
    "workspace.coverageExportSuccess": "Coverage export started.",
    "workspace.coverageFilterAll": "All ({count})",
    "workspace.coverageFilterAttention": "Needs attention ({count})",
    "workspace.coverageFilterCovered": "Covered ({count})",
    "workspace.coverageFilterFailing": "Latest failed ({count})",
    "workspace.coverageFilterLabel": "Filter request coverage operations",
    "workspace.coverageFilterUndocumented": "Undocumented status ({count})",
    "workspace.coverageFilterUntested": "Untested ({count})",
    "workspace.coverageLoading": "Loading saved request history...",
    "workspace.coverageNeverRun": "Never run",
    "workspace.coverageNoFilteredOperations":
      "No operations match this coverage filter.",
    "workspace.coverageNoHistory":
      "No saved requests yet. Run an endpoint to begin measuring coverage.",
    "workspace.coverageObservedStatuses": "Observed statuses",
    "workspace.coverageOperationDetails":
      "{attempts} attempts · {duration} ms average · latest {latest}",
    "workspace.coverageOperationProgress": "Operation coverage",
    "workspace.coverageOperationSummary": "Coverage: {summary}",
    "workspace.coverageRefresh": "Refresh history",
    "workspace.coverageResponseProgress": "Response coverage",
    "workspace.coverageScope": "Coverage scope",
    "workspace.coverageScopeAll": "All endpoints ({count})",
    "workspace.coverageScopeVisible": "Current view ({count})",
    "workspace.coverageShowAll": "Show all {count} operations",
    "workspace.coverageShowLess": "Show fewer operations",
    "workspace.coverageStateCovered": "Covered",
    "workspace.coverageStateFailing": "Latest failed",
    "workspace.coverageStateUndocumented": "Undocumented status",
    "workspace.coverageStateUntested": "Untested",
    "workspace.coverageStatFailures": "Failed requests",
    "workspace.coverageStatOperations": "Tested operations",
    "workspace.coverageStatRequests": "Matched requests",
    "workspace.coverageStatResponses": "Observed responses",
    "workspace.coverageSummary":
      "{matched} of {saved} saved requests match this API and scope.",
    "workspace.coverageTitle": "Request coverage",
    "workspace.coverageTransportError": "ERR",
    "workspace.coverageUnknownDate": "Unknown date",
    "workspace.coverageViewEndpoint": "View endpoint",
    "workspace.coverageWindow": "History window",
    "workspace.coverageWindowAll": "All saved",
    "workspace.coverageWindowDay": "Last 24 hours",
    "workspace.coverageWindowWeek": "Last 7 days",
    "workspace.docsBadge": "Standalone HTML",
    "workspace.docsDeprecatedExcluded":
      "Excluded deprecated endpoint sections: {count}.",
    "workspace.docsDownload": "Download HTML",
    "workspace.docsDownloadError": "Could not download the documentation file.",
    "workspace.docsDownloadSuccess": "Documentation download started.",
    "workspace.docsIncludeDeprecated": "Include deprecated endpoints",
    "workspace.docsIncludeExamples": "Include request and response examples",
    "workspace.docsIncludeModels": "Include related schema models",
    "workspace.docsNoEndpoints":
      "No endpoints are available for this documentation scope.",
    "workspace.docsOptionsTitle": "Document content",
    "workspace.docsPreview": "Open preview",
    "workspace.docsPreviewError":
      "Could not open the preview. Allow popups and try again.",
    "workspace.docsPreviewSuccess": "Documentation opened in a new tab.",
    "workspace.docsScopeAll": "All endpoints ({count})",
    "workspace.docsScopeLabel": "Documentation scope",
    "workspace.docsScopeVisible": "Current view ({count})",
    "workspace.docsStatEndpoints": "Documented endpoints",
    "workspace.docsStatMethods": "HTTP methods",
    "workspace.docsStatModels": "Related models",
    "workspace.docsStatSecurity": "Auth schemes",
    "workspace.docsSummary":
      "{count} endpoint sections in one searchable offline file.",
    "workspace.docsTitle": "Offline API documentation",
    "workspace.nodeMockBadge": "No dependencies",
    "workspace.nodeMockCopy": "Copy server",
    "workspace.nodeMockCopyError": "Could not copy the mock server source.",
    "workspace.nodeMockCopySuccess": "Mock server source copied.",
    "workspace.nodeMockCors": "Enable CORS",
    "workspace.nodeMockDelay": "Default delay (ms)",
    "workspace.nodeMockDownload": "Download .mjs",
    "workspace.nodeMockDownloadError": "Could not download the mock server.",
    "workspace.nodeMockDownloadSuccess": "Mock server download started.",
    "workspace.nodeMockIncludeDeprecated": "Include deprecated routes",
    "workspace.nodeMockNoEndpoints":
      "No endpoints are available for this mock-server scope.",
    "workspace.nodeMockPort": "Default port",
    "workspace.nodeMockScopeAll": "All endpoints ({count})",
    "workspace.nodeMockScopeLabel": "Mock server scope",
    "workspace.nodeMockScopeVisible": "Current view ({count})",
    "workspace.nodeMockStatBodies": "Response bodies",
    "workspace.nodeMockStatExcludedDeprecated": "Excluded deprecated",
    "workspace.nodeMockStatRoutes": "Mock routes",
    "workspace.nodeMockStatVariants": "Status variants",
    "workspace.nodeMockSummary":
      "{routes} routes with {responses} documented response variants.",
    "workspace.nodeMockTarget": "http://localhost:{port}",
    "workspace.nodeMockTitle": "Node mock server",
    "workspace.nodeMockValidate": "Validate required inputs",
    "workspace.sdkBadge": "Fetch client",
    "workspace.sdkClientName": "Client factory name",
    "workspace.sdkCopy": "Copy TypeScript",
    "workspace.sdkCopyError": "Could not copy the TypeScript client.",
    "workspace.sdkCopySuccess": "TypeScript client copied.",
    "workspace.sdkDeprecated": "Deprecated method",
    "workspace.sdkEndpoint": "Endpoint {path}",
    "workspace.sdkExport": "Download client",
    "workspace.sdkExportError": "Could not download the TypeScript client.",
    "workspace.sdkExportSuccess": "TypeScript client download started.",
    "workspace.sdkGeneratedFactory": "Factory: {name}",
    "workspace.sdkGeneratedName": "Generated name",
    "workspace.sdkIncludeDeprecated": "Include deprecated operations",
    "workspace.sdkIncludeDocumentation": "Include documentation comments",
    "workspace.sdkIncludeUnusedModels": "Include unused schema models",
    "workspace.sdkNoEndpoints":
      "No endpoints are available in this generation scope.",
    "workspace.sdkOperationsTitle": "Generated methods",
    "workspace.sdkReturns": "Returns {type}",
    "workspace.sdkScopeAll": "All endpoints ({count})",
    "workspace.sdkScopeLabel": "TypeScript client generation scope",
    "workspace.sdkScopeVisible": "Current view ({count})",
    "workspace.sdkShowAll": "Show all {count} methods",
    "workspace.sdkShowLess": "Show fewer methods",
    "workspace.sdkStatExcludedDeprecated": "Excluded deprecated",
    "workspace.sdkStatGeneratedNames": "Generated names",
    "workspace.sdkStatMethods": "Methods",
    "workspace.sdkStatModels": "Models",
    "workspace.sdkSummary":
      "{operations} methods and {models} model declarations.",
    "workspace.sdkTitle": "TypeScript SDK",
    "workspace.workflowCopyError": "Could not copy the Mermaid workflow.",
    "workspace.workflowCopyMermaid": "Copy Mermaid",
    "workspace.workflowCopySuccess": "Mermaid workflow copied.",
    "workspace.workflowCycleBadge": "Cycle",
    "workspace.workflowExport": "Export report",
    "workspace.workflowExportError": "Could not export the workflow report.",
    "workspace.workflowExportSuccess": "Workflow report export started.",
    "workspace.workflowFilterAll": "All links ({count})",
    "workspace.workflowFilterCycles": "Cycle links ({count})",
    "workspace.workflowFilterLabel": "Filter API workflow links",
    "workspace.workflowFilterProblems": "Needs review ({count})",
    "workspace.workflowFilterResolved": "Resolved ({count})",
    "workspace.workflowIssueAmbiguousOperationId":
      "More than one operation declares the target operationId: {target}.",
    "workspace.workflowIssueExternalOperationRef":
      "This external operationRef cannot be resolved inside the current schema: {target}.",
    "workspace.workflowIssueInvalidOperationRef":
      "This local operationRef does not point to a path operation: {target}.",
    "workspace.workflowIssueMissingOperationId":
      "No operation declares the target operationId: {target}.",
    "workspace.workflowIssueMissingTarget":
      "This link does not declare operationId or operationRef.",
    "workspace.workflowIssueMultipleTargets":
      "This link declares both operationId and operationRef; operationRef is used.",
    "workspace.workflowNoLinks": "No workflow links match this filter.",
    "workspace.workflowParameter": "Parameter",
    "workspace.workflowRequestBody": "Request body",
    "workspace.workflowResolvedSummary": "{resolved}/{total} resolved",
    "workspace.workflowServer": "Server override",
    "workspace.workflowShowAll": "Show all {count} links",
    "workspace.workflowShowLess": "Show fewer links",
    "workspace.workflowSource": "Source operation",
    "workspace.workflowStatCycles": "Cycles",
    "workspace.workflowStatLinks": "Links",
    "workspace.workflowStatOperations": "Connected operations",
    "workspace.workflowStatProblems": "Needs review",
    "workspace.workflowStatusAmbiguous": "Ambiguous",
    "workspace.workflowStatusExternal": "External",
    "workspace.workflowStatusResolved": "Resolved",
    "workspace.workflowStatusUnresolved": "Unresolved",
    "workspace.workflowSummary":
      "{operations} connected operations, {problems} links need review.",
    "workspace.workflowTarget": "Target operation",
    "workspace.workflowTitle": "API workflows",
    "workspace.workflowUnknownTarget": "Unknown target",
    "workspace.properties": "Properties:",
    "workspace.query": "Query",
    "workspace.requestBody": "Request body",
    "workspace.requestBodyContractTitle": "Request body contract",
    "workspace.requestCancelled": "Request cancelled.",
    "workspace.formatRequestBody": "Format JSON",
    "workspace.requestBodyInputLabel": "Editable request body",
    "workspace.requestBodyInvalidJson": "Enter valid JSON before executing.",
    "workspace.requestBodyRequired": "Request body is required.",
    "workspace.requestCodeFormat": "Request code format",
    "workspace.requestContentType": "Request content type",
    "workspace.requestPreview": "Request preview",
    "workspace.requestPresetCancel": "Cancel",
    "workspace.requestPresetCreateForm": "Save request preset",
    "workspace.requestPresetDelete": "Delete",
    "workspace.requestPresetDeleteConfirm":
      'Delete the "{name}" request preset?',
    "workspace.requestPresetDeleted": "Request preset deleted.",
    "workspace.requestPresetName": "Preset name",
    "workspace.requestPresetNamePlaceholder": "Happy path",
    "workspace.requestPresetNameRequired": "Enter a preset name.",
    "workspace.requestPresetNone": "No preset selected",
    "workspace.requestPresetSave": "Save preset",
    "workspace.requestPresetSaveAs": "Save as preset",
    "workspace.requestPresetSaved": "Request preset saved locally.",
    "workspace.requestPresetSelector": "Request preset",
    "workspace.requestPresetStorageError":
      "Preset changed for this session, but local storage could not be updated.",
    "workspace.requestPresetUpdate": "Update preset",
    "workspace.requestSize": "Request {size} B",
    "workspace.requestTimeout": "Request timeout",
    "workspace.requestUrlCopied": "Request URL copied.",
    "workspace.required": "Required",
    "workspace.resetEditor": "Reset editor",
    "workspace.resetEditorConfirm":
      "Reset the editor to the default schema? Unsaved changes will be lost.",
    "workspace.resetEndpointFilters": "Reset filters",
    "workspace.resetTryItOut": "Reset values",
    "workspace.removeEndpointFavorite": "Remove {method} {path} from favorites",
    "workspace.remoteImportCancel": "Cancel load",
    "workspace.remoteImportClose": "Close URL import",
    "workspace.remoteImportEmpty": "The remote schema is empty.",
    "workspace.remoteImportFetchFailed":
      "Could not load the remote schema. Check the URL and try again.",
    "workspace.remoteImportForm": "Import OpenAPI schema from URL",
    "workspace.remoteImportHttpError":
      "The remote server returned HTTP {status}.",
    "workspace.remoteImportInvalidResponse":
      "The schema import service returned an invalid response.",
    "workspace.remoteImportInvalidUrl":
      "Enter a public HTTP or HTTPS schema URL.",
    "workspace.remoteImportLoad": "Load schema",
    "workspace.remoteImportLoading": "Loading...",
    "workspace.remoteImportOpen": "Import URL",
    "workspace.remoteImportTooLarge":
      "The remote schema exceeds the 5 MB import limit.",
    "workspace.remoteImportUrl": "OpenAPI schema URL",
    "workspace.remoteImportUrlPlaceholder": "https://example.com/openapi.yaml",
    "workspace.response": "Response",
    "workspace.responseBody": "Response body",
    "workspace.responseContentType": "Mock response content type",
    "workspace.responseCopied": "Response copied.",
    "workspace.responseHeaders": "Response headers",
    "workspace.responseHeadersCopied": "Response headers copied.",
    "workspace.responseSize": "Response {size} B",
    "workspace.responseStatus": "Mock response status",
    "workspace.responses": "Responses",
    "workspace.saveSchema": "Save schema",
    "workspace.schemaSearchSummary": "{current} of {total}",
    "workspace.searchSchema": "Search schema",
    "workspace.savedToHistory": "Saved to history",
    "workspace.schemaCopied": "Schema copied.",
    "workspace.schemaCopyFailed": "Could not copy schema.",
    "workspace.schemaDownloadFailed": "Could not download schema.",
    "workspace.schemaDownloadStarted": "Schema download started.",
    "workspace.schemaImported": "Imported {file} ({size} B).",
    "workspace.schemaSaveFailed": "Schema could not be saved locally.",
    "workspace.schemaSaved": "Schema saved.",
    "workspace.securityAccessOptional": "Optional auth",
    "workspace.securityAccessPublic": "Public",
    "workspace.securityAccessSecured": "Secured",
    "workspace.securityAllSchemes": "All schemes",
    "workspace.securityAnd": "AND",
    "workspace.securityCopy": "Copy summary",
    "workspace.securityCopyError": "Could not copy the security summary.",
    "workspace.securityCopySuccess": "Security summary copied.",
    "workspace.securityCoverage": "{percentage}% strict coverage",
    "workspace.securityExport": "Export report",
    "workspace.securityExportError": "Could not export the security report.",
    "workspace.securityExportSuccess": "Security report export started.",
    "workspace.securityFilterAll": "All ({count})",
    "workspace.securityFilterIssues": "Needs review ({count})",
    "workspace.securityFilterLabel": "Filter security operations",
    "workspace.securityFilterOptional": "Optional ({count})",
    "workspace.securityFilterPublic": "Public ({count})",
    "workspace.securityFilterSecured": "Secured ({count})",
    "workspace.securityFindingIncompleteApiKey":
      "{scheme} is missing its API key name or location.",
    "workspace.securityFindingIncompleteHttp":
      "{scheme} is missing its HTTP authentication scheme.",
    "workspace.securityFindingOptional":
      "Anonymous access is allowed by an empty security alternative.",
    "workspace.securityFindingUndefined":
      "The requirement references undefined scheme {scheme}.",
    "workspace.securityFindingUnsupported":
      "{scheme} uses a security type that cannot be analyzed.",
    "workspace.securityFindingUnused":
      "{scheme} is declared but no operation uses it.",
    "workspace.securityFindingsSummary":
      "{count} findings · {errors} errors · {warnings} warnings",
    "workspace.securityFindingsTitle": "Findings",
    "workspace.securityIncompleteDefinition": "Incomplete definition",
    "workspace.securityMarkdownCoverage":
      "Strict authentication coverage: {secured}/{total} ({percentage}%)",
    "workspace.securityMarkdownTitle": "Security posture: {title}",
    "workspace.securityMarkdownVersion": "Version: {version}",
    "workspace.securityNoFindings": "No security findings.",
    "workspace.securityNoOperations":
      "No operations match the selected security view.",
    "workspace.securityNoSchemes": "No security schemes are declared.",
    "workspace.securityOperationsTitle": "Operation access matrix",
    "workspace.securityOr": "OR",
    "workspace.securityRequirementOptional":
      "Anonymous access OR {requirements}",
    "workspace.securityRequirementPublic": "No authentication required",
    "workspace.securityRequirementSecured": "Requires {requirements}",
    "workspace.securitySchemeFilterLabel": "Filter by security scheme",
    "workspace.securitySchemeUsage": "{type}, {count} operations",
    "workspace.securitySchemesSummary": "{used}/{total} used",
    "workspace.securitySchemesTitle": "Security schemes",
    "workspace.securitySeverityError": "Error",
    "workspace.securitySeverityInfo": "Info",
    "workspace.securitySeverityWarning": "Warning",
    "workspace.securityShowAll": "Show all ({count})",
    "workspace.securityShowLess": "Show fewer",
    "workspace.securityStatOptional": "Optional auth",
    "workspace.securityStatPublic": "Public",
    "workspace.securityStatSchemes": "Used schemes",
    "workspace.securityStatSecured": "Strictly secured",
    "workspace.securityTitle": "API security posture",
    "workspace.securityViewEndpoint": "View endpoint",
    "workspace.secured": "Secured",
    "workspace.securedOnly": "Secured only",
    "workspace.server": "Server",
    "workspace.serverErrorResponseOnly": "Documents 5xx",
    "workspace.serverSelector": "Select API server",
    "workspace.signInToSave": "Sign in to save and restore schemas.",
    "workspace.sortByMethod": "Method order",
    "workspace.sortByPath": "Path A-Z",
    "workspace.sortSchemaOrder": "Schema order",
    "workspace.successResponseOnly": "Documents 2xx",
    "workspace.tryItOut": "Try It Out",
    "workspace.tagFilterLabel": "Filter endpoints by tag",
    "workspace.tagFilterOption": "{tag} ({count})",
    "workspace.timeoutSeconds": "{seconds} s",
    "workspace.type": "Type:",
    "workspace.totalEndpoints": "Endpoints",
    "workspace.unsecuredOnly": "Unsecured only",
    "workspace.unsavedSchemaChanges": "Unsaved schema changes.",
    "workspace.valid": "Valid",
    "workspace.version": "Version {version}",
    "workspace.viewer": "Viewer",
    "workspace.withRequestBodies": "With bodies",
    "workspace.withRequestBodyOnly": "With request body",
    "workspace.withoutRequestBodyOnly": "Without request body",
    "workspace.examplesTitle": "Example validator",
    "workspace.examplesDescription":
      "Checks every documented example against its schema so documentation, mocks, and generated tests stay trustworthy.",
    "workspace.examplesConformance": "{percentage}% conform",
    "workspace.examplesSummary":
      "{total} examples · {invalid} mismatched · {warnings} with warnings · {skipped} skipped",
    "workspace.examplesTruncated":
      "Validation stopped early to keep the editor responsive; some examples were not checked.",
    "workspace.examplesCopy": "Copy example report",
    "workspace.examplesExport": "Export example report",
    "workspace.examplesCopySuccess": "Example report copied.",
    "workspace.examplesCopyError": "Could not copy the example report.",
    "workspace.examplesExportSuccess": "Example report export started.",
    "workspace.examplesExportError": "Could not export the example report.",
    "workspace.examplesStatValid": "Matches schema",
    "workspace.examplesStatWarning": "With warnings",
    "workspace.examplesStatInvalid": "Mismatches",
    "workspace.examplesStatSkipped": "Not checked",
    "workspace.examplesProgressLabel":
      "Example results: {valid} matching, {warnings} with warnings, {invalid} mismatched, {skipped} not checked",
    "workspace.examplesStatusFilterLabel": "Filter examples by result",
    "workspace.examplesFilterAll": "All ({count})",
    "workspace.examplesFilterInvalid": "Mismatches ({count})",
    "workspace.examplesFilterWarning": "Warnings ({count})",
    "workspace.examplesFilterValid": "Matching ({count})",
    "workspace.examplesFilterSkipped": "Not checked ({count})",
    "workspace.examplesKindFilterLabel": "Example location",
    "workspace.examplesKindAll": "All locations",
    "workspace.examplesKindParameter": "Parameters",
    "workspace.examplesKindRequestBody": "Request bodies",
    "workspace.examplesKindResponse": "Responses",
    "workspace.examplesKindHeader": "Response headers",
    "workspace.examplesKindSchema": "Component schemas",
    "workspace.examplesBadgeParameter": "Parameter",
    "workspace.examplesBadgeRequestBody": "Request body",
    "workspace.examplesBadgeResponse": "Response",
    "workspace.examplesBadgeHeader": "Header",
    "workspace.examplesBadgeSchema": "Schema",
    "workspace.examplesStatusValid": "Matches",
    "workspace.examplesStatusWarning": "Needs review",
    "workspace.examplesStatusInvalid": "Mismatch",
    "workspace.examplesStatusSkipped": "Not checked",
    "workspace.examplesSearchLabel": "Search examples",
    "workspace.examplesSearchPlaceholder":
      "Search by endpoint, location, or example name",
    "workspace.examplesDefaultName": "example",
    "workspace.examplesNoMatches": "No examples match these filters.",
    "workspace.examplesAllClear": "Every checked example matches its schema.",
    "workspace.examplesShowAll": "Show all {count} examples",
    "workspace.examplesShowLess": "Show fewer examples",
    "workspace.examplesRevealInEditor": "Show in editor",
    "workspace.examplesRevealAriaLabel":
      "Show {name} for {location} in the editor",
    "workspace.examplesRevealError":
      "Could not find this example in the editor. Wait for the schema to finish updating and try again.",
    "workspace.examplesOpenEndpoint": "Open endpoint",
    "workspace.examplesOpenEndpointAriaLabel": "Open endpoint {method} {path}",
    "workspace.examplesHiddenIssues": "+{count} more issues",
    "workspace.examplesRoot": "value",
    "workspace.examplesIssueAdditionalProperties":
      'Property "{property}" is not allowed by the schema.',
    "workspace.examplesIssueAnyOf":
      "Value does not match any of the {options} anyOf schemas.",
    "workspace.examplesIssueConst": "Value must equal {expected}.",
    "workspace.examplesIssueEnum": "Value must be one of: {allowed}.",
    "workspace.examplesIssueFormat": "Value is not a valid {format}.",
    "workspace.examplesIssueMaxItems": "List must have at most {limit} items.",
    "workspace.examplesIssueMaxLength":
      "Text must have at most {limit} characters.",
    "workspace.examplesIssueMaxProperties":
      "Object must have at most {limit} properties.",
    "workspace.examplesIssueMaximum": "Value must be {comparison} {limit}.",
    "workspace.examplesIssueMinItems": "List must have at least {limit} items.",
    "workspace.examplesIssueMinLength":
      "Text must have at least {limit} characters.",
    "workspace.examplesIssueMinProperties":
      "Object must have at least {limit} properties.",
    "workspace.examplesIssueMinimum": "Value must be {comparison} {limit}.",
    "workspace.examplesIssueMultipleOf":
      "Value must be a multiple of {divisor}.",
    "workspace.examplesIssueNot": "Value matches a schema it must not match.",
    "workspace.examplesIssueOneOf":
      "Value does not match any of the {options} oneOf schemas.",
    "workspace.examplesIssueOneOfMultiple":
      "Value matches {matches} oneOf schemas; exactly one is expected.",
    "workspace.examplesIssuePattern":
      "Text does not match the pattern {pattern}.",
    "workspace.examplesIssueReadOnly":
      'Read-only property "{property}" should not appear in a request example.',
    "workspace.examplesIssueRequired":
      'Required property "{property}" is missing.',
    "workspace.examplesIssueSerialized":
      "Example is a JSON string; use a structured value instead.",
    "workspace.examplesIssueType": "Expected {expected}, but found {actual}.",
    "workspace.examplesIssueUniqueItems":
      "List items must be unique; item {index} is a duplicate.",
    "workspace.examplesIssueWriteOnly":
      'Write-only property "{property}" should not appear in a response example.',
    "workspace.examplesSkipExternalValue":
      "Uses externalValue, which is not downloaded for validation.",
    "workspace.examplesSkipLimit":
      "Skipped after reaching the validation limit.",
    "workspace.examplesSkipMediaType":
      "This media type is not validated as structured data.",
    "workspace.examplesSkipMissingSchema":
      "No schema is documented for this example.",
    "workspace.examplesSkipUnresolvedReference":
      "A referenced schema or example could not be resolved.",
    "workspace.examplesMarkdownTitle": "Example validation: {title}",
    "workspace.examplesMarkdownVersion": "Version: {version}",
    "workspace.examplesMarkdownSummary":
      "Checked {total} examples: {valid} matching, {warnings} with warnings, {invalid} mismatched, {skipped} not checked ({percentage}% conform).",
    "workspace.examplesMarkdownFindings": "Findings",
    "workspace.examplesMarkdownNoFindings":
      "No mismatched examples or warnings were found.",
    "workspace.toolNavLabel": "Workspace tools",
    "workspace.toolNavTitle": "Jump to",
    "workspace.toolNavCount": "{count} tools",
    "workspace.toolNavEndpoints": "Endpoint list",
    "workspace.toolNavCheckpoints": "Checkpoints",
    "workspace.toolNavComponents": "Components",
    "workspace.toolNavModels": "Data models",
    "workspace.toolNavWorkflows": "Links",
    "workspace.toolNavEvents": "Callbacks",
    "workspace.toolNavSecurity": "Security",
    "workspace.toolNavAudit": "Quality audit",
    "workspace.toolNavExamples": "Examples",
    "workspace.toolNavChanges": "Change review",
    "workspace.toolNavMockSuite": "Mock suite",
    "workspace.toolNavCoverage": "Coverage",
    "workspace.toolNavHar": "HAR traffic",
    "workspace.toolNavTestPlan": "Test plan",
    "workspace.toolNavPostman": "Postman",
    "workspace.toolNavSlice": "API slice",
    "workspace.toolNavTypeScript": "TypeScript client",
    "workspace.toolNavDocs": "HTML docs",
    "workspace.toolNavMockServer": "Mock server",
    "workspace.toolNavSmokeTests": "Smoke tests",
    "workspace.toolNavGroupDesign": "Design",
    "workspace.toolNavGroupQuality": "Quality",
    "workspace.toolNavGroupTesting": "Testing",
    "workspace.toolNavGroupExport": "Export",
    "workspace.styleTitle": "API style guide",
    "workspace.styleDescription":
      "Lints naming, path design, pagination, and error models against your team's conventions.",
    "workspace.styleScore": "Style score {score}",
    "workspace.styleScoreLabel": "Style score {score} out of 100",
    "workspace.styleSummary":
      "{findings} findings · {errors} must fix · {warnings} should fix · {notes} to consider",
    "workspace.styleRulesPassing": "{passing}/{enabled} rules passing",
    "workspace.styleTruncated":
      "Only the first findings are listed to keep the editor responsive; rule counts include every finding.",
    "workspace.styleCopy": "Copy style report",
    "workspace.styleExport": "Export style report",
    "workspace.styleExportRuleset": "Export ruleset",
    "workspace.styleImportRuleset": "Import ruleset",
    "workspace.styleImportRulesetFile": "Style guide ruleset file",
    "workspace.styleCopySuccess": "Style report copied.",
    "workspace.styleCopyError": "Could not copy the style report.",
    "workspace.styleExportSuccess": "Style report export started.",
    "workspace.styleExportError": "Could not export the style report.",
    "workspace.styleRulesetExportSuccess": "Ruleset export started.",
    "workspace.styleRulesetExportError": "Could not export the ruleset.",
    "workspace.styleImportSuccess": "Ruleset imported and applied.",
    "workspace.styleImportInvalid":
      "This file is not a valid RSSwag style guide ruleset.",
    "workspace.styleImportTooLarge": "The ruleset file is too large.",
    "workspace.styleImportReadError": "Could not read the ruleset file.",
    "workspace.styleStorageError":
      "Conventions apply for this session but could not be saved in this browser.",
    "workspace.styleRevealError":
      "Could not find this location in the editor. Wait for the schema to finish updating and try again.",
    "workspace.styleConfigure": "Conventions and rules",
    "workspace.styleConfigureHint":
      "Changes apply instantly and are remembered in this browser.",
    "workspace.styleConventionPathCase": "Path segments",
    "workspace.styleConventionParameterCase": "Query and path parameters",
    "workspace.styleConventionPropertyCase": "Schema properties",
    "workspace.styleConventionOperationIdCase": "Operation IDs",
    "workspace.styleResetConfig": "Reset to defaults",
    "workspace.styleRuleFindings": "{count} findings",
    "workspace.styleRulePassing": "Passing",
    "workspace.styleRuleNotApplicable": "Not applicable",
    "workspace.styleRuleDisabled": "Turned off",
    "workspace.styleRuleToggle": "Enable rule: {rule}",
    "workspace.styleCategoryPaths": "Paths & URLs",
    "workspace.styleCategoryOperations": "Operations & methods",
    "workspace.styleCategoryParameters": "Parameters & pagination",
    "workspace.styleCategorySchemas": "Schemas & properties",
    "workspace.styleCategoryResponses": "Error responses",
    "workspace.styleCategoryDocument": "Document & tags",
    "workspace.styleCategoryCardSummary": "{passing}/{total} rules passing",
    "workspace.styleCategoryFilterAria": "Show findings for {category}",
    "workspace.styleSeverityError": "Must fix",
    "workspace.styleSeverityWarning": "Should fix",
    "workspace.styleSeverityInfo": "Consider",
    "workspace.styleSeverityFilterLabel": "Filter style findings by severity",
    "workspace.styleFilterAll": "All findings ({count})",
    "workspace.styleFilterError": "Must fix ({count})",
    "workspace.styleFilterWarning": "Should fix ({count})",
    "workspace.styleFilterInfo": "Consider ({count})",
    "workspace.styleCategoryFilterLabel": "Rule category",
    "workspace.styleCategoryAll": "All categories",
    "workspace.styleSearchLabel": "Search style findings",
    "workspace.styleSearchPlaceholder": "Search by rule, endpoint, or name",
    "workspace.styleNoFindings":
      "No style findings. The API follows every enabled rule.",
    "workspace.styleNoMatches": "No style findings match these filters.",
    "workspace.styleShowAll": "Show all {count} findings",
    "workspace.styleShowLess": "Show fewer findings",
    "workspace.styleSuggestion": "Suggested: {suggestion}",
    "workspace.styleReveal": "Show in editor",
    "workspace.styleRevealAriaLabel":
      "Show {rule} finding at {pointer} in the editor",
    "workspace.styleOpenEndpoint": "Open endpoint",
    "workspace.styleOpenEndpointAriaLabel":
      "Open {method} {path} from the style guide",
    "workspace.styleMarkdownTitle": "API style guide: {title}",
    "workspace.styleMarkdownVersion": "Version: {version}",
    "workspace.styleMarkdownSummary":
      "Style score {score}/100 · {passing}/{enabled} rules passing · {errors} must fix, {warnings} should fix, {notes} to consider.",
    "workspace.styleMarkdownConventions": "Conventions",
    "workspace.styleMarkdownRules": "Rules",
    "workspace.styleMarkdownFindings": "Findings",
    "workspace.styleRulePathAmbiguousTitle": "Unambiguous path templates",
    "workspace.styleRulePathAmbiguousMessage":
      "Conflicts with {conflict}; both templates match the same URLs.",
    "workspace.styleRulePathCasingTitle": "Path segment casing",
    "workspace.styleRulePathCasingMessage":
      "Use {convention} for path segments: {segments}.",
    "workspace.styleRulePathTrailingSlashTitle": "No trailing slashes",
    "workspace.styleRulePathTrailingSlashMessage":
      "Remove the trailing slash from the path.",
    "workspace.styleRulePathVerbsTitle": "Resource-oriented paths",
    "workspace.styleRulePathVerbsMessage":
      'Avoid the verb in "{segment}"; let the HTTP method express the action.',
    "workspace.styleRulePathFileExtensionTitle": "No file extensions in paths",
    "workspace.styleRulePathFileExtensionMessage":
      'Remove "{extension}" and negotiate formats with the Accept header.',
    "workspace.styleRuleOperationIdCasingTitle": "Operation ID casing",
    "workspace.styleRuleOperationIdCasingMessage":
      'Use {convention} for operationId "{name}".',
    "workspace.styleRuleRequestBodyOnSafeMethodTitle":
      "No bodies on GET, HEAD, or DELETE",
    "workspace.styleRuleRequestBodyOnSafeMethodMessage":
      "{method} requests should not carry a body; many clients and proxies drop it.",
    "workspace.styleRulePostCreateStatusTitle": "201 for created resources",
    "workspace.styleRulePostCreateStatusMessage":
      "This POST only documents 200; document 201 Created (or 202/204) when it creates a resource.",
    "workspace.styleRuleSummaryStyleTitle": "Concise summaries",
    "workspace.styleRuleSummaryStyleMessage":
      "Keep summaries under {limit} characters without a trailing period (currently {length}).",
    "workspace.styleRuleParameterCasingTitle": "Parameter casing",
    "workspace.styleRuleParameterCasingMessage":
      'Use {convention} for {location} parameter "{name}".',
    "workspace.styleRuleReservedHeaderParameterTitle":
      "No reserved header parameters",
    "workspace.styleRuleReservedHeaderParameterMessage":
      'OpenAPI ignores the "{name}" header parameter; use media types or security schemes instead.',
    "workspace.styleRulePaginationStyleTitle": "Consistent pagination",
    "workspace.styleRulePaginationStyleMessage":
      "Uses {style} pagination while most endpoints use {dominant} pagination.",
    "workspace.styleRulePageSizeNameTitle": "Consistent page size parameter",
    "workspace.styleRulePageSizeNameMessage":
      'Uses "{name}" for page size while most endpoints use "{dominant}".',
    "workspace.styleRuleParameterDescriptionTitle": "Parameter descriptions",
    "workspace.styleRuleParameterDescriptionMessage":
      'Describe the {location} parameter "{name}".',
    "workspace.styleRuleSchemaNameCasingTitle": "Schema name casing",
    "workspace.styleRuleSchemaNameCasingMessage":
      'Use PascalCase for schema "{name}".',
    "workspace.styleRulePropertyCasingTitle": "Property casing",
    "workspace.styleRulePropertyCasingMessage":
      'Use {convention} for property "{name}".',
    "workspace.styleRuleEnumValueCasingTitle": "Consistent enum casing",
    "workspace.styleRuleEnumValueCasingMessage":
      "Enum values mix letter casing: {values}.",
    "workspace.styleRulePropertyTypeTitle": "Typed properties",
    "workspace.styleRulePropertyTypeMessage":
      'Property "{name}" has no type, reference, or composition.',
    "workspace.styleRuleErrorSchemaConsistencyTitle": "Consistent error model",
    "workspace.styleRuleErrorSchemaConsistencyMessage":
      "{status} uses {schema} while most error responses use {dominant}.",
    "workspace.styleRuleServerHttpsTitle": "HTTPS servers",
    "workspace.styleRuleServerHttpsMessage": "Serve {url} over HTTPS.",
    "workspace.styleRuleTagDeclaredTitle": "Declared tags",
    "workspace.styleRuleTagDeclaredMessage":
      'Tag "{tag}" is used but not declared in the top-level tags list.',
    "workspace.styleRuleTagDescriptionTitle": "Tag descriptions",
    "workspace.styleRuleTagDescriptionMessage": 'Describe tag "{tag}".',
    "workspace.styleRuleInfoMetadataTitle": "API metadata",
    "workspace.styleRuleInfoMetadataMessage":
      "Add info.{field} so consumers know what the API does, who owns it, and how it may be used.",
    "workspace.toolNavStyleGuide": "Style guide",
    "workspace.upgradeTitle": "OpenAPI upgrade assistant",
    "workspace.upgradeDescription":
      "Migrate this document to a newer OpenAPI version, review every change, and apply it safely with a checkpoint.",
    "workspace.upgradeSourceSwagger2": "Swagger 2.0",
    "workspace.upgradeSourceOpenApi30": "OpenAPI 3.0",
    "workspace.upgradePath": "{source} → OpenAPI {target}",
    "workspace.upgradeTargetLabel": "Target version",
    "workspace.upgradeFormatLabel": "Output format",
    "workspace.upgradeFormatYaml": "YAML document",
    "workspace.upgradeFormatJson": "JSON document",
    "workspace.upgradePreview": "Preview upgrade",
    "workspace.upgradeHidePreview": "Hide preview",
    "workspace.upgradeStatChanges": "Automatic changes",
    "workspace.upgradeStatWarnings": "Manual review",
    "workspace.upgradeStatEndpoints": "Endpoints preserved",
    "workspace.upgradeStatEndpointsValue": "{upgraded}/{source}",
    "workspace.upgradeStatLines": "Output lines",
    "workspace.upgradeParityOk": "All {count} endpoints are preserved.",
    "workspace.upgradeParityMissing":
      "{count} endpoints would be lost: {endpoints}",
    "workspace.upgradeInvalidOutput":
      "The upgraded document could not be parsed, so it cannot be applied.",
    "workspace.upgradeChangesTitle": "Automatic changes",
    "workspace.upgradeNoChanges": "No structural changes are needed.",
    "workspace.upgradeWarningsTitle": "Review after upgrading",
    "workspace.upgradeNoWarnings": "Nothing needs manual review.",
    "workspace.upgradeChangeVersion": "Declares OpenAPI {target}",
    "workspace.upgradeChangeServers":
      "Builds {count} server URLs from host, basePath, and schemes",
    "workspace.upgradeChangeSchemas":
      "Moves {count} definitions to components/schemas",
    "workspace.upgradeChangeParameters":
      "Converts {count} parameters to schema-based parameters",
    "workspace.upgradeChangeRequestBodies":
      "Creates {count} request bodies from body and form parameters",
    "workspace.upgradeChangeFormData":
      "Turns {count} form fields into request body properties",
    "workspace.upgradeChangeResponses":
      "Wraps {count} response schemas in media type content",
    "workspace.upgradeChangeSecuritySchemes":
      "Converts {count} security definitions to security schemes",
    "workspace.upgradeChangeReferences":
      "Rewrites {count} $ref pointers to components",
    "workspace.upgradeChangeSerializationStyles":
      "Maps {count} collection formats to style and explode",
    "workspace.upgradeChangeFileTypes":
      "Replaces {count} file types with binary strings",
    "workspace.upgradeChangeNullable": "Converts {count} nullable flags",
    "workspace.upgradeChangeBounds":
      "Converts {count} exclusive bounds to numeric keywords",
    "workspace.upgradeChangeSchemaExamples":
      "Turns {count} schema examples into examples arrays",
    "workspace.upgradeChangeWebhooks": "Promotes x-webhooks to webhooks",
    "workspace.upgradeWarningBodyAndFormData":
      "This operation mixes body and formData parameters; the form fields were not converted.",
    "workspace.upgradeWarningExternalReference":
      "External reference {reference} was rewritten, but the referenced file must be upgraded separately.",
    "workspace.upgradeWarningFormDataMediaType":
      "Form fields were declared with {consumes}; a form media type was used instead.",
    "workspace.upgradeWarningMissingResponseDescription":
      "The response had no description, so an empty one was added.",
    "workspace.upgradeWarningNullableComposition":
      "A nullable reference or composition was wrapped in anyOf with null; confirm generated types.",
    "workspace.upgradeWarningOperationSchemes":
      "Operation-level schemes ({schemes}) became operation servers.",
    "workspace.upgradeWarningUnresolvedReference":
      "Reference {reference} could not be resolved and was kept.",
    "workspace.upgradeWarningUnsupportedCollectionFormat":
      'Collection format "{format}" of "{name}" has no OpenAPI 3 equivalent.',
    "workspace.upgradeWarningUnsupportedOauthFlow":
      'OAuth flow "{flow}" is not recognized and needs a flows definition.',
    "workspace.upgradeWarningWebsocketScheme":
      "A server uses the {scheme} scheme; confirm your tooling supports it.",
    "workspace.upgradeOutputLabel": "Upgraded document",
    "workspace.upgradeCopy": "Copy upgraded document",
    "workspace.upgradeDownload": "Download upgraded document",
    "workspace.upgradeCopyNotes": "Copy migration notes",
    "workspace.upgradeSaveCheckpoint":
      "Save the current document as a checkpoint first",
    "workspace.upgradeApply": "Apply to editor",
    "workspace.upgradeCopySuccess": "Upgraded document copied.",
    "workspace.upgradeCopyError": "Could not copy the upgraded document.",
    "workspace.upgradeDownloadSuccess": "Upgraded document download started.",
    "workspace.upgradeDownloadError":
      "Could not download the upgraded document.",
    "workspace.upgradeNotesCopied": "Migration notes copied.",
    "workspace.upgradeNotesError": "Could not copy the migration notes.",
    "workspace.upgradeCheckpointError":
      "Could not save a checkpoint, so the editor was not changed. Remove old checkpoints or apply without one.",
    "workspace.upgradeCheckpointName": "Before upgrade to OpenAPI {version}",
    "workspace.upgradeApplied":
      "Upgraded to OpenAPI {version}. The previous document was saved as a checkpoint.",
    "workspace.upgradeAppliedWithoutCheckpoint":
      "Upgraded to OpenAPI {version}.",
    "workspace.upgradeReveal": "Show in editor",
    "workspace.upgradeRevealAriaLabel":
      "Show upgrade note at {pointer} in the editor",
    "workspace.upgradeRevealError":
      "Could not find this location in the editor. Wait for the schema to finish updating and try again.",
    "workspace.upgradeMarkdownTitle": "OpenAPI upgrade notes: {title}",
    "workspace.toolNavUpgrade": "OpenAPI upgrade",
    "workspace.moreSnippetLanguages": "More languages…",
    "workspace.snippetLanguageAriaLabel":
      "More code languages for {method} {path}",
    "workspace.copySnippet": "Copy code",
    "workspace.snippetCopied": "Code snippet copied.",
    "workspace.codeSamplesTitle": "Code samples",
    "workspace.codeSamplesDescription":
      "Generate ready-to-run requests in 15 languages for guides, READMEs, or Redoc's x-codeSamples, using documented examples.",
    "workspace.codeSamplesLanguagesLabel": "Languages",
    "workspace.codeSamplesSelectAll": "Select all",
    "workspace.codeSamplesSelectNone": "Clear",
    "workspace.codeSamplesScopeLabel": "Endpoints",
    "workspace.codeSamplesScopeAll": "Every endpoint ({count})",
    "workspace.codeSamplesScopeVisible": "Filtered endpoints ({count})",
    "workspace.codeSamplesAuth": "Include authentication placeholders",
    "workspace.codeSamplesAuthHint":
      "Secured endpoints use placeholders such as YOUR_TOKEN; stored credentials are never included.",
    "workspace.codeSamplesSummary":
      "{endpoints} endpoints × {languages} languages = {samples} samples",
    "workspace.codeSamplesNoLanguages":
      "Select at least one language to generate samples.",
    "workspace.codeSamplesNoEndpoints":
      "No endpoints match the current filters.",
    "workspace.codeSamplesPreviewEndpoint": "Preview endpoint",
    "workspace.codeSamplesPreviewLanguages": "Preview language",
    "workspace.codeSamplesPreviewAriaLabel":
      "Code sample preview for {method} {path} in {language}",
    "workspace.codeSamplesCopySample": "Copy sample",
    "workspace.codeSamplesCopyMarkdown": "Copy Markdown guide",
    "workspace.codeSamplesDownloadMarkdown": "Download Markdown guide",
    "workspace.codeSamplesDownloadSpec": "Download spec with x-codeSamples",
    "workspace.codeSamplesSampleCopied": "Sample copied.",
    "workspace.codeSamplesMarkdownCopied": "Markdown guide copied.",
    "workspace.codeSamplesCopyError": "Could not copy to the clipboard.",
    "workspace.codeSamplesMarkdownDownloaded":
      "Markdown guide download started.",
    "workspace.codeSamplesSpecDownloaded":
      "Spec download started with code samples on {count} operations.",
    "workspace.codeSamplesDownloadError": "Could not start the download.",
    "workspace.codeSamplesMarkdownTitle": "{title} code samples",
    "workspace.codeSamplesMarkdownSummary":
      "Version {version} · {count} endpoints · {languages}",
    "workspace.toolNavCodeSamples": "Code samples",
    "workspace.codeSamplesShowOptions": "Choose languages and preview",
    "workspace.codeSamplesHideOptions": "Hide options",
    "workspace.snippetLanguageMenuLabel": "Code languages for {method} {path}",
  },
  ru: {
    ...resilienceTranslations.ru,
    ...streamingTranslations.ru,
    "jwtStudio.title": "Студия JWT и ключей подписи",
    "jwtStudio.description":
      "Декодируйте JWT, проверяйте подписи и политики утверждений, создавайте ключи и тестовые токены и сохраняйте повторяемые проверки полностью в этой вкладке.",
    "jwtStudio.help":
      "Декодирование не проверяет подпись. Проверка использует предоставленные ключи и сохранённую политику; она не предоставляет доступ и не устанавливает доверие к издателю. Работа хранится в памяти вкладки. Ключи из URL заголовков не загружаются; данные не добавляются в авторизацию приложения и историю запросов.",
    "jwtStudio.project": "Проект проверки JWT",
    "jwtStudio.projectName": "Название проекта JWT",
    "jwtStudio.newProject": "Новый проект JWT",
    "jwtStudio.demo": "Загрузить демо проверки JWT",
    "jwtStudio.demoLoaded":
      "Демо RSA загружено: пять проверок и фиксированное время для повторяемых результатов.",
    "jwtStudio.importProject": "Восстановить проект JWT (JSON)",
    "jwtStudio.projectLoaded":
      "Проект JWT восстановлен. Импортированные результаты удалены; повторите проверку с предоставленными ключами и политикой.",
    "jwtStudio.busy":
      "Локальная обработка… завершено проверок: {count}/{total}.",
    "jwtStudio.cancel": "Отменить обработку JWT",
    "jwtStudio.cancelled":
      "Обработка отменена. Уже выполняемая криптографическая операция может завершиться, но её отменённый результат не применяется; пакетные проверки сохраняют завершённые случаи.",
    "jwtStudio.tokenSection": "Просмотр и проверка токена",
    "jwtStudio.token": "Компактный JWT",
    "jwtStudio.verificationKey": "Доверенный ключ проверки",
    "jwtStudio.autoKey": "Подобрать предоставленный ключ по алгоритму и kid",
    "jwtStudio.decode": "Декодировать JWT без проверки",
    "jwtStudio.verify": "Проверить подпись и утверждения JWT",
    "jwtStudio.decoded":
      "Токен декодирован. Декодирование не проверяет подпись.",
    "jwtStudio.decodedOnly":
      "Декодированное содержимое недоверенное; смотрите отдельный результат проверки подписи и политики.",
    "jwtStudio.decodedSizes":
      "Заголовок: {header} байт; утверждения: {claims} байт; подпись: {signature} байт.",
    "jwtStudio.decodedHeader": "Декодированный заголовок JWT",
    "jwtStudio.decodedClaims": "Декодированные утверждения JWT",
    "jwtStudio.dateOutsideRange": "Вне отображаемого диапазона дат UTC",
    "jwtStudio.copyToken": "Копировать компактный JWT",
    "jwtStudio.copyHeader": "Копировать заголовок Authorization",
    "jwtStudio.downloadToken": "Скачать компактный JWT",
    "jwtStudio.copied": "Скопировано в буфер обмена.",
    "jwtStudio.copyFailed": "Не удалось скопировать в буфер обмена.",
    "jwtStudio.verificationResult": "Результат проверки JWT",
    "jwtStudio.verificationSummary":
      "Токен {status}; подпись {signature}; утверждения {claims}.",
    "jwtStudio.checkedAt":
      "Проверка на Unix-секунде {time}; алгоритм {algorithm}.",
    "jwtStudio.outcome.accepted": "принят политикой",
    "jwtStudio.outcome.rejected": "отклонён",
    "jwtStudio.check.valid": "корректна",
    "jwtStudio.check.invalid": "некорректна",
    "jwtStudio.check.not-checked": "не проверялись",
    "jwtStudio.downloadReport": "Скачать отчёт проверки JWT без значений",
    "jwtStudio.policy": "Политика проверки JWT",
    "jwtStudio.policyHelp":
      "Алгоритмы разрешаются явно и привязаны к типам предоставленных ключей. Издатель, аудитория, субъект и тип токена сравниваются точно; пустые значения отключают требования. По умолчанию обязателен срок действия. Пустое время означает текущее; фиксированные Unix-секунды обеспечивают повторяемость. Сохраните политику перед проверкой или экспортом.",
    "jwtStudio.allowedAlgorithms": "Разрешённые алгоритмы JWT",
    "jwtStudio.issuer": "Ожидаемый издатель (iss)",
    "jwtStudio.audience": "Ожидаемая аудитория (aud)",
    "jwtStudio.subject": "Ожидаемый субъект (sub)",
    "jwtStudio.type": "Ожидаемый тип токена (typ)",
    "jwtStudio.tolerance": "Допуск времени (секунды, 0–300)",
    "jwtStudio.maxAge": "Максимальный возраст токена (секунды, 0 отключает)",
    "jwtStudio.now": "Время проверки (Unix-секунды, пусто — сейчас)",
    "jwtStudio.requireExpiration": "Требовать срок действия (exp)",
    "jwtStudio.checkIssuedAt": "Отклонять будущее время выпуска (iat)",
    "jwtStudio.policyDirty":
      "В политике есть несохранённые правки. Сохраните или отмените их перед переходом, проверкой или экспортом.",
    "jwtStudio.savePolicy": "Сохранить политику проверки JWT",
    "jwtStudio.discardPolicy": "Отменить правки политики",
    "jwtStudio.policySaved":
      "Политика проверки сохранена; прежние результаты очищены.",
    "jwtStudio.keys": "Локальные ключи подписи и проверки",
    "jwtStudio.keysHelp":
      "Создавайте ключи HS256, RS256, PS256 и ES256 либо импортируйте JWK/JWKS, SPKI/PKCS8 PEM или секрет HS256 длиной 32–128 байт. Импорт закрытого асимметричного ключа добавляет открытый ключ проверки. Открытые ключи не подписывают; HMAC-секреты подписывают и проверяют. Импорт сохраняется кнопкой добавления. Материал подписи скрыт до явного раскрытия.",
    "jwtStudio.keyName": "Метка ключа",
    "jwtStudio.keyKid": "Идентификатор ключа (kid)",
    "jwtStudio.keyAlgorithm": "Алгоритм генерации / JWK без alg",
    "jwtStudio.keyFormat": "Формат импорта ключа",
    "jwtStudio.keySource": "Материал импортируемого ключа",
    "jwtStudio.addKeys": "Добавить импортированные ключи JWT",
    "jwtStudio.discardKey": "Удалить материал импорта ключа",
    "jwtStudio.generate": "Создать ключи подписи JWT",
    "jwtStudio.importKeyFile": "Прочитать файл ключа (JWK/JWKS/PEM/текст)",
    "jwtStudio.keyFileLoaded":
      "Файл ключа загружен в форму. Выберите формат и добавьте ключи для проверки.",
    "jwtStudio.keysAdded":
      "Ключи проверены и добавлены локально. Проверка токена использует сохранённую политику алгоритмов.",
    "jwtStudio.selectedKey": "Выбранный ключ JWT",
    "jwtStudio.noKeys": "Ключ не выбран",
    "jwtStudio.keyKind.secret": "общий секрет",
    "jwtStudio.keyKind.private": "закрытый ключ подписи",
    "jwtStudio.keyKind.public": "открытый ключ проверки",
    "jwtStudio.reveal": "Показать выбранный материал подписи",
    "jwtStudio.keyPreview": "Материал выбранного JWK",
    "jwtStudio.keyHidden":
      "Материал подписи скрыт. Обычный экспорт проекта не включает его.",
    "jwtStudio.thumbprint": "Вычислить отпечаток открытого JWK",
    "jwtStudio.thumbprintValue": "Отпечаток SHA-256 JWK: {value}",
    "jwtStudio.removeKey": "Удалить выбранный ключ JWT",
    "jwtStudio.downloadKey": "Скачать выбранный JWK",
    "jwtStudio.publicPem": "Скачать открытый PEM",
    "jwtStudio.privatePem": "Скачать закрытый PEM",
    "jwtStudio.forgetSigning": "Удалить ключи подписи и материал импорта",
    "jwtStudio.signing": "Создание подписанного тестового JWT",
    "jwtStudio.signingHelp":
      "alg заголовка должен соответствовать ключу; отсутствующий kid заполняется автоматически, а заданные значения должны совпадать. Кнопки создания явно заменяют JSON-черновики. Подпись не проверяет политику утверждений, позволяя создавать просроченные и негативные примеры. Черновики хранятся в памяти вкладки; проект сохраняет текущий токен и проверки.",
    "jwtStudio.signingKey": "Ключ подписи JWT",
    "jwtStudio.noSigningKey": "Ключ подписи недоступен",
    "jwtStudio.buildHeader": "Создать заголовок для ключа подписи",
    "jwtStudio.buildClaims": "Создать утверждения на час по политике",
    "jwtStudio.signHeader": "JSON заголовка JOSE для подписи",
    "jwtStudio.signClaims": "JSON утверждений JWT для подписи",
    "jwtStudio.sign": "Подписать JWT локально",
    "jwtStudio.useDecoded":
      "Скопировать декодированный токен в черновики подписи",
    "jwtStudio.signed":
      "JWT подписан локально и помещён в поле токена; отдельно проверьте сохранённую политику.",
    "jwtStudio.cases": "Регрессионные проверки JWT",
    "jwtStudio.casesHelp":
      "Сохраняйте токены с ожидаемым принятием/отклонением и необязательным ключом проверки. Запуск использует сохранённую политику и общий снимок времени. Ожидаемое отклонение означает успешный тест; проверьте причину в результатах. Неполный или отменённый отчёт показывает число завершённых случаев.",
    "jwtStudio.selectedCase": "Выбранная проверка JWT",
    "jwtStudio.newCase": "Новая проверка",
    "jwtStudio.caseName": "Название проверочного случая",
    "jwtStudio.caseToken": "Токен проверочного случая",
    "jwtStudio.caseExpected": "Ожидаемый результат проверки",
    "jwtStudio.caseKey": "Ключ проверочного случая",
    "jwtStudio.missingCaseKey":
      "Сохранённый ключ недоступен; импортируйте его или выберите другой",
    "jwtStudio.caseDirty":
      "В случае есть несохранённые правки. Сохраните или отмените их перед переходом, проверкой или экспортом.",
    "jwtStudio.currentToCase": "Использовать текущий токен в случае",
    "jwtStudio.saveCase": "Сохранить проверку JWT",
    "jwtStudio.discardCase": "Отменить правки проверочного случая",
    "jwtStudio.removeCase": "Удалить проверку JWT",
    "jwtStudio.loadCase": "Загрузить токен случая для просмотра",
    "jwtStudio.caseSaved": "Проверочный случай сохранён.",
    "jwtStudio.runCases": "Запустить проверки JWT",
    "jwtStudio.downloadCases": "Скачать отчёт проверок JWT без значений",
    "jwtStudio.casesSummary":
      "Завершено {completed}/{total} случаев: успешно {passed}, ошибок {failed}.",
    "jwtStudio.caseSearch": "Поиск проверок JWT",
    "jwtStudio.caseStatus.passed": "проверка пройдена",
    "jwtStudio.caseStatus.failed": "ошибка проверки",
    "jwtStudio.exports": "Переносимые проекты JWT и экспорт ключей",
    "jwtStudio.exportHelp":
      "Проекты содержат токены, политику, ключи и проверки. Обычный экспорт сохраняет только открытые ключи проверки. Для включения закрытых/HMAC-ключей или закрытого PEM явно разрешите экспорт ключей подписи. Выбранный JWK по умолчанию экспортируется как открытый. Отчёты не содержат токенов, значений утверждений, политики и материала ключей. Хранилище браузера не используется.",
    "jwtStudio.includeSigning":
      "Включить закрытые ключи и общие секреты подписи в экспорт",
    "jwtStudio.omittedKeys":
      "В обычный экспорт проекта не включены ключи подписи/секреты: {count}.",
    "jwtStudio.downloadProject": "Скачать проект проверки JWT",
    "jwtStudio.downloadJwks": "Скачать открытые ключи проверки JWKS",
    "jwtStudio.downloaded": "Загрузка началась.",
    "jwtStudio.downloadFailed": "Загрузка заблокирована. Повторите попытку.",
    "jwtStudio.error.format":
      "Укажите компактный JWT из трёх частей через точки без внешних пробелов; зашифрованные и вложенные формы не поддерживаются.",
    "jwtStudio.error.encoding":
      "Используйте канонический base64url без заполнения и корректный UTF-8 для JSON токена.",
    "jwtStudio.error.json":
      "Используйте ограниченные JSON-объекты с конечными числами и безопасными целыми для заголовка и утверждений.",
    "jwtStudio.error.limit":
      "Превышен лимит JWT, ключа, случая, проекта или обработки.",
    "jwtStudio.error.algorithm":
      "Используйте разрешённый поддерживаемый алгоритм, соответствующий ключу подписи и заголовку токена.",
    "jwtStudio.error.key":
      "Укажите корректный совместимый JWK/JWKS или незашифрованный ключ SPKI/PKCS8; RSA требует 2048–4096 бит, EC — P-256, HS256 — 32–128 байт секрета.",
    "jwtStudio.error.key-usage":
      "Тип или объявленное назначение ключа не поддерживает эту операцию.",
    "jwtStudio.error.missing-key":
      "Нет предоставленного ключа проверки, соответствующего алгоритму и выбору ключа.",
    "jwtStudio.error.ambiguous-key":
      "Подходят несколько ключей проверки. Явно выберите доверенный ключ.",
    "jwtStudio.error.header":
      "Заголовок токена содержит некорректные поля или неподдерживаемые критические расширения/неупакованные данные.",
    "jwtStudio.error.crypto":
      "Web Crypto недоступен или операция не выполнена. Используйте поддерживаемый защищённый контекст браузера.",
    "jwtStudio.error.policy":
      "Укажите корректную политику с поддерживаемыми алгоритмами, ограниченным допуском/возрастом и конечным временем проверки.",
    "jwtStudio.error.project":
      "Используйте корректный проект RSSwag JWT с уникальными идентификаторами ключей/случаев. Прежняя работа сохранена.",
    "jwtStudio.error.case":
      "Укажите корректный случай с названием, токеном и ожидаемым принятием/отклонением.",
    "jwtStudio.finding.format":
      "Неподдерживаемый или некорректный компактный JWT.",
    "jwtStudio.finding.encoding": "Некорректная кодировка base64url или UTF-8.",
    "jwtStudio.finding.json": "Некорректный JSON заголовка или утверждений.",
    "jwtStudio.finding.limit": "Превышен лимит обработки токена/ключа.",
    "jwtStudio.finding.algorithm":
      "Алгоритм не поддерживается или не разрешён политикой.",
    "jwtStudio.finding.key": "Ключ проверки некорректен или несовместим.",
    "jwtStudio.finding.key-usage": "Назначение ключа не разрешает проверку.",
    "jwtStudio.finding.missing-key":
      "Нет подходящего предоставленного ключа проверки.",
    "jwtStudio.finding.ambiguous-key":
      "Подходят несколько ключей; выберите один явно.",
    "jwtStudio.finding.header":
      "Некорректное или неподдерживаемое расширение защищённого заголовка.",
    "jwtStudio.finding.crypto": "Криптографическая проверка не завершена.",
    "jwtStudio.finding.policy": "Некорректная политика проверки.",
    "jwtStudio.finding.project": "Некорректные данные проекта.",
    "jwtStudio.finding.case": "Некорректные данные случая.",
    "jwtStudio.finding.signature": "Проверка подписи не пройдена.",
    "jwtStudio.finding.claim-type":
      "Зарегистрированное утверждение имеет неверный JSON-тип.",
    "jwtStudio.finding.expired": "Срок действия токена истёк.",
    "jwtStudio.finding.not-active": "Токен ещё не активен.",
    "jwtStudio.finding.issued-future": "Токен выпущен в будущем.",
    "jwtStudio.finding.expiration-required": "Политика требует срок действия.",
    "jwtStudio.finding.issued-at-required":
      "Ограничение возраста требует время выпуска.",
    "jwtStudio.finding.too-old":
      "Превышен максимально допустимый возраст токена.",
    "jwtStudio.finding.issuer": "Издатель не соответствует политике.",
    "jwtStudio.finding.audience": "Аудитория не соответствует политике.",
    "jwtStudio.finding.subject": "Субъект не соответствует политике.",
    "jwtStudio.finding.type": "Тип токена не соответствует политике.",
    "wsStudio.title": "Студия сессий WebSocket",
    "wsStudio.description":
      "Исследуйте двунаправленные API: текстовые, JSON и бинарные сообщения, переиспользуемые диалоги, локальное воспроизведение, захват переменных и поиск по журналу.",
    "wsStudio.help":
      "Подключение начинается только кнопками подключения или запуска живого диалога. Работа хранится в этой вкладке и продолжается при закрытой панели; отключитесь для завершения интерактивной сессии. Скачайте проект перед уходом. Студия независима от редактора OpenAPI.",
    "wsStudio.loading": "Чтение файла WebSocket…",
    "wsStudio.project": "Проект WebSocket",
    "wsStudio.projectName": "Название проекта WebSocket",
    "wsStudio.newProject": "Новый проект WebSocket",
    "wsStudio.demo": "Загрузить демо диалога реального времени",
    "wsStudio.demoLoaded":
      "Демо загружено. Воспроизведите его локально или укажите собственный совместимый адрес WebSocket.",
    "wsStudio.importProject": "Восстановить проект WebSocket (JSON)",
    "wsStudio.importTranscript": "Импорт журнала WebSocket (JSON)",
    "wsStudio.projectLoaded":
      "Проект WebSocket восстановлен без подключений и импортированных результатов запуска.",
    "wsStudio.transcriptLoaded":
      "Журнал загружен без отправки сообщений и подключения.",
    "wsStudio.exportProject": "Скачать проект WebSocket",
    "wsStudio.connection": "Живое подключение WebSocket",
    "wsStudio.connectionHelp":
      "Укажите полный ws:// или wss:// URL и необязательные подпротоколы через запятую. Cookie и разрешениями управляет браузер; произвольные HTTP-заголовки и управление Ping/Pong недоступны. HTTPS-страницам обычно нужен wss://. Автоматических переподключений и повторных отправок нет.",
    "wsStudio.url": "URL WebSocket",
    "wsStudio.protocols": "Подпротоколы WebSocket (через запятую)",
    "wsStudio.connectTimeout": "Таймаут подключения (мс)",
    "wsStudio.connectionStatus":
      "Подключение: {status}; согласованный протокол: {protocol}",
    "wsStudio.state.closed": "закрыто",
    "wsStudio.state.connecting": "подключение",
    "wsStudio.state.open": "открыто",
    "wsStudio.state.closing": "закрывается",
    "wsStudio.cleanClose": "корректное закрытие",
    "wsStudio.uncleanClose": "некорректное закрытие",
    "wsStudio.connect": "Подключить WebSocket",
    "wsStudio.disconnect": "Отключить WebSocket",
    "wsStudio.composerFormat": "Формат исходящего сообщения",
    "wsStudio.composer": "Исходящее сообщение WebSocket",
    "wsStudio.send": "Отправить сообщение WebSocket",
    "wsStudio.sent":
      "Сообщение поставлено в очередь отправки. Это не подтверждает обработку сервером.",
    "wsStudio.format.json": "JSON",
    "wsStudio.format.text": "Текст",
    "wsStudio.format.binary": "Бинарное (base64)",
    "wsStudio.format.any": "Любой формат",
    "wsStudio.conversations": "Переиспользуемые диалоги WebSocket",
    "wsStudio.conversationHelp":
      "Упорядочьте шаги отправки, ожидания и паузы. Проверки JSON Pointer используют существующие операторы утверждений; захваченные значения становятся переменными следующих шагов. Полные JSON-подстановки вроде {{taskId}} сохраняют тип значения. Текстовые подстановки принимают скалярные значения. Сохраните или отмените правки перед переходом или запуском.",
    "wsStudio.selectedConversation": "Выбранный диалог WebSocket",
    "wsStudio.conversationName": "Название диалога",
    "wsStudio.addConversation": "Добавить диалог",
    "wsStudio.duplicateConversation": "Дублировать диалог",
    "wsStudio.removeConversation": "Удалить диалог",
    "wsStudio.selectedStep": "Выбранный шаг диалога",
    "wsStudio.newStep": "Новый шаг диалога",
    "wsStudio.type.send": "Отправка",
    "wsStudio.type.expect": "Ожидание",
    "wsStudio.type.pause": "Пауза",
    "wsStudio.add.send": "Добавить шаг отправки",
    "wsStudio.add.expect": "Добавить шаг ожидания",
    "wsStudio.add.pause": "Добавить паузу",
    "wsStudio.move.up": "Переместить шаг вверх",
    "wsStudio.move.down": "Переместить шаг вниз",
    "wsStudio.removeStep": "Удалить шаг диалога",
    "wsStudio.stepName": "Название шага диалога",
    "wsStudio.stepFormat": "Формат сообщения шага",
    "wsStudio.stepPayload": "Данные сообщения шага",
    "wsStudio.template": "Подставлять переменные диалога в этом шаге",
    "wsStudio.pauseMs": "Длительность паузы (мс)",
    "wsStudio.receiveTimeout": "Срок ожидания сообщения (мс)",
    "wsStudio.matchMode": "Политика сопоставления сообщений",
    "wsStudio.match.next": "Проверить следующее сообщение",
    "wsStudio.match.matching": "Пропускать посторонние сообщения до совпадения",
    "wsStudio.textMode": "Сравнение текста / base64",
    "wsStudio.text.any": "Без сравнения текста",
    "wsStudio.text.equals": "Равно",
    "wsStudio.text.contains": "Содержит",
    "wsStudio.expectedText": "Ожидаемый текст / base64",
    "wsStudio.checks": "Проверки JSON Pointer сообщения (JSON-массив)",
    "wsStudio.checksHelp":
      'Пример: [{"name":"Тип события","target":"body","path":"/type","operator":"equals","expected":"\\\"task\\\""}]. Операторы: exists, absent, equals (JSON), contains, type, length, gte, lte. Пустой указатель проверяет всё JSON-сообщение; заменяйте / на ~1 и ~ на ~0.',
    "wsStudio.captures": "Захватываемые переменные (JSON-массив)",
    "wsStudio.capturesHelp":
      'Пример: [{"name":"taskId","pointer":"/task/id"}]. Захват требует JSON-сообщения и существующего собственного поля. Имена содержат буквы, цифры и подчёркивания и не начинаются с цифры. Последующий захват может заменить прежнюю переменную.',
    "wsStudio.dirtyStep":
      "В шаге есть несохранённые правки. Сохраните или отмените их перед переходом, импортом, экспортом проекта или запуском.",
    "wsStudio.saveStep": "Сохранить шаг диалога",
    "wsStudio.discardStep": "Отменить правки шага",
    "wsStudio.stepSaved": "Шаг диалога сохранён.",
    "wsStudio.discarded": "Правки шага отменены.",
    "wsStudio.replaySettings": "Переменные и локальное воспроизведение",
    "wsStudio.variables": "Начальные переменные диалога (JSON-объект)",
    "wsStudio.fixtures": "Входящие сообщения воспроизведения (JSON-массив)",
    "wsStudio.fixturesHelp":
      'Сообщения задаются как {"format":"json","data":"..."}, текст или канонический бинарный base64. Воспроизведение читает их по порядку и локально записывает исходящие сообщения. Паузы изменяют время без ожидания. Это не симуляция сервера и не доказательство его поведения или задержек.',
    "wsStudio.dirtySettings":
      "В переменных или сообщениях есть несохранённые правки. Сохраните или отмените их перед редактированием шагов, переходом, экспортом проекта или запуском.",
    "wsStudio.saveSettings": "Сохранить настройки воспроизведения",
    "wsStudio.discardSettings": "Отменить правки настроек воспроизведения",
    "wsStudio.settingsSaved":
      "Переменные и сообщения воспроизведения сохранены.",
    "wsStudio.execution": "Запуск диалога WebSocket",
    "wsStudio.executionHelp":
      "Локальное воспроизведение использует сохранённые сообщения. Живой запуск открывает новое подключение, выполняет выбранный диалог и закрывает соединение. Сначала отключите интерактивную сессию. После первой ошибки оставшиеся шаги пропускаются. Все пропускаемые сообщения используют единый срок ожидания.",
    "wsStudio.replay": "Воспроизвести диалог локально",
    "wsStudio.runLive": "Запустить живой диалог WebSocket",
    "wsStudio.cancel": "Отменить диалог WebSocket",
    "wsStudio.running": "Диалог выполняется…",
    "wsStudio.exportReport": "Скачать отчёт диалога без значений",
    "wsStudio.runSummary": "{mode}: {status} · {duration} мс",
    "wsStudio.receivedCount": "получено {received}, пропущено {skipped}",
    "wsStudio.mode.live": "Живой диалог",
    "wsStudio.mode.replay": "Локальное воспроизведение",
    "wsStudio.result.passed": "пройдено",
    "wsStudio.result.failed": "ошибка",
    "wsStudio.result.cancelled": "отменено",
    "wsStudio.result.skipped": "пропущено",
    "wsStudio.transcript": "Журнал сообщений WebSocket",
    "wsStudio.transcriptHelp":
      "Новая сессия или воспроизведение заменяет прежний журнал. Сохраняются до 200 сообщений и 256 КиБ текста данных; список показывает последние 50 совпадений. Файлы проекта и журнала содержат настроенный URL, переменные или значения сообщений. Отчёты содержат результаты шагов и счётчики без URL, данных сообщений и захваченных значений.",
    "wsStudio.search": "Поиск сообщений WebSocket",
    "wsStudio.direction": "Фильтр направления сообщений",
    "wsStudio.direction.all": "Оба направления",
    "wsStudio.direction.send": "Отправлено",
    "wsStudio.direction.receive": "Получено",
    "wsStudio.formatFilter": "Фильтр формата сообщений",
    "wsStudio.messageCount":
      "Совпадений среди сохранённых сообщений: {count}; удалено прежних сообщений: {dropped}.",
    "wsStudio.selectMessage": "Выбрать сообщение WebSocket {sequence}",
    "wsStudio.messagePreview": "Просмотр сообщения (первые 16 000 символов)",
    "wsStudio.composeSelected": "Скопировать выбранное сообщение для отправки",
    "wsStudio.recordConversation": "Создать диалог из журнала",
    "wsStudio.recorded":
      "Журнал сохранён как редактируемый диалог с точными проверками сообщений и входящими данными воспроизведения. Проверьте динамические поля перед живым запуском.",
    "wsStudio.useFixtures":
      "Использовать полученные сообщения для воспроизведения",
    "wsStudio.fixturesSaved":
      "Полученные сообщения сохранены для воспроизведения.",
    "wsStudio.exportTranscript": "Скачать журнал WebSocket",
    "wsStudio.exportNdjson": "Скачать сообщения WebSocket (NDJSON)",
    "wsStudio.clearTranscript": "Очистить журнал WebSocket",
    "wsStudio.downloaded": "Загрузка началась.",
    "wsStudio.downloadFailed": "Загрузка заблокирована. Повторите попытку.",
    "wsStudio.error.project":
      "Используйте корректный проект RSSwag WebSocket хотя бы с одним диалогом; прежняя работа сохранена.",
    "wsStudio.error.connection":
      "Не удалось использовать подключение WebSocket. Проверьте URL, сервер, разрешения origin, подпротоколы и ограничения браузера.",
    "wsStudio.error.url":
      "Укажите полный ws:// или wss:// URL без встроенных учётных данных, пробелов и фрагмента.",
    "wsStudio.error.protocol":
      "Укажите до 10 различных корректных токенов подпротоколов WebSocket.",
    "wsStudio.error.message":
      "Используйте поддерживаемое текстовое, JSON или бинарное сообщение/журнал.",
    "wsStudio.error.json":
      "Используйте ограниченный JSON с конечными числами и безопасными целыми; проверки и захват требуют JSON-сообщения.",
    "wsStudio.error.binary":
      "Используйте канонический base64 с заполнением для бинарных сообщений.",
    "wsStudio.error.limit":
      "Превышен лимит сообщения, проекта, журнала, диалога или обработки WebSocket.",
    "wsStudio.error.step":
      "Сохраните корректный шаг диалога и добавьте хотя бы один шаг перед запуском.",
    "wsStudio.error.check":
      "Используйте корректные проверки body JSON Pointer с поддерживаемыми операторами и ожидаемыми значениями.",
    "wsStudio.error.variable":
      "Используйте объявленные или захваченные переменные с корректными именами; объекты и массивы доступны только для полных JSON-подстановок.",
    "wsStudio.error.pointer":
      "Используйте корректный JSON Pointer к существующему собственному полю; унаследованные поля недоступны.",
    "wsStudio.error.closed": "Подключение WebSocket закрыто.",
    "wsStudio.error.timeout": "Истёк срок подключения или ожидания сообщения.",
    "wsStudio.error.buffer":
      "Буфер отправки WebSocket или очередь входящих сообщений диалога заполнены.",
    "wsStudio.error.cancelled": "Операция WebSocket отменена.",
    "wsStudio.error.exhausted":
      "Для этого шага ожидания больше нет входящих сообщений воспроизведения.",
    "wsStudio.error.mismatch":
      "Следующее сообщение не соответствует формату или проверкам шага.",
    "designer.title": "Студия проектирования API",
    "designer.description":
      "Создавайте и редактируйте REST-контракты через формы операций, параметров, данных, моделей и авторизации; сохраняйте обратимый черновик и проверяйте изменения перед обновлением редактора.",
    "designer.help":
      "Работайте с независимым черновиком OpenAPI 3.0–3.2. Получение исходного текста, импорт и сохранение форм не меняют основной редактор. Сохраните или отмените изменения формы перед переходом или экспортом; скачайте проект перед уходом со страницы.",
    "designer.loading": "Чтение файла проекта API…",
    "designer.imports": "Импорт исходного контракта",
    "designer.importContract": "Импорт OpenAPI для проектирования (JSON/YAML)",
    "designer.importProject": "Восстановить проект API (JSON)",
    "designer.new": "Начать новый черновик OpenAPI 3.1",
    "designer.created": "Новый черновик API создан.",
    "designer.demo": "Загрузить демо API задач",
    "designer.demoLoaded": "Проект API задач загружен.",
    "designer.capture": "Получить контракт из редактора",
    "designer.source": "Исходный OpenAPI для загрузки в студию",
    "designer.load": "Загрузить OpenAPI в студию",
    "designer.loaded": "Контракт OpenAPI загружен в черновик.",
    "designer.restored":
      "Проект API восстановлен. Подготовьте новый просмотр перед применением к редактору.",
    "designer.discardSource": "Отменить изменения исходного текста",
    "designer.sourceDirty":
      "В исходном тексте есть непроверенные изменения. Загрузите его или отмените изменения для продолжения проектирования и экспорта.",
    "designer.projectName": "Название проекта API",
    "designer.summary":
      "OpenAPI {version}: редактируемых операций: {operations}, моделей: {models}.",
    "designer.undo": "Отменить изменение черновика",
    "designer.redo": "Повторить изменение черновика",
    "designer.undone": "Изменение черновика отменено.",
    "designer.redone": "Изменение черновика повторено.",
    "designer.context": "Выбор контекста проектирования",
    "designer.operationSearch": "Поиск операций в студии",
    "designer.operation": "Выбранная операция",
    "designer.model": "Выбранная переиспользуемая модель",
    "designer.newOperation": "Новая операция",
    "designer.newModel": "Новая модель",
    "designer.editor": "Форма проектирования",
    "designer.editor.info": "Информация об API",
    "designer.editor.server": "Добавить сервер",
    "designer.editor.operation": "Метаданные операции",
    "designer.editor.parameter": "Параметры операции",
    "designer.editor.payload": "Данные запроса / ответа",
    "designer.editor.model": "Схема переиспользуемой модели",
    "designer.editor.property": "Свойства модели",
    "designer.editor.security": "Авторизация операции",
    "designer.apiTitle": "Название API",
    "designer.apiVersion": "Версия API",
    "designer.apiDescription": "Описание API",
    "designer.serverUrl": "URL нового сервера",
    "designer.serverDescription": "Описание нового сервера",
    "designer.serverHelp":
      "Добавьте конкретный HTTP(S) или относительный URL сервера. Порядок, значения по умолчанию, переменные и метаданные существующих серверов сохраняются; шаблонные серверы редактируются в текстовом редакторе.",
    "designer.path": "Путь операции",
    "designer.method": "Метод операции",
    "designer.operationSummary": "Краткое описание операции",
    "designer.operationId": "Идентификатор операции",
    "designer.tags": "Теги операции (через запятую)",
    "designer.operationDescription": "Описание операции",
    "designer.deprecated": "Операция устарела",
    "designer.operationHelp":
      "Пути, методы и заданные идентификаторы существующих операций фиксированы. Новые операции получают ответ 200 и недостающие обязательные строковые параметры пути. Изменение метаданных сохраняет схемы, примеры, авторизацию, ссылки, обратные вызовы, расширения и соседние методы.",
    "designer.selectOperation": "Сначала выберите или создайте операцию.",
    "designer.parameter": "Выбранный параметр операции",
    "designer.newParameter": "Новый параметр",
    "designer.inherited":
      "Параметров уровня пути, сохраняемых без изменений: {count}.",
    "designer.referenceHelp":
      "Объекты по ссылкам и параметры с content сохраняются. Форма свойств требует встроенную объектную модель. Другие определения редактируются через полный JSON схемы или существующие инструменты.",
    "designer.parameterName": "Название параметра",
    "designer.parameterLocation": "Расположение параметра",
    "designer.parameterDescription": "Описание параметра",
    "designer.required": "Обязательное",
    "designer.parameterSchema": "JSON-схема параметра",
    "designer.payloadKind": "Направление данных",
    "designer.request": "Тело запроса",
    "designer.response": "Тело ответа",
    "designer.responseStatus": "Статус ответа / default",
    "designer.mediaType": "Тип содержимого",
    "designer.payloadDescription": "Описание данных",
    "designer.payloadSchema": "JSON-схема данных",
    "designer.modelName": "Название переиспользуемой модели",
    "designer.modelSchema": "JSON-схема модели",
    "designer.modelHelp":
      "Сохраните новый компонент или явно замените JSON-схему модели. Для изменения отдельного свойства используйте форму свойств, сохраняющую остальные свойства и метаданные.",
    "designer.selectModel":
      "Сначала выберите или создайте переиспользуемую модель.",
    "designer.property": "Выбранное свойство модели",
    "designer.newProperty": "Новое свойство",
    "designer.propertyName": "Название свойства",
    "designer.propertySchema": "JSON-схема свойства",
    "designer.templateType": "Тип шаблона схемы",
    "designer.templateModel": "Модель ссылки / элемента массива",
    "designer.noModel": "Без модели (элементы массива — строки)",
    "designer.templateEnum":
      "Перечисление шаблона (JSON-массив, необязательно)",
    "designer.templateFormat": "Формат шаблона (необязательно)",
    "designer.nullable": "Разрешить null",
    "designer.buildSchema": "Создать черновик схемы",
    "designer.schemaHelp":
      "Создание шаблона явно заменяет текст схемы. Проверьте JSON перед сохранением. Здесь можно задавать сложные ограничения, композиции, вложенные модели и ссылки; студия не выполняет полную сертификацию JSON Schema.",
    "designer.type.string": "Строка",
    "designer.type.integer": "Целое",
    "designer.type.number": "Число",
    "designer.type.boolean": "Логическое",
    "designer.type.object": "Объект",
    "designer.type.array": "Массив",
    "designer.type.reference": "Ссылка на модель",
    "designer.securityHelp":
      "Авторизация изменяется явно и отдельно от метаданных операции. Выберите наследование, публичный доступ или JSON-требования с объявленными схемами. Сложные существующие требования доступны в JSON-форме.",
    "designer.securityMode": "Политика авторизации операции",
    "designer.security.inherit": "Наследовать авторизацию API",
    "designer.security.public": "Публичная (пустые требования)",
    "designer.security.custom": "Требования в JSON",
    "designer.securityJson": "JSON-требования авторизации",
    "designer.securitySchemes": "Объявленные схемы авторизации",
    "designer.formDirty":
      "В форме есть несохранённые изменения. Сохраните их в черновик или отмените перед переходом, экспортом или подготовкой обновления редактора.",
    "designer.saveForm": "Сохранить форму в черновик",
    "designer.saved": "Форма сохранена в черновик.",
    "designer.discardForm": "Отменить изменения формы",
    "designer.discarded": "Изменения формы отменены.",
    "designer.publish": "Проверка и использование проекта API",
    "designer.publishHelp":
      "Скачивание и обновление редактора используют только сохранённые изменения черновика. Подготовьте новый просмотр, проверьте изменённые пути и счётчики ссылок, затем примените. Применение и отмена останавливаются, если редактор изменился после просмотра или обновления. Проверка ссылок и разбор рекомендательные, а не полная сертификация OpenAPI.",
    "designer.exportFormat": "Формат результата проекта API",
    "designer.downloadContract": "Скачать спроектированный OpenAPI",
    "designer.downloadProject": "Скачать проект API",
    "designer.prepare": "Подготовить просмотр обновления редактора",
    "designer.prepared":
      "Просмотр обновления подготовлен. Проверьте его перед применением.",
    "designer.apply": "Применить проект API к редактору",
    "designer.applied": "Проект API применён к редактору.",
    "designer.undoEditor": "Отменить обновление редактора",
    "designer.editorUndone": "Предыдущий текст редактора восстановлен.",
    "designer.reviewSummary":
      "Изменений в списке: {changes}; операций: {operations}, моделей: {models}, неразрешённых ссылок: {broken}, внешних: {external}.",
    "designer.replaceInvalid":
      "Текущий текст редактора некорректен; применение проверенного черновика заменит его.",
    "designer.change.added": "Добавлено",
    "designer.change.removed": "Удалено",
    "designer.change.changed": "Изменено",
    "designer.truncated": "Список изменений ограничен 200 записями.",
    "designer.preview": "Просмотр проекта API (первые 16 000 символов)",
    "designer.downloadReview": "Скачать отчёт проекта API без значений",
    "designer.downloaded": "Скачивание начато.",
    "designer.downloadFailed": "Скачивание заблокировано. Попробуйте снова.",
    "designer.error.source":
      "Используйте корректный локальный контракт OpenAPI, непустое название/версию API или конкретный HTTP(S)/относительный URL сервера.",
    "designer.error.version":
      "Студия поддерживает OpenAPI 3.0–3.2. Для Swagger 2 используйте существующий инструмент обновления.",
    "designer.error.limit":
      "Превышен лимит файла проекта, схемы, истории или обработки.",
    "designer.error.operation":
      "Выберите существующую операцию или корректную новую HTTP-операцию; существующие пути, методы и заданные идентификаторы фиксированы.",
    "designer.error.exists":
      "Такая операция, идентификатор, модель, свойство, параметр или сервер уже существует.",
    "designer.error.path":
      "Используйте корректный /путь с именами параметров и без эквивалентного существующего шаблона маршрута.",
    "designer.error.schema":
      "Используйте корректный JSON-объект схемы; логические схемы требуют OpenAPI 3.1 или новее.",
    "designer.error.model":
      "Выберите корректную модель/свойство; не изменяйте модель-ссылку или необъектную модель через форму свойств.",
    "designer.error.parameter":
      "Используйте корректный параметр. Параметры пути должны соответствовать пути операции.",
    "designer.error.payload":
      "Используйте корректный тип содержимого и статус/описание ответа.",
    "designer.error.reference":
      "Объект по ссылке или с content сохраняется. Редактируйте его определение в существующих инструментах.",
    "designer.error.security":
      "Используйте JSON-объекты требований с объявленными схемами и массивами строковых областей доступа.",
    "designer.error.project": "Некорректный проект API или его название.",
    "designer.error.stale":
      "Редактор или проект изменился. Подготовьте новый просмотр; отмена работает только при совпадении редактора с последним применённым результатом.",
    "designer.error.file": "Не удалось прочитать файл проекта.",
    "mappingStudio.direction.request": "запрос",
    "mappingStudio.direction.response": "ответ",
    "mappingStudio.root": "(корень)",
    "mappingStudio.patternHelp":
      "Проверка шаблонов контракта поддерживает консервативное подмножество выражений с привязкой к началу и концу. Сложные или неподдерживаемые шаблоны пропускаются с частичным результатом и сохраняются в снимке OpenAPI.",
    "mappingStudio.title": "Студия преобразования данных",
    "mappingStudio.description":
      "Создавайте адаптеры JSON между API, изучайте каждый этап, проверяйте данные по контрактам OpenAPI и экспортируйте автономный преобразователь.",
    "mappingStudio.help":
      "Правила, примеры и снимки OpenAPI остаются в панели до скачивания. Преобразование работает локально, не изменяет редактор и не отправляет запросы.",
    "mappingStudio.loading": "Чтение файла преобразования…",
    "mappingStudio.name": "Название набора правил",
    "mappingStudio.demo": "Загрузить демо преобразования клиентов",
    "mappingStudio.demoLoaded":
      "Адаптер клиентов, два этапа и тестовый пример загружены.",
    "mappingStudio.import.project": "Восстановить проект преобразования (JSON)",
    "mappingStudio.import.recipe": "Импорт набора правил (JSON)",
    "mappingStudio.import.input": "Импорт входных данных (JSON)",
    "mappingStudio.import.contract": "Импорт снимка OpenAPI",
    "mappingStudio.imported.project":
      "Проект восстановлен; запустите преобразование для новых результатов.",
    "mappingStudio.imported.recipe":
      "Правила импортированы; текущие примеры и контракт сохранены.",
    "mappingStudio.imported.input": "Входные данные импортированы.",
    "mappingStudio.imported.contract": "Снимок OpenAPI импортирован.",
    "mappingStudio.export.recipe": "Скачать набор правил",
    "mappingStudio.export.project": "Скачать проект преобразования",
    "mappingStudio.export.module": "Скачать JavaScript-преобразователь",
    "mappingStudio.export.output": "Скачать выбранный результат",
    "mappingStudio.export.report": "Скачать отчёт преобразования без значений",
    "mappingStudio.export.cases": "Скачать отчёт тестов без значений",
    "mappingStudio.downloaded": "Скачивание начато.",
    "mappingStudio.downloadFailed":
      "Скачивание заблокировано. Попробуйте снова.",
    "mappingStudio.pipeline": "Конвейер преобразования",
    "mappingStudio.pipelineHelp":
      "Этапы читают результат предыдущего этапа. Правила одного этапа читают одни и те же данные. Начните с пустого объекта/массива или сохраните входные данные, затем запишите поля. Пути источника и назначения могут содержать по одному сегменту * для массива; позиции строк сохраняются. Пересекающиеся записи отклоняются.",
    "mappingStudio.count": "Этапов: {stages}/12, правил: {rules}/200.",
    "mappingStudio.stage": "Выбранный этап преобразования",
    "mappingStudio.disabled": "отключено",
    "mappingStudio.addStage": "Добавить этап",
    "mappingStudio.removeStage": "Удалить этап",
    "mappingStudio.stageUp": "Переместить этап раньше",
    "mappingStudio.stageDown": "Переместить этап позже",
    "mappingStudio.stageName": "Название этапа",
    "mappingStudio.base": "Начальная структура этапа",
    "mappingStudio.base.object": "Пустой объект",
    "mappingStudio.base.array": "Пустой массив",
    "mappingStudio.base.input": "Сохранить входные данные этапа",
    "mappingStudio.enableStage": "Включить этап",
    "mappingStudio.ruleSearch": "Поиск правил преобразования",
    "mappingStudio.rules": "Правила преобразования",
    "mappingStudio.addRule": "Добавить правило",
    "mappingStudio.removeRule": "Удалить правило",
    "mappingStudio.ruleUp": "Переместить правило раньше",
    "mappingStudio.ruleDown": "Переместить правило позже",
    "mappingStudio.sourcePointer": "Путь источника / шаблон массива",
    "mappingStudio.targetPointer": "Путь назначения / шаблон массива",
    "mappingStudio.operator": "Преобразование значения",
    "mappingStudio.operator.copy": "Копировать JSON-значение",
    "mappingStudio.operator.constant": "Постоянное JSON-значение",
    "mappingStudio.operator.string": "Преобразовать в строку",
    "mappingStudio.operator.number": "Преобразовать в число",
    "mappingStudio.operator.integer": "Преобразовать в целое",
    "mappingStudio.operator.boolean": "Преобразовать в логическое",
    "mappingStudio.operator.trim": "Удалить крайние пробелы",
    "mappingStudio.operator.lower": "Строка в нижнем регистре",
    "mappingStudio.operator.upper": "Строка в верхнем регистре",
    "mappingStudio.operator.length": "Число элементов / символов / ключей",
    "mappingStudio.operator.join": "Объединить значения массива",
    "mappingStudio.operator.split": "Разделить строку",
    "mappingStudio.missing": "Политика отсутствующего значения",
    "mappingStudio.missing.error": "Завершить с ошибкой",
    "mappingStudio.missing.omit": "Пропустить запись",
    "mappingStudio.missing.default": "Использовать JSON по умолчанию",
    "mappingStudio.literal":
      "Постоянное значение / значение по умолчанию (JSON)",
    "mappingStudio.argument": "Разделитель для объединения / разделения",
    "mappingStudio.enableRule": "Включить правило",
    "mappingStudio.contract": "Необязательная проверка по OpenAPI",
    "mappingStudio.contractHelp":
      "Загрузите локальный контракт и выберите модель входа/выхода или JSON-тело операции. Проверки рекомендательные и учитывают направление запроса/ответа. Внешние ссылки и неподдерживаемые ограничения дают частичный результат; ссылки не загружаются. Экспортируемый преобразователь содержит только правила без проверок контракта.",
    "mappingStudio.contractSource": "Исходный текст снимка OpenAPI",
    "mappingStudio.capture": "Получить OpenAPI из редактора",
    "mappingStudio.loadContract": "Загрузить снимок OpenAPI",
    "mappingStudio.clearContract": "Очистить привязки контракта",
    "mappingStudio.contractLoaded": "Снимок OpenAPI и варианты схем загружены.",
    "mappingStudio.dirty":
      "В тексте контракта есть непроверенные изменения. Загрузите его или очистите привязки перед запуском или скачиванием проекта.",
    "mappingStudio.bindingCount": "Вариантов схем: {count}",
    "mappingStudio.inputBinding": "Схема входных данных",
    "mappingStudio.outputBinding": "Схема результата",
    "mappingStudio.noBinding": "Без проверки контракта",
    "mappingStudio.rehearsal": "Локальная репетиция преобразования",
    "mappingStudio.input": "Входной JSON",
    "mappingStudio.pointers": "Список путей входа (первые 300)",
    "mappingStudio.pointerHelp":
      "Пути используют / для вложенности, ~0 для ~ и ~1 для /. Пустой путь выбирает корень. * — расширение студии для массивов; имена свойств с буквальным * не поддерживаются. В списке показаны первые три элемента каждого массива без значений.",
    "mappingStudio.run": "Запустить преобразование данных",
    "mappingStudio.finished":
      "Преобразование выполнено. Проверьте результаты проверки контракта ниже.",
    "mappingStudio.runSummary":
      "Выполнено этапов: {stages}, шагов обработки: {steps}.",
    "mappingStudio.inputValidation": "Контракт входа",
    "mappingStudio.outputValidation": "Контракт результата",
    "mappingStudio.validation.none": "Не выбран",
    "mappingStudio.validation.valid": "Поддерживаемые проверки пройдены",
    "mappingStudio.validation.warning": "Пройдено с предупреждениями",
    "mappingStudio.validation.invalid": "Ошибки контракта",
    "mappingStudio.validation.partial": "Частичная проверка",
    "mappingStudio.severity.error": "ошибка",
    "mappingStudio.severity.warning": "предупреждение",
    "mappingStudio.previewStage": "Просмотр результата этапа",
    "mappingStudio.finalOutput": "Итоговый результат",
    "mappingStudio.output": "Результат преобразования (первые 16 000 символов)",
    "mappingStudio.trace": "Счётчики выполнения правил",
    "mappingStudio.ruleSummary":
      "Записей: {mapped}, пропущено: {omitted}, значений по умолчанию: {defaults}.",
    "mappingStudio.cases": "Регрессионные примеры преобразования",
    "mappingStudio.casesHelp":
      "Сохраните текущий вход, при необходимости записав текущий результат как ожидаемый. Примеры выполняются независимо с текущими правилами и контрактом. JSON сравнивается по структуре и значениям без учёта порядка ключей объектов. Изменение примеров или правил очищает старые результаты.",
    "mappingStudio.caseCount": "Сохранено примеров: {count}/{max}.",
    "mappingStudio.newCaseName": "Название нового примера",
    "mappingStudio.saveCase": "Сохранить текущий вход как пример",
    "mappingStudio.caseSaved": "Пример преобразования сохранён в проекте.",
    "mappingStudio.runCases": "Запустить все примеры",
    "mappingStudio.casesFinished": "Примеры преобразования выполнены.",
    "mappingStudio.selectedCase": "Выбранный пример",
    "mappingStudio.caseName": "Название сохранённого примера",
    "mappingStudio.caseInput": "Входной JSON сохранённого примера",
    "mappingStudio.expected": "Ожидаемый JSON-результат",
    "mappingStudio.compareExpected": "Сравнивать ожидаемый результат",
    "mappingStudio.loadCase": "Загрузить вход сохранённого примера",
    "mappingStudio.captureExpected": "Записать текущий результат как ожидаемый",
    "mappingStudio.removeCase": "Удалить пример",
    "mappingStudio.casesSummary":
      "Пройдено: {passed}, ошибок: {failed}, частичных: {partial}.",
    "mappingStudio.caseStatus.passed": "Пройдено",
    "mappingStudio.caseStatus.failed": "Ошибка",
    "mappingStudio.caseStatus.partial": "Частично",
    "mappingStudio.expectedStatus.none": "Без проверки ожидаемого результата",
    "mappingStudio.expectedStatus.match": "Ожидаемый результат совпадает",
    "mappingStudio.expectedStatus.mismatch": "Ожидаемый результат отличается",
    "mappingStudio.inspectCase": "Просмотр результата примера",
    "mappingStudio.caseOutput": "Результат примера (первые 16 000 символов)",
    "mappingStudio.error.limit": "Превышен лимит файла, данных или обработки.",
    "mappingStudio.error.input":
      "Используйте корректный JSON с конечными числами и безопасными целыми.",
    "mappingStudio.error.pointer":
      "Некорректный путь или шаблон массива. Используйте не более одного * в источнике и назначении.",
    "mappingStudio.error.recipe":
      "Некорректный набор правил, этап, правило или идентификатор.",
    "mappingStudio.error.literal":
      "Постоянные значения и значения по умолчанию должны содержать корректный JSON.",
    "mappingStudio.error.collision":
      "Пути назначения включённых правил пересекаются.",
    "mappingStudio.error.missing":
      "Отсутствует обязательное значение или массив источника.",
    "mappingStudio.error.array": "Источник шаблона * должен выбирать массив.",
    "mappingStudio.error.target":
      "Структура назначения несовместима или создаёт разреженные/несогласованные массивы.",
    "mappingStudio.error.conversion":
      "Источник нельзя преобразовать выбранной операцией.",
    "mappingStudio.error.project":
      "Некорректный проект или сохранённый пример.",
    "mappingStudio.error.source":
      "Используйте корректный локальный контракт OpenAPI в JSON/YAML.",
    "mappingStudio.error.binding":
      "Выбранная схема отсутствует в загруженном контракте.",
    "mappingStudio.error.case":
      "Укажите название и корректный JSON для примера.",
    "protoStudio.codecNote":
      "Неявные значения по умолчанию proto3 могут исчезнуть при бинарной нормализации. Неизвестные номера принимаются для открытых перечислений proto3; закрытые перечисления proto2 отклоняют их в JSON и отбрасывают при декодировании. Этот JSON-редактор не поддерживает бесконечные значения и NaN.",
    "protoStudio.import.folder": "Импорт папки проекта .proto",
    "protoStudio.explicit": "явное наличие",
    "protoStudio.implicit": "неявное наличие",
    "protoStudio.title": "Студия Protocol Buffers и gRPC",
    "protoStudio.description":
      "Изучайте проекты .proto, проверяйте JSON-сообщения, анализируйте бинарные данные, репетируйте RPC-обмены и сравнивайте версии контрактов.",
    "protoStudio.help":
      "Всё работает локально. Добавьте или импортируйте файлы proto2/proto3, выберите входной файл и загрузите контракт. Проекты остаются в памяти до скачивания; редактор OpenAPI работает независимо.",
    "protoStudio.import.files": "Импорт файлов .proto (несколько)",
    "protoStudio.import.project": "Восстановить проект Protobuf (JSON)",
    "protoStudio.importHelp":
      "Импорт объединяет файлы по пути, заменяя совпадающие. Отсутствующие обязательные импорты блокируют загрузку; поддерживаемые стандартные типы Google встроены. Компилируются только входной файл и его зависимости.",
    "protoStudio.projectName": "Название проекта Protobuf",
    "protoStudio.loading": "Чтение файлов Protobuf…",
    "protoStudio.demo": "Загрузить демо-контракт Protobuf",
    "protoStudio.capture": "Прочитать редактор в выбранный файл .proto",
    "protoStudio.load": "Загрузить и проверить контракт Protobuf",
    "protoStudio.file": "Выбранный файл .proto",
    "protoStudio.entry": "Входной файл .proto",
    "protoStudio.source": "Исходный текст выбранного .proto",
    "protoStudio.newPath": "Путь нового файла .proto",
    "protoStudio.addFile": "Добавить файл .proto",
    "protoStudio.removeFile": "Удалить выбранный файл .proto",
    "protoStudio.dirty":
      "В файлах есть непроверенные изменения. Загрузите контракт перед использованием инструментов; предыдущий контракт и сохранённые обмены доступны.",
    "protoStudio.loaded": "Контракт Protobuf загружен.",
    "protoStudio.demoLoaded": "Демо-контракт и черновик RPC загружены.",
    "protoStudio.imported":
      "Файлы импортированы. Выберите входной файл и загрузите контракт.",
    "protoStudio.restored":
      "Проект Protobuf восстановлен; результаты необходимо получить заново.",
    "protoStudio.summary":
      "Типов: {types}, полей: {fields}, RPC-методов: {methods}, файлов: {files}.",
    "protoStudio.tools": "Инструменты контракта Protobuf",
    "protoStudio.export.file": "Скачать выбранный .proto",
    "protoStudio.export.inventory": "Скачать структуру Protobuf",
    "protoStudio.export.descriptor": "Скачать JSON рефлексии protobuf.js",
    "protoStudio.export.project": "Скачать проект Protobuf",
    "protoStudio.export.codec": "Скачать результаты кодека",
    "protoStudio.export.exchange": "Скачать RPC-обмен и кадры",
    "protoStudio.export.report": "Скачать отчёт репетиции без значений",
    "protoStudio.export.comparison": "Скачать отчёт совместимости",
    "protoStudio.downloaded": "Скачивание начато.",
    "protoStudio.downloadFailed": "Скачивание заблокировано. Попробуйте снова.",
    "protoStudio.imports": "Разрешение локальных импортов (первые 100)",
    "protoStudio.builtin": "(встроенный тип Google)",
    "protoStudio.weakMissing": "(отсутствует необязательный импорт)",
    "protoStudio.explorer": "Изучить типы и зависимости Protobuf",
    "protoStudio.search": "Поиск типов и полей Protobuf",
    "protoStudio.kind": "Фильтр вида типа Protobuf",
    "protoStudio.kind.all": "Все типы",
    "protoStudio.kind.message": "Сообщение",
    "protoStudio.kind.enum": "Перечисление",
    "protoStudio.types": "Типы Protobuf",
    "protoStudio.noTypes": "Подходящих типов Protobuf нет.",
    "protoStudio.previous": "Назад",
    "protoStudio.next": "Далее",
    "protoStudio.page": "Страница {page}/{total}",
    "protoStudio.dependencies": "Зависимости типа Protobuf",
    "protoStudio.fields": "Поля Protobuf",
    "protoStudio.number": "Номер",
    "protoStudio.fieldName": "Поле",
    "protoStudio.fieldType": "Тип",
    "protoStudio.rules": "Наличие / кратность",
    "protoStudio.required": "обязательное",
    "protoStudio.repeated": "повторяющееся",
    "protoStudio.reserved": "Зарезервированные имена / диапазоны",
    "protoStudio.codec": "Кодек сообщений Protobuf",
    "protoStudio.codecHelp":
      "JSON использует имена полей из .proto, десятичные строки для 64-битных целых, имена перечислений или числа int32 и канонический base64 для байтов. Неустановленные поля пропускайте; null, неизвестные поля и несколько вариантов oneof не допускаются. Стандартные типы Google используют обычные поля сообщений, а не специальное представление ProtoJSON. Неизвестные бинарные поля отбрасываются. Кадры должны быть полными и несжатыми.",
    "protoStudio.codecType": "Тип сообщения для кодека",
    "protoStudio.depth": "Глубина вложенности примера",
    "protoStudio.payload": "JSON-сообщение Protobuf",
    "protoStudio.format": "Текстовый формат бинарных данных",
    "protoStudio.binary": "Бинарные данные Protobuf или кадры gRPC",
    "protoStudio.action.sample": "Сгенерировать JSON-сообщение",
    "protoStudio.action.check": "Проверить JSON-сообщение",
    "protoStudio.action.encode":
      "Закодировать и проверить обратное преобразование",
    "protoStudio.action.decode": "Декодировать бинарное сообщение",
    "protoStudio.action.frames": "Декодировать кадры сообщений gRPC",
    "protoStudio.generated": "JSON-сообщение сгенерировано.",
    "protoStudio.valid": "JSON-сообщение соответствует контракту.",
    "protoStudio.invalid": "В JSON-сообщении есть ошибки контракта.",
    "protoStudio.encoded": "Сообщение успешно закодировано и декодировано.",
    "protoStudio.decoded": "Бинарные данные успешно декодированы.",
    "protoStudio.codecSummary":
      "Декодировано сообщений: {messages}, байтов данных: {bytes}.",
    "protoStudio.codecOutput": "Результаты кодека (первые 16 000 символов)",
    "protoStudio.issues": "Ошибки данных Protobuf",
    "protoStudio.issue.object": "Ожидается JSON-объект.",
    "protoStudio.issue.unknown": "Неизвестное поле.",
    "protoStudio.issue.required": "Отсутствует обязательное поле.",
    "protoStudio.issue.oneof": "Допускается только один вариант oneof.",
    "protoStudio.issue.array": "Ожидается массив.",
    "protoStudio.issue.map": "Ожидается объект словаря.",
    "protoStudio.issue.key": "Недопустимый ключ словаря.",
    "protoStudio.issue.scalar": "Недопустимое значение скаляра или диапазон.",
    "protoStudio.issue.enum": "Ожидается имя перечисления или число int32.",
    "protoStudio.issue.null": "Пропускайте неустановленные поля вместо null.",
    "protoStudio.rpc": "Локальная репетиция обмена gRPC",
    "protoStudio.rpcHelp":
      "Создайте черновик RPC-метода, затем отредактируйте массивы сообщений запросов и ответов. Для одиночной стороны нужно одно сообщение, для потоковой — от 1 до 100. Репетиция проверяет, кодирует, декодирует и формирует кадры каждой стороны независимо. Она не выполняет логику сервера, авторизацию или HTTP/2-запросы и не определяет порядок запросов и ответов.",
    "protoStudio.methodSearch": "Поиск методов gRPC",
    "protoStudio.method": "Выбранный метод gRPC",
    "protoStudio.noMethods": "Подходящих RPC-методов нет.",
    "protoStudio.stream.unary": "Одиночный",
    "protoStudio.stream.client": "Поток запросов",
    "protoStudio.stream.server": "Поток ответов",
    "protoStudio.stream.bidi": "Двунаправленный поток",
    "protoStudio.generateExchange": "Создать черновик RPC-обмена",
    "protoStudio.exchangeGenerated": "Черновик RPC-обмена создан.",
    "protoStudio.caseName": "Название RPC-обмена",
    "protoStudio.draftMethod": "RPC-метод черновика",
    "protoStudio.requests": "Сообщения RPC-запросов (JSON-массив)",
    "protoStudio.responses": "Сообщения RPC-ответов (JSON-массив)",
    "protoStudio.run": "Запустить локальную репетицию RPC",
    "protoStudio.save": "Сохранить новый RPC-обмен",
    "protoStudio.update": "Обновить выбранный RPC-обмен",
    "protoStudio.rehearsed": "Локальная репетиция RPC пройдена.",
    "protoStudio.saved": "RPC-обмен сохранён в проекте.",
    "protoStudio.rehearsalSummary":
      "Запросов: {requests}, ответов: {responses}, байтов с кадрами: {bytes}; локальные проверки пройдены.",
    "protoStudio.rehearsalOutput":
      "Результаты репетиции RPC (первые 16 000 символов)",
    "protoStudio.library": "Сохранённые RPC-обмены",
    "protoStudio.caseCount": "Сохранено обменов: {count}/{max}.",
    "protoStudio.loadCase": "Загрузить RPC-обмен",
    "protoStudio.removeCase": "Удалить RPC-обмен",
    "protoStudio.compatibility": "Совместимость контрактов Protobuf",
    "protoStudio.compatibilityHelp":
      "Закрепите загруженный контракт, измените или импортируйте и загрузите новую версию, затем сравните. Консервативная проверка анализирует номера полей, объявленные типы, кратность, обязательность/oneof, имена и номера перечислений и сигнатуры RPC. Удаления и переименования могут влиять на данные или JSON-клиенты, даже если бинарные читатели их принимают. Это не полная сертификация совместимости protoc/Buf.",
    "protoStudio.pin": "Закрепить текущую базу Protobuf",
    "protoStudio.compare": "Сравнить с базой Protobuf",
    "protoStudio.clearBaseline": "Очистить базу Protobuf",
    "protoStudio.pinned": "Текущий контракт закреплён для сравнения.",
    "protoStudio.baseline": "База: {entry}, полей: {fields} (только в памяти).",
    "protoStudio.comparisonSummary":
      "Потенциально несовместимых изменений: {errors}, предупреждений: {warnings}, добавлений: {additions}.",
    "protoStudio.first100":
      "Показаны первые 100 изменений; скачивание содержит все результаты.",
    "protoStudio.severity.error": "Риск",
    "protoStudio.severity.warning": "Предупреждение",
    "protoStudio.severity.info": "Добавление",
    "protoStudio.change.typeRemoved": "Тип удалён или изменён его вид.",
    "protoStudio.change.methodRemoved": "RPC-метод удалён.",
    "protoStudio.change.methodChanged":
      "Изменены типы RPC или потоковая сигнатура.",
    "protoStudio.change.fieldRemoved":
      "Поле удалено; проверьте потерю данных и зарезервируйте номер.",
    "protoStudio.change.fieldReserved":
      "Поле удалено с резервированием номера; проверьте потерю данных.",
    "protoStudio.change.fieldAdded":
      "Добавлено необязательное/повторяющееся поле.",
    "protoStudio.change.requiredAdded": "Добавлено обязательное поле.",
    "protoStudio.change.fieldChanged":
      "Изменены тип, кратность, обязательность, ключ словаря или oneof.",
    "protoStudio.change.fieldRenamed":
      "Поле переименовано с тем же номером; возможны ошибки JSON-клиентов.",
    "protoStudio.change.tagChanged": "Номер существующего поля изменён.",
    "protoStudio.change.enumRemoved": "Номер перечисления удалён.",
    "protoStudio.change.enumRenamed": "Имя или номер перечисления изменены.",
    "protoStudio.change.added": "Новый тип или RPC-метод.",
    "protoStudio.error.schema": "Не удалось загрузить контракт proto2/proto3.",
    "protoStudio.error.import": "Локальный импорт отсутствует или не разрешён.",
    "protoStudio.error.path":
      "Используйте уникальный относительный путь .proto внутри проекта.",
    "protoStudio.error.limit":
      "Превышен лимит файла, данных, бинарного ввода или обработки.",
    "protoStudio.error.payload":
      "Некорректное JSON-сообщение для выбранного типа Protobuf.",
    "protoStudio.error.binary":
      "Некорректные бинарные данные для типа Protobuf или текстового формата.",
    "protoStudio.error.frame":
      "Используйте полные несжатые кадры сообщений gRPC.",
    "protoStudio.error.project":
      "Некорректный проект Protobuf. Названия и JSON-черновики должны быть корректными.",
    "protoStudio.error.case":
      "RPC-обмен не соответствует методу или кратности сообщений.",
    "protoStudio.error.generation":
      "Для этого рекурсивного обязательного сообщения нужны данные вручную.",
    "protoStudio.error.file": "Не удалось прочитать файл.",
    "graphqlStudio.error.introspection":
      "Для запросов __schema и __type используйте отдельный экспорт схемы/интроспекции. Локальное выполнение с тестовыми данными поддерживает обычные операции и __typename.",
    "graphqlStudio.implementations": "Реализации интерфейса GraphQL",
    "graphqlStudio.title": "Студия контрактов GraphQL",
    "graphqlStudio.description":
      "Проектируйте и изучайте схемы GraphQL, создавайте переиспользуемые операции, проверяйте документы и переменные, моделируйте ответы локально и экспортируйте HTTP-контракты для REST-инструментов.",
    "graphqlStudio.help":
      "Используйте SDL или JSON-интроспекцию. Студия работает отдельно от редактора OpenAPI и не выполняет сетевые запросы. Загрузите пример или свою схему, создайте операцию и проверьте её либо выполните локально с редактируемыми JSON-данными.",
    "graphqlStudio.loading": "Чтение файла GraphQL…",
    "graphqlStudio.import.schema":
      "Импорт схемы GraphQL (SDL/JSON-интроспекция)",
    "graphqlStudio.import.project": "Восстановить проект студии GraphQL (JSON)",
    "graphqlStudio.import.request": "Импорт HTTP-запроса GraphQL (JSON)",
    "graphqlStudio.projectName": "Название проекта GraphQL",
    "graphqlStudio.source": "Исходник схемы GraphQL (SDL/JSON-интроспекция)",
    "graphqlStudio.load": "Загрузить и проверить схему GraphQL",
    "graphqlStudio.demo": "Загрузить пример контракта GraphQL",
    "graphqlStudio.capture": "Прочитать редактор как схему GraphQL",
    "graphqlStudio.dirty":
      "В исходнике схемы есть непроверенные изменения. Загрузите и проверьте его перед использованием операций; предыдущая схема и сохранённые операции остаются.",
    "graphqlStudio.schemaSummary":
      "Типов: {types}, полей: {fields}, корневых операций: {operations}; исходник: {format}.",
    "graphqlStudio.workspace": "Операции и экспорт GraphQL",
    "graphqlStudio.explorer": "Изучить типы и зависимости GraphQL",
    "graphqlStudio.typeSearch": "Поиск типов и полей GraphQL",
    "graphqlStudio.typeFilter": "Фильтр вида типа GraphQL",
    "graphqlStudio.allTypes": "Все виды типов",
    "graphqlStudio.type.object": "Объект",
    "graphqlStudio.type.input": "Входной объект",
    "graphqlStudio.type.interface": "Интерфейс",
    "graphqlStudio.type.union": "Объединение",
    "graphqlStudio.type.enum": "Перечисление",
    "graphqlStudio.type.scalar": "Скаляр",
    "graphqlStudio.types": "Типы GraphQL",
    "graphqlStudio.noTypes": "Нет типов, соответствующих фильтрам.",
    "graphqlStudio.previousTypes": "Предыдущие типы GraphQL",
    "graphqlStudio.nextTypes": "Следующие типы GraphQL",
    "graphqlStudio.previousFields": "Предыдущие поля GraphQL",
    "graphqlStudio.nextFields": "Следующие поля GraphQL",
    "graphqlStudio.page": "Страница {page}/{total}",
    "graphqlStudio.oneOf":
      "Вход OneOf: укажите ровно одно поле с ненулевым значением.",
    "graphqlStudio.dependencies": "Зависимости типа GraphQL",
    "graphqlStudio.members": "Участники / реализованные интерфейсы: {names}",
    "graphqlStudio.enumValues": "Значения перечисления GraphQL (первые 100)",
    "graphqlStudio.fields": "Поля GraphQL",
    "graphqlStudio.deprecated": "Устарело",
    "graphqlStudio.default": "По умолчанию: {value}",
    "graphqlStudio.required": "обязательно",
    "graphqlStudio.exportSdl": "Скачать SDL GraphQL",
    "graphqlStudio.exportIntrospection": "Скачать JSON-интроспекцию GraphQL",
    "graphqlStudio.exportInventory": "Скачать список типов и операций GraphQL",
    "graphqlStudio.operationSearch": "Поиск корневых операций GraphQL",
    "graphqlStudio.operationFilter": "Фильтр вида операции GraphQL",
    "graphqlStudio.allOperations": "Все виды операций",
    "graphqlStudio.operation.query": "Запрос",
    "graphqlStudio.operation.mutation": "Мутация",
    "graphqlStudio.operation.subscription": "Подписка",
    "graphqlStudio.rootOperation": "Корневая операция GraphQL",
    "graphqlStudio.depth": "Глубина создаваемой выборки",
    "graphqlStudio.optionalArguments":
      "Включать необязательные аргументы и входные поля",
    "graphqlStudio.generate": "Создать операцию, переменные и тестовые данные",
    "graphqlStudio.generatorHelp":
      "Создание заменяет текущий черновик. Выбирается до восьми актуальных полей на объект; вложенные поля с обязательными аргументами пропускаются, для циклов и предела глубины используется __typename. Примеры значений можно редактировать. Проверьте пользовательские скаляры и созданные входные данные.",
    "graphqlStudio.draftName": "Название черновика операции GraphQL",
    "graphqlStudio.operationName":
      "Имя операции GraphQL (пусто для одной операции)",
    "graphqlStudio.document": "Документ операции GraphQL",
    "graphqlStudio.variables": "Переменные GraphQL (JSON-объект)",
    "graphqlStudio.fixtures": "Корневые тестовые данные GraphQL (JSON-объект)",
    "graphqlStudio.validate": "Проверить документ и переменные GraphQL",
    "graphqlStudio.rehearse": "Выполнить GraphQL локально",
    "graphqlStudio.rehearsalHelp":
      "Данные задают значения по реальному имени поля; псевдонимы, фрагменты, встроенные директивы, скаляры/перечисления и распространение null обрабатываются по правилам GraphQL. Добавляйте __typename для объектов интерфейсов/объединений. Аргументы проверяются, но данные не реализуют фильтрацию, бизнес-логику, аутентификацию или эффекты мутаций. Семантика пользовательских скаляров/директив не выполняется. Подписки можно проектировать и проверять, но потоковая передача не моделируется.",
    "graphqlStudio.checkSummary":
      "Замечаний к запросу: {issues}, примечаний о пользовательских правилах: {warnings}, игнорируемых лишних ключей переменных: {ignored}.",
    "graphqlStudio.availableOperations": "Имена операций в документе: {names}",
    "graphqlStudio.anonymous": "без имени",
    "graphqlStudio.issues": "Диагностика запроса GraphQL",
    "graphqlStudio.phase.document": "Документ",
    "graphqlStudio.phase.selection": "Выбор операции",
    "graphqlStudio.phase.variables": "Переменные",
    "graphqlStudio.warning.custom-scalar":
      "Пользовательский скаляр {name}: задайте подходящие значения; правила разбора/сериализации сервера здесь недоступны.",
    "graphqlStudio.warning.custom-directive":
      "Пользовательская директива {name}: её поведение не моделируется.",
    "graphqlStudio.response":
      "Локальный ответ GraphQL (первые 16 000 символов)",
    "graphqlStudio.exportRequest": "Скачать HTTP-запрос GraphQL",
    "graphqlStudio.exportResponse": "Скачать локальный ответ GraphQL",
    "graphqlStudio.exportReport": "Скачать отчёт проверки GraphQL",
    "graphqlStudio.reportHelp":
      "Отчёты не содержат текст запроса, переменные, тестовые данные, значения ответа или сообщения диагностики. Имена операций/типов/директив и места в исходнике остаются. Изменение черновика или схемы сбрасывает результаты проверки.",
    "graphqlStudio.library": "Библиотека сохранённых операций GraphQL",
    "graphqlStudio.savedOperation": "Сохранённая операция GraphQL",
    "graphqlStudio.chooseCase": "Выберите сохранённую операцию",
    "graphqlStudio.saveNew": "Сохранить как новую операцию GraphQL",
    "graphqlStudio.updateCase": "Обновить выбранную сохранённую операцию",
    "graphqlStudio.loadCase":
      "Загрузить выбранную сохранённую операцию в черновик",
    "graphqlStudio.removeCase": "Удалить выбранную сохранённую операцию",
    "graphqlStudio.libraryHelp":
      "Сохранено операций: {count}/50. Для сохранения нужны корректный документ/переменные и JSON-данные. Загрузка явно заменяет черновик; удаление записи сохраняет текущий черновик. Обновление схемы сохраняет записи, которые следует проверить заново.",
    "graphqlStudio.httpContract": "HTTP-контракт GraphQL для REST-инструментов",
    "graphqlStudio.endpoint": "URL HTTP-эндпоинта GraphQL",
    "graphqlStudio.bridgeFormat": "Формат OpenAPI HTTP-контракта GraphQL",
    "graphqlStudio.exportBridge": "Скачать OpenAPI HTTP-контракт GraphQL",
    "graphqlStudio.bridgeHelp":
      "Экспортирует OpenAPI 3.1 POST-контракт для проверенного запроса или мутации: типизированные переменные, пример запроса и общий ответ data/errors. Выборка ответа, правила пользовательских скаляров и аутентификация не моделируются. Шлюз и обработчики не создаются. Импортируйте файл или объедините его в компоновщике API-шлюза; экспорт не меняет редактор.",
    "graphqlStudio.exportProject": "Скачать проект студии GraphQL",
    "graphqlStudio.exportHelp":
      "Проекты содержат исходник схемы, текущий черновик, переменные, тестовые данные, URL и сохранённые операции. Запросы и ответы содержат значения; списки типов содержат описания и значения по умолчанию. Восстановление заново строит схему и требует новой проверки. Ограничения: 2 МиБ для схемы/результата/файла, 128 КиБ для документа/переменных, 256 КиБ для тестовых данных, 8 МиБ для проекта, 50 операций, а также ограниченная вложенность, число токенов, полей и объём выполнения.",
    "graphqlStudio.loaded":
      "Схема GraphQL загружена; текущий черновик и сохранённые операции оставлены.",
    "graphqlStudio.demoLoaded":
      "Пример схемы загружен с редактируемой операцией и тестовыми данными.",
    "graphqlStudio.requestImported":
      "HTTP-запрос GraphQL импортирован; текущие корневые данные сохранены. Проверьте запрос по загруженной схеме.",
    "graphqlStudio.restored":
      "Проект GraphQL восстановлен. Повторите проверку или локальное выполнение перед экспортом проверенных запросов.",
    "graphqlStudio.generated":
      "Операция, переменные и тестовые данные созданы. Проверьте их перед использованием.",
    "graphqlStudio.valid":
      "Документ и переменные соответствуют загруженной схеме.",
    "graphqlStudio.invalid":
      "В запросе GraphQL есть ошибки; проверьте диагностику ниже.",
    "graphqlStudio.rehearsal.success":
      "Локальное выполнение GraphQL завершено с данными без ошибок.",
    "graphqlStudio.rehearsal.errors":
      "Локальное выполнение GraphQL вернуло ошибки. Проверьте тестовые значения и допустимость null.",
    "graphqlStudio.rehearsal.invalid":
      "Проверка запроса не пройдена; тестовые данные не выполнялись.",
    "graphqlStudio.saved": "Операция GraphQL сохранена.",
    "graphqlStudio.caseLoaded":
      "Сохранённая операция загружена в черновик; нужна новая проверка.",
    "graphqlStudio.caseRemoved":
      "Выбранная сохранённая операция удалена; текущий черновик оставлен.",
    "graphqlStudio.downloaded": "Начато скачивание GraphQL.",
    "graphqlStudio.error.schema":
      "Не удалось загрузить корректную схему GraphQL. Проверьте SDL или структуру интроспекции и подробности ниже.",
    "graphqlStudio.error.limit":
      "Превышены ограничения студии GraphQL. Уменьшите размер данных, вложенность, развёртывание выборки или объём тестового результата.",
    "graphqlStudio.error.variables":
      "Переменные должны быть JSON-объектом допустимого размера с поддерживаемыми значениями.",
    "graphqlStudio.error.fixtures":
      "Корневые тестовые данные должны быть JSON-объектом допустимого размера с поддерживаемыми значениями.",
    "graphqlStudio.error.generation":
      "Не удалось создать операцию в допустимых пределах. Выберите другое поле/глубину или задайте документ и входные значения вручную.",
    "graphqlStudio.error.request":
      "Используйте корректные документ и переменные перед сохранением или экспортом. Импортируемый HTTP-запрос должен содержать текст query и переменные-объект.",
    "graphqlStudio.error.subscription":
      "Подписки можно проектировать, проверять и сохранять, но локальное выполнение и этот HTTP-экспорт поддерживают только запросы и мутации.",
    "graphqlStudio.error.endpoint":
      "Используйте абсолютный HTTP(S) URL без учётных данных, параметров запроса и фрагмента.",
    "graphqlStudio.error.project":
      "Некорректный проект GraphQL. Проверьте формат/версию, названия, исходник схемы, черновики, уникальные ID и JSON-значения.",
    "graphqlStudio.error.case":
      "Выберите существующую сохранённую операцию GraphQL.",
    "graphqlStudio.error.file":
      "Не удалось прочитать выбранный файл GraphQL. Выберите его снова.",
    "graphqlStudio.error.download":
      "Браузер заблокировал скачивание GraphQL. Повторите попытку.",
    "localeStudio.catalogHelp":
      "Строки каталога сохраняют исходник, на котором основан перевод. currentSource (JSON) / current_source (CSV) показывает текущий текст. При подтверждении обновлённого перевода в каталоге скопируйте этот текст в source и установите reviewed в true. Столбец текущего текста носит справочный характер; импорт проверяет source по захваченному API.",
    "localeStudio.title": "Студия локализации документации API",
    "localeStudio.description":
      "Ведите документацию на нескольких языках: каталоги переводов, проверка текста, отслеживание изменений исходника и экспорт локализованных OpenAPI и автономного HTML.",
    "localeStudio.help":
      "Захватите или импортируйте API, добавьте язык, переведите документацию и подтвердите каждый перевод. Маршруты, идентификаторы, ссылки, ограничения схем и значения примеров сохраняются. Данные хранятся в памяти до скачивания файла или явного применения результата.",
    "localeStudio.loading": "Чтение файла локализации…",
    "localeStudio.import.source":
      "Импорт исходника документации (OpenAPI JSON/YAML)",
    "localeStudio.import.project": "Восстановить проект локализации (JSON)",
    "localeStudio.import.catalog": "Импорт каталога переводов (JSON/CSV)",
    "localeStudio.capture": "Захватить или обновить документацию из редактора",
    "localeStudio.overwrite":
      "Заменять совпадающие переводы при импорте каталога",
    "localeStudio.importHelp":
      "Каталоги объединяются по языку и месту в документе; непустые переводы по умолчанию сохраняются. Включите замену для обновления совпадающих строк. Остальные переводы остаются. CSV поддерживает многострочный текст в кавычках и апострофы для защиты ячеек, похожих на формулы.",
    "localeStudio.name": "Название проекта локализации",
    "localeStudio.inventory": "{title}: полей документации — {count}.",
    "localeStudio.sourceDetails": "Захваченный исходник документации",
    "localeStudio.sourceText": "Захваченный исходник документации OpenAPI",
    "localeStudio.newLocale": "Код нового языка перевода",
    "localeStudio.addLocale": "Добавить язык перевода",
    "localeStudio.localeHelp":
      "Используйте код вроде fr, ru, pt-BR или zh-Hant. До 20 языков и 5000 полей документации. Обновление исходника сохраняет переводы: изменённый текст становится устаревшим, а перемещённые или удалённые места — потерявшими связь.",
    "localeStudio.progress": "Готовность переводов по языкам",
    "localeStudio.locale": "Язык",
    "localeStudio.coverage": "Подтверждено / всего",
    "localeStudio.orphaned": "Без связи",
    "localeStudio.status.missing": "Отсутствует",
    "localeStudio.status.draft": "Черновик",
    "localeStudio.status.stale": "Устарел",
    "localeStudio.status.reviewed": "Подтверждён",
    "localeStudio.search": "Поиск документации и переводов",
    "localeStudio.filter": "Фильтр статуса перевода",
    "localeStudio.allStatuses": "Все статусы",
    "localeStudio.section": "Раздел документации",
    "localeStudio.allSections": "Все разделы",
    "localeStudio.section.info": "Информация об API",
    "localeStudio.section.operations": "Операции и вебхуки",
    "localeStudio.section.schemas": "Схемы и свойства",
    "localeStudio.section.other": "Компоненты, теги и серверы",
    "localeStudio.noEntries":
      "Нет полей документации, соответствующих фильтрам.",
    "localeStudio.entries": "Поля документации",
    "localeStudio.previous": "Предыдущие поля документации",
    "localeStudio.next": "Следующие поля документации",
    "localeStudio.page": "Страница {page}/{total}",
    "localeStudio.original": "Текущий исходный текст",
    "localeStudio.previousSource": "Исходный текст на момент создания перевода",
    "localeStudio.translation": "Перевод ({locale})",
    "localeStudio.review": "Подтвердить перевод для текущего исходника",
    "localeStudio.unreview": "Вернуть перевод в черновик",
    "localeStudio.copySource": "Скопировать исходник в черновик перевода",
    "localeStudio.clear": "Очистить выбранный перевод",
    "localeStudio.reviewHelp":
      "Редактирование делает текст черновиком. Подтверждение означает, что перевод соответствует текущему исходнику, даже если предыдущий текст изменился. Пустые, черновые и устаревшие переводы не публикуются.",
    "localeStudio.orphanDetails": "Места переводов без связи (первые 30)",
    "localeStudio.orphanHelp":
      "В этих местах больше нет документации в захваченном исходнике. Переводы остаются в проектах и каталогах, но исключаются из результата. Для повторного использования измените место в каталоге и импортируйте его.",
    "localeStudio.exportCatalog": "Скачать каталог переводов JSON",
    "localeStudio.exportCsv": "Скачать каталог переводов CSV",
    "localeStudio.policy": "Правило публикации локализации",
    "localeStudio.policy.fallback":
      "Подтверждённые переводы с исходным текстом для остальных полей",
    "localeStudio.policy.strict":
      "Требовать подтверждения всех полей документации",
    "localeStudio.format": "Формат локализованного OpenAPI",
    "localeStudio.preview": "Предпросмотр локализованной документации",
    "localeStudio.policyHelp":
      "При использовании исходного текста отсутствующие, черновые и устаревшие переводы заменяются оригиналом. Строгий режим блокирует экспорт и применение до подтверждения всех активных полей. Переводы без связи сохраняются отдельно.",
    "localeStudio.previewSummary":
      "{locale}: подтверждённые переводы используются в {translated} из {total} полей.",
    "localeStudio.previewText":
      "Предпросмотр локализованного API (первые 16 000 символов)",
    "localeStudio.needsPreview":
      "Повторите предпросмотр после изменения языка, перевода, исходника, формата или правила публикации.",
    "localeStudio.exportApi": "Скачать локализованный OpenAPI",
    "localeStudio.exportHtml":
      "Скачать локализованную автономную HTML-документацию",
    "localeStudio.apply": "Применить локализованный OpenAPI к редактору",
    "localeStudio.htmlHelp":
      "Автономный HTML использует переведённое содержимое API и язык приложения для навигации. Включаются эндпоинты, модели и схемы безопасности, поддерживаемые существующим генератором документации.",
    "localeStudio.exportProject": "Скачать проект локализации с исходником",
    "localeStudio.exportProgress": "Скачать отчёт о готовности переводов",
    "localeStudio.exportHelp":
      "Проекты содержат полный исходник API и все переводы. Каталоги содержат текст документации и места, включая устаревшие строки и строки без связи. Отчёты содержат полные счётчики и ограниченные списки мест/статусов с флагами усечения; пути и имена могут быть конфиденциальными. Импортированные отчёты и предпросмотры не используются как готовый результат.",
    "localeStudio.undo": "Отменить последнее применение локализации",
    "localeStudio.captured":
      "Исходник документации захвачен; существующие переводы сохранены.",
    "localeStudio.restored":
      "Проект локализации восстановлен. Создайте новый предпросмотр перед применением.",
    "localeStudio.imported":
      "Каталог объединён: импортировано строк — {imported}, сохранено существующих переводов — {kept}.",
    "localeStudio.ready":
      "Локализованная документация готова к проверке и экспорту.",
    "localeStudio.blocked":
      "Строгая публикация заблокирована: сначала подтвердите каждое активное поле документации.",
    "localeStudio.downloaded": "Начато скачивание локализации.",
    "localeStudio.staleEditor":
      "Редактор изменился после предпросмотра. Создайте новый предпросмотр перед применением.",
    "localeStudio.staleUndo":
      "Редактор изменился после применения. Отмена заблокирована, чтобы сохранить эти изменения.",
    "localeStudio.unchanged":
      "Редактор уже содержит этот локализованный результат.",
    "localeStudio.applied":
      "Локализованная документация применена. Отмена доступна, пока редактор не изменён.",
    "localeStudio.undone": "В редакторе восстановлен точный предыдущий текст.",
    "localeStudio.error.source":
      "Используйте корректный поддерживаемый документ OpenAPI или Swagger в JSON или YAML.",
    "localeStudio.error.limit":
      "Превышены ограничения локализации: исходники/результаты 2 МиБ, каталоги 8 МиБ, проекты 16 МиБ, 5000 полей/строк, 20 языков и ограниченная вложенность.",
    "localeStudio.error.locale":
      "Используйте корректный уникальный код языка вроде fr, ru, pt-BR или zh-Hant.",
    "localeStudio.error.catalog":
      "Некорректный каталог переводов. Проверьте версию, уникальные указатели на документацию, текст и логические флаги подтверждения.",
    "localeStudio.error.project":
      "Некорректный проект локализации. Проверьте формат, версию, название, исходник и каталоги языков.",
    "localeStudio.error.csv":
      "Некорректный CSV-каталог. Используйте уникальные столбцы locale,pointer,source,current_source,translation,reviewed, один язык, одинаковую ширину строк, true/false для подтверждения и корректные кавычки.",
    "localeStudio.error.text":
      "Каждый перевод должен занимать не более 64 КиБ текста UTF-8.",
    "localeStudio.error.result":
      "Локализованный результат нельзя опубликовать. Завершите обязательные проверки и соблюдайте ограничения документа.",
    "localeStudio.error.download":
      "Браузер заблокировал скачивание локализации. Повторите попытку.",
    "mergeStudio.title": "Студия трёхстороннего слияния OpenAPI",
    "mergeStudio.description":
      "Согласуйте параллельные изменения одного API по общей базе и двум изменённым версиям. Объединяйте независимые правки, изучайте конфликты, выбирайте решения и проверяйте контракт перед экспортом или применением.",
    "mergeStudio.help":
      "Работа остаётся в этой вкладке без запросов и автоматического сохранения. Проекты содержат все три исходника и пользовательские решения. Отчёты исключают полные исходники/значения, но включают названия и места слияния; идентификаторы могут содержать имена параметров/тегов и URL серверов. Проверьте перед публикацией. Лимиты: 2 МиБ на исходник/результат, 8 МиБ на проект/отчёт, 500 конфликтов и 64 КиБ на пользовательское значение.",
    "mergeStudio.loading": "Чтение файла слияния…",
    "mergeStudio.importProject":
      "Восстановить проект трёхстороннего слияния (JSON)",
    "mergeStudio.sources": "Версии для слияния",
    "mergeStudio.name": "Название проекта слияния",
    "mergeStudio.side.base": "База",
    "mergeStudio.side.ours": "Наша версия",
    "mergeStudio.side.theirs": "Их версия",
    "mergeStudio.sideHelp.base": "Общая версия до изменений в обеих ветках.",
    "mergeStudio.sideHelp.ours":
      "Ваша изменённая версия. Её порядок элементов используется, если ни одна ветка не меняла порядок общих элементов.",
    "mergeStudio.sideHelp.theirs":
      "Другая изменённая версия, которую нужно согласовать с вашей.",
    "mergeStudio.capture.base": "Использовать редактор как базу",
    "mergeStudio.capture.ours": "Использовать редактор как нашу версию",
    "mergeStudio.capture.theirs": "Использовать редактор как их версию",
    "mergeStudio.import.base": "Импорт базового OpenAPI (JSON/YAML)",
    "mergeStudio.import.ours": "Импорт нашего OpenAPI (JSON/YAML)",
    "mergeStudio.import.theirs": "Импорт их OpenAPI (JSON/YAML)",
    "mergeStudio.source.base": "Базовый исходник (JSON/YAML)",
    "mergeStudio.source.ours": "Наш исходник (JSON/YAML)",
    "mergeStudio.source.theirs": "Их исходник (JSON/YAML)",
    "mergeStudio.keyedArrays":
      "Объединять поддерживаемые массивы OpenAPI по идентификаторам",
    "mergeStudio.arrayHelp":
      "Сопоставляет встроенные параметры по in/name, корневые теги по имени, серверы по URL в корне и поддерживаемых путях/операциях. Идентификаторы должны быть уникальными; массивы со ссылками, дубликатами, превышенным размером и другие массивы считаются атомарными. Примеры и схемы не считаются такими коллекциями. Различный порядок общих элементов и разные серверы по умолчанию требуют отдельного решения.",
    "mergeStudio.preview": "Проанализировать и показать слияние",
    "mergeStudio.exportProject": "Скачать проект слияния с исходниками",
    "mergeStudio.summary":
      "Решено конфликтов: {resolved}/{conflicts} · автоматических решений: {automatic} · массивов по идентификаторам: {keyed} · атомарных конфликтов массивов: {atomic}",
    "mergeStudio.needsPreview":
      "Решения изменены или проект восстановлен. Повторите предпросмотр перед экспортом, применением API или отчётом.",
    "mergeStudio.conflicts": "Конфликты слияния",
    "mergeStudio.search": "Поиск конфликтов слияния",
    "mergeStudio.filter": "Фильтр решений конфликтов",
    "mergeStudio.filter.all": "Все конфликты",
    "mergeStudio.filter.unresolved": "Нерешённые конфликты",
    "mergeStudio.filter.resolved": "Решённые конфликты",
    "mergeStudio.bulk.base": "База для оставшихся конфликтов",
    "mergeStudio.bulk.ours": "Наша версия для оставшихся конфликтов",
    "mergeStudio.bulk.theirs": "Их версия для оставшихся конфликтов",
    "mergeStudio.clearResolutions": "Сбросить все решения конфликтов",
    "mergeStudio.noConflicts": "Подходящих конфликтов нет.",
    "mergeStudio.unresolved": "Не решён",
    "mergeStudio.kind.value": "Разные изменения значения",
    "mergeStudio.kind.add-add": "Разные добавления",
    "mergeStudio.kind.delete-edit": "Удаление и изменение",
    "mergeStudio.kind.type": "Несовместимые типы значений",
    "mergeStudio.kind.array": "Атомарные изменения массива",
    "mergeStudio.kind.array-order": "Порядок коллекции",
    "mergeStudio.choice.base": "Использовать базу",
    "mergeStudio.choice.ours": "Использовать нашу версию",
    "mergeStudio.choice.theirs": "Использовать их версию",
    "mergeStudio.choice.custom": "Свой JSON",
    "mergeStudio.selected": "Конфликт в {location}",
    "mergeStudio.orderHelp":
      "Это списки идентификаторов по порядку, а не полные определения. Выберите порядок ветки или базы; независимо объединённые данные элементов сохраняются, остальные добавляются в конец. Свой JSON порядка отключён. Места слияния коллекций содержат @item/@order и не являются обычными JSON Pointer.",
    "mergeStudio.sidePreview":
      "Значение конфликта: {side} (первые 16 000 символов)",
    "mergeStudio.missing": "Отсутствует в этой версии (не JSON null)",
    "mergeStudio.choose.base": "Выбрать базовое значение",
    "mergeStudio.choose.ours": "Выбрать наше значение",
    "mergeStudio.choose.theirs": "Выбрать их значение",
    "mergeStudio.custom": "Своё значение конфликта (JSON)",
    "mergeStudio.customHelp":
      "Сохраните полное JSON-значение конфликта. JSON null — настоящее значение; для удаления выберите версию, где поле отсутствует. Изменение активного собственного решения сбрасывает его до повторного сохранения. Выбор ветки сохраняет всё вложенное содержимое этого конфликта.",
    "mergeStudio.saveCustom": "Проверить и использовать свой JSON",
    "mergeStudio.clearSelected": "Сбросить решение выбранного конфликта",
    "mergeStudio.previous": "Предыдущие конфликты слияния",
    "mergeStudio.next": "Следующие конфликты слияния",
    "mergeStudio.page": "Страница {page}/{total}",
    "mergeStudio.output": "Проверка объединённого контракта",
    "mergeStudio.review":
      "Добавлено операций: {added} · удалено: {removed} · изменено: {modified} · потенциально несовместимых: {breaking} · сломанных ссылок: {broken} · внешних ссылок: {external}",
    "mergeStudio.reviewHelp":
      "Рекомендательная проверка использует сравнение операций и ссылки. Это не полная проверка OpenAPI, не глубокий анализ совместимости схем и не тестирование API. Сломанные/внешние ссылки и потенциально несовместимые изменения нужно изучить после решения конфликтов. Внешние ссылки не загружаются.",
    "mergeStudio.referenceFindings": "Замечания по ссылкам (первые 50)",
    "mergeStudio.changeCount": "Изменённых мест документа: {count}",
    "mergeStudio.truncatedChanges": "показаны первые 200 изменений",
    "mergeStudio.changes": "Изменения относительно базы",
    "mergeStudio.format": "Формат объединённого API",
    "mergeStudio.previewLabel":
      "Предпросмотр объединённого API (первые 16 000 символов)",
    "mergeStudio.blocked":
      "Решите все конфликты и проверьте результат перед экспортом или применением API.",
    "mergeStudio.exportApi": "Скачать объединённый OpenAPI",
    "mergeStudio.apply": "Применить объединённый OpenAPI к редактору",
    "mergeStudio.exportReport": "Скачать JSON-отчёт решений слияния",
    "mergeStudio.exportMarkdown": "Скачать Markdown-отчёт решений слияния",
    "mergeStudio.undo": "Отменить последнее применение слияния",
    "mergeStudio.captured":
      "Редактор скопирован как версия слияния. Предыдущие решения сброшены.",
    "mergeStudio.imported":
      "Версия слияния импортирована. Предыдущие решения сброшены.",
    "mergeStudio.restored":
      "Проект слияния восстановлен, решения пересчитаны. Повторите предпросмотр перед применением.",
    "mergeStudio.ready":
      "Структурные конфликты решены; объединённый API готов к проверке.",
    "mergeStudio.conflictsFound":
      "Найдены конфликты слияния. Выберите решения и повторите предпросмотр.",
    "mergeStudio.downloaded": "Начато скачивание слияния.",
    "mergeStudio.stale":
      "Редактор изменился после предпросмотра. Повторите его перед применением.",
    "mergeStudio.staleUndo":
      "Редактор изменился после применения. Отмена перезаписала бы поздние правки.",
    "mergeStudio.unchanged": "Редактор уже содержит этот результат слияния.",
    "mergeStudio.applied":
      "Слияние OpenAPI применено. Прошлое содержимое редактора можно восстановить отменой.",
    "mergeStudio.undone":
      "Прошлое содержимое редактора восстановлено. Повторите предпросмотр перед новым применением.",
    "mergeStudio.error.source":
      "Нужны три корректные ограниченные версии OpenAPI или Swagger 2 JSON/YAML. Проверьте указанный исходник.",
    "mergeStudio.error.limit":
      "Превышен лимит исходника, результата, конфликтов, обхода или экспорта. Уменьшите размер или попробуйте JSON.",
    "mergeStudio.error.resolution":
      "Решение некорректно, повторяется или больше не соответствует конфликту. Сбросьте решения или восстановите подходящий проект.",
    "mergeStudio.error.custom":
      "Используйте корректный JSON в пределах лимита, с безопасными числами и ограниченной вложенностью.",
    "mergeStudio.error.project":
      "Нужен проект слияния версии 1 с названием, тремя исходниками, настройками массивов и решениями.",
    "mergeStudio.error.result":
      "Полученный результат не принимается парсером OpenAPI. Проверьте решения и свои значения перед применением.",
    "mergeStudio.error.download":
      "Не удалось начать скачивание слияния. Попробуйте снова.",
    "asyncStudio.title": "Студия событий AsyncAPI",
    "asyncStudio.description":
      "Создавайте и изучайте контракты событий, проверяйте JSON-сообщения и репетируйте отправку/приём в локальном журнале. Импортируйте AsyncAPI 2.x или 3.x либо создайте контракт 3.1 по примерам.",
    "asyncStudio.help":
      "Работа остаётся в этой вкладке: без соединений с брокером и автоматического сохранения. Редактор OpenAPI независим. Документы и проекты могут содержать приватные примеры и адреса серверов; проекты и полные журналы содержат значения сообщений. Отчёты исключают значения тела/заголовков, конкретные адреса и идентификаторы корреляции. Названия и пути полей видны.",
    "asyncStudio.importDocument": "Импорт документа AsyncAPI (JSON/YAML)",
    "asyncStudio.importProject": "Восстановить проект студии событий (JSON)",
    "asyncStudio.loading": "Чтение файла студии событий…",
    "asyncStudio.contract": "Контракт событий",
    "asyncStudio.source": "Исходник AsyncAPI (JSON или YAML)",
    "asyncStudio.sourceHelp":
      "Загрузка проверяет поддерживаемую версию и структуру, разрешает локальные ссылки. Это не полная сертификация AsyncAPI. Загрузка заменяет контракт и очищает журнал. Неизвестные поля сохраняются при экспорте. Внешние ссылки отображаются без загрузки.",
    "asyncStudio.dirty":
      "Есть несохранённые изменения контракта. Загрузите или отмените их перед созданием каналов, проверкой, повтором или экспортом.",
    "asyncStudio.load": "Загрузить контракт событий и сбросить журнал",
    "asyncStudio.discard": "Отменить изменения контракта событий",
    "asyncStudio.create": "Начать пустой контракт AsyncAPI 3.1",
    "asyncStudio.summary":
      "{title} · AsyncAPI {version} · каналов: {channels} · операций: {operations} · сообщений: {messages}",
    "asyncStudio.exports": "Экспорт контракта и репетиций",
    "asyncStudio.projectName": "Название проекта студии событий",
    "asyncStudio.export.json": "Скачать AsyncAPI JSON",
    "asyncStudio.export.yaml": "Скачать AsyncAPI YAML",
    "asyncStudio.export.markdown": "Скачать каталог событий Markdown",
    "asyncStudio.export.project": "Скачать проект со значениями сообщений",
    "asyncStudio.export.journal":
      "Скачать полный журнал со значениями сообщений",
    "asyncStudio.export.report":
      "Скачать отчёт репетиций без значений сообщений",
    "asyncStudio.builder": "Добавить канал по JSON-примеру",
    "asyncStudio.builderHelp":
      "Добавляет канал, сообщение с выведенной схемой, пример и операцию отправки/приёма. Поля контракта сохраняются. Вывод описывает наблюдаемые типы, а не бизнес-правила. Ограничения, параметры адресов, заголовки, корреляцию и варианты сообщений задайте в исходнике.",
    "asyncStudio.builderV3":
      "Конструктор каналов поддерживает AsyncAPI 3.x. Контракты 2.x можно редактировать, проверять, репетировать и экспортировать в исходной версии.",
    "asyncStudio.channelKey": "Идентификатор нового канала",
    "asyncStudio.address": "Адрес нового канала (без параметров)",
    "asyncStudio.messageName": "Название нового сообщения",
    "asyncStudio.action": "Действие новой операции",
    "asyncStudio.send": "Приложение отправляет",
    "asyncStudio.receive": "Приложение принимает",
    "asyncStudio.seed": "JSON-пример тела для вывода схемы",
    "asyncStudio.captureSeeds": "Прочитать JSON-примеры из редактора OpenAPI",
    "asyncStudio.seedChoice": "Пример OpenAPI для использования",
    "asyncStudio.useSeed": "Использовать выбранный пример OpenAPI",
    "asyncStudio.addChannel": "Добавить канал и операцию события",
    "asyncStudio.findings":
      "Замечания по контракту ({count}; показаны первые 100)",
    "asyncStudio.servers": "Описанные серверы (без соединений)",
    "asyncStudio.operations": "Операции каналов",
    "asyncStudio.search": "Поиск операций событий",
    "asyncStudio.direction": "Фильтр направления операции",
    "asyncStudio.all": "Все",
    "asyncStudio.noOperations": "Подходящих операций событий нет.",
    "asyncStudio.rehearsal": "Локальная репетиция сообщения",
    "asyncStudio.rehearsalHelp":
      "Проверяет схемы тела/заголовков и корреляцию, подставляет параметры адреса и записывает попытку. Ошибочные сообщения записываются с ошибками. Поддерживаются основные ограничения JSON Schema; остальные возможности дают частичный результат. Настоящая отправка, приём, доставка и подтверждение не выполняются. В 2.x subscribe означает отправку приложением, publish — приём.",
    "asyncStudio.dynamic": "Динамический адрес",
    "asyncStudio.message": "Вариант сообщения для репетиции",
    "asyncStudio.messageDetails":
      "Схема сообщения и корреляция (первые 16 000 символов)",
    "asyncStudio.example": "Документированный пример сообщения",
    "asyncStudio.useExample": "Загрузить пример сообщения для репетиции",
    "asyncStudio.parameters": "Параметры канала (JSON-объект строк)",
    "asyncStudio.payload": "Тело репетиции (JSON)",
    "asyncStudio.headers": "Заголовки сообщения приложения (JSON-объект)",
    "asyncStudio.validate": "Проверить сообщение без записи",
    "asyncStudio.record": "Записать локальную репетицию сообщения",
    "asyncStudio.checkStatus": "Проверка сообщения: {status}",
    "asyncStudio.status.valid": "Соответствует поддерживаемым проверкам",
    "asyncStudio.status.invalid": "Не соответствует",
    "asyncStudio.status.partial": "Частично — изучите замечания",
    "asyncStudio.journal": "Локальный журнал событий ({count}/200)",
    "asyncStudio.journalHelp":
      "Повтор проверяет прошлое сообщение и добавляет попытку. Редактирование загружает значения в форму. Отмена удаляет последнюю попытку. Журнал остаётся в памяти при закрытии панели; скачайте проект для восстановления. Лимиты: 2 МиБ на документ/проект/журнал, 128 КиБ на тело или объект заголовков, 100 каналов, 200 операций, 400 вариантов сообщений.",
    "asyncStudio.eventSearch": "Поиск в журнале репетиций",
    "asyncStudio.eventFilter": "Фильтр результата репетиции",
    "asyncStudio.noEvents": "Подходящих записей журнала нет.",
    "asyncStudio.replayOf": "повтор записи {sequence}",
    "asyncStudio.inspectEvent": "Просмотреть событие {sequence}",
    "asyncStudio.replayEvent": "Повторить событие {sequence}",
    "asyncStudio.editEvent": "Редактировать данные события {sequence}",
    "asyncStudio.inspect": "Просмотреть",
    "asyncStudio.replay": "Повторить локально",
    "asyncStudio.edit": "Редактировать данные",
    "asyncStudio.selectedEvent": "Подробности события {sequence}",
    "asyncStudio.eventPreview":
      "Значения выбранного события (первые 16 000 символов)",
    "asyncStudio.undo": "Отменить последнюю запись журнала",
    "asyncStudio.clear": "Очистить локальный журнал",
    "asyncStudio.previous": "Предыдущие записи журнала",
    "asyncStudio.next": "Следующие записи журнала",
    "asyncStudio.page": "Страница {page}/{total}",
    "asyncStudio.loaded": "Контракт событий загружен; журнал сброшен.",
    "asyncStudio.restored":
      "Проект событий восстановлен, проверки журнала пересчитаны.",
    "asyncStudio.created":
      "Создан пустой контракт AsyncAPI 3.1; журнал сброшен.",
    "asyncStudio.built":
      "Добавлены канал, выведенная схема сообщения и операция.",
    "asyncStudio.seedsLoaded": "JSON-примеры прочитаны из редактора OpenAPI.",
    "asyncStudio.noSeeds": "В редакторе нет подходящих JSON-примеров.",
    "asyncStudio.recorded":
      "Локальная репетиция записана. Изучите результат проверки.",
    "asyncStudio.checked":
      "Сообщение проверено без добавления записи в журнал.",
    "asyncStudio.replayed":
      "Прошлое сообщение проверено и записано как новая попытка.",
    "asyncStudio.downloaded": "Начато скачивание из студии событий.",
    "asyncStudio.finding.reference":
      "Не найдена или некорректна локальная ссылка",
    "asyncStudio.finding.external-reference": "Внешняя ссылка требует проверки",
    "asyncStudio.finding.structure":
      "Отсутствующая или неподдерживаемая структура",
    "asyncStudio.finding.traits": "Объединение traits не оценивается",
    "asyncStudio.finding.reply": "Маршрутизация ответа не репетируется",
    "asyncStudio.finding.schema-format": "Формат схемы не оценивается",
    "asyncStudio.finding.schema-keyword":
      "Ключевое слово схемы требует отдельной проверки",
    "asyncStudio.finding.schema-limit": "Обход схемы ограничен или рекурсивен",
    "asyncStudio.finding.content-type":
      "Здесь проверяются только JSON-сообщения",
    "asyncStudio.finding.correlation": "Неподдерживаемое выражение корреляции",
    "asyncStudio.finding.address":
      "Динамическому адресу требуется конкретное определение",
    "asyncStudio.error.document":
      "Используйте ограниченный документ AsyncAPI JSON/YAML с info title/version и объектами разделов. Текущая работа сохраняется.",
    "asyncStudio.error.version": "Поддерживаются AsyncAPI 2.0–2.6, 3.0 и 3.1.",
    "asyncStudio.error.limit":
      "Превышен лимит входных данных, экспорта, каналов, операций или сообщений.",
    "asyncStudio.error.json":
      "Используйте корректный ограниченный JSON с безопасными числами. Заголовки должны быть объектом.",
    "asyncStudio.error.selection":
      "Выберите операцию и сообщение её канала перед проверкой или повтором.",
    "asyncStudio.error.parameters":
      "Укажите все параметры адреса непустыми строками из описанных enum. Динамические адреса и неразрешённые скобки репетировать нельзя.",
    "asyncStudio.error.builder":
      "Для конструктора нужны уникальный идентификатор канала, конкретный адрес, название сообщения и контракт 3.x.",
    "asyncStudio.error.project":
      "Используйте проект студии событий версии 1 с упорядоченным восстанавливаемым журналом.",
    "asyncStudio.error.journal":
      "Достигнут лимит записей или размера журнала. Скачайте его, затем отмените запись или очистите журнал.",
    "asyncStudio.error.openapi":
      "Для получения JSON-примеров нужен корректный документ в редакторе OpenAPI.",
    "asyncStudio.error.download":
      "Не удалось начать скачивание. Попробуйте снова.",
    "matrix.title": "Проверки сценариев API по наборам данных",
    "matrix.description":
      "Запускайте один сценарий API по тестовым случаям JSON/CSV с изолированными переменными, индивидуальными ожиданиями и проверками ответов. Используйте Mock или управляемый пакет Live, затем экспортируйте JSON/JUnit.",
    "matrix.help":
      "Сценарии и данные матрицы хранятся во вкладке до скачивания. Проекты и экспорт сценариев содержат примеры запросов и значения строк; проверяйте их перед передачей. Отчёты не содержат этих значений, тел ответов и сеансовых заголовков, но названия и шаблоны путей могут быть частными. До 100 случаев, 20 шагов, 500 попыток шагов за запуск, 4 параллельных случаев и 5 минут общего бюджета.",
    "matrix.import.project":
      "Восстановить проект матрицы (заменяет настройки и случаи)",
    "matrix.import.scenario":
      "Импортировать сценарий API (сохраняет случаи, очищает привязки)",
    "matrix.import.dataset": "Импортировать случаи (JSON/CSV; заменяет случаи)",
    "matrix.loading": "Чтение файла матрицы…",
    "matrix.configuration": "Сценарий и тестовые случаи",
    "matrix.name": "Название проекта матрицы",
    "matrix.workflow": "Повторно используемый сценарий",
    "matrix.capture": "Прочитать эндпоинты из редактора",
    "matrix.endpoint": "Эндпоинт для добавления в сценарий",
    "matrix.addStep": "Добавить шаг эндпоинта",
    "matrix.templateHelp":
      "Новые шаги используют {{columnName}} для параметров с допустимыми именами переменных и заполняют отсутствующие столбцы примерами. Заданные значения сохраняются. Меняйте JSON для порядка шагов, тел, извлечения переменных, статусов, времени и проверок контракта или импортируйте готовый сценарий.",
    "matrix.editWorkflow": "Изменить сценарий и привязки ожиданий",
    "matrix.workflowJson": "JSON сценария (объект ApiScenario)",
    "matrix.bindingsJson": "Привязки ожиданий шагов (массив JSON)",
    "matrix.addBinding": "Добавить привязку следующего ненастроенного шага",
    "matrix.bindingHelp":
      "Привязка содержит stepId, statusVariable, mockStatusVariable, durationVariable (пустые не заменяют настройки) и assertions. Проверки: name, target, path, operator, expected, valueVariable (пустое — буквальное expected). body equals сохраняет тип JSON из valueVariable. Доступны значения случая и переменные предыдущих шагов. /items/{{index}}/id безопасно подставляет сегменты указателя. Замены статуса/времени/Mock используют только столбцы случаев.",
    "matrix.saveDefinitions": "Проверить и сохранить сценарий/привязки",
    "matrix.discardDefinitions": "Отменить правки сценария/привязок",
    "matrix.data": "Набор тестовых случаев",
    "matrix.dataFormat": "Формат вставляемого набора",
    "matrix.inferCsv": "Определять канонические числа, boolean и null в CSV",
    "matrix.dataset": "Набор тестовых случаев для загрузки",
    "matrix.useDataset": "Заменить случаи вставленным набором",
    "matrix.dataHelp":
      'JSON — массив объектов со скалярными значениями переменных, например [{"id":1,"wantedId":1},{"id":2,"wantedId":2}]. CSV требует уникальных заголовков переменных; значения остаются строками без включённого определения типов. Поддерживаются запятые/переносы в кавычках и экранированные кавычки. До 32 столбцов и 64 КиБ на случай. Общие названия случаев не копируют данные в отчёты; названия редактируются отдельно.',
    "matrix.addCase": "Добавить или скопировать выбранный случай",
    "matrix.enableAll": "Включить все случаи",
    "matrix.disableAll": "Отключить все случаи",
    "matrix.selectCase": "Настраиваемый случай",
    "matrix.caseName": "Название случая",
    "matrix.caseEnabled": "Включить случай в запуски",
    "matrix.caseValues": "Переменные выбранного случая (объект JSON)",
    "matrix.saveCase": "Проверить и сохранить переменные случая",
    "matrix.discardCase": "Отменить правки переменных случая",
    "matrix.removeCase": "Удалить выбранный случай",
    "matrix.concurrency": "Параллельных случаев (1–4)",
    "matrix.budget": "Общий бюджет запуска (1000–300000 мс)",
    "matrix.stopOnFailure":
      "Не запускать новые случаи после ошибки (активные завершатся)",
    "matrix.negativeInputs":
      "Разрешить отсутствие обязательных query/header/cookie/body для негативных тестов",
    "matrix.dirty":
      "Есть несохранённые JSON-правки сценария, привязок или случая. Проверьте или отмените их перед предпросмотром, запуском или экспортом. При смене случая черновики сохраняются.",
    "matrix.exportProject": "Скачать проект матрицы с данными",
    "matrix.exportScenario": "Скачать сценарий API",
    "matrix.execution": "Пакетный запуск",
    "matrix.mode": "Режим запуска матрицы",
    "matrix.liveHelp":
      "Live отправляет каждый включённый случай через имеющийся прокси. POST/PUT/PATCH/DELETE могут менять данные сервера и требуют флажка ниже. Сеансовые заголовки заменяют одноимённые заголовки сценария для всех шагов; для них задайте статический сервер HTTP(S). Импорт сбрасывает Live и сеансовые данные. Mock использует описанные ответы и не моделирует поведение для разных входных данных.",
    "matrix.server": "Сервер Live (обязателен для сеансовых заголовков)",
    "matrix.headers": "Общие заголовки сеанса (JSON со строковыми значениями)",
    "matrix.allowWrites": "Разрешить методы Live, изменяющие данные сервера",
    "matrix.caseCount": "Включено случаев: {enabled}/{total} · шагов: {steps}",
    "matrix.preview": "Проверить и просмотреть пакет матрицы",
    "matrix.run": "Запустить включённые случаи",
    "matrix.rerun": "Повторить только прошлые неуспешные случаи",
    "matrix.previewSummary":
      "Проверенный пакет: {cases} случаев · до {requests} попыток шагов",
    "matrix.progress":
      "Завершено случаев: {completed}/{total} · активно: {active}",
    "matrix.cancel": "Отменить запуск матрицы",
    "matrix.results": "Результаты случаев матрицы",
    "matrix.summary":
      "Успешно: {passed} · неуспешно: {failed} · ошибок: {error} · отменено: {cancelled} · пропущено: {skipped}",
    "matrix.stop.cancelled": "Запуск отменён; случаи в очереди не запущены.",
    "matrix.stop.budget": "Общий бюджет истёк; активная работа отменена.",
    "matrix.stop.failure":
      "Случай завершился неуспешно; новые случаи не запущены.",
    "matrix.exportReport": "Скачать результаты матрицы в JSON",
    "matrix.exportJUnit": "Скачать результаты JUnit XML",
    "matrix.search": "Поиск результатов случаев",
    "matrix.filter": "Фильтр исхода случая",
    "matrix.all": "Все исходы",
    "matrix.outcome.passed": "Успешно",
    "matrix.outcome.failed": "Неуспешно",
    "matrix.outcome.error": "Ошибка",
    "matrix.outcome.cancelled": "Отменено",
    "matrix.outcome.skipped": "Пропущено",
    "matrix.noMatches": "Нет подходящих результатов.",
    "matrix.unnamedAssertion": "Проверка ответа",
    "matrix.previous": "Предыдущие случаи матрицы",
    "matrix.next": "Следующие случаи матрицы",
    "matrix.page": "Страница {page}/{total}",
    "matrix.inspectInvalid": "Открыть некорректный случай {key}",
    "matrix.choicesLoaded": "Эндпоинты прочитаны из редактора.",
    "matrix.definitionsSaved": "Сценарий и привязки проверены и сохранены.",
    "matrix.datasetLoaded": "Тестовые случаи загружены.",
    "matrix.caseSaved": "Переменные случая проверены и сохранены.",
    "matrix.projectLoaded":
      "Проект матрицы восстановлен. Режим сброшен на Mock.",
    "matrix.scenarioLoaded":
      "Сценарий импортирован; данные сохранены, привязки очищены.",
    "matrix.previewReady":
      "Включённые случаи прошли предварительную проверку матрицы.",
    "matrix.completed": "Запуск матрицы завершён. Проверьте отдельные исходы.",
    "matrix.cancelled":
      "Запуск матрицы остановлен; частичные результаты доступны.",
    "matrix.downloaded": "Загрузка файла матрицы началась.",
    "matrix.error.project":
      "Используйте проект матрицы RSSwag версии 1 с допустимым сценарием, включёнными случаями и настройками запуска.",
    "matrix.error.dataset":
      "Используйте скалярные переменные с допустимыми именами, уникальные ключи случаев и корректный JSON. Текущие данные сохранены.",
    "matrix.error.csv":
      "Проверьте кавычки CSV, уникальные заголовки переменных и одинаковое число столбцов в каждой строке.",
    "matrix.error.limit":
      "Превышены ограничения исходных данных, случаев/шагов, попыток запросов или экспорта. Уменьшите пакет или отчёт.",
    "matrix.error.variables":
      "Не хватает переменной шаблона/проверки, тело JSON некорректно или отсутствует требуемое сценарием значение. Проверьте указанный случай перед запуском.",
    "matrix.error.binding":
      "Проверьте ID шагов, переменные ожиданий, определения проверок, значения ожиданий случаев и описанные варианты Mock.",
    "matrix.error.endpoint":
      "Каждый шаг должен точно соответствовать одной операции текущего редактора. Обновите API или сценарий перед запуском.",
    "matrix.error.writes":
      "Включите разрешение методов Live, меняющих данные сервера, перед их запуском.",
    "matrix.error.headers":
      "Используйте ограниченный объект JSON с уникальными допустимыми именами заголовков и строками без переносов. Для общих Live-заголовков нужен статический сервер HTTP(S) без учётных данных в URL.",
    "matrix.error.source":
      "Используйте корректный документ OpenAPI в редакторе или допустимый сервер перед запуском матрицы.",
    "matrix.error.download":
      "Не удалось начать загрузку файла матрицы. Повторите попытку.",
    "redaction.title": "Студия обезличивания данных",
    "redaction.description":
      "Подготовьте материалы API к передаче: скрывайте учётные данные, заменяйте личные данные псевдонимами и применяйте правила указателей с согласованными заменами в нескольких файлах.",
    "redaction.help":
      "Обработка выполняется во вкладке без запросов и автоматического хранения. Правила OpenAPI обрабатывают примеры, а не ограничения или имена схем; HAR — заголовки, cookies, параметры, URL и тела JSON. Поиск основан на известных именах полей и не гарантирует удаления всех частных значений. Проекты содержат исходные данные; наборы правил не включают исходные файлы. Проверяйте результаты перед передачей.",
    "redaction.import.sources": "Добавить материалы (OpenAPI, HAR, JSON)",
    "redaction.import.project": "Восстановить проект (заменяет текущую работу)",
    "redaction.import.rules":
      "Импортировать правила (заменяет правила/настройки, сохраняет материалы)",
    "redaction.loading": "Чтение файлов обработки…",
    "redaction.inputs": "Материалы и проект",
    "redaction.name": "Название проекта обработки",
    "redaction.capture": "Добавить редактор для обработки",
    "redaction.exportProject": "Скачать проект с исходными данными",
    "redaction.exportRules": "Скачать набор правил",
    "redaction.undo": "Отменить применение обработанного API",
    "redaction.pasteHeading": "Вставить материал",
    "redaction.pasteKind": "Тип вставляемого материала",
    "redaction.kind.auto": "Определить автоматически",
    "redaction.kind.openapi": "OpenAPI 3.0/3.1",
    "redaction.kind.har": "Запись HAR",
    "redaction.kind.json": "Данные JSON",
    "redaction.paste": "Текст добавляемого материала",
    "redaction.addPasted": "Добавить вставленный материал",
    "redaction.source": "Материал для просмотра",
    "redaction.sourceHeading": "Изменить исходный материал в проекте",
    "redaction.sourceName": "Название материала",
    "redaction.sourceText": "Выбранный исходный материал",
    "redaction.saveSource": "Проверить и сохранить правки материала",
    "redaction.discardSource": "Отменить правки материала",
    "redaction.removeSource": "Удалить материал из проекта",
    "redaction.automatic": "Автоматическая обработка",
    "redaction.option.secrets":
      "Скрывать известные поля учётных данных и секреты в URL",
    "redaction.option.personal":
      "Обрабатывать распространённые поля личных данных",
    "redaction.option.dropOpaqueBodies": "Удалять непрозрачные тела HAR",
    "redaction.strategy": "Способ автоматической замены",
    "redaction.action.mask": "Скрыть значения",
    "redaction.action.pseudonymize": "Использовать согласованные псевдонимы",
    "redaction.action.remove": "Удалить поле или элемент массива",
    "redaction.action.replace": "Заменить заданным JSON",
    "redaction.automaticHelp":
      "Скрытие сохраняет типы JSON, ключи и форму контейнеров: строки становятся [redacted], числа — 0, логические значения — false. Псевдонимы повторяются в пределах предпросмотра; это не шифрование и не необратимое обезличивание. Замены могут нарушать форматы, enum или ограничения примеров. Обрабатываются распространённые поля email, телефона, имени, адреса, IP и ID пользователей/клиентов/аккаунтов. Произвольный текст, бинарные тела, расширения, ограничения схем и метаданные требуют проверки.",
    "redaction.rules": "Упорядоченные правила",
    "redaction.ruleDefault": "Своё правило",
    "redaction.addRule": "Добавить правило обработки",
    "redaction.rule": "Настраиваемое правило",
    "redaction.ruleName": "Название правила",
    "redaction.enableRule": "Включить правило",
    "redaction.selector": "Шаблон указателя правила",
    "redaction.ruleAction": "Действие правила",
    "redaction.replacement": "Значение замены (JSON)",
    "redaction.saveReplacement": "Проверить и сохранить замену",
    "redaction.discardReplacement": "Отменить правки замены",
    "redaction.moveUp": "Переместить правило раньше",
    "redaction.moveDown": "Переместить правило позже",
    "redaction.removeRule": "Удалить правило",
    "redaction.ruleHelp":
      "Экранирование JSON Pointer: ~1 для /, ~0 для ~; * — один сегмент, ** — любая глубина. /**/privateNote находит поле везде. Для тел JSON в HAR используйте виртуальные пути /text/$json/поле. На узле применяется первое подходящее правило. Замена/удаление родителя прекращает правила и поиск внутри него. Правила могут затрагивать структуру; удаление обязательных полей OpenAPI блокирует экспорт/применение.",
    "redaction.dirty":
      "Есть несохранённые правки материалов или замен. Проверьте или отмените их перед предпросмотром/экспортом. При смене выбора черновики сохраняются.",
    "redaction.generate": "Предпросмотр обработанных материалов",
    "redaction.result": "Результат обработки и аудит",
    "redaction.summary":
      "Файлов: {files} · изменённых целей: {changes} · замечаний: {diagnostics}",
    "redaction.reviewHelp":
      "Предпросмотр показывает только результат. Исходные значения не включаются в отчёт, но названия и указатели могут содержать частную информацию. Отсутствие замечаний не гарантирует полноту обработки. Проверьте изменённые примеры имеющимися инструментами. Применение OpenAPI явно заменяет редактор с проверкой промежуточных правок.",
    "redaction.exportReport": "Скачать отчёт обработки",
    "redaction.exportBundle": "Скачать набор обработанных файлов",
    "redaction.output": "Обработанный материал: {name} · изменений: {count}",
    "redaction.preview": "Предпросмотр результата (первые 16 000 символов)",
    "redaction.exportFile": "Скачать выбранный обработанный материал",
    "redaction.apply": "Применить выбранный обработанный API к редактору",
    "redaction.search": "Поиск результатов обработки",
    "redaction.findingCount":
      "Изменённых целей: {total} · сохранённых записей: {shown} · видимых замечаний: {diagnostics}",
    "redaction.findings": "Записи обработки",
    "redaction.noMatches": "Нет подходящих записей обработки.",
    "redaction.previous": "Предыдущие записи обработки",
    "redaction.next": "Следующие записи обработки",
    "redaction.page": "Страница {page}/{total}",
    "redaction.category.credential": "Учётные данные",
    "redaction.category.email": "Email",
    "redaction.category.phone": "Телефон",
    "redaction.category.name": "Имя",
    "redaction.category.address": "Адрес",
    "redaction.category.ip": "IP-адрес",
    "redaction.category.identifier": "Идентификатор",
    "redaction.category.custom": "Своё правило/удаление тела",
    "redaction.diagnostic.extension":
      "Непрозрачное расширение сохранено; проверьте или задайте своё правило.",
    "redaction.diagnostic.constraint-values":
      "Возможно частные значения ограничений сохранены для сохранения контракта.",
    "redaction.diagnostic.external-example":
      "Ссылка/внешний пример не раскрыт; проверьте источник отдельно.",
    "redaction.diagnostic.opaque-body":
      "Непрозрачное, закодированное, крупное или не-JSON тело требует проверки либо явного удаления.",
    "redaction.diagnostic.url-unparsed":
      "URL не удалось разобрать; исходное значение сохранено.",
    "redaction.diagnostic.url-template":
      "Шаблонный URL сохранён; при необходимости задайте замену.",
    "redaction.diagnostic.invalid-openapi":
      "Правила удалили обязательную структуру API. Экспорт и применение заблокированы.",
    "redaction.diagnostic.custom-structure":
      "Правило затрагивает структуру или метаданные API. Проверьте контракт дополнительно к базовой проверке парсера.",
    "redaction.diagnostic.external-reference":
      "URL внешней ссылки сохранён для сохранения её смысла; проверьте его отдельно.",
    "redaction.imported": "Материалы добавлены для обработки.",
    "redaction.rulesImported":
      "Правила импортированы; текущие материалы сохранены.",
    "redaction.projectImported": "Проект обработки восстановлен.",
    "redaction.sourceSaved": "Правки материала проверены и сохранены.",
    "redaction.replacementSaved": "Значение замены проверено и сохранено.",
    "redaction.generated":
      "Предпросмотр сформирован. Проверьте результат и замечания перед передачей.",
    "redaction.downloaded": "Загрузка файла обработки началась.",
    "redaction.applied": "Обработанный API применён к редактору.",
    "redaction.undone": "Предыдущий документ редактора восстановлен.",
    "redaction.error.json":
      "Используйте корректный JSON в пределах ограничений структуры и размера. Текущая работа сохранена.",
    "redaction.error.source":
      "Используйте корректный JSON, HAR с массивом entries или OpenAPI 3.0/3.1 в JSON/YAML. Сначала преобразуйте Swagger 2 имеющимся инструментом.",
    "redaction.error.project":
      "Используйте проект или набор правил RSSwag версии 1 с уникальными ключами и корректными настройками.",
    "redaction.error.rule":
      "Проверьте названия правил, уникальные ключи, экранирование указателей, действия и заданные замены.",
    "redaction.error.limit":
      "Превышены ограничения количества, размера, вложенности, указателей или обработки. Уменьшите проект или сложность правил.",
    "redaction.error.root":
      "Правило удаляет весь документ. Выберите поле или используйте замену.",
    "redaction.error.read":
      "Не удалось прочитать файлы обработки. Текущая работа сохранена.",
    "redaction.error.download":
      "Не удалось начать загрузку файла обработки. Повторите попытку.",
    "redaction.error.changed":
      "Редактор изменился после предпросмотра. Сформируйте результат заново перед применением.",
    "redaction.error.undo":
      "После применения редактор изменился. Отмена остановлена для сохранения этих правок.",
    "consumer.title": "Проверка совместимости потребителей API",
    "consumer.description":
      "Зафиксируйте зависимости каждого клиента API и проверяйте новые определения на изменения, влияющие на этих потребителей. Сохраняйте поля ответов, примеры запросов и требования публичного доступа в профилях.",
    "consumer.help":
      "Анализ выполняется локально и не меняет редактор. Совместимость означает прохождение поддерживаемых проверок зависимостей, а не гарантию поведения сервиса. Неподдерживаемые схемы требуют проверки. Проекты содержат примеры запросов и значения enum; отчёты их не включают. До 20 потребителей, 100 зависимостей, 1000 полей и 2 МиБ на файл. Работа хранится во вкладке до скачивания.",
    "consumer.import":
      "Восстановить проект потребителей (заменяет текущие профили)",
    "consumer.loading": "Чтение файла совместимости…",
    "consumer.profiles": "Профили потребителей",
    "consumer.projectName": "Название проекта потребителей",
    "consumer.selectConsumer": "Настраиваемый потребитель",
    "consumer.defaultName": "Клиент API",
    "consumer.addConsumer": "Добавить потребителя",
    "consumer.removeConsumer": "Удалить потребителя и зависимости",
    "consumer.consumerName": "Название потребителя",
    "consumer.enableConsumer": "Включить потребителя в проверку",
    "consumer.captureHeading": "Зафиксировать зависимости из исходного API",
    "consumer.readReference": "Зафиксировать редактор как исходный API",
    "consumer.referenceTitle": "Исходный API: {title} ({version})",
    "consumer.operation": "Операция исходного API",
    "consumer.variant": "Вариант исходного ответа",
    "consumer.noBody": "Без требования к медиатипу",
    "consumer.captureStatus": "Конкретный ожидаемый статус ответа",
    "consumer.fieldsHelp":
      "Выберите только используемые клиентом поля. /* в указателе означает каждый существующий элемент массива; корневой указатель пустой. Типы, обязательность и скалярные enum станут редактируемыми требованиями. Обязательные поля должны быть доступны через всех родителей; массивы могут быть пустыми. Список ограничен 200 полями и 10 уровнями. Без полей проверяются операция, статус, медиатип и публичный доступ.",
    "consumer.selectAll": "Выбрать все поля ответа",
    "consumer.clearFields": "Снять выбор полей ответа",
    "consumer.fieldChoices": "Выбор полей ответа",
    "consumer.selectField": "Отслеживать поле ответа {pointer}",
    "consumer.root": "Корень ответа",
    "consumer.anyType": "Любой тип",
    "consumer.required": "Обязательное",
    "consumer.optional": "Необязательное",
    "consumer.noFields": "Для этого варианта нет доступных полей ответа.",
    "consumer.capture": "Добавить зависимость выбранному потребителю",
    "consumer.dependencies": "Зависимости потребителя",
    "consumer.selectContract": "Настраиваемая зависимость",
    "consumer.contractName": "Название зависимости",
    "consumer.method": "HTTP-метод зависимости",
    "consumer.path": "Шаблон пути зависимости",
    "consumer.status": "Необходимый документированный статус",
    "consumer.media": "Необходимый медиатип ответа (пустой — пропустить)",
    "consumer.enableContract": "Включить зависимость в проверку",
    "consumer.requirePublic": "Требовать вариант без авторизации",
    "consumer.fieldJson": "Требования к полям ответа (массив JSON)",
    "consumer.requestJson":
      "Пример запроса (JSON; пустой — без проверки запросов)",
    "consumer.requestHelp":
      'Формат: {"parameters":[{"name":"id","location":"path","value":1}],"body":{"mediaType":"application/json","value":{}}}. Если тела нет, опустите body. Значения — типизированные примеры JSON, не сериализованные HTTP-данные. Проверяются только заданные примеры; пустое поле оставляет проверку ответов. Сохраните или отмените JSON-правки перед проверкой/экспортом. При смене клиента правки сохраняются.',
    "consumer.save": "Проверить и сохранить JSON зависимости",
    "consumer.discard": "Отменить JSON-правки зависимости",
    "consumer.removeContract": "Удалить зависимость",
    "consumer.dirty":
      "Есть несохранённые JSON-правки зависимостей. Сохраните или отмените их перед добавлением зависимостей, проверкой кандидатов или экспортом.",
    "consumer.exportProject": "Скачать проект потребителей",
    "consumer.checkHeading": "Проверить новую версию API",
    "consumer.checkEditor": "Проверить редактор для потребителей",
    "consumer.candidate": "Проверяемое определение OpenAPI (JSON/YAML)",
    "consumer.checkPasted": "Проверить вставленное определение",
    "consumer.candidateFile": "Импортировать и проверить определение",
    "consumer.report": "Отчёт о влиянии на потребителей",
    "consumer.summary":
      "Потребители · совместимы: {compatible} · затронуты: {breaking} · требуют проверки: {review} · не проверены: {untracked}",
    "consumer.status.compatible": "Совместимо",
    "consumer.status.breaking": "Затронуто несовместимыми изменениями",
    "consumer.status.review": "Требует проверки",
    "consumer.status.untracked": "Не проверено",
    "consumer.search": "Поиск зависимостей потребителей",
    "consumer.filter": "Фильтр результата зависимости",
    "consumer.all": "Все результаты",
    "consumer.noMatches": "Нет подходящих зависимостей.",
    "consumer.fieldCount": "Отслеживаемых полей: {count}",
    "consumer.hidden": "Дополнительных замечаний: {count}",
    "consumer.previous": "Предыдущие зависимости",
    "consumer.next": "Следующие зависимости",
    "consumer.page": "Страница {page}/{total}",
    "consumer.exportReport": "Скачать JSON влияния на потребителей",
    "consumer.exportMarkdown": "Скачать список проверки выпуска",
    "consumer.preview": "Предпросмотр JSON отчёта (первые 12 000 символов)",
    "consumer.referenceLoaded":
      "Исходный API зафиксирован. Выберите операцию, ответ и отслеживаемые поля.",
    "consumer.captured": "Зависимость потребителя зафиксирована.",
    "consumer.saved": "JSON зависимости проверен и сохранён.",
    "consumer.checked": "Определение проверено по проекту потребителей.",
    "consumer.imported": "Проект потребителей восстановлен.",
    "consumer.downloaded": "Загрузка файла совместимости началась.",
    "consumer.error.source":
      "Используйте корректный OpenAPI 3.0 или 3.1 в JSON/YAML со стандартным диалектом. Сначала объедините внешние ссылки и преобразуйте Swagger 2 имеющимися инструментами.",
    "consumer.error.project":
      "Используйте проект потребителей RSSwag версии 1 с уникальными ключами потребителей/зависимостей и названиями.",
    "consumer.error.json":
      "Используйте корректный JSON в пределах ограничений размера и вложенности. Текущая работа сохранена.",
    "consumer.error.limit":
      "Проект, исходный файл или экспорт превышает ограничения количества, размера или структуры.",
    "consumer.error.contract":
      "Проверьте настройки зависимости, уникальные указатели, поддерживаемые типы, скалярные enum и типизированные примеры запросов. Статус — конкретный код 100–599.",
    "consumer.error.read":
      "Не удалось прочитать файл совместимости. Текущая работа сохранена.",
    "consumer.error.download":
      "Не удалось начать загрузку файла совместимости. Повторите попытку.",
    "consumer.finding.operation-missing": "Операция больше не описана.",
    "consumer.finding.response-missing":
      "Для нужного статуса нет описания ответа.",
    "consumer.finding.media-missing":
      "Нужный медиатип ответа больше не описан.",
    "consumer.finding.schema-unknown":
      "Схема не даёт достаточно информации для подтверждения требования.",
    "consumer.finding.field-missing": "Обязательное поле больше не объявлено.",
    "consumer.finding.field-optional":
      "Наличие поля или родительского объекта больше не гарантируется.",
    "consumer.finding.nullable-parent":
      "Родитель может быть null, поэтому поле может быть недоступно.",
    "consumer.finding.type-expanded":
      "API может вернуть тип, который потребитель не принимает.",
    "consumer.finding.enum-expanded":
      "API может вернуть значение enum, которое потребитель не принимает.",
    "consumer.finding.security-required":
      "Операция больше не предлагает вариант без авторизации.",
    "consumer.finding.request-parameter-missing":
      "В примере запроса нет обязательного параметра.",
    "consumer.finding.request-body-missing":
      "В примере запроса нет обязательного тела.",
    "consumer.finding.request-media-missing":
      "Медиатип тела запроса отсутствует или не описан.",
    "consumer.finding.request-invalid":
      "Пример запроса нарушает описанное ограничение.",
    "consumer.finding.parameter-removed":
      "Заданный параметр запроса больше не описан; проверьте, принимается ли он ещё.",
    "consumer.finding.schema-unsupported":
      "Конструкция схемы требует ручной проверки.",
    "consumer.finding.reference-unresolved":
      "Не удалось локально разрешить ссылку на схему или объект.",
    "consumer.finding.limit": "Анализ схемы достиг ограничения ресурсов.",
    "consumer.finding.deprecated":
      "Потребитель зависит от устаревающей операции.",
    "sandbox.title": "Песочница API с состоянием",
    "sandbox.description":
      "Создайте локальный макет сервиса, сохраняющий записи между запросами. Проверяйте создание, чтение, изменение и удаление с настраиваемыми ресурсами и привязками эндпоинтов.",
    "sandbox.help":
      "Всё работает в этой вкладке: без HTTP-запросов, сервера, авторизации и автоматического сохранения. Редактор не изменяется. Начните с примера задач или привяжите свои эндпоинты. Проекты и выгрузки записей содержат исходные данные, журналы — пути запросов. Проверяйте файлы перед передачей.",
    "sandbox.import":
      "Восстановить проект песочницы (заменяет настройки и текущее состояние)",
    "sandbox.loading": "Чтение проекта песочницы…",
    "sandbox.configuration": "Настройки сервиса",
    "sandbox.name": "Название песочницы",
    "sandbox.resources": "Ресурсы с начальными данными",
    "sandbox.resource": "Настраиваемый ресурс",
    "sandbox.resourceKey": "Ключ ресурса",
    "sandbox.addResource": "Добавить ресурс",
    "sandbox.removeResource": "Удалить ресурс и его маршруты",
    "sandbox.idField": "Поле идентификатора записи",
    "sandbox.idType": "Тип идентификатора записи",
    "sandbox.number": "Целое число",
    "sandbox.string": "Строка",
    "sandbox.seed": "Начальные записи (массив JSON)",
    "sandbox.seedHelp":
      "У каждой записи должен быть уникальный ID в пределах ресурса. При создании без ID генерируются возрастающие числа или строки sandbox-N. До 10 ресурсов, 500 записей на ресурс, 2000 записей всего и 512 КиБ состояния.",
    "sandbox.routes": "Привязки эндпоинтов",
    "sandbox.capture": "Прочитать эндпоинты из редактора",
    "sandbox.operation": "Эндпоинт для новой привязки",
    "sandbox.manual": "Ввести маршрут вручную",
    "sandbox.route": "Настраиваемая привязка",
    "sandbox.addRoute": "Добавить привязку к выбранному ресурсу",
    "sandbox.removeRoute": "Удалить привязку",
    "sandbox.routeMethod": "HTTP-метод привязки",
    "sandbox.routePath": "Шаблон пути привязки",
    "sandbox.routeResource": "Ресурс привязки",
    "sandbox.action": "Действие с ресурсом",
    "sandbox.action.list": "Список записей",
    "sandbox.action.read": "Прочитать запись",
    "sandbox.action.create": "Создать запись",
    "sandbox.action.replace": "Заменить запись",
    "sandbox.action.merge": "Изменить поля записи",
    "sandbox.action.delete": "Удалить запись",
    "sandbox.idParameter": "Параметр ID в пути (пустой для списка/создания)",
    "sandbox.scope": "Сопоставление родительских параметров (объект JSON)",
    "sandbox.routeHelp":
      'GET/HEAD — список или чтение, POST — создание, PUT — замена, PATCH — изменение полей, DELETE — удаление. Для /teams/{teamId}/tasks/{id} задайте {"teamId":"teamId"}, чтобы ограничить записи этим полем. Учитывайте каждый параметр пути. Статические маршруты приоритетнее пересекающихся параметризованных. До 100 привязок.',
    "sandbox.dirty":
      "Есть изменения настроек. Запустите/перезапустите песочницу, чтобы применить их и сбросить записи, или отмените правки для продолжения текущего сеанса.",
    "sandbox.start": "Проверить и запустить/перезапустить песочницу",
    "sandbox.discard": "Отменить изменения настроек",
    "sandbox.exportProject": "Скачать проект песочницы",
    "sandbox.console": "Консоль локальных запросов",
    "sandbox.consoleHelp":
      "Используйте конкретный локальный путь, например /tasks/1. Для списков доступны точные фильтры скалярных полей, повторные значения как альтернативы и _offset/_limit (по умолчанию 0/100, лимит до 500). PUT заменяет поля; PATCH объединяет поля верхнего уровня, сохраняя null. Ответы: 200, 201 при создании, 204 при удалении. Это модель поведения ресурсов, а не всего контракта OpenAPI.",
    "sandbox.method": "Метод запроса песочницы",
    "sandbox.path": "Путь и параметры запроса песочницы",
    "sandbox.body": "Тело запроса песочницы в JSON",
    "sandbox.send": "Отправить локальный запрос",
    "sandbox.undo": "Отменить последний запрос песочницы",
    "sandbox.reset": "Восстановить начальные записи",
    "sandbox.response": "Ответ песочницы",
    "sandbox.state": "Текущее состояние ресурсов",
    "sandbox.inspectResource": "Ресурс для просмотра",
    "sandbox.records": "Предпросмотр записей (первые 16 000 символов)",
    "sandbox.recordCount": "Записей: {count}",
    "sandbox.exportState": "Скачать все текущие записи",
    "sandbox.checkpoint": "Сделать текущие записи начальными и перезапустить",
    "sandbox.history": "Журнал запросов песочницы",
    "sandbox.historyHelp":
      "Снимки для отмены хранятся для последних 20 запросов. Отмена удаляет последний запрос, включая чтение и ошибки. Сброс и перезапуск очищают журнал. Тела и значения записей не экспортируются в журнал, но пути могут содержать частные ID или параметры.",
    "sandbox.emptyHistory": "Отправьте запрос, чтобы начать сценарий.",
    "sandbox.changed": "Записи изменены",
    "sandbox.unchanged": "Записи не изменены",
    "sandbox.exportLog": "Скачать журнал песочницы",
    "sandbox.started": "Песочница запущена с начальными записями.",
    "sandbox.resetDone": "Начальные записи восстановлены, журнал очищен.",
    "sandbox.undone": "Последний запрос песочницы отменён.",
    "sandbox.checkpointed":
      "Текущие записи сохранены как начальные; журнал очищен.",
    "sandbox.captured":
      "Список эндпоинтов обновлён. Выберите эндпоинт, добавьте привязку и проверьте действие и родительские параметры.",
    "sandbox.imported": "Проект восстановлен и запущен с начальными записями.",
    "sandbox.downloaded": "Загрузка файла песочницы началась.",
    "sandbox.error.json":
      "Используйте корректный JSON в пределах ограничений размера и вложенности. Текущее состояние сохранено.",
    "sandbox.error.project": "Это не проект песочницы RSSwag версии 1.",
    "sandbox.error.limit":
      "Превышен лимит файлов, записей, маршрутов или структуры. Проекты ограничены 1 МиБ, тела запросов — 64 КиБ.",
    "sandbox.error.resource":
      "Ресурсам нужны уникальные ключи (строчные латинские буквы, цифры, дефисы; первая — буква), поле и тип ID, а также массив записей JSON.",
    "sandbox.error.identity":
      "Каждой начальной записи нужен уникальный ID заданного типа: безопасное целое число или непустая строка до 256 символов. Строковый ID не может быть точечным сегментом или содержать управляющие символы.",
    "sandbox.error.route":
      "Проверьте пути, методы, действия, ресурсы, параметры ID и родительские поля. Каждый параметр пути должен соответствовать ID или отдельному полю, отличному от ID.",
    "sandbox.error.ambiguous":
      "Две привязки одного HTTP-метода пересекаются с одинаковым приоритетом. Измените или удалите одну перед запуском.",
    "sandbox.error.source":
      "Не удалось прочитать эндпоинты. Используйте корректный документ OpenAPI в пределах ограничений импорта.",
    "sandbox.error.read":
      "Не удалось прочитать проект песочницы. Текущая работа сохранена.",
    "sandbox.error.download":
      "Не удалось начать загрузку файла песочницы. Повторите попытку.",
    "composer.title": "Компоновщик API-шлюза",
    "composer.description":
      "Объедините определения независимых сервисов в один контракт OpenAPI для шлюза с префиксами маршрутов, изолированными компонентами, требованиями авторизации и списком исходных маршрутов.",
    "composer.help":
      "Инструмент создаёт контракт, но не развёртывает и не настраивает шлюз. Основные маршруты используют URL шлюза: настройте соответствующую маршрутизацию перед выполнением запросов. Данные остаются в этой вкладке до явного экспорта или применения. Проекты содержат исходные схемы, примеры и URL — проверьте их перед передачей. До 8 сервисов, 1 МиБ на источник, 1,5 МиБ суммарно и 2 МиБ на проект/результат.",
    "composer.files": "Добавить определения сервисов (JSON/YAML)",
    "composer.projectFile": "Восстановить проект компоновки (заменяет текущий)",
    "composer.loading": "Чтение файлов компоновки…",
    "composer.capture": "Добавить документ редактора как сервис",
    "composer.exportProject": "Скачать проект компоновки",
    "composer.pasteHeading": "Вставить определение сервиса",
    "composer.paste": "Добавляемое определение сервиса",
    "composer.addPasted": "Добавить вставленный сервис",
    "composer.apiTitle": "Название API шлюза",
    "composer.version": "Версия API шлюза",
    "composer.gateway": "URL сервера шлюза",
    "composer.serviceCount": "Сервисов: {count}/{max}",
    "composer.enable": "Включить {name} ({key})",
    "composer.serviceEditor": "Настройки сервиса",
    "composer.name": "Отображаемое имя сервиса",
    "composer.namespace": "Пространство имён сервиса",
    "composer.prefix": "Префикс маршрутов шлюза",
    "composer.namespaceHelp":
      "Пространства имён должны быть уникальными: строчные латинские буквы, цифры и дефисы, начиная с буквы (до 32 символов). Префикс — статический путь, например /billing; пустое значение сохраняет исходные пути. Сервисы должны использовать одну версию OpenAPI 3.0 или 3.1 и один диалект JSON Schema.",
    "composer.moveUp": "Переместить сервис выше",
    "composer.moveDown": "Переместить сервис ниже",
    "composer.remove": "Удалить сервис из компоновки",
    "composer.sourceHeading": "Редактировать определение сервиса",
    "composer.source": "Исходный текст выбранного сервиса",
    "composer.saveSource": "Проверить и использовать правки",
    "composer.revertSource": "Отменить неподтверждённые правки",
    "composer.dirty":
      "Есть неподтверждённые правки исходных текстов. Проверьте или отмените их перед компоновкой и экспортом. Переключение сервисов сохраняет эти правки.",
    "composer.generate": "Предпросмотр компоновки шлюза",
    "composer.result": "Результат компоновки шлюза",
    "composer.summary":
      "Компоновка · сервисов: {services} · маршрутов: {routes} · компонентов: {components}",
    "composer.search": "Поиск маршрутов компоновки",
    "composer.route": "Маршрут шлюза и ID операции",
    "composer.upstream": "Исходный маршрут и серверы сервиса",
    "composer.noServer": "Исходный сервер не указан",
    "composer.noRoutes": "Подходящих маршрутов нет.",
    "composer.previous": "Предыдущие маршруты компоновки",
    "composer.next": "Следующие маршруты компоновки",
    "composer.page": "Страница {page}/{total}",
    "composer.diagnosticCount":
      "Замечаний компоновки: {count} (показано {shown})",
    "composer.severity.error": "Ошибка",
    "composer.severity.warning": "Проверить",
    "composer.inspect": "Открыть сервис",
    "composer.blocked":
      "Компоновка неполна. Исправьте ошибки или исключите проблемные сервисы и повторите предпросмотр. Экспорт API и применение недоступны.",
    "composer.exportInventory": "Скачать маршруты и диагностику",
    "composer.format": "Формат составного API",
    "composer.preview":
      "Предпросмотр составного OpenAPI (первые 12 000 символов)",
    "composer.copy": "Копировать составной OpenAPI",
    "composer.download": "Скачать составной OpenAPI",
    "composer.apply": "Применить составной API в редакторе",
    "composer.applyHelp":
      "Применение заменяет документ редактора и сохраняет снимок для отмены. Если редактор изменился после предпросмотра, повторите предпросмотр. Отмена остановится, если она перезапишет последующие правки.",
    "composer.undo": "Отменить применение компоновки",
    "composer.imported": "Источники компоновки импортированы.",
    "composer.sourceSaved": "Проверенные правки включены в компоновку.",
    "composer.copied": "Составной API скопирован.",
    "composer.downloaded": "Скачивание компоновки начато.",
    "composer.applied": "Составной API применён в редакторе.",
    "composer.undone": "Предыдущий документ редактора восстановлен.",
    "composer.error.source":
      "Используйте корректный OpenAPI 3.0 или 3.1 в JSON/YAML. Swagger 2 сначала преобразуйте существующим инструментом обновления.",
    "composer.error.limit":
      "Превышен предел размера файлов, числа сервисов, операций или сложности структуры. Уменьшите проект.",
    "composer.error.project":
      "Проект компоновки или настройки сервиса некорректны. Текущие данные сохранены.",
    "composer.error.settings":
      "Введите название, версию и абсолютный HTTP(S)-URL шлюза без учётных данных, query, fragment и переменных.",
    "composer.error.empty": "Включите хотя бы один сервис в компоновку.",
    "composer.error.output":
      "Не удалось экспортировать компоновку. Исправьте замечания или уменьшите размер/сложность результата (до 2 МиБ).",
    "composer.error.read":
      "Не удалось прочитать файлы. Текущие данные сохранены.",
    "composer.error.copy":
      "Нет доступа к буферу обмена. Скачайте составной API.",
    "composer.error.download":
      "Скачивание заблокировано. Попробуйте скопировать API или скачать снова.",
    "composer.error.stale":
      "Редактор изменился после предпросмотра. Повторите предпросмотр перед применением.",
    "composer.error.undo":
      "Редактор изменился после применения. Отмена остановлена для сохранения этих правок.",
    "composer.issue.settings":
      "Исправьте пространство имён или статический префикс сервиса. Сегменты префикса не могут быть . или .., переменными, query или fragment.",
    "composer.issue.version":
      "Сервисы должны использовать одну ветку версий OpenAPI и одинаковый объявленный диалект JSON Schema. Сначала приведите их к общей версии.",
    "composer.issue.namespace":
      "Это пространство имён уже занято другим включённым сервисом. Выберите уникальное.",
    "composer.issue.collision":
      "Путь шлюза совпадает с другим, в том числе с эквивалентным шаблоном параметров. Измените префикс сервиса или исходные пути; существующий путь не перезаписывается.",
    "composer.issue.reference":
      "Локальная ссылка повреждена, ведёт за пределы сохраняемых компонентов/путей/webhooks или к метаданным, удаляемым при маршрутизации через шлюз. Исправьте ссылку.",
    "composer.issue.external":
      "Внешние или относительные ссылки нельзя безопасно перенести. Сначала соберите файлы сервиса в единый документ; ссылки автоматически не загружаются.",
    "composer.issue.pathRef":
      "Ссылки на объекты путей нужно раскрыть перед компоновкой. Вставьте объект пути, чтобы проверить маршрутизацию и наследуемые настройки.",
    "composer.issue.operationId":
      "Этот ID операции повторяется в сервисе. Задайте уникальные ID перед компоновкой.",
    "composer.issue.link":
      "Ссылка ответа не указывает на известную операцию сервиса. Исправьте operationId или локальный operationRef.",
    "composer.issue.security":
      "Требование авторизации некорректно или ссылается на отсутствующую схему. Определите схему или исправьте требование.",
    "composer.issue.schemaScope":
      "Пользовательские диалекты, ID, якоря и динамические/рекурсивные ссылки схем требуют ручной нормализации перед сменой пространства имён: область их разрешения нельзя безопасно перенести.",
    "composer.issue.discriminator":
      "Неявные соответствия discriminator могут измениться при переименовании схем. Задайте явные соответствия для каждого значения перед компоновкой.",
    "composer.issue.extensions":
      "Значения расширений сохранены как непрозрачные данные. Проверьте встроенные имена, ссылки и настройки шлюза вручную. Корневые расширения сохранены в метаданных сервиса.",
    "composer.issue.shape":
      "Путь, операция или компонент имеет неподдерживаемую или некорректную структуру. Исправьте исходное определение.",
    "migration.title": "Студия миграции Postman",
    "migration.description":
      "Преобразуйте коллекцию Postman v2.1 в черновик OpenAPI 3.1 с тегами папок, редактируемыми путями, схемами запросов и ответов, определениями авторизации и диагностикой.",
    "migration.privacy":
      "Преобразование выполняется локально в этой вкладке. Коллекции и окружения не сохраняются автоматически. Скрипты, динамические переменные и содержимое файлов не выполняются и не загружаются. До 500 запросов и 5 МиБ на импорт; результат — до 2 МиБ.",
    "migration.file": "Импорт коллекции Postman",
    "migration.pasteHeading": "Вставить JSON коллекции",
    "migration.paste": "JSON коллекции Postman",
    "migration.import": "Импортировать вставленную коллекцию",
    "migration.loading": "Чтение файла Postman…",
    "migration.imported":
      "Импорт завершён. Создайте черновик для проверки преобразования.",
    "migration.selected": "Выбрано запросов: {count}/{total}",
    "migration.apiTitle": "Название импортируемого API",
    "migration.version": "Версия импортируемого API",
    "migration.variablesHeading": "Переменные и окружение",
    "migration.variablesHelp":
      "Строковые переопределения имеют приоритет над включёнными значениями окружения, затем переменными запроса, папки и коллекции. Переменные, занимающие сегмент пути целиком, становятся параметрами OpenAPI; остальные статические переменные подставляются. Новая коллекция очищает окружение и переопределения.",
    "migration.environment": "Импорт окружения Postman",
    "migration.environmentCount": "Включённых значений окружения: {count}",
    "migration.clearEnvironment": "Очистить импортированное окружение",
    "migration.overrides":
      "Переопределения переменных миграции (JSON со строками)",
    "migration.fallback":
      "Резервный сервер для относительных или неопределённых базовых URL",
    "migration.examples": "Включить примеры query/header и необработанных тел",
    "migration.examplesHelp":
      "Примеры выключены по умолчанию. При включении они могут содержать частные данные запросов и ответов. Секреты помощников авторизации и заголовки Authorization/Cookie исключаются; URL, названия, описания и остальные поля всё равно нужно проверить перед передачей.",
    "migration.required":
      "Считать стабильно наблюдаемые поля JSON и форм обязательными",
    "migration.search": "Поиск запросов коллекции",
    "migration.selectFiltered": "Выбрать найденные запросы",
    "migration.deselectFiltered": "Снять выбор найденных запросов",
    "migration.pathHelp":
      "Оставьте переопределение пустым для исходного пути. Используйте /users/{id} для объединения конкретных маршрутов. Запросы с одинаковыми методом и путём объединяются: схемы, статусы, серверы и варианты авторизации.",
    "migration.selectRequest": "Выбрать {name} ({id})",
    "migration.pathOverride": "Переопределение пути для {name} ({id})",
    "migration.noMatches": "Подходящих запросов нет.",
    "migration.previous": "Предыдущие запросы",
    "migration.next": "Следующие запросы",
    "migration.page": "Страница {page}/{total}",
    "migration.generate": "Создать OpenAPI из коллекции",
    "migration.result": "Результат миграции Postman",
    "migration.summary":
      "Черновик миграции · запросов: {requests} · операций: {operations}",
    "migration.review":
      "Выведенные схемы описывают предоставленные примеры, а не проверенный контракт API. Параметры query/header и тела остаются необязательными. Проверьте обязательные поля, авторизацию, типы содержимого и диагностику перед использованием.",
    "migration.operations":
      "Преобразованные операции (число исходных запросов)",
    "migration.diagnostics":
      "Замечаний при преобразовании: {count} (показано {shown})",
    "migration.severity.warning": "Проверить",
    "migration.severity.error": "Ошибка",
    "migration.blocked":
      "Исправьте запросы с ошибками или снимите их выбор и создайте черновик заново. Экспорт и применение недоступны, чтобы избежать неполной миграции.",
    "migration.format": "Формат импортируемого описания",
    "migration.preview": "Предпросмотр OpenAPI (первые 12 000 символов)",
    "migration.copy": "Копировать OpenAPI из коллекции",
    "migration.download": "Скачать OpenAPI из коллекции",
    "migration.apply": "Применить импортированный API в редакторе",
    "migration.applyHelp":
      "Применение заменяет документ редактора. Отмена доступна до его изменения. Если редактор изменился после создания черновика, сначала создайте новый черновик.",
    "migration.undo": "Отменить применение миграции",
    "migration.copied": "OpenAPI из коллекции скопирован.",
    "migration.downloaded": "Скачивание OpenAPI из коллекции начато.",
    "migration.applied": "Импортированный API применён в редакторе.",
    "migration.undone": "Предыдущий документ редактора восстановлен.",
    "migration.error.json":
      "Введите корректный JSON с конечными числами, представимыми без потери точности.",
    "migration.error.limit":
      "Превышен предел размера, числа запросов, вложенности или сложности импорта.",
    "migration.error.collection":
      "Импортируйте JSON коллекции Postman v2.1 хотя бы с одним корректным запросом.",
    "migration.error.environment":
      "Импортируйте JSON окружения Postman с массивом values из именованных строковых, числовых или логических значений.",
    "migration.error.overrides":
      "Переопределения должны быть JSON-объектом с непустыми ключами и строковыми значениями.",
    "migration.error.selection":
      "Выберите хотя бы один запрос импортированной коллекции.",
    "migration.error.metadata":
      "Введите название API (до 200 символов), версию (до 80) и корректный резервный HTTP(S)-сервер, если он нужен.",
    "migration.error.output":
      "Черновик нельзя экспортировать: исправьте ошибки преобразования или уменьшите размер/сложность (максимум 2 МиБ).",
    "migration.error.read":
      "Не удалось прочитать файл Postman. Текущая миграция сохранена в этой вкладке.",
    "migration.error.copy": "Нет доступа к буферу обмена. Скачайте документ.",
    "migration.error.download":
      "Браузер заблокировал скачивание. Скопируйте документ.",
    "migration.error.stale":
      "Редактор изменился после создания черновика. Создайте новый черновик перед применением.",
    "migration.error.undo":
      "Редактор изменился после применения. Отмена остановлена, чтобы не перезаписать эти правки.",
    "migration.diagnostic.scripts":
      "Обнаружены скрипты. Скрипты перед запросами и тесты не выполняются и не переводятся; перенесите их поведение вручную.",
    "migration.diagnostic.settings":
      "Настройки протокола Postman не переносятся в контракт API.",
    "migration.diagnostic.method":
      "Метод этого запроса нельзя представить операцией OpenAPI.",
    "migration.diagnostic.url":
      "Не удалось преобразовать URL. Задайте недостающие статические переменные или резервный сервер и проверьте путь.",
    "migration.diagnostic.path":
      "Укажите абсолютный путь без query/fragment. Параметры должны занимать сегмент целиком, иметь уникальные имена из букв, цифр и подчёркиваний.",
    "migration.diagnostic.unresolved":
      "Переменная не определена, динамическая, циклическая или превышает предел подстановки. Задайте статическое переопределение и проверьте результат.",
    "migration.diagnostic.auth":
      "Эта авторизация требует ручной настройки. Операция отмечена x-postman-auth-review-required; не считайте её публичной.",
    "migration.diagnostic.headers":
      "Заголовки Authorization, Cookie или заголовки с некорректными именами исключены. Проверьте требования авторизации; схемы безопасности создаются только для поддерживаемых помощников авторизации.",
    "migration.diagnostic.body":
      "Этот режим тела запроса не поддерживается. Добавьте его контракт вручную.",
    "migration.diagnostic.sample":
      "JSON-тело не удалось безопасно проанализировать или превышен предел примеров. Тип содержимого сохранён со схемой без ограничений.",
    "migration.diagnostic.file":
      "Файловые данные представлены бинарными схемами. Локальные имена и содержимое файлов не импортируются.",
    "migration.diagnostic.response":
      "Сохранённый ответ с некорректным HTTP-статусом пропущен. Проверьте полноту ответов.",
    "migration.diagnostic.merged":
      "Запросы с одинаковыми методом и путём объединены. Проверьте схемы и варианты авторизации; для каждого типа содержимого используется первый доступный пример.",
    "migration.diagnostic.conflict":
      "Эквивалентные шаблоны пути используют разные имена параметров. Задайте одинаковое переопределение пути или снимите выбор одного запроса.",
    "migration.diagnostic.credentials":
      "Учётные данные удалены из URL сервера. Настройте авторизацию отдельно.",
    "benchmark.title": "Лаборатория производительности API",
    "benchmark.description":
      "Измеряйте производительность GET/HEAD-эндпоинтов: ограниченная нагрузка, прогрев, параллельные запросы, перцентили задержки и проверка заданных порогов.",
    "benchmark.privacy":
      "Планы, заголовки сессии и результаты остаются в этой вкладке. Автоматического запуска и сохранения нет. Отчёты содержат названия и пути операций, статусы, размеры и время; адрес сервера, значения параметров, тела ответов и заголовки в них не входят.",
    "benchmark.configure": "Настройка теста производительности",
    "benchmark.name": "Название плана тестирования",
    "benchmark.mode": "Режим выполнения теста",
    "benchmark.mode.mock": "Mock",
    "benchmark.mode.live": "Live",
    "benchmark.mockHelp":
      "Mock проверяет планировщик и пороги локально, используя описанные ответы и заданные задержки. Запросы к API не отправляются; производительность реального сервиса не измеряется.",
    "benchmark.liveHelp":
      "Запуск Live отправляет заданные GET/HEAD-запросы через существующий прокси приложения. Используйте API, которое вам разрешено тестировать. Указанный адрес заменяет серверы схемы. До 200 запросов с учётом прогрева, 5 одновременно и 10 запусков в секунду; лимит времени останавливает оставшуюся работу.",
    "benchmark.target": "Адрес сервера для тестирования",
    "benchmark.headers": "Заголовки сессии тестирования (JSON)",
    "benchmark.headersHelp":
      "Укажите публичный базовый HTTP(S)-адрес без учётных данных, строки запроса и фрагмента. Заголовки сессии заменяют одноимённые заголовки тестов и не экспортируются. Изменение адреса или импорт плана очищает их.",
    "benchmark.clearHeaders": "Очистить заголовки теста",
    "benchmark.workload": "Параметры нагрузки",
    "benchmark.setting.requests": "Измеряемые запросы",
    "benchmark.setting.warmup": "Запросы прогрева",
    "benchmark.setting.concurrency": "Максимум параллельных запросов",
    "benchmark.setting.ratePerSecond": "Максимум запусков в секунду",
    "benchmark.setting.timeoutMs": "Тайм-аут запроса (мс)",
    "benchmark.setting.maxRunMs": "Лимит времени запуска (мс)",
    "benchmark.setting.stopAfterErrors":
      "Остановить после ошибок (0 — без ограничения)",
    "benchmark.setting.maxP95Ms": "Максимум p95 (мс; 0 — без проверки)",
    "benchmark.setting.maxErrorPercent": "Максимальная доля ошибок (%)",
    "benchmark.setting.minThroughput": "Минимум запросов/с (0 — без проверки)",
    "benchmark.workloadHelp":
      "Прогрев завершается до начала измерения. Тесты чередуются с учётом веса; каждая фаза начинает последовательность заново. Частота запусков — верхняя граница, а не гарантированная пропускная способность. Результаты зависят от браузера, прокси и сети; держите вкладку активной. Тайм-ауты и лимиты отменяют незавершённые запросы.",
    "benchmark.budgets": "Пороги производительности",
    "benchmark.search": "Поиск эндпоинтов для тестирования",
    "benchmark.endpoint": "Эндпоинт для теста",
    "benchmark.chooseEndpoint": "Выберите GET/HEAD-эндпоинт",
    "benchmark.add": "Добавить тест нагрузки",
    "benchmark.addVisible": "Добавить видимые эндпоинты",
    "benchmark.caseCount": "Тестов нагрузки: {count}/10",
    "benchmark.case": "Редактируемый тест нагрузки",
    "benchmark.caseName": "Название теста нагрузки",
    "benchmark.weight": "Вес трафика (1–10)",
    "benchmark.expected": "Ожидаемые статусы",
    "benchmark.caseHelp":
      "Вес задаёт долю теста в расписании запросов. Короткий запуск может не охватить все тесты. Ожидаемые статусы: коды, диапазоны или any через запятую (например, 200,204 или 2xx). Остальные ответы считаются ошибками.",
    "benchmark.mockStatus": "Ответ Mock для теста",
    "benchmark.mockLatency": "Задержка имитации ответа (мс)",
    "benchmark.parameters": "Параметры запросов теста",
    "benchmark.parametersHelp":
      "Значения используются буквально и входят в экспорт плана. Повторяющиеся ключи запроса поддерживаются; пустые значения пропускаются. По возможности задавайте учётные данные в заголовках сессии. В Mock параметры запросов не требуются.",
    "benchmark.parameter": "Параметр запроса {index}",
    "benchmark.parameterLocation": "Расположение параметра",
    "benchmark.parameterName": "Имя параметра",
    "benchmark.parameterValue": "Значение параметра",
    "benchmark.removeParameter": "Удалить параметр теста",
    "benchmark.addParameter": "Добавить параметр теста",
    "benchmark.viewEndpoint": "Открыть эндпоинт теста",
    "benchmark.moveUp": "Переместить тест выше",
    "benchmark.moveDown": "Переместить тест ниже",
    "benchmark.remove": "Удалить тест нагрузки",
    "benchmark.endpointMissing":
      "Эта операция отсутствует в текущей схеме. Восстановите её или удалите тест перед запуском.",
    "benchmark.runMock": "Запустить тест Mock",
    "benchmark.runLive": "Запустить тест Live",
    "benchmark.running": "Выполняется…",
    "benchmark.stop": "Остановить тест",
    "benchmark.progress":
      "{phase}: завершено {done}/{total} · активно {active}",
    "benchmark.progressLabel": "Прогресс тестирования",
    "benchmark.phase.warmup": "Прогрев",
    "benchmark.phase.measured": "Измерение",
    "benchmark.finished":
      "Тест завершён. Ниже доступны метрики и результаты проверки порогов.",
    "benchmark.results": "Результаты тестирования",
    "benchmark.runSummary":
      "{mode} · Начало: {started} · Всего {elapsed} мс · Окно измерения {window} мс · Максимум параллельных запросов: {peak}",
    "benchmark.mockResults":
      "Репетиция Mock: время отражает имитацию задержек и локальную обработку в браузере, а не работу API. Эти результаты не измеряют производительность сервера.",
    "benchmark.stop.completed": "Завершено",
    "benchmark.stop.cancelled": "Остановлено пользователем",
    "benchmark.stop.time-limit": "Достигнут лимит времени",
    "benchmark.stop.error-limit": "Достигнут лимит ошибок",
    "benchmark.metric.completed": "Завершённые попытки",
    "benchmark.metric.errorRate": "Доля ошибок (%)",
    "benchmark.metric.throughput": "Пропускная способность (запросы/с)",
    "benchmark.metric.p95": "Задержка p95 (мс)",
    "benchmark.metric.mean": "Средняя задержка (мс)",
    "benchmark.metric.operation": "Операция",
    "benchmark.countSummary":
      "Успешно: {success} · С ошибками: {failed} · Отменено: {cancelled} · Прогрев: {warmup} (ошибок: {warmupErrors})",
    "benchmark.metricsHelp":
      "Задержка измеряется от отправки клиентом до завершения, включая прокси и сеть. Учитываются все завершённые измеряемые попытки, включая HTTP-ошибки, тайм-ауты и ошибки сети. Отменённые запросы и прогрев исключаются. Перцентили рассчитываются методом ближайшего ранга; малая выборка не определяет предельную нагрузку. Для пропускной способности каждого теста используется общее окно измерения.",
    "benchmark.stat.minMs": "Мин.",
    "benchmark.stat.meanMs": "Среднее",
    "benchmark.stat.p50Ms": "p50",
    "benchmark.stat.p90Ms": "p90",
    "benchmark.stat.p95Ms": "p95",
    "benchmark.stat.p99Ms": "p99",
    "benchmark.stat.maxMs": "Макс.",
    "benchmark.chart": "Задержка по номеру измеряемого запроса",
    "benchmark.chartHelp":
      "Фиолетовые точки — успешные запросы; красные — неуспешные запросы или ошибки транспорта. Наведите курсор на точку или откройте таблицу запросов.",
    "benchmark.budget.p95": "Задержка p95 (мс)",
    "benchmark.budget.errors": "Доля ошибок (%)",
    "benchmark.budget.throughput": "Пропускная способность (запросы/с)",
    "benchmark.budget.passed": "Пройдено",
    "benchmark.budget.failed": "Не пройдено",
    "benchmark.budget.disabled": "Отключено",
    "benchmark.budget.incomplete": "Незавершённый запуск / недостаточно данных",
    "benchmark.perCase": "Метрики по тестам",
    "benchmark.comparison": "Сравнение с базовым запуском",
    "benchmark.baseline": "Базовый запуск",
    "benchmark.current": "Текущий запуск",
    "benchmark.delta": "Текущий минус базовый",
    "benchmark.metricLabel": "Метрика",
    "benchmark.incompatible":
      "Режимы, параметры нагрузки, определения тестов или состояние завершения различаются. Эти разницы не являются сравнением одинаковых условий.",
    "benchmark.comparisonHelp":
      "Разницы задержек указаны в миллисекундах, доли ошибок — в процентных пунктах, пропускной способности — в запросах/с. Отчёты не содержат адресов серверов, параметров и учётных данных; совпадение настроек не подтверждает одинаковые входные данные и условия сети.",
    "benchmark.reportActions": "Действия с отчётом",
    "benchmark.pin": "Закрепить запуск как базовый",
    "benchmark.baselinePinned": "Запуск закреплён для сравнения.",
    "benchmark.pinned": "Базовый запуск: {name} · {mode} · {date}",
    "benchmark.clearBaseline": "Убрать базовый запуск",
    "benchmark.downloadJson": "Скачать отчёт JSON",
    "benchmark.downloadCsv": "Скачать отчёт CSV",
    "benchmark.copyReport": "Копировать отчёт теста",
    "benchmark.copied": "Отчёт скопирован.",
    "benchmark.downloaded": "Скачивание начато.",
    "benchmark.samples": "Запросы тестирования",
    "benchmark.sampleCase": "Фильтр тестов",
    "benchmark.allCases": "Все тесты",
    "benchmark.sampleOutcome": "Фильтр результатов запросов",
    "benchmark.outcome.all": "Все результаты",
    "benchmark.outcome.success": "Успешно",
    "benchmark.outcome.failed": "Неожиданный статус",
    "benchmark.outcome.error": "Ошибка транспорта",
    "benchmark.outcome.cancelled": "Отменено",
    "benchmark.showWarmup": "Показать запросы прогрева",
    "benchmark.sampleCount": "Подходящих запросов: {count}",
    "benchmark.column.number": "#",
    "benchmark.column.phase": "Фаза",
    "benchmark.column.operation": "Операция",
    "benchmark.column.status": "HTTP-статус",
    "benchmark.column.duration": "Задержка клиента (мс)",
    "benchmark.column.proxy": "Время прокси (мс)",
    "benchmark.column.outcome": "Результат",
    "benchmark.previous": "Предыдущие запросы",
    "benchmark.next": "Следующие запросы",
    "benchmark.downloadPlan": "Скачать план тестирования",
    "benchmark.importExport": "Импорт плана и базового запуска",
    "benchmark.importHelp":
      "Импорт плана заменяет настройки, включает Mock и очищает заголовки сессии. План содержит адрес сервера и значения параметров запросов. Импорт отчёта задаёт базовый запуск без изменения плана. Размер файла — до 2 МиБ. Сводные метрики пересчитываются по запросам.",
    "benchmark.importKind": "Тип импорта тестирования",
    "benchmark.importPlanOption": "План нагрузки",
    "benchmark.importBaselineOption": "Отчёт как базовый запуск",
    "benchmark.importJson": "JSON для импорта тестирования",
    "benchmark.import": "Импортировать JSON тестирования",
    "benchmark.importFile": "Импортировать файл тестирования",
    "benchmark.loading": "Чтение файла тестирования…",
    "benchmark.cancelImport": "Отменить импорт тестирования",
    "benchmark.importCancelled": "Импорт отменён.",
    "benchmark.planImported":
      "План импортирован в режиме Mock. Заголовки сессии очищены.",
    "benchmark.baselineImported": "Отчёт импортирован как базовый запуск.",
    "benchmark.error.invalid-plan":
      "Некорректный план. Проверьте названия, уникальность идентификаторов тестов, лимиты запросов, веса, ожидаемые статусы и параметры.",
    "benchmark.error.limit":
      "План, запрос или файл превышает лимит размера или обработки.",
    "benchmark.error.headers":
      "Заголовки сессии должны быть JSON-объектом строковых значений без повторяющихся имён и служебных заголовков транспорта.",
    "benchmark.error.target":
      "Используйте публичный HTTP(S)-адрес без учётных данных, строки запроса и фрагмента. Прокси также может отклонить недоступные или частные адреса.",
    "benchmark.error.missing-endpoint":
      "Операция отсутствует или неоднозначна в текущей схеме. Тест: {index}",
    "benchmark.error.missing-parameter":
      "Отсутствует обязательный параметр запроса. Тест: {index}",
    "benchmark.error.mock-response":
      "Выбранный ответ Mock отсутствует в схеме. Тест: {index}",
    "benchmark.error.network": "Не удалось выполнить запрос.",
    "benchmark.error.timeout": "Истёк тайм-аут запроса.",
    "benchmark.error.invalid-response":
      "Запрос вернул некорректный ответ прокси.",
    "benchmark.error.response-limit": "Ответ превысил допустимый размер.",
    "benchmark.error.cancelled": "Запрос отменён.",
    "benchmark.error.invalid-report":
      "Некорректный отчёт. Импортируйте неизменённый отчёт, экспортированный этой лабораторией.",
    "benchmark.error.read": "Не удалось выполнить операцию тестирования.",
    "benchmark.error.export":
      "Экспорт не удался. Попробуйте скопировать или скачать отчёт ещё раз.",
    "fixtures.title": "Студия тестовых данных API",
    "fixtures.description":
      "Создавайте воспроизводимые наборы тестовых данных из схем OpenAPI. Связывайте записи разных наборов, настраивайте поля и экспортируйте данные для разработки интерфейсов и автоматических тестов.",
    "fixtures.privacy":
      "Работает локально в этой вкладке. Запросы к API не отправляются, автоматического сохранения нет. Примеры и значения по умолчанию не используются; enum, константы и ваши переопределения могут содержать реальные данные. Проверяйте экспорт перед передачей.",
    "fixtures.configure": "Настройка наборов тестовых данных",
    "fixtures.capture": "Использовать текущую схему редактора",
    "fixtures.captured": "Исходная схема сохранена. Можно настроить рецепт.",
    "fixtures.sourceSummary": "{title} · источников схем: {count}",
    "fixtures.snapshot":
      "Генерация использует снимок схемы. После редактирования API создайте новый снимок; рецепт сохранится.",
    "fixtures.sourcesLimited":
      "Поиск ограничен 500 схемами или лимитом обхода. Уменьшите документ для доступа к пропущенным схемам.",
    "fixtures.noSources":
      "Модели компонентов и JSON-схемы запросов или ответов не найдены.",
    "fixtures.seed": "Начальное значение генератора",
    "fixtures.optional": "Включать необязательные свойства",
    "fixtures.search": "Поиск схем для тестовых данных",
    "fixtures.source": "Схема нового набора",
    "fixtures.chooseSource": "Выберите схему",
    "fixtures.add": "Добавить набор данных",
    "fixtures.counts": "Наборы: {datasets}/10 · Строки: {rows}/2000",
    "fixtures.dataset": "Редактируемый набор",
    "fixtures.name": "Название набора",
    "fixtures.rows": "Количество строк",
    "fixtures.direction": "Назначение схемы",
    "fixtures.direction.none": "Модель (все поля)",
    "fixtures.direction.request": "Запрос (без полей только для чтения)",
    "fixtures.direction.response": "Ответ (без полей только для записи)",
    "fixtures.nameHelp":
      "Уникальное название: латинские буквы, цифры, подчёркивания или дефисы. Первый символ — буква или подчёркивание; не более 64 символов.",
    "fixtures.rules": "Переопределения полей",
    "fixtures.rulesHelp":
      "Заменяйте поля верхнего уровня последовательностью, JSON-константой или скалярным полем другого набора. Ссылки циклически перебирают строки родительского набора. Зависимости создаются первыми; циклические ссылки запрещены.",
    "fixtures.rule": "Правило поля {index}",
    "fixtures.field": "Целевое поле",
    "fixtures.ruleType": "Тип переопределения",
    "fixtures.kind.sequence": "Последовательность",
    "fixtures.kind.constant": "JSON-константа",
    "fixtures.kind.reference": "Ссылка на набор",
    "fixtures.start": "Начало последовательности",
    "fixtures.step": "Шаг последовательности",
    "fixtures.asString": "Строковые идентификаторы",
    "fixtures.prefix": "Префикс идентификатора",
    "fixtures.constant": "Постоянное значение (JSON)",
    "fixtures.parent": "Связанный набор",
    "fixtures.chooseDataset": "Выберите набор",
    "fixtures.parentField": "Имя связанного поля",
    "fixtures.removeRule": "Удалить правило поля",
    "fixtures.addRule": "Добавить правило поля",
    "fixtures.removeDataset": "Удалить набор",
    "fixtures.generate": "Создать тестовые данные",
    "fixtures.generated":
      "Данные созданы. Проверьте диагностику перед использованием.",
    "fixtures.progress": "Генерация данных: {done}/{total} строк",
    "fixtures.loading": "Чтение рецепта…",
    "fixtures.cancel": "Отменить операцию",
    "fixtures.exportRecipe": "Скачать рецепт данных",
    "fixtures.limits":
      "До 10 наборов, 500 строк в каждом и 2000 строк всего. Вложенные массивы — до 50 элементов, объекты — до 100 свойств. Схемы и рецепты: 2 МиБ; каждый экспорт: 8 МиБ. Большие или сложные схемы могут достичь лимита обработки.",
    "fixtures.importExport": "Импорт и экспорт рецепта данных",
    "fixtures.recipeHelp":
      "Рецепт содержит начальное значение, указатели схем, настройки наборов и переопределения, включая константы. Исходная схема и созданные строки не входят в рецепт. Импорт заменяет текущий рецепт; перед генерацией загрузите совместимую схему.",
    "fixtures.recipeJson": "JSON рецепта данных",
    "fixtures.importRecipe": "Импортировать рецепт данных",
    "fixtures.importFile": "Импортировать файл рецепта",
    "fixtures.imported":
      "Рецепт импортирован. Для генерации используйте совместимую исходную схему.",
    "fixtures.results": "Созданные наборы данных",
    "fixtures.resultSeed": "Начальное значение: {seed}",
    "fixtures.resultSummary":
      "{name}: строк — {rows} · с ошибками — {invalid} · требуют проверки — {review}",
    "fixtures.validationHelp":
      "Строки проверяются встроенным валидатором приложения, который поддерживает не весь JSON Schema. Сложные композиции могут давать некорректные строки. Шаблоны, рекурсия, неразрешённые ссылки и неподдерживаемые ключевые слова требуют проверки. Экспорт включает все строки, в том числе с ошибками.",
    "fixtures.exportScope": "Набор для экспорта",
    "fixtures.allDatasets": "Все наборы (JSON-объект)",
    "fixtures.format": "Формат экспорта данных",
    "fixtures.download": "Скачать тестовые данные",
    "fixtures.copy": "Копировать тестовые данные",
    "fixtures.copied": "Данные скопированы.",
    "fixtures.downloaded": "Скачивание начато.",
    "fixtures.preview":
      "Просмотр: {name}, строки {start}–{end} из {total}. Большие значения сокращены; экспорт содержит все строки.",
    "fixtures.previewLabel": "Просмотр тестовых данных",
    "fixtures.previous": "Предыдущие строки",
    "fixtures.next": "Следующие строки",
    "fixtures.issues": "Диагностика данных ({count})",
    "fixtures.issueLocation": "{name}, строка {row}:",
    "fixtures.issuesLimited":
      "Показаны первые 200 сообщений. Счётчики учитывают все сообщения.",
    "fixtures.issue.unsupported":
      "Это ключевое слово схемы требует ручной проверки.",
    "fixtures.issue.reference": "Не удалось разрешить ссылку локально.",
    "fixtures.issue.recursive": "Рекурсивная ссылка заменена на null.",
    "fixtures.issue.depth": "Достигнут предел вложенности.",
    "fixtures.issue.pattern":
      "Генерация по регулярным выражениям не поддерживается; проверьте значение.",
    "fixtures.issue.constraint": "Генератор не смог выполнить это ограничение.",
    "fixtures.issue.validation": "Созданное значение не прошло проверку схемы.",
    "fixtures.issue.validation-limit":
      "Проверка схемы достигла лимита обработки.",
    "fixtures.error.recipe":
      "Некорректный рецепт. Проверьте уникальность названий, число строк, начальное значение, правила и JSON-константы. Набор: {dataset}",
    "fixtures.error.source":
      "Редактор должен содержать корректный документ OpenAPI или Swagger в формате JSON или YAML.",
    "fixtures.error.limit":
      "Схема, рецепт, данные или объём вычислений превышают лимит. Уменьшите размер или сложность.",
    "fixtures.error.missing-source":
      "Схема набора отсутствует в текущем снимке. Набор: {dataset}",
    "fixtures.error.cycle":
      "Ссылки между наборами образуют цикл. Удалите циклическую ссылку. Набор: {dataset}",
    "fixtures.error.reference":
      "Связанный набор или поле отсутствует, содержит null или нескалярное значение. Набор: {dataset}",
    "fixtures.error.field":
      "Переопределения требуют объектной схемы с выбранным полем верхнего уровня. Набор: {dataset}",
    "fixtures.error.cancelled": "Операция отменена.",
    "fixtures.error.csv":
      "Для NDJSON или CSV выберите один набор. CSV поддерживает до 64 столбцов.",
    "fixtures.error.read": "Не удалось выполнить операцию с тестовыми данными.",
    "fixtures.error.export":
      "Экспорт не удался. Попробуйте копирование или скачивание.",
    "parity.title": "Сравнение окружений API",
    "parity.description":
      "Сравнивайте одинаковые GET/HEAD-запросы в двух окружениях. Находите различия статусов, ответов, контрактов и задержек перед выпуском изменений API.",
    "parity.privacy":
      "Планы и результаты хранятся в памяти вкладки: экспортируйте их перед уходом. Значения ответов удаляются после сравнения; отчёты содержат пути полей и метаданные. История запросов не пополняется; автоматических запросов нет.",
    "parity.configure": "Настройка сравнения окружений",
    "parity.name": "Название плана сравнения",
    "parity.mode": "Режим сравнения",
    "parity.mock": "Mock",
    "parity.live": "Live",
    "parity.baseline": "Базовое окружение",
    "parity.candidate": "Проверяемое окружение",
    "parity.baselineUrl": "URL базового сервера",
    "parity.candidateUrl": "URL проверяемого сервера",
    "parity.liveHelp":
      "Запуск Live-сравнения отправляет до двух запросов на случай, начиная с базового окружения, через существующий серверный прокси. Поддерживаются только GET и HEAD. Укажите публичные HTTP(S) URL без учётных данных, строки запроса и фрагмента. Эти URL заменяют серверы схемы.",
    "parity.mockHelp":
      "Mock сравнивает документированные варианты ответов локально. URL серверов, авторизация и обязательные значения запросов не нужны. Выберите разные варианты для проверки расхождений. Mock не проверяет развёрнутые окружения и задержки.",
    "parity.credentials": "Сессионные заголовки окружений",
    "parity.credentialsHelp":
      "Введите JSON-объект со строковыми значениями заголовков, например Authorization. Заголовки окружения заменяют одноимённые заголовки случая. Они не экспортируются и не сохраняются. Изменение URL очищает его заголовки; импорт плана очищает оба набора и выбирает режим Mock.",
    "parity.baselineHeaders": "Сессионные заголовки базового окружения (JSON)",
    "parity.candidateHeaders":
      "Сессионные заголовки проверяемого окружения (JSON)",
    "parity.clearHeaders": "Очистить сессионные заголовки",
    "parity.rules": "Правила сравнения",
    "parity.timeout": "Тайм-аут запроса (мс)",
    "parity.slowdown": "Допустимое замедление (мс; 0 отключает)",
    "parity.ignorePaths": "Игнорируемые JSON Pointer тела (по одному в строке)",
    "parity.ignoreHeaders": "Игнорируемые заголовки ответа (через запятую)",
    "parity.rulesHelp":
      "Указатель исключает поле и вложенные значения из структурного сравнения JSON; шаблоны не поддерживаются. Некорректный JSON и JSON с неточными числами сравниваются как текст. Регистр имён заголовков не важен. Задержка измеряется одним последовательным запросом и не является нагрузочным тестом. Исключения не отключают проверку контрактов.",
    "parity.checkContract": "Проверять контракты обоих ответов",
    "parity.compareHeaders": "Сравнивать заголовки ответов",
    "parity.stopOnFailure": "Остановиться после первого несовпадения",
    "parity.search": "Поиск эндпоинтов для сравнения",
    "parity.endpoint": "Эндпоинт для сравнения",
    "parity.noEndpoints": "Нет подходящих GET/HEAD-эндпоинтов",
    "parity.add": "Добавить случай сравнения",
    "parity.addVisible": "Добавить видимые GET/HEAD-эндпоинты",
    "parity.clear": "Очистить случаи сравнения",
    "parity.count": "Случаи сравнения: {count}/{max}",
    "parity.cases": "Порядок случаев сравнения",
    "parity.up": "Переместить случай сравнения {index} вверх",
    "parity.down": "Переместить случай сравнения {index} вниз",
    "parity.remove": "Удалить случай сравнения {index}",
    "parity.editCase": "Редактировать случай сравнения",
    "parity.caseName": "Название случая сравнения",
    "parity.viewEndpoint": "Открыть сравниваемый эндпоинт",
    "parity.duplicate": "Дублировать случай сравнения",
    "parity.parametersHelp":
      "Значения случая отправляются в оба окружения и включаются в экспорт плана. Учётные данные вводите в сессионные заголовки. Пустые значения пропускаются; Live требует заполнения всех обязательных параметров.",
    "parity.parameterLocation": "Расположение параметра {index}",
    "parity.parameterName": "Имя параметра {index}",
    "parity.parameterValue": "Значение параметра {index}",
    "parity.removeParameter": "Удалить параметр {index}",
    "parity.addParameter": "Добавить параметр сравнения",
    "parity.baselineMock": "Mock-ответ базового окружения",
    "parity.candidateMock": "Mock-ответ проверяемого окружения",
    "parity.portable": "Импорт и экспорт плана сравнения",
    "parity.portableHelp":
      "Определения содержат URL окружений, значения параметров и правила сравнения. Проверьте их перед передачей. Сессионные заголовки и результаты исключены. Импорт заменяет план только после успешной проверки.",
    "parity.file": "Импорт файла плана сравнения",
    "parity.input": "JSON плана сравнения",
    "parity.import": "Импортировать план сравнения",
    "parity.imported":
      "План сравнения импортирован. Сессионные заголовки очищены, выбран режим Mock.",
    "parity.copyPlan": "Скопировать план сравнения",
    "parity.downloadPlan": "Скачать план сравнения",
    "parity.runLive": "Запустить Live-сравнение",
    "parity.runMock": "Запустить Mock-сравнение",
    "parity.loading": "Чтение плана сравнения…",
    "parity.caseNumber": "Случай {index}",
    "parity.results": "Результаты сравнения окружений",
    "parity.progress": "Завершено случаев: {done}/{total}",
    "parity.finished": "Сравнение {mode}: {outcome}",
    "parity.report.matched": "все случаи совпали",
    "parity.report.failed": "требуется проверка",
    "parity.report.cancelled": "отменено",
    "parity.resultHelp":
      "Совпадение означает согласие выбранных проверок; одинаковые ответы с ошибками также могут совпасть. Контракт проверяется по схеме на момент запуска: статус, тип содержимого, верхний уровень тела и обязательные поля. Это не полная проверка схемы. Для просмотра значений ответа используйте инструменты эндпоинта.",
    "parity.resultSearch": "Поиск результатов сравнения",
    "parity.resultFilter": "Фильтр результатов сравнения",
    "parity.outcome.all": "Все результаты",
    "parity.outcome.issues": "Требуют проверки",
    "parity.outcome.matched": "Совпало",
    "parity.outcome.different": "Различается",
    "parity.outcome.inconclusive": "Не определено",
    "parity.outcome.error": "Ошибка запроса",
    "parity.outcome.cancelled": "Отменено",
    "parity.outcome.skipped": "Пропущено",
    "parity.column.case": "Случай",
    "parity.column.outcome": "Результат",
    "parity.column.baseline": "Базовое: статус / время",
    "parity.column.candidate": "Проверяемое: статус / время",
    "parity.column.delta": "Изменение времени",
    "parity.noResults": "Нет результатов для выбранных фильтров.",
    "parity.limited":
      "Достигнуты ограничения сравнения. Эти результаты не доказывают полное равенство.",
    "parity.slowdownFailed":
      "Проверяемое окружение превысило допустимый рост задержки.",
    "parity.bodyMode": "Режим сравнения тела: {mode}",
    "parity.bytes": "Тело: {bytes} байт",
    "parity.contractCounts":
      "Контракт: успешно {passed}, ошибок {failed}, пропущено {skipped}",
    "parity.contractOff": "Проверка контрактов отключена",
    "parity.differences": "Найдено различий: {count}",
    "parity.area.body": "Тело",
    "parity.area.headers": "Заголовки",
    "parity.area.status": "Статус",
    "parity.kind.added": "Добавлено",
    "parity.kind.removed": "Удалено",
    "parity.kind.changed": "Изменено",
    "parity.root": "(корень тела)",
    "parity.copyReport": "Скопировать отчёт сравнения",
    "parity.downloadReport": "Скачать отчёт сравнения",
    "parity.running": "Сравнение случая {index}/{total} · {side}",
    "parity.starting": "Подготовка сравнения…",
    "parity.cancel": "Отменить сравнение окружений",
    "parity.copied": "Скопировано в буфер обмена.",
    "parity.downloaded": "Скачивание началось.",
    "parity.error.invalid-plan":
      "Некорректный план сравнения. Проверьте название, GET/HEAD-случаи, уникальные ID, параметры, указатели, тайм-аут (1 000–30 000 мс) и допустимое замедление (0–60 000 мс).",
    "parity.error.limit":
      "Достигнут предел сравнения: 20 случаев или 2 МиБ на план.",
    "parity.error.headers":
      "Сессионные заголовки должны быть JSON-объектом со строковыми значениями и уникальными именами. Используйте символы HTTP-заголовков (Latin-1); управляющие символы и транспортные заголовки, например Host, запрещены.",
    "parity.error.target":
      "Укажите публичный HTTP(S) URL без учётных данных, строки запроса и фрагмента. Прокси также отклоняет адреса частных сетей.",
    "parity.error.missing-endpoint":
      "Случай больше не соответствует ровно одной GET/HEAD-операции текущей схемы. Обновите план перед запуском.",
    "parity.error.missing-parameter":
      "Не заполнен обязательный параметр окружения или подстановка в пути. Заполните значения случая или сессионные заголовки.",
    "parity.error.mock-response":
      "Выбранный Mock-ответ больше не документирован. Выберите доступный вариант.",
    "parity.error.network":
      "Не удалось выполнить запрос. Проверьте окружение и соединение, затем повторите запуск.",
    "parity.error.timeout": "Время ожидания запроса истекло.",
    "parity.error.invalid-response":
      "Запрос вернул некорректный результат, который нельзя сравнить.",
    "parity.error.response-limit":
      "Ответ превысил допустимый размер тела или заголовков.",
    "parity.error.cancelled":
      "Сравнение отменено; новые запросы не будут запущены.",
    "parity.error.stopped": "Пропущено из-за несовпадения предыдущего случая.",
    "parity.error.read": "Не удалось прочитать план. Попробуйте вставить JSON.",
    "parity.error.copy": "Не удалось скопировать. Попробуйте скачать.",
    "parity.error.download":
      "Браузер заблокировал скачивание. Попробуйте скопировать.",
    "transform.title": "Мастер преобразования API",
    "transform.description":
      "Создавайте повторно используемые рецепты JSON Patch для вариантов API, обновления метаданных и изменения структуры. Просматривайте изменения до применения.",
    "transform.help":
      "Работает локально со снимком редактора. Рецепты и снимки хранятся в памяти: экспортируйте их перед уходом. После применения действует обычное сохранение редактора. Значения могут содержать конфиденциальные данные. Форматирование JSON/YAML и комментарии не сохраняются. Ссылки не обновляются автоматически: проверьте результат средствами контроля качества.",
    "transform.capture": "Использовать текущий редактор как источник",
    "transform.source": "Источник: {title}",
    "transform.captured":
      "Источник сохранён. Рецепт остался прежним; создайте новый предпросмотр перед применением.",
    "transform.undo": "Отменить применение преобразования",
    "transform.importHeading": "Импорт рецепта JSON Patch",
    "transform.file": "Файл JSON с рецептом",
    "transform.input": "JSON рецепта",
    "transform.import": "Импортировать вставленный рецепт",
    "transform.loading": "Чтение рецепта…",
    "transform.imported":
      "Рецепт импортирован. Шаги заменены; редактор не изменён.",
    "transform.add": "Добавить шаг преобразования",
    "transform.versionTemplate": "Добавить изменение версии",
    "transform.serverTemplate": "Добавить изменение корневого сервера",
    "transform.clear": "Очистить рецепт",
    "transform.steps": "Шаги рецепта: {count}/{max}",
    "transform.empty":
      "Добавьте шаг, выберите заготовку или импортируйте массив JSON Patch.",
    "transform.recipe": "Порядок шагов преобразования",
    "transform.root": "(корень документа)",
    "transform.up": "Переместить шаг {step} вверх",
    "transform.down": "Переместить шаг {step} вниз",
    "transform.remove": "Удалить шаг {step}",
    "transform.edit": "Редактировать шаг {step}",
    "transform.operation": "Операция Patch",
    "transform.path": "Целевой JSON Pointer",
    "transform.from": "Исходный JSON Pointer",
    "transform.value": "Значение шага (JSON)",
    "transform.duplicate": "Дублировать выбранный шаг",
    "transform.op.add": "Вставить или задать значение",
    "transform.op.replace": "Заменить существующее значение",
    "transform.op.remove": "Удалить существующее значение",
    "transform.op.copy": "Скопировать значение",
    "transform.op.move": "Переместить значение",
    "transform.op.test": "Проверить ожидаемое значение",
    "transform.opHelp.add":
      "Задаёт свойство объекта или вставляет элемент массива. Родитель должен существовать. /- добавляет в конец массива.",
    "transform.opHelp.replace":
      "Заменяет существующую цель. Если цель отсутствует, рецепт останавливается.",
    "transform.opHelp.remove":
      "Удаляет существующую цель. Индексы массива после удаления сдвигаются.",
    "transform.opHelp.copy":
      "Копирует исходное значение в цель по правилам add. Изменения копии не затрагивают оригинал.",
    "transform.opHelp.move":
      "Удаляет исходное значение и добавляет его в цель. Индексы цели вычисляются после удаления. Ссылки не обновляются.",
    "transform.opHelp.test":
      "Останавливает рецепт, если цель не равна указанному JSON. Подходит для проверки версии API и других предположений.",
    "transform.browser": "Обзор JSON Pointer источника",
    "transform.pointerHelp":
      "Показан снимок до выполнения шагов. Заменяйте / на ~1, а ~ на ~0. Пустой указатель задаёт весь документ, / — свойство с пустым именем. URI-фрагменты (#/…) не поддерживаются.",
    "transform.search": "Поиск указателей источника",
    "transform.matches": "Показано {shown} из {count} подходящих указателей",
    "transform.use": "Выбрать целью",
    "transform.useSource": "Выбрать источником",
    "transform.usePath": "Использовать {path} как целевой указатель",
    "transform.useFrom": "Использовать {path} как исходный указатель",
    "transform.preview": "Предпросмотр преобразования",
    "transform.copyRecipe": "Скопировать JSON рецепта",
    "transform.downloadRecipe": "Скачать JSON рецепта",
    "transform.ready":
      "Предпросмотр готов. Результат прошёл структурные проверки редактора; проверьте ссылки и семантику API перед применением.",
    "transform.stepError": "Шаг {step}:",
    "transform.result": "Предпросмотр преобразования API",
    "transform.changeCount": "Изменений документа: {count}",
    "transform.truncated":
      "Показаны первые 200 изменений. Экспорт содержит все изменения.",
    "transform.noChanges": "Рецепт не меняет данные документа.",
    "transform.kind.added": "Добавлено",
    "transform.kind.removed": "Удалено",
    "transform.kind.changed": "Изменено",
    "transform.before": "До",
    "transform.after": "После",
    "transform.format": "Формат преобразованной схемы",
    "transform.output": "Просмотр преобразованной схемы",
    "transform.previewLimit":
      "Показаны первые 50 000 символов. Копирование и скачивание содержат всю схему.",
    "transform.copyDocument": "Скопировать преобразованную OpenAPI",
    "transform.downloadDocument": "Скачать преобразованную OpenAPI",
    "transform.apply": "Применить преобразование к редактору",
    "transform.applied":
      "Преобразование применено. Отмена доступна до изменения редактора.",
    "transform.undone": "Предыдущий текст редактора восстановлен.",
    "transform.copied": "Скопировано в буфер обмена.",
    "transform.downloaded": "Скачивание началось.",
    "transform.error.limit":
      "Достигнут предел: 2 МиБ для ввода/рецепта, 100 шагов, 50 000 узлов JSON или 64 уровня вложенности. Результат ограничен 8 МиБ.",
    "transform.error.json":
      "Введите корректный JSON с конечными, точно представимыми числами и без циклических значений.",
    "transform.error.recipe":
      "Ожидается массив JSON Patch с операциями add, remove, replace, copy, move или test и обязательными полями.",
    "transform.error.pointer":
      "Некорректный JSON Pointer. Используйте пустой указатель или путь с / в начале и экранированием ~0 и ~1.",
    "transform.error.missing":
      "Цель, источник или родитель отсутствует. Проверьте путь и порядок предыдущих шагов.",
    "transform.error.index":
      "Некорректный индекс массива. Используйте существующий неотрицательный индекс без ведущих нулей; add принимает длину массива или - для добавления в конец.",
    "transform.error.descendant":
      "Нельзя переместить значение внутрь самого себя.",
    "transform.error.test":
      "Ожидаемое значение не совпадает. Рецепт остановлен без изменения редактора.",
    "transform.error.source":
      "Источником должен быть документ OpenAPI JSON или YAML, принимаемый редактором.",
    "transform.error.result":
      "Результат не является документом OpenAPI, принимаемым редактором. Исправьте рецепт перед экспортом или применением.",
    "transform.error.read":
      "Не удалось прочитать рецепт. Попробуйте вставить JSON.",
    "transform.error.copy": "Не удалось скопировать. Попробуйте скачать.",
    "transform.error.download":
      "Браузер заблокировал скачивание. Попробуйте скопировать.",
    "transform.error.stale":
      "Редактор изменился после создания снимка. Используйте текущий редактор как источник и создайте новый предпросмотр.",
    "transform.error.undo":
      "Редактор изменился после применения. Отмена остановлена для сохранения этих правок.",
    "discovery.title": "Создание OpenAPI из трафика",
    "discovery.description":
      "Создайте черновик OpenAPI 3.1 из HAR браузера, проверьте шаблоны путей и определите структуру запросов и ответов. Обработка локальная; импорт не отправляет запросов к API.",
    "discovery.privacy":
      "Значения тел, query-параметров, заголовков и cookie не сохраняются и не добавляются как примеры. Имена хостов, пути и имена полей остаются видимыми и входят в документ. Проверьте их перед передачей. Данные хранятся в памяти; экспортируйте определение до закрытия страницы.",
    "discovery.file": "Импорт HAR для создания API",
    "discovery.paste": "Вставить HAR",
    "discovery.input": "HAR JSON для создания API",
    "discovery.import": "Создать API из вставленного HAR",
    "discovery.clear": "Очистить захват трафика",
    "discovery.loading": "Чтение захвата трафика…",
    "discovery.configure": "Настройка обнаруженного API",
    "discovery.counts":
      "Запросов: {count} · Пропущено: {skipped} · Предупреждений: {warnings}",
    "discovery.origin": "Источник API",
    "discovery.prefix": "Перенести префикс пути в URL сервера",
    "discovery.apiTitle": "Название обнаруженного API",
    "discovery.version": "Версия обнаруженного API",
    "discovery.scopeHelp":
      "Выберите один источник. Префикс, например /api, выбирает поддерево путей и переносится в URL сервера. Изменение источника, префикса или группировки сбрасывает правки и выбор маршрутов.",
    "discovery.parameterize": "Предлагать параметры пути для чисел и UUID",
    "discovery.required":
      "Считать обязательными поля, присутствующие во всех наблюдениях",
    "discovery.inferenceHelp":
      "Это черновик по наблюдениям, а не полный контракт. Проверьте ID, необязательные поля, авторизацию и ограничения. Заменяйте целые сегменты пути на {parameterName}; остальные сегменты должны совпадать с захваченными путями. Совпадающие метод и шаблон объединяются.",
    "discovery.routes": "Выбрано маршрутов: {selected}/{total}",
    "discovery.search": "Поиск обнаруженных маршрутов",
    "discovery.searchPlaceholder":
      "Метод, шаблон пути, захваченный путь или HTTP-статус",
    "discovery.select": "Выбрать найденные маршруты",
    "discovery.exclude": "Исключить найденные маршруты",
    "discovery.table": "Обнаруженные маршруты API",
    "discovery.include": "Включить",
    "discovery.route": "Метод и шаблон пути",
    "discovery.evidence": "Наблюдаемый трафик",
    "discovery.includeRoute": "Включить {route}",
    "discovery.template": "Шаблон пути для {route}",
    "discovery.observedPaths": "Наблюдаемые пути (до 10)",
    "discovery.samples": "Наблюдений: {count}",
    "discovery.noMatches": "Нет маршрутов в выбранной области или по запросу.",
    "discovery.previous": "Предыдущие маршруты",
    "discovery.next": "Следующие маршруты",
    "discovery.page": "Страница {current} из {total}",
    "discovery.build": "Создать черновик OpenAPI",
    "discovery.warnings": "Предупреждения захвата и анализа",
    "discovery.warningHelp":
      "Предупреждения относятся ко всему захвату, включая исключённые маршруты. Показаны первые 100. Отсутствующие, некорректные, неподдерживаемые или слишком большие тела сохраняют тип содержимого с общей схемой.",
    "discovery.warningRow": "Запись {entry} · {part}",
    "discovery.part.request": "запрос",
    "discovery.part.response": "ответ",
    "discovery.part.entry": "запись",
    "discovery.warning.skipped":
      "Пропущен некорректный запрос, неподдерживаемый метод или ответ без HTTP-статуса.",
    "discovery.warning.missing": "Содержимое тела JSON не было захвачено.",
    "discovery.warning.invalid":
      "Тело не является поддерживаемым JSON, содержит неточные числа или неверную кодировку.",
    "discovery.warning.unsupported":
      "Структура определяется только для JSON; другое содержимое сохраняет общую схему.",
    "discovery.warning.limit":
      "Достигнуты ограничения анализа тела или query-параметров.",
    "discovery.warning.media":
      "Нет подходящего типа содержимого; тело пропущено.",
    "discovery.ready":
      "Черновик готов · Операций: {count} · Наблюдений: {observations}",
    "discovery.format": "Формат обнаруженного определения",
    "discovery.preview": "Просмотр созданного определения",
    "discovery.previewText": "Созданное определение OpenAPI",
    "discovery.previewLimit":
      "Показаны первые 50 000 символов. Копирование и скачивание включают полный документ.",
    "discovery.copy": "Копировать обнаруженный OpenAPI",
    "discovery.download": "Скачать обнаруженный OpenAPI",
    "discovery.applyHelp":
      "Применение заменит содержимое редактора черновиком с обычным поведением сохранения. Отмена доступна, пока редактор совпадает с применённым черновиком.",
    "discovery.apply": "Применить обнаруженный API в редакторе",
    "discovery.undo": "Отменить применение обнаруженного API",
    "discovery.imported":
      "Захват импортирован. Проверьте маршруты перед созданием черновика.",
    "discovery.exported": "Созданное определение экспортировано.",
    "discovery.applied": "Обнаруженный API применён в редакторе.",
    "discovery.restored": "Предыдущее содержимое редактора восстановлено.",
    "discovery.error.invalid-har":
      "Укажите объект HAR, содержащий log.entries.",
    "discovery.error.too-large":
      "Входной файл — до 5 МиБ; созданный документ — до 10 МиБ.",
    "discovery.error.too-many":
      "Поддерживается до 1 000 записей и 500 маршрутов. Сократите захват или область.",
    "discovery.error.no-requests":
      "Не найдены поддерживаемые HTTP-запросы с ответами.",
    "discovery.error.origin": "Выберите источник из захвата.",
    "discovery.error.prefix":
      "Префикс должен начинаться с / и не содержать пробелы, query, фрагменты, обратные слеши или фигурные скобки.",
    "discovery.error.template":
      "Шаблон должен соответствовать всем исходным путям. Используйте уникальные имена целых сегментов, например {userId}; остальные сегменты не меняйте.",
    "discovery.error.conflict":
      "Эквивалентные пути имеют разные имена параметров. Укажите одинаковые шаблоны или исключите один.",
    "discovery.error.empty": "Выберите хотя бы один маршрут.",
    "discovery.error.metadata":
      "Укажите название API (до 200 символов) и версию (до 80 символов).",
    "discovery.error.read":
      "Не удалось прочитать захват. Текущий черновик сохранён.",
    "discovery.error.export":
      "Не удалось экспортировать определение. Попробуйте другой способ экспорта.",
    "discovery.error.undo":
      "Редактор изменён после применения. Отмена перезаписала бы эти изменения.",
    "bundle.title": "Многофайловый OpenAPI-проект",
    "bundle.description":
      "Импортируйте или создавайте локальные файлы YAML/JSON, разрешайте ссылки и собирайте единый документ API. Файлы хранятся во вкладке до экспорта; автоматических сетевых запросов нет.",
    "bundle.edit": "Редактирование многофайлового проекта",
    "bundle.importFiles": "Импорт файлов определений",
    "bundle.importFolder": "Импорт папки определений",
    "bundle.importHelp":
      "Импорт папки сохраняет относительные пути и включает только .json, .yaml и .yml. После импорта выберите корневой документ API. Регистр букв в путях имеет значение.",
    "bundle.replace": "Заменять совпадающие файлы при импорте или добавлении",
    "bundle.newPath": "Путь нового файла",
    "bundle.addFile": "Создать файл проекта",
    "bundle.useEditor": "Скопировать редактор в файл проекта",
    "bundle.fileCount": "Файлов проекта: {count}/50",
    "bundle.root": "Корневой документ API",
    "bundle.chooseRoot": "Выберите корневой документ",
    "bundle.selected": "Выбранный файл проекта",
    "bundle.removeFile": "Удалить выбранный файл проекта",
    "bundle.source": "Исходный текст: {file}",
    "bundle.build": "Собрать документ со ссылками",
    "bundle.projectSharing": "Сохранение и восстановление проекта",
    "bundle.projectHelp":
      "Экспорт проекта включает все файлы целиком, в том числе неиспользуемые файлы и конфиденциальные примеры. Импорт заменяет этот проект, не меняя основной редактор. Экспортируйте проект перед закрытием страницы.",
    "bundle.copyProject": "Копировать JSON проекта",
    "bundle.downloadProject": "Скачать JSON проекта",
    "bundle.importProject": "Восстановить проект из JSON",
    "bundle.imported":
      "Файлы импортированы. Проверьте корневой документ и выполните сборку.",
    "bundle.loading": "Чтение файлов проекта…",
    "bundle.exported": "Экспорт завершён.",
    "bundle.exportFailed":
      "Ошибка экспорта. Повторите копирование или скачивание.",
    "bundle.ready": "Документ собран · ссылок: {refs} · файлов: {files}",
    "bundle.blocked": "Сборка заблокирована · проблем: {issues}",
    "bundle.issues": "Диагностика сборки",
    "bundle.issueLimit":
      "Показаны первые 100 проблем. Исправьте их и повторите сборку.",
    "bundle.unused": "Неиспользуемые файлы: {files}",
    "bundle.search": "Поиск ссылок сборки",
    "bundle.filter": "Фильтр разрешения ссылок",
    "bundle.all": "Все ссылки",
    "bundle.resolved": "Разрешена",
    "bundle.unresolved": "Не разрешена",
    "bundle.matches": "Найдено ссылок: {count}",
    "bundle.references": "Карта ссылок сборки",
    "bundle.from": "Исходное расположение",
    "bundle.to": "Исходная ссылка",
    "bundle.outputRef": "Ссылка в сборке",
    "bundle.tableLimit":
      "Показаны первые 100 совпадений. Уточните поиск, чтобы найти другие ссылки.",
    "bundle.outputHelp":
      "Фрагменты размещаются в {namespace}; исходные поля и соседние поля ссылок сохраняются. Циклы остаются ссылками. Относительные ссылки разрешаются от папки исходного файла. Неподдерживаемые идентификаторы ресурсов и якоря нужно устранить до сборки.",
    "bundle.format": "Формат собранного документа",
    "bundle.preview": "Просмотр собранного документа",
    "bundle.previewText": "Предпросмотр собранного документа",
    "bundle.previewLimit":
      "Предпросмотр ограничен 50 000 символами; экспорт содержит весь документ.",
    "bundle.copy": "Копировать собранный документ",
    "bundle.download": "Скачать собранный документ",
    "bundle.applyHelp":
      "Применение заменяет основной редактор сборкой. Предыдущий текст сохраняется во вкладке для одной отмены; последующие правки блокируют отмену, чтобы не затереть их. Для длительного хранения скопируйте или скачайте резервную копию.",
    "bundle.apply": "Применить сборку к редактору",
    "bundle.applied": "Сборка применена к редактору.",
    "bundle.invalidOutput":
      "Сборка не соответствует минимальным требованиям редактора к документу. Её можно экспортировать для проверки.",
    "bundle.undo": "Отменить применение сборки",
    "bundle.undoChanged":
      "После применения сборки основной редактор изменился. Отмена заблокирована для сохранения правок.",
    "bundle.restored": "Предыдущий документ редактора восстановлен.",
    "bundle.error.path":
      "Используйте относительный путь без обратных слешей, синтаксиса URL и выхода за пределы проекта.",
    "bundle.error.duplicate":
      "Файл с этим путём уже существует. Включите замену или выберите другой путь.",
    "bundle.error.limit":
      "Превышено ограничение: 50 файлов, 2 МиБ на файл, 8 МиБ исходного текста, 16 МиБ результата, 1 000 фрагментов, 5 000 ссылок либо глубина и число узлов.",
    "bundle.error.parse":
      "Файл не удалось прочитать как JSON/YAML. Проверьте синтаксис, повторяющиеся ключи, теги YAML, циклические псевдонимы и небезопасные числа.",
    "bundle.error.root":
      "Выберите импортированный корневой документ OpenAPI 3.0–3.2 или Swagger 2.0.",
    "bundle.error.missing-file":
      "Файла ссылки нет в проекте. Импортируйте его с соответствующим относительным путём.",
    "bundle.error.missing-pointer":
      "JSON Pointer не указывает на существующее значение в файле.",
    "bundle.error.reference":
      "Неподдерживаемая ссылка или цель. Используйте путь файла с необязательным JSON Pointer; именованные якоря и параметры URL не поддерживаются.",
    "bundle.error.remote":
      "Удалённые и абсолютные URI не загружаются. Импортируйте файл и укажите относительную ссылку.",
    "bundle.error.dialect":
      "Идентификаторы ресурсов схемы, якоря, динамические и рекурсивные ссылки требуют обработки URI, которая здесь не поддерживается.",
    "bundle.error.discriminator":
      "Перед сборкой добавьте явную карту сопоставления discriminator.",
    "bundle.error.relative-resource":
      "Относительный ресурс примера или переносимый относительный URL сервера/документации требует абсолютного URL либо встроенного значения.",
    "bundle.error.project":
      "Это не многофайловый проект версии 1 либо не выбраны поддерживаемые файлы определений.",
    "bundle.error.read":
      "Не удалось прочитать файл. Существующий проект сохранён.",
    "scenario.title": "Запуск API-сценариев",
    "scenario.description":
      "Создайте цепочку до 20 запросов, передавайте значения ответов между шагами и проверяйте результаты. Черновики и переменные хранятся в памяти. Используется схема на момент запуска; история запросов не записывается.",
    "scenario.edit": "Редактирование API-сценария",
    "scenario.name": "Название сценария",
    "scenario.mode": "Режим выполнения сценария",
    "scenario.mock": "Проверка на Mock",
    "scenario.live": "Реальные запросы",
    "scenario.stopOnFailure": "Остановить после первого неуспешного шага",
    "scenario.variables": "Переменные сессии (объект JSON)",
    "scenario.variableHelp":
      "Используйте {{name}} в значениях параметров, URL сервера и строках тела. Подстановка на всю строку JSON сохраняет тип переменной: число, boolean, null или строку. Извлекайте скалярные значения через JSON Pointer (пустой путь выбирает корень). Результаты публикуют только успешные шаги. Настройте заголовки авторизации здесь; окружения и авторизация рабочей области автоматически не применяются.",
    "scenario.search": "Поиск эндпоинтов сценария",
    "scenario.endpoint": "Эндпоинт для добавления",
    "scenario.noEndpoints": "Подходящих эндпоинтов нет",
    "scenario.addStep": "Добавить шаг сценария",
    "scenario.new": "Новый пустой сценарий",
    "scenario.stepCount": "Шагов сценария: {count}/20",
    "scenario.steps": "Порядок шагов сценария",
    "scenario.editStep": "Редактировать шаг сценария {number}",
    "scenario.moveUp": "Переместить шаг {number} вверх",
    "scenario.moveDown": "Переместить шаг {number} вниз",
    "scenario.duplicate": "Дублировать шаг {number}",
    "scenario.duplicateLabel": "Дублировать",
    "scenario.removeStep": "Удалить шаг {number}",
    "scenario.remove": "Удалить",
    "scenario.stepEditor": "Выбранный шаг",
    "scenario.viewEndpoint": "Открыть эндпоинт сценария",
    "scenario.stepName": "Название шага",
    "scenario.server": "URL сервера (пустое поле — из схемы)",
    "scenario.parameters": "Параметры шага",
    "scenario.parameterLocation": "Расположение параметра {number}",
    "scenario.parameterName": "Имя параметра {number}",
    "scenario.parameterValue": "Значение параметра {number}",
    "scenario.removeParameter": "Удалить параметр {number}",
    "scenario.addParameter": "Добавить параметр шага",
    "scenario.contentType": "Тип содержимого запроса шага",
    "scenario.body": "Шаблон тела запроса шага",
    "scenario.expectedStatus": "Ожидаемый статус (200, 2xx или any)",
    "scenario.mockStatus": "Документированный ответ для Mock",
    "scenario.timeoutLabel": "Таймаут шага (1 000–30 000 мс)",
    "scenario.timeout": "Превышен таймаут шага.",
    "scenario.maxDuration": "Максимальное время ответа (мс; 0 отключает)",
    "scenario.checkContract":
      "Проверить документированные статус, тип содержимого и структуру тела",
    "scenario.extracts": "Извлечение переменных ответа для следующих шагов",
    "scenario.extractName": "Имя переменной извлечения {number}",
    "scenario.extractPointer": "JSON Pointer извлечения {number}",
    "scenario.removeExtract": "Удалить извлечение {number}",
    "scenario.addExtract": "Добавить извлечение ответа",
    "scenario.unavailable": "Недоступно",
    "scenario.mockHelp":
      "Проверки Mock используют примеры или сгенерированные тела ответов, не отправляют запросы и показывают условную длительность 0 мс. Они не доказывают, что реальный сценарий будет успешным.",
    "scenario.liveHelp":
      "В реальном режиме отправляются все перечисленные запросы, включая изменение и удаление данных. Поддерживаются только публичные HTTP(S)-адреса. Перенаправления не выполняются; размер ответа ограничен 1 МиБ. Отмена останавливает текущий запрос и следующие шаги, но не откатывает завершённые изменения.",
    "scenario.runMock": "Запустить сценарий Mock",
    "scenario.runLive": "Запустить реальный сценарий",
    "scenario.running":
      "Сценарий выполняется · завершено шагов {count}/{total}",
    "scenario.cancel": "Отменить сценарий",
    "scenario.sharing": "Импорт и экспорт сценария",
    "scenario.sharingHelp":
      "Экспорт определения включает шаблоны запросов, которые могут содержать чувствительные значения. Значения переменных сессии и полученные ответы исключены. Импорт заменяет черновик и задаёт объявленным переменным пустые строки. Отчёты содержат результаты и пути из схемы без значений запросов и ответов.",
    "scenario.copyDefinition": "Копировать определение сценария",
    "scenario.downloadDefinition": "Скачать определение сценария",
    "scenario.importFile": "Импорт JSON-файла сценария",
    "scenario.importText": "JSON сценария для импорта",
    "scenario.import": "Импортировать определение сценария",
    "scenario.imported":
      "Сценарий импортирован. Заполните переменные сессии перед запуском.",
    "scenario.loading": "Чтение файла сценария…",
    "scenario.exported": "Экспорт сценария завершён.",
    "scenario.exportFailed":
      "Не удалось экспортировать сценарий. Повторите попытку.",
    "scenario.result": "Сценарий: {outcome} · пройдено шагов {passed}/{total}",
    "scenario.results": "Результаты шагов сценария",
    "scenario.column.step": "Шаг",
    "scenario.column.outcome": "Результат",
    "scenario.column.status": "HTTP-статус",
    "scenario.column.duration": "Длительность",
    "scenario.column.outputs": "Опубликованные переменные",
    "scenario.contractResult": "Контракт: {result}",
    "scenario.copyReport": "Копировать отчёт сценария",
    "scenario.downloadReport": "Скачать отчёт сценария",
    "scenario.passed": "пройден",
    "scenario.failed": "не пройден",
    "scenario.error": "ошибка",
    "scenario.cancelled": "отменён",
    "scenario.skipped": "пропущен",
    "scenario.partial": "частично",
    "scenario.invalid-plan":
      "Проверьте определение сценария: названия, эндпоинты, статусы, таймауты, параметры и уникальные имена извлечений должны быть корректны.",
    "scenario.limit":
      "Превышены ограничения: 20 шагов, 2 МиБ на определение, 64 переменные, 64 параметра и 10 извлечений на шаг либо размер подстановок.",
    "scenario.invalid-variables":
      "Переменные должны быть объектом JSON, содержащим до 64 скалярных значений. Имена состоят из латинских букв, цифр и подчёркиваний. Значения: безопасные числа, boolean, null или строки до 8 192 символов (128 КиБ суммарно).",
    "scenario.missing-variable":
      "Переменная шаблона недоступна. Задайте её или получите из предыдущего успешного шага.",
    "scenario.missing-endpoint":
      "Эндпоинт сценария отсутствует или неоднозначен в текущей схеме. Восстановите его перед запуском.",
    "scenario.invalid-body":
      "Тело запроса отсутствует или некорректно. Поместите подстановки JSON внутрь строк в кавычках.",
    "scenario.missing-parameter":
      "Не задано значение обязательного параметра запроса.",
    "scenario.invalid-server":
      "Некорректный адрес или запрос. Используйте публичный HTTP(S)-сервер без учётных данных, параметров запроса и фрагмента в URL.",
    "scenario.network":
      "Реальный запрос не выполнен. Проверьте сервер и настройки запроса.",
    "scenario.invalid-response":
      "Нет пригодного ответа либо выбранный ответ Mock больше не существует.",
    "scenario.response-limit": "Ответ превышает ограничение 1 МиБ.",
    "scenario.status-mismatch": "Статус ответа не соответствует ожидаемому.",
    "scenario.duration-exceeded":
      "Ответ превысил заданное ограничение времени.",
    "scenario.contract-failed":
      "Ответ не прошёл проверку документированного контракта.",
    "scenario.assertion-failed": "Ответ не прошёл настроенную проверку.",
    "scenario.extraction-failed":
      "Не удалось извлечь переменную. Укажите существующий JSON Pointer на безопасное скалярное значение.",
    "scenario.stopped": "Не выполнен из-за предыдущего неуспешного шага.",
    "inference.title": "Конструктор схемы ответа",
    "inference.heading": "Создание схемы по примерам JSON",
    "inference.description":
      "Добавьте текущий ответ или примеры JSON для вывода общей схемы. Примеры хранятся в памяти этого эндпоинта до удаления или закрытия эндпоинта. Запросы не отправляются, документ в редакторе не меняется.",
    "inference.limits":
      "До 10 примеров, 1 МиБ на пример, 2 МиБ суммарно, 20 000 значений и 64 уровней вложенности.",
    "inference.capture": "Добавить текущий ответ",
    "inference.paste": "Пример JSON для схемы",
    "inference.add": "Добавить пример JSON",
    "inference.samples": "Добавлено примеров: {count}/10",
    "inference.sampleList": "Примеры для схемы",
    "inference.sample": "Пример {number} · {bytes} байт",
    "inference.remove": "Удалить пример {number}",
    "inference.removeLabel": "Удалить",
    "inference.clear": "Очистить примеры схемы",
    "inference.empty":
      "Добавьте пример для начала. Массив считается одним примером; его элементы анализируются вместе.",
    "inference.review":
      "Проверьте полученную схему перед использованием как контракта. Примеры не определяют обязательность полей, форматы, диапазоны, перечисления и бизнес-правила. Экспорт содержит имена и типы полей без значений примеров. YAML — фрагмент компонента для OpenAPI 3.1, а не полный документ API.",
    "inference.name": "Имя компонента схемы",
    "inference.format": "Формат выведенной схемы",
    "inference.json": "JSON Schema 2020-12",
    "inference.yaml": "Компонент OpenAPI 3.1 (YAML)",
    "inference.invalidName":
      "Используйте 1–80 букв латиницы, цифр, подчёркиваний, точек или дефисов. Начните с буквы или подчёркивания.",
    "inference.required":
      "Считать обязательными поля, присутствующие во всех объектах",
    "inference.additional": "Разрешить дополнительные свойства объектов",
    "inference.fields": "Полей: {count} · необязательных: {optional}",
    "inference.search": "Поиск по путям и типам выведенной схемы",
    "inference.fieldTable": "Выведенные поля",
    "inference.path": "Путь в схеме",
    "inference.types": "Типы",
    "inference.observed": "Есть / объектов",
    "inference.presence": "Обязательность",
    "inference.requiredLabel": "Обязательное",
    "inference.optionalLabel": "Необязательное",
    "inference.noFields":
      "Подходящих полей объектов нет. Схемы скалярных значений и пустых массивов доступны в предпросмотре.",
    "inference.previous": "Предыдущие поля схемы",
    "inference.next": "Следующие поля схемы",
    "inference.page": "Страница {current} из {total}",
    "inference.copy": "Копировать выведенную схему",
    "inference.download": "Скачать выведенную схему",
    "inference.copied": "Выведенная схема скопирована.",
    "inference.copyFailed":
      "Не удалось скопировать схему. Попробуйте скачать её.",
    "inference.downloaded": "Скачивание выведенной схемы началось.",
    "inference.downloadFailed": "Не удалось скачать выведенную схему.",
    "inference.preview": "Предпросмотр выведенной схемы",
    "inference.shortened":
      "Предпросмотр сокращён до 12 000 символов. Копирование и скачивание включают всю схему.",
    "inference.invalid-json":
      "Пример не является корректным JSON. Ранее добавленные примеры сохранены.",
    "inference.size-limit":
      "Превышен лимит размера: 1 МиБ на пример и 2 МиБ суммарно.",
    "inference.structure-limit":
      "Примеры превышают 20 000 значений суммарно или 64 уровня вложенности.",
    "inference.unsafe-number":
      "Число в примере невозможно точно представить. Используйте строки для больших идентификаторов.",
    "inference.sample-limit":
      "Удалите пример перед добавлением более 10 примеров.",
    "plan.exportTooLarge":
      "Этот JSON-отчёт превышает лимит импорта 16 МиБ. Сузьте область эндпоинтов перед экспортом, чтобы прогресс можно было восстановить.",
    "plan.title": "План тестирования API",
    "plan.description":
      "Создайте ручной QA-чек-лист по документированным входным данным, записывайте результаты и заметки, делитесь прогрессом и восстанавливайте его. Запросы не отправляются, результаты остаются в памяти.",
    "plan.help":
      "Начните с рабочего запроса в Try It Out, измените только выбранное поле и запишите наблюдаемый результат. Предложенные значения проверяют одно правило: перед тестированием учтите остальные ограничения, авторизацию и документированные ответы. Для pattern подберите подходящие и неподходящие значения вручную. Это ограниченный чек-лист, а не полная проверка контракта.",
    "plan.limits":
      "План ограничен 1 000 тестами; пропущено операций со слишком большими ограничениями или путями: {skipped}.",
    "plan.scope": "Область эндпоинтов плана",
    "plan.allEndpoints": "Все эндпоинты",
    "plan.visibleEndpoints": "Текущее представление эндпоинтов",
    "plan.search": "Поиск по эндпоинтам, полям или значениям плана",
    "plan.resultFilter": "Фильтр QA-результатов",
    "plan.allResults": "Все QA-результаты",
    "plan.expectationFilter": "Фильтр целей тестирования",
    "plan.allExpectations": "Все цели тестирования",
    "plan.pending": "Ожидает",
    "plan.passed": "Пройден",
    "plan.failed": "Не пройден",
    "plan.blocked": "Заблокирован",
    "plan.accept": "Позитивный тест: выполнить проверяемое правило",
    "plan.reject": "Негативный тест: нарушить проверяемое правило",
    "plan.review": "Ручная проверка pattern",
    "plan.summary":
      "Тестов: {total} · Ожидают: {pending} · Пройдены: {passed} · Не пройдены: {failed} · Заблокированы: {blocked}",
    "plan.count": "Подходящих тестов: {count}",
    "plan.cases": "Тесты API",
    "plan.endpoint": "Эндпоинт",
    "plan.scenario": "Сценарий",
    "plan.target": "Проверяемое поле",
    "plan.value": "Предложенное значение или pattern",
    "plan.expectation": "Цель тестирования",
    "plan.result": "QA-результат",
    "plan.notes": "QA-заметки",
    "plan.previous": "Предыдущая страница плана",
    "plan.next": "Следующая страница плана",
    "plan.page": "Страница {page} из {total}",
    "plan.selected": "Выбранный тест",
    "plan.openEndpoint": "Открыть эндпоинт теста",
    "plan.empty": "Нет тестов для этого представления.",
    "plan.copy": "Копировать план как Markdown",
    "plan.json": "Скачать план в JSON",
    "plan.markdown": "Скачать план в Markdown",
    "plan.import": "Восстановить план из JSON",
    "plan.reset": "Сбросить QA-результаты",
    "plan.undo": "Отменить импорт или сброс прогресса",
    "plan.exportHelp":
      "Экспорт содержит выбранную область эндпоинтов, предложенные значения и ваши заметки; фильтры таблицы и поиск не сужают экспорт. Импорт JSON обновляет только тесты с совпадающими идентификаторами, сохраняя остальные результаты. Заметки могут содержать конфиденциальные данные. Прогресс сохраняется при закрытии панели и временных ошибках схемы, но теряется при закрытии страницы. Экспортируйте JSON для сохранения.",
    "plan.loading": "Чтение прогресса тестирования…",
    "plan.restored":
      "Восстановлено совпадающих тестов: {restored} · Пропущено неизвестных или изменённых: {ignored}",
    "plan.invalid":
      "Некорректный JSON плана тестирования. Текущие результаты не изменены.",
    "plan.too-large":
      "Импорт плана ограничен 16 МиБ. Текущие результаты не изменены.",
    "plan.readError":
      "Не удалось прочитать файл плана. Текущие результаты не изменены.",
    "plan.resetDone": "QA-результаты сброшены. Это действие можно отменить.",
    "plan.copySuccess": "План скопирован в Markdown.",
    "plan.copyError": "Не удалось скопировать план. Попробуйте скачать его.",
    "plan.downloadSuccess": "Скачивание плана началось.",
    "plan.downloadError":
      "Не удалось скачать план. Попробуйте скопировать его.",
    "plan.kind.happy": "Документированный успешный сценарий",
    "plan.kind.omit": "Убрать обязательное поле",
    "plan.kind.enum-valid": "Использовать значение из enum",
    "plan.kind.enum-invalid": "Использовать значение вне enum",
    "plan.kind.minimum": "Использовать нижнюю границу",
    "plan.kind.below-minimum": "Опуститься ниже минимума",
    "plan.kind.maximum": "Использовать верхнюю границу",
    "plan.kind.above-maximum": "Превысить максимум",
    "plan.kind.min-length": "Использовать минимальную длину строки",
    "plan.kind.shorter": "Использовать слишком короткую строку",
    "plan.kind.max-length": "Использовать максимальную длину строки",
    "plan.kind.longer": "Использовать слишком длинную строку",
    "plan.kind.pattern": "Проверить ограничение pattern",
    "plan.kind.body-property": "Убрать обязательное свойство тела",
    "har.title": "Анализатор HAR-трафика",
    "har.description":
      "Изучайте сетевой журнал браузера локально, без отправки запросов. Заголовки, cookie, значения query-параметров и тела отбрасываются после импорта; пути запросов и источники остаются в памяти до очистки или закрытия страницы.",
    "har.file": "Импорт HAR-файла",
    "har.clear": "Очистить журнал трафика",
    "har.paste": "Вставить HAR JSON",
    "har.json": "HAR JSON",
    "har.import": "Анализировать вставленный HAR",
    "har.loading": "Чтение журнала трафика…",
    "har.invalid-har":
      "Введите корректный HAR JSON с массивом log.entries. Предыдущий журнал не изменён.",
    "har.too-large":
      "Размер HAR ограничен 5 МиБ. Предыдущий журнал не изменён.",
    "har.too-many":
      "HAR ограничен 5 000 записями. Предыдущий журнал не изменён.",
    "har.no-requests":
      "Подходящие HTTP-запросы не найдены. Предыдущий журнал не изменён.",
    "har.read-error":
      "Не удалось прочитать HAR-файл. Выберите его ещё раз; предыдущий журнал не изменён.",
    "har.loaded":
      "Импортировано запросов: {accepted} · Пропущено некорректных или не-HTTP записей: {skipped}",
    "har.scope": "Сопоставить с эндпоинтами",
    "har.allEndpoints": "Все эндпоинты",
    "har.visibleEndpoints": "Текущее представление эндпоинтов",
    "har.origin": "Источник трафика",
    "har.allOrigins": "Все источники журнала",
    "har.prefix": "Удалить префикс пути запроса",
    "har.matchHelp":
      "Сопоставление использует метод и путь с параметрами в отдельных сегментах, например {id}. Статические маршруты имеют приоритет; равные совпадения неоднозначны. Завершающий слеш значим. При необходимости выберите источник и удалите префикс, например /api; URL серверов схемы автоматически не применяются.",
    "har.invalidPrefix":
      "Оставьте префикс пустым или начните путь с /, без пробелов, query-строк, фрагментов, обратных слешей и фигурных скобок.",
    "har.summary":
      "Запросов: {total} · Совпадений: {matched} · Недокументированных статусов: {undocumented} · HTTP-ошибок или сетевых сбоев: {failed}",
    "har.timing":
      "Среднее: {average} · P95: {p95} · Максимум: {max} · Известных длительностей: {count}",
    "har.coverage":
      "Наблюдалось операций: {observed} из {total} · Без совпадений: {unmatched} · Неоднозначных запросов: {ambiguous}",
    "har.operations": "Покрытие операций трафиком",
    "har.endpoint": "Эндпоинт",
    "har.requests": "Запросы",
    "har.failed": "HTTP-ошибки или сетевые сбои",
    "har.unknown": "Неизвестно",
    "har.search": "Поиск по методу, пути или статусу запроса",
    "har.filter": "Фильтр результатов трафика",
    "har.all": "Весь трафик",
    "har.matched": "Есть совпадение",
    "har.unmatched": "Нет совпадения",
    "har.ambiguous": "Неоднозначно",
    "har.undocumented": "Недокументированный статус",
    "har.sort": "Порядок трафика",
    "har.captureOrder": "Порядок журнала",
    "har.slowest": "Сначала медленные",
    "har.rowCount": "Подходящих запросов: {count}",
    "har.traffic": "Записанный трафик",
    "har.request": "Запрос",
    "har.status": "Статус",
    "har.duration": "Длительность",
    "har.match": "Совпадение с эндпоинтом",
    "har.previous": "Предыдущая страница трафика",
    "har.page": "Страница {current} из {total}",
    "har.next": "Следующая страница трафика",
    "har.copy": "Копировать отчёт о трафике",
    "har.download": "Скачать отчёт о трафике",
    "har.exportHelp":
      "Отчёты содержат сводные счётчики, длительности и пути операций схемы для выбранной области, источника и префикса; поиск и фильтры таблицы не сужают отчёт. URL и значения из журнала исключены. Статусы проверяются по точным кодам, диапазонам или default, без проверки тела. Статус 0 и HTTP 400–599 считаются ошибками; неизвестные длительности исключаются, P95 вычисляется методом ближайшего ранга.",
    "har.copySuccess": "Отчёт о трафике скопирован.",
    "har.copyError":
      "Не удалось скопировать отчёт о трафике. Попробуйте скачать его.",
    "har.downloadSuccess": "Скачивание отчёта о трафике началось.",
    "har.downloadError":
      "Не удалось скачать отчёт о трафике. Попробуйте скопировать его.",
    "explorer.title": "Исследователь данных ответа",
    "explorer.navigator": "Навигатор JSON",
    "explorer.description":
      "Просматривайте поля ответа или ищите по всему JSON: пути, ключам и скалярным значениям. Пустой JSON Pointer означает корень; заменяйте / на ~1, а ~ на ~0. Данные хранятся в памяти; изменение тела ответа сбрасывает навигацию.",
    "explorer.pointer": "Открыть JSON Pointer",
    "explorer.go": "Перейти к значению JSON",
    "explorer.pointerError":
      "Введите корректный JSON Pointer, существующий в этом ответе.",
    "explorer.breadcrumbs": "Положение в JSON ответа",
    "explorer.root": "Корень",
    "explorer.selected":
      "Выбрано: {type} · Дочерних: {children} · Значений в индексе: {total}",
    "explorer.copyPointer": "Скопировать выбранный JSON Pointer",
    "explorer.copyJson": "Скопировать выбранный JSON",
    "explorer.downloadJson": "Скачать выбранный JSON",
    "explorer.view": "Отображение массива",
    "explorer.browse": "Просмотр полей",
    "explorer.table": "Таблица",
    "explorer.columns": "Выбрать столбцы таблицы",
    "explorer.value": "Значение",
    "explorer.filterRows": "Фильтр строк таблицы ответа",
    "explorer.rowCount": "Подходящих строк: {count} из {total}",
    "explorer.tableCaption": "Данные массива ответа",
    "explorer.exploreRow": "Открыть строку {number}",
    "explorer.missing": "(отсутствует)",
    "explorer.downloadCsv": "Скачать отфильтрованный CSV",
    "explorer.csvHelp":
      "CSV содержит все подходящие строки и выбранные столбцы с исходными индексами строк от нуля. Вложенные значения экспортируются как JSON. Отсутствующие поля — пустые ячейки; null записывается как null. Перед строками и именами столбцов, похожими на формулы, добавляется апостроф. Экспорт содержит значения ответа.",
    "explorer.search": "Поиск по путям и значениям ответа",
    "explorer.typeFilter": "Фильтр типа значения JSON",
    "explorer.allTypes": "Все типы JSON",
    "explorer.matches": "Подходящих значений во всём ответе: {count}",
    "explorer.children": "Прямых дочерних значений: {count}",
    "explorer.preview": "Предпросмотр выбранного JSON",
    "explorer.previewLabel": "Предпросмотр значения JSON",
    "explorer.truncated":
      "Предпросмотр сокращён до 8 000 символов. Копирование и скачивание JSON включают полное выбранное значение.",
    "explorer.previous": "Предыдущая страница данных",
    "explorer.next": "Следующая страница данных",
    "explorer.page": "Страница {page} из {total}",
    "explorer.copySuccess": "Данные ответа скопированы.",
    "explorer.copyError": "Не удалось скопировать. Попробуйте скачать.",
    "explorer.downloadSuccess": "Скачивание данных ответа началось.",
    "explorer.downloadError": "Не удалось скачать. Попробуйте скопировать.",
    "explorer.invalid-json":
      "Ответ не является корректным JSON. Исходное представление ответа остаётся доступным.",
    "explorer.size-limit":
      "Ответ превышает предел исследователя в 1 МиБ. Используйте исходное представление или скачивание ответа.",
    "explorer.structure-limit":
      "JSON превышает 20 000 значений или 64 уровня вложенности. Используйте исходное представление или скачивание ответа.",
    "explorer.unsafe-number":
      "JSON содержит бесконечное число или целое за пределами безопасного диапазона JavaScript. Исследователь недоступен, чтобы избежать экспорта округлённых значений; скачайте исходный ответ.",
    "explorer.not-array": "Выберите массив для просмотра таблицы.",
    "explorer.row-limit":
      "Массив превышает предел таблицы в 5 000 строк. Просматривайте поля или экспортируйте выбранный JSON.",
    "explorer.column-limit":
      "Массив превышает предел таблицы в 64 столбца. Просматривайте поля или экспортируйте выбранный JSON.",
    "smoke.title": "Экспорт smoke-тестов для CI",
    "smoke.description":
      "Создайте автономный скрипт Node.js 20+ и шаблон конфигурации для GET- и HEAD-эндпоинтов. Запускайте файл локально или в CI для проверки реальных ответов без сторонних зависимостей.",
    "smoke.scope": "Область smoke-тестов",
    "smoke.visible": "Текущее представление эндпоинтов",
    "smoke.all": "Все эндпоинты",
    "smoke.timeout": "Таймаут запроса (мс)",
    "smoke.budget": "Допустимое время ответа (мс)",
    "smoke.deprecated": "Включить устаревшие smoke-тесты",
    "smoke.checkJson": "Проверять структуру JSON и обязательные свойства",
    "smoke.enableBudget": "Ограничить время ответа",
    "smoke.invalid":
      "Введите целое число миллисекунд: таймаут 100–120 000, допустимое время ответа 1–120 000.",
    "smoke.summary": "Smoke-тестов: {count} · Исключено операций: {excluded}",
    "smoke.empty":
      "В выбранной области с этими настройками нет GET- или HEAD-эндпоинтов.",
    "smoke.manifest": "Список созданных smoke-тестов",
    "smoke.operation": "Операция",
    "smoke.inputs": "Обязательные параметры для заполнения",
    "smoke.auth": "Задокументированная аутентификация",
    "smoke.authRequired": "Настройте при запуске",
    "smoke.authNotRequired": "Не требуется",
    "smoke.downloadScript": "Скачать скрипт smoke-тестов",
    "smoke.downloadConfig": "Скачать конфигурацию smoke-тестов",
    "smoke.preview": "Предпросмотр файлов smoke-тестов",
    "smoke.previewFile": "Файл для предпросмотра smoke-тестов",
    "smoke.script": "Скрипт Node.js",
    "smoke.config": "Шаблон конфигурации",
    "smoke.copy": "Скопировать предпросмотр smoke-тестов",
    "smoke.source": "Исходный код smoke-тестов",
    "smoke.copySuccess": "Файл smoke-тестов скопирован.",
    "smoke.copyError": "Не удалось скопировать. Попробуйте скачать.",
    "smoke.downloadSuccess": "Скачивание smoke-тестов началось.",
    "smoke.downloadError": "Не удалось скачать. Попробуйте скопировать.",
    "smoke.instructions": "Запуск smoke-тестов в CI",
    "smoke.step1":
      "Скачайте оба файла. Укажите целевой сервер в baseUrl конфигурации, включая префикс пути API, и заполните обязательные параметры пути, запроса, заголовков и cookie. Для пропуска операции установите enabled в false.",
    "smoke.step2":
      "Укажите путь к конфигурации в RSSWAG_SMOKE_CONFIG. RSSWAG_BASE_URL переопределяет базовый URL. Передавайте секреты через RSSWAG_HEADERS_JSON — JSON-объект HTTP-заголовков; они переопределяют заголовки конфигурации без учёта регистра имён.",
    "smoke.step3":
      "Запустите экспортированный файл в Node.js 20 или новее. Сохраните стандартный вывод как JSON-отчёт. Запросы выполняются последовательно, каждый должен вернуть задокументированный ответ 2xx.",
    "smoke.exit":
      "Код завершения 0 требует хотя бы одного успешного теста и отсутствия неудачных или заблокированных тестов. Некорректная конфигурация, незаполненные обязательные параметры и полностью пропущенный набор не считаются успешным запуском.",
    "smoke.limits":
      "Проверяются статус, медиатип, при включении — тип JSON верхнего уровня и обязательные свойства, а также допустимое время ответа. Это не полная валидация JSON Schema. Тело ограничено 1 МиБ; редиректы не выполняются. Отчёты не содержат тела ответа, заголовков и значений параметров. Настройте аутентификацию при запуске; окружения редактора, примеры и сохранённые секреты не включаются.",
    "assertions.title": "Проверки ответа",
    "assertions.builder": "Пользовательские проверки ответа",
    "assertions.description":
      "Настройте проверки для этого эндпоинта. Каждый показанный реальный или мок-ответ проверяется автоматически. Проверки хранятся в памяти, пока эндпоинт остаётся в представлении.",
    "assertions.add.status": "Добавить проверку статуса",
    "assertions.add.header": "Добавить проверку заголовка",
    "assertions.add.body": "Добавить проверку JSON",
    "assertions.add.duration": "Добавить проверку времени",
    "assertions.summary":
      "Успешно: {pass} · Не пройдено: {fail} · Ошибок: {error} · Ответ: {source}",
    "assertions.live": "Реальный",
    "assertions.mock": "Мок",
    "assertions.awaiting":
      "Проверки готовы. Выполните запрос для проверки ответа.",
    "assertions.empty":
      "Проверок пока нет. Добавьте проверку или импортируйте сохранённый набор.",
    "assertions.filter": "Фильтр результатов проверок",
    "assertions.all": "Все проверки",
    "assertions.pass": "Пройдено",
    "assertions.fail": "Не пройдено",
    "assertions.error": "Ошибка",
    "assertions.pending": "Ожидание ответа",
    "assertions.noMatches": "Нет проверок, соответствующих фильтру.",
    "assertions.check": "Проверка {number}",
    "assertions.name": "Название проверки (необязательно)",
    "assertions.target": "Объект проверки",
    "assertions.target.status": "Код статуса",
    "assertions.target.header": "Заголовок ответа",
    "assertions.target.body": "Тело JSON",
    "assertions.target.duration": "Время ответа (мс)",
    "assertions.path": "JSON Pointer (пусто = всё тело)",
    "assertions.header": "Имя заголовка",
    "assertions.operator": "Условие",
    "assertions.operator.equals": "Равно",
    "assertions.operator.exists": "Существует",
    "assertions.operator.absent": "Отсутствует",
    "assertions.operator.contains": "Содержит текст",
    "assertions.operator.type": "Имеет тип JSON",
    "assertions.operator.length": "Имеет длину",
    "assertions.operator.gte": "Больше или равно",
    "assertions.operator.lte": "Меньше или равно",
    "assertions.expected": "Ожидаемое значение",
    "assertions.expectedJson": "Ожидаемое значение (JSON)",
    "assertions.remove": "Удалить проверку {number}",
    "assertions.removeButton": "Удалить проверку",
    "assertions.pathHelp":
      "JSON Pointer выбирает точное поле: /items/0/id. Пустой путь означает всё тело; используйте ~1 для / и ~0 для ~ в ключах. Равенство сравнивает значения JSON без учёта порядка ключей объекта. Поиск текста учитывает регистр. Длина — число элементов массива или кодовых точек Unicode в строке.",
    "assertions.transfer": "Импорт и экспорт проверок",
    "assertions.exportHelp":
      "Наборы проверок содержат названия и ожидаемые значения. Импорт добавляет проверки. Отчёты содержат только пронумерованные результаты без значений ответа и ожидаемых значений; храните набор проверок вместе с отчётом.",
    "assertions.copySet": "Скопировать набор проверок",
    "assertions.downloadSet": "Скачать набор проверок",
    "assertions.importLabel": "JSON набора проверок",
    "assertions.import": "Добавить импортированные проверки",
    "assertions.import.invalid-set":
      "Используйте корректный набор проверок ответа RSSwag версии 1 с допустимыми проверками.",
    "assertions.import.too-large":
      "Импортируемый набор проверок должен быть не больше 2 МиБ.",
    "assertions.import.too-many":
      "Эндпоинт может содержать не больше 50 проверок. Удалите часть проверок перед импортом.",
    "assertions.copyReport": "Скопировать отчёт проверок",
    "assertions.downloadReport": "Скачать отчёт проверок",
    "assertions.copySuccess": "Скопировано в буфер обмена.",
    "assertions.copyError": "Не удалось скопировать. Попробуйте скачать.",
    "assertions.downloadSuccess": "Скачивание началось.",
    "assertions.downloadError": "Не удалось скачать. Попробуйте скопировать.",
    "assertions.limits":
      "До 50 проверок на эндпоинт. Для JSON: до 1 МиБ, 20 000 значений и 64 уровней вложенности; числа должны быть конечными, а целые — точно представимыми. Очистка ответа сохраняет проверки. Экспортируйте их, чтобы сохранить после скрытия эндпоинта фильтром или закрытия страницы.",
    "assertions.issue.invalid-rule":
      "Некорректная проверка. Проверьте объект, условие и длину полей.",
    "assertions.issue.invalid-path":
      "Введите корректный JSON Pointer или имя HTTP-заголовка.",
    "assertions.issue.invalid-expected":
      "Введите допустимое ожидаемое значение: JSON для равенства тела, тип JSON для проверки типа или конечное число для числовых проверок. Код статуса — 100–599; время и целочисленная длина неотрицательны.",
    "assertions.issue.unreadable-body":
      "Тело ответа не является корректным JSON. Проверка не выполнена.",
    "assertions.issue.body-limit":
      "JSON ответа превышает предел размера, глубины или числа значений. Проверка не выполнена.",
    "assertions.issue.unsafe-number":
      "JSON ответа содержит число, которое нельзя надёжно представить. Проверка не выполнена.",
    "assertions.issue.missing": "Выбранное поле отсутствует.",
    "assertions.issue.wrong-type":
      "Тип выбранного значения не подходит для этого условия.",
    "assertions.issue.unavailable": "Статус или время ответа недоступны.",
    "comparison.title": "Сравнение ответов",
    "comparison.description":
      "Закрепите ответ, затем повторите запрос для просмотра изменений. Базовый ответ остаётся в памяти, пока эндпоинт находится в текущем списке.",
    "comparison.pin": "Закрепить базовый ответ",
    "comparison.replace": "Сделать текущий ответ базовым",
    "comparison.clear": "Удалить базовый ответ",
    "comparison.baselineSummary": "Базовый ответ: статус {status} · {source}",
    "comparison.mock": "Mock",
    "comparison.live": "Live",
    "comparison.awaiting":
      "Базовый ответ сохранён в памяти. Повторите запрос для сравнения.",
    "comparison.options": "Настройки сравнения",
    "comparison.ignorePaths": "Игнорируемые пути JSON (по одному на строку)",
    "comparison.ignoreHeaders": "Игнорируемые заголовки ответа (через запятую)",
    "comparison.ignoreHelp":
      "Используйте JSON Pointer, например /timestamp или /items/0/id. Указанные пути и их потомки пропускаются; добавление или удаление родителя по-прежнему отображается. Заменяйте / на ~1, а ~ на ~0. Массивы сравниваются по индексам.",
    "comparison.invalidOptions":
      "Допускается не более 64 путей JSON и 64 заголовков. Путь должен начинаться с /, содержать корректные ~0 или ~1 и быть не длиннее 512 символов.",
    "comparison.partial": "Частичное сравнение: найдено изменений — {count}",
    "comparison.differenceCount": "Изменений ответа: {count}",
    "comparison.identical":
      "При текущих настройках изменений ответа не найдено.",
    "comparison.bodyMode": "Сравнение тела: {mode}",
    "comparison.jsonMode": "Структура JSON",
    "comparison.textMode": "Текст",
    "comparison.largeMode": "Пропущено (более 1 МиБ)",
    "comparison.latency": "Время: {before} → {after} мс (Δ {delta} мс)",
    "comparison.size": "Размер тела: {before} → {after} Б",
    "comparison.mixedModes":
      "Сравниваются ответы из разных режимов: Mock и Live.",
    "comparison.textHelp":
      "Если структурное сравнение JSON недоступно, тела сравниваются как текст. Игнорируемые пути применяются только к JSON.",
    "comparison.limitHelp":
      "Ограничения: 1 МиБ на тело, 500 изменений, 20 000 значений и 60 уровней вложенности. Частичное сравнение не подтверждает совпадение ответов.",
    "comparison.areaFilter": "Область изменения",
    "comparison.kindFilter": "Тип изменения",
    "comparison.allAreas": "Все области",
    "comparison.allKinds": "Все изменения",
    "comparison.body": "Тело",
    "comparison.headers": "Заголовки",
    "comparison.status": "Статус",
    "comparison.added": "Добавлено",
    "comparison.removed": "Удалено",
    "comparison.changed": "Изменено",
    "comparison.search": "Поиск изменённых путей",
    "comparison.table": "Различия ответов",
    "comparison.path": "Путь",
    "comparison.before": "Базовое значение",
    "comparison.after": "Текущее значение",
    "comparison.root": "(корень тела)",
    "comparison.noMatches": "Нет изменений, соответствующих фильтрам.",
    "comparison.copy": "Копировать отчёт сравнения",
    "comparison.download": "Скачать отчёт сравнения",
    "comparison.includeValues": "Включить предпросмотр значений в отчёт",
    "comparison.exportHelp":
      "Экспорт включает все найденные изменения независимо от фильтров таблицы. По умолчанию значения исключены. Предпросмотр ограничен 1000 символами; для контейнеров указан размер. Значения стандартных заголовков авторизации и cookie всегда скрыты.",
    "comparison.copySuccess": "Сравнение ответов скопировано.",
    "comparison.copyError":
      "Не удалось скопировать сравнение. Попробуйте скачать его.",
    "comparison.downloadSuccess": "Скачивание сравнения ответов началось.",
    "comparison.downloadError":
      "Не удалось скачать сравнение. Попробуйте скопировать его.",
    "common.clearSearchShortcut": "Нажмите Escape, чтобы очистить поиск",
    "workspace.apiSliceTitle": "Экспорт части API",
    "workspace.apiSliceFileDetails": "Файл экспорта: {fileName} ({size} Б)",
    "workspace.apiSliceSerializationError":
      "Не удалось сериализовать документ. Замените циклические псевдонимы YAML ссылками OpenAPI перед экспортом.",
    "workspace.apiSliceDescription":
      "Поделитесь отдельным контрактом OpenAPI по фильтрам, тегам или избранным эндпоинтам. Сохраняются метаданные, общие параметры и нужные компоненты. Используются URL серверов из схемы. Экспорт JSON/YAML сохраняет данные, но не комментарии и исходное форматирование.",
    "workspace.apiSliceScope": "Область экспорта",
    "workspace.apiSliceVisible": "Текущий вид ({count})",
    "workspace.apiSliceAll": "Все эндпоинты ({count})",
    "workspace.apiSliceFormat": "Формат экспорта",
    "workspace.apiSlicePrune": "Удалить неиспользуемые компоненты",
    "workspace.apiSliceDeprecated": "Включить устаревшие операции",
    "workspace.apiSliceWebhooks": "Включить все вебхуки верхнего уровня",
    "workspace.apiSliceOperations": "Операций в экспорте",
    "workspace.apiSlicePaths": "Путей в экспорте",
    "workspace.apiSliceRetained": "Сохранено компонентов",
    "workspace.apiSliceRemoved": "Удалено компонентов",
    "workspace.apiSliceIssues": "Замечания ({count})",
    "workspace.apiSliceBrokenReference":
      "Не найдена локальная ссылка или схема безопасности. Включите её цель или исправьте исходный контракт.",
    "workspace.apiSliceExternalReference":
      "Для ссылки нужен внешний документ. Она сохранена без встраивания; относительным ссылкам может потребоваться новый базовый URL.",
    "workspace.apiSliceLinkedOperation":
      "Не удалось найти целевую операцию ссылки ответа в этой части API. Проверьте цель перед отправкой.",
    "workspace.apiSlicePreservedComponents":
      "Все компоненты сохранены: полиморфизм, идентификаторы ресурсов схемы или ссылки на целые контейнеры могут иметь неявные зависимости.",
    "workspace.apiSlicePathReference":
      "Путь ссылается на другой объект пути, который может включать невыбранные операции. Встройте объект пути в исходную схему перед экспортом.",
    "workspace.apiSliceEmpty":
      "Нет выбранных операций. Измените фильтры эндпоинтов или включите устаревшие операции.",
    "workspace.apiSliceBlocked":
      "Исправьте отсутствующие локальные ссылки и встроите объекты путей для экспорта. Предпросмотр доступен для проверки.",
    "workspace.apiSlicePreview": "Предпросмотр части OpenAPI",
    "workspace.apiSliceCopy": "Копировать часть API",
    "workspace.apiSliceDownload": "Скачать часть API",
    "workspace.apiSliceCopySuccess": "Часть OpenAPI скопирована.",
    "workspace.apiSliceCopyError":
      "Не удалось скопировать часть API. Попробуйте скачать её.",
    "workspace.apiSliceDownloadSuccess": "Скачивание части OpenAPI началось.",
    "workspace.apiSliceDownloadError":
      "Не удалось скачать часть API. Попробуйте скопировать её.",
    "about.courseTextAfter": ".",
    "about.courseTextBefore":
      "Итоговое задание модуля React от RS School. Подробнее: ",
    "about.courseTitle": "Курс",
    "about.description":
      "RSSwag - командный проект для курса React от RS School. Приложение создается как редактор OpenAPI, просмотрщик, REST-клиент и рабочее пространство истории запросов.",
    "about.githubLabel": "GitHub:",
    "about.label": "О проекте",
    "about.roleLabel": "Роль:",
    "about.roleText": "отвечает за все.",
    "about.schoolLink": "RS School",
    "about.stackText": "Next.js, React, TypeScript и Tailwind CSS.",
    "about.stackTitle": "Стек",
    "about.teamTitle": "Команда",
    "about.title": "RSSwag OpenAPI UI",
    "apiReference.description":
      "Основной редактор и просмотрщик находятся на главной странице. Этот маршрут готов для отдельного справочника, если команда решит разделить его позже.",
    "apiReference.label": "API справочник",
    "apiReference.title": "Документация эндпоинтов",
    "auth.account": "Аккаунт RSSwag",
    "auth.alreadyHaveAccount": "Уже есть аккаунт?",
    "auth.email": "Email",
    "auth.errors.emailInvalid": "Введите корректный email.",
    "auth.errors.emailRequired": "Email обязателен.",
    "auth.errors.passwordDigit": "Пароль должен содержать хотя бы одну цифру.",
    "auth.errors.passwordLetter": "Пароль должен содержать хотя бы одну букву.",
    "auth.errors.passwordLength": "Пароль должен содержать минимум 8 символов.",
    "auth.errors.passwordRequired": "Пароль обязателен.",
    "auth.errors.passwordSpecial":
      "Пароль должен содержать хотя бы один специальный символ.",
    "auth.hidePassword": "Скрыть пароль",
    "auth.hidePasswordShort": "Скрыть",
    "auth.needAccount": "Нужен аккаунт?",
    "auth.password": "Пароль",
    "auth.passwordPlaceholder": "Пароль",
    "auth.signIn": "Войти",
    "auth.signInShort": "Вход",
    "auth.signInHelper": "С возвращением в рабочее пространство OpenAPI.",
    "auth.signOut": "Выйти",
    "auth.signUp": "Зарегистрироваться",
    "auth.signUpShort": "Регистрация",
    "auth.signUpHelper":
      "Начните работу с сохраненными схемами и историей запросов.",
    "auth.showPassword": "Показать пароль",
    "auth.showPasswordShort": "Показать",
    "common.goHome": "На главную",
    "common.openEditor": "Открыть редактор",
    "error.description":
      "Приложение не смогло завершить это действие. Попробуйте снова или вернитесь на главную страницу редактора.",
    "error.errorId": "ID ошибки: {digest}",
    "error.label": "Ошибка",
    "error.title": "Что-то пошло не так",
    "error.tryAgain": "Попробовать снова",
    "footer.copyright":
      "© {year} RSSwag. Создано для курса React от RS School.",
    "footer.course": "Курс RS School",
    "footer.github": "Исходный код на GitHub",
    "footer.navigate": "Навигация",
    "footer.navigation": "Навигация в футере",
    "footer.resources": "Ресурсы",
    "footer.tagline":
      "Редактор и просмотрщик OpenAPI, REST-клиент и история запросов.",
    "footer.workspace": "Рабочее пространство RSSwag OpenAPI",
    "history.duration": "Длительность",
    "history.analytics": "Аналитика истории",
    "history.averageDuration": "Средняя длительность",
    "history.averageDurationValue": "{duration} мс",
    "history.backToHistory": "Вернуться к истории",
    "history.allDurations": "Любая длительность",
    "history.allMethods": "Все методы",
    "history.allOutcomes": "Все",
    "history.allTime": "За всё время",
    "history.ageFilterLabel": "Фильтр истории по времени",
    "history.clearAll": "Очистить всё",
    "history.clearAllConfirm":
      "Удалить все {count} записи истории? Это действие необратимо.",
    "history.clearAllError": "Не удалось очистить историю. Попробуйте снова.",
    "history.clearing": "Очистка...",
    "history.copyDetails": "Скопировать детали запроса",
    "history.copyDetailsError": "Не удалось скопировать детали запроса.",
    "history.copyingVisible": "Копирование...",
    "history.copyVisible": "Копировать видимые",
    "history.copyVisibleError":
      "Не удалось скопировать видимую историю запросов.",
    "history.copyVisibleSuccess": "Видимая история запросов скопирована.",
    "history.delete": "Удалить",
    "history.deleteAriaLabel": "Удалить {summary}",
    "history.deleteConfirm": 'Удалить "{summary}"? Это действие необратимо.',
    "history.deleteError": "Не удалось удалить запись. Попробуйте снова.",
    "history.deleting": "Удаление...",
    "history.detailsCopied": "Детали запроса скопированы.",
    "history.detailsTitle": "Детали запроса",
    "history.downloadDetails": "Скачать JSON",
    "history.downloadDetailsError": "Не удалось экспортировать этот запрос.",
    "history.downloadDetailsSuccess": "Экспорт запроса начался.",
    "history.duration100To499": "100-499 мс",
    "history.duration500Plus": "500 мс или больше",
    "history.durationFilterLabel": "Фильтр истории по длительности запроса",
    "history.durationUnder100": "Меньше 100 мс",
    "history.empty":
      "Вы еще не выполняли запросы. Начните с редактора или откройте API справочник, чтобы изучить текущую схему.",
    "history.endpoint": "Эндпоинт",
    "history.errorDetails": "Детали ошибки",
    "history.exportAriaLabel": "Экспортировать видимую историю запросов",
    "history.exportVisible": "Экспортировать",
    "history.exportVisibleError":
      "Не удалось экспортировать видимую историю запросов.",
    "history.exportVisibleSuccess": "Видимая история запросов экспортирована.",
    "history.failedRequests": "С ошибкой",
    "history.filterLabel": "Фильтр истории запросов",
    "history.filterPlaceholder": "Поиск в истории запросов",
    "history.filterSummary": "Показано запросов: {visible} из {total}",
    "history.history": "История",
    "history.last24Hours": "Последние 24 часа",
    "history.last7Days": "Последние 7 дней",
    "history.last30Days": "Последние 30 дней",
    "history.method": "Метод",
    "history.methodFilterLabel": "Фильтр истории по HTTP-методу",
    "history.noErrors": "Ошибки не зафиксированы.",
    "history.noMatches":
      "Нет записей истории, соответствующих текущим фильтрам.",
    "history.notFound": "Эта запись истории недоступна.",
    "history.openEndpoint": "Открыть эндпоинт в редакторе",
    "history.outcomeFilterLabel": "Фильтр истории по результату",
    "history.privateRoute": "Приватный маршрут",
    "history.recent":
      "Просматривайте выполненные запросы и подробную информацию о них.",
    "history.requestSize": "Размер запроса",
    "history.resetFilters": "Сбросить фильтры",
    "history.responseSize": "Размер ответа",
    "history.sortFastest": "Сначала быстрые",
    "history.sortFailures": "Сначала с ошибками",
    "history.sortLabel": "Сортировка истории запросов",
    "history.sortNewest": "Сначала новые",
    "history.sortOldest": "Сначала старые",
    "history.sortSlowest": "Сначала медленные",
    "history.status": "Статус",
    "history.statsLabel": "Статистика видимых запросов",
    "history.summary": "Описание",
    "history.successRate": "Доля успешных",
    "history.successfulRequests": "Успешные",
    "history.timestamp": "Дата и время",
    "history.totalRequests": "Всего запросов",
    "history.viewDetails": "Посмотреть детали: {summary}",
    "i18n.enShort": "АНГЛ",
    "i18n.english": "Английский",
    "i18n.ruShort": "РУС",
    "i18n.russian": "Русский",
    "nav.about": "О проекте",
    "nav.apiReference": "API-документация",
    "nav.home": "Главная",
    "nav.mainNavigation": "Основная навигация",
    "nav.schemas": "Схемы",
    "notFound.description":
      "Страница не существует или ссылка больше недоступна.",
    "notFound.label": "404",
    "notFound.title": "Страница не найдена",
    "schemas.allEndpointStates": "Все состояния эндпоинтов",
    "schemas.allFormats": "Все форматы",
    "schemas.characters": "Символы",
    "schemas.clearAll": "Очистить всё",
    "schemas.clearAllConfirm":
      "Удалить все {count} сохраненные схемы? Это действие необратимо.",
    "schemas.clearAllError": "Не удалось очистить схемы. Попробуйте снова.",
    "schemas.clearing": "Очистка...",
    "schemas.copied": "Схема скопирована.",
    "schemas.copy": "Копировать",
    "schemas.copyAriaLabel": "Копировать {title}",
    "schemas.copyError": "Не удалось скопировать схему.",
    "schemas.copying": "Копирование...",
    "schemas.delete": "Удалить",
    "schemas.deleteAriaLabel": "Удалить {title}",
    "schemas.deleteConfirm": 'Удалить "{title}"? Это действие необратимо.',
    "schemas.deleteError": "Не удалось удалить схему. Попробуйте снова.",
    "schemas.deleting": "Удаление...",
    "schemas.description":
      "Сохраненные в редакторе схемы показаны здесь от новых к старым.",
    "schemas.download": "Скачать",
    "schemas.downloadAriaLabel": "Скачать {title}",
    "schemas.downloadError": "Не удалось начать скачивание.",
    "schemas.downloadStarted": "Скачивание началось.",
    "schemas.duplicate": "Дублировать",
    "schemas.duplicateAriaLabel": "Дублировать {title}",
    "schemas.duplicateError": "Не удалось дублировать схему. Попробуйте снова.",
    "schemas.duplicateTitle": "{title} (копия)",
    "schemas.duplicating": "Дублирование...",
    "schemas.empty":
      "Вы еще не сохраняли схемы. Сохраните валидную схему OpenAPI в редакторе, чтобы увидеть ее здесь.",
    "schemas.endpointFilterLabel":
      "Фильтр сохраненных схем по наличию эндпоинтов",
    "schemas.endpoints": "Эндпоинты",
    "schemas.exportAll": "Экспортировать все",
    "schemas.exportVisible": "Экспортировать видимые",
    "schemas.filterLabel": "Фильтр сохраненных схем",
    "schemas.filterPlaceholder": "Поиск схем",
    "schemas.filterSummary": "Показано схем: {visible} из {total}",
    "schemas.format": "Формат",
    "schemas.formatFilterLabel": "Фильтр сохраненных схем по формату",
    "schemas.hidePreview": "Скрыть просмотр",
    "schemas.hidePreviewAriaLabel": "Скрыть просмотр схемы {title}",
    "schemas.label": "Схемы",
    "schemas.lines": "Строки",
    "schemas.noMatches":
      "Нет сохраненных схем, соответствующих текущим фильтрам.",
    "schemas.openEditor": "Открыть в редакторе",
    "schemas.openEditorAriaLabel": "Открыть {title} в редакторе",
    "schemas.openEditorError": "Не удалось открыть схему в редакторе.",
    "schemas.preview": "Просмотр",
    "schemas.previewAriaLabel": "Просмотреть {title}",
    "schemas.previewContentAriaLabel": "Предпросмотр схемы {title}",
    "schemas.rename": "Переименовать",
    "schemas.renameAriaLabel": "Переименовать {title}",
    "schemas.renameCancel": "Отмена",
    "schemas.renameError": "Не удалось переименовать схему. Попробуйте снова.",
    "schemas.renameInputLabel": "Новое название",
    "schemas.renameSave": "Сохранить",
    "schemas.renameTitleRequired": "Введите название.",
    "schemas.renaming": "Сохранение...",
    "schemas.resetFilters": "Сбросить фильтры",
    "schemas.schemaSize": "Размер",
    "schemas.sortEndpoints": "Больше эндпоинтов",
    "schemas.sortLabel": "Сортировка сохраненных схем",
    "schemas.sortLargest": "Сначала большие",
    "schemas.sortNewest": "Сначала новые",
    "schemas.sortOldest": "Сначала старые",
    "schemas.sortTitle": "Название А-Я",
    "schemas.title": "Сохраненные схемы OpenAPI",
    "schemas.unavailable": "Недоступно",
    "schemas.updated": "Обновлено",
    "schemas.version": "Версия",
    "schemas.withEndpoints": "С эндпоинтами",
    "schemas.withoutEndpoints": "Без эндпоинтов",
    "workspace.addValidSchema":
      "Добавьте корректную схему OpenAPI, чтобы заполнить просмотрщик.",
    "workspace.addEndpointFavorite": "Добавить {method} {path} в избранное",
    "workspace.allEndpoints": "Все эндпоинты",
    "workspace.allResponses": "Любое покрытие ответов",
    "workspace.allMethods": "Все методы",
    "workspace.allTags": "Все теги",
    "workspace.applyServerOverride": "Применить сервер",
    "workspace.auditCoverage": "Покрытие аудита",
    "workspace.auditCoverageValue": "{passed}/{total}",
    "workspace.auditCopy": "Копировать сводку аудита",
    "workspace.auditCopyError": "Не удалось скопировать сводку аудита.",
    "workspace.auditCopySuccess": "Сводка аудита скопирована.",
    "workspace.auditExport": "Экспорт аудита JSON",
    "workspace.auditExportError": "Не удалось экспортировать отчет аудита.",
    "workspace.auditExportSuccess": "Экспорт аудита начался.",
    "workspace.auditFilterAll": "Все ({count})",
    "workspace.auditFilterErrors": "Ошибки ({count})",
    "workspace.auditFilterInfo": "Информация ({count})",
    "workspace.auditFilterLabel": "Результаты аудита",
    "workspace.auditFilterWarnings": "Предупреждения ({count})",
    "workspace.auditIssueDuplicateOperationId":
      'operationId "{operationId}" повторяется.',
    "workspace.auditIssueMissingDocumentation":
      "Добавьте краткое или подробное описание.",
    "workspace.auditIssueMissingErrorResponse":
      "Опишите ответ с ошибкой 4xx, 5xx или default.",
    "workspace.auditIssueMissingOperationId":
      "Добавьте уникальный operationId.",
    "workspace.auditIssueMissingPathParameter":
      'Определите параметр пути "{parameter}".',
    "workspace.auditIssueMissingSuccessResponse": "Опишите успешный ответ 2xx.",
    "workspace.auditIssueMissingTags": "Добавьте хотя бы один тег операции.",
    "workspace.auditIssueNoEndpoints": "Добавьте хотя бы одну операцию API.",
    "workspace.auditMetricDocumentation": "Документированы",
    "workspace.auditMetricErrorResponses": "Ответы с ошибками",
    "workspace.auditMetricOperationIds": "Уникальные operation ID",
    "workspace.auditMetricPathParameters": "Покрытие параметров пути",
    "workspace.auditMetricSuccessResponses": "Успешные ответы",
    "workspace.auditMetricTags": "С тегами",
    "workspace.auditMarkdownCoverage": "Покрытие",
    "workspace.auditMarkdownFindings": "Замечания",
    "workspace.auditMarkdownScore":
      "Оценка качества: {score}% (пройдено {passed}/{total} проверок)",
    "workspace.auditMarkdownTitle": "Аудит качества API: {title}",
    "workspace.auditMarkdownVersion": "Версия схемы: {version}",
    "workspace.auditNoFilteredIssues": "Для выбранного уровня замечаний нет.",
    "workspace.auditNoIssues": "Все проверки качества пройдены.",
    "workspace.auditScore": "Оценка качества: {score}%",
    "workspace.auditSeverityError": "Ошибка",
    "workspace.auditSeverityInfo": "Информация",
    "workspace.auditSeverityWarning": "Предупреждение",
    "workspace.auditShowAll": "Показать все ({count})",
    "workspace.auditShowLess": "Показать меньше",
    "workspace.auditTitle": "Аудит качества API",
    "workspace.auditViewEndpoint": "Открыть эндпоинт",
    "workspace.authRequired": "Auth: {schemes}",
    "workspace.changeAddedLabel": "Добавлено",
    "workspace.changeBaseline": "Базовая версия: {title} v{version} | {date}",
    "workspace.changeBreakingLabel": "Критические",
    "workspace.changeClearBaseline": "Удалить базовую версию",
    "workspace.changeDetailDeprecated": "Операция помечена устаревшей.",
    "workspace.changeDetailDocumentationChanged":
      "Изменено краткое или подробное описание.",
    "workspace.changeDetailOperationIdAdded":
      'Добавлен operationId "{current}".',
    "workspace.changeDetailOperationIdChanged":
      'operationId изменен с "{previous}" на "{current}".',
    "workspace.changeDetailOperationIdRemoved":
      'Удален operationId "{previous}".',
    "workspace.changeDetailOptionalParameterAdded":
      "Добавлен необязательный параметр {location} {name}.",
    "workspace.changeDetailParameterBecameOptional":
      "Параметр {location} {name} стал необязательным.",
    "workspace.changeDetailParameterBecameRequired":
      "Параметр {location} {name} стал обязательным.",
    "workspace.changeDetailParameterRemoved":
      "Удален параметр {location} {name}.",
    "workspace.changeDetailRequestBodyAdded":
      "Добавлено тело запроса {contentType}.",
    "workspace.changeDetailRequestBodyBecameOptional":
      "Тело запроса {contentType} стало необязательным.",
    "workspace.changeDetailRequestBodyBecameRequired":
      "Тело запроса {contentType} стало обязательным.",
    "workspace.changeDetailRequestBodyRemoved":
      "Удалено тело запроса {contentType}.",
    "workspace.changeDetailRequiredParameterAdded":
      "Добавлен обязательный параметр {location} {name}.",
    "workspace.changeDetailResponseAdded": "Добавлен ответ {status}.",
    "workspace.changeDetailResponseRemoved": "Удален ответ {status}.",
    "workspace.changeDetailSecurityAdded": "Теперь требуется аутентификация.",
    "workspace.changeDetailSecurityRemoved":
      "Аутентификация больше не требуется.",
    "workspace.changeDetailTagsChanged": "Изменены теги операции.",
    "workspace.changeDetailUndeprecated": "Метка устаревания удалена.",
    "workspace.changeEndpointAdded": "Операция добавлена.",
    "workspace.changeEndpointModified": "Изменений контракта: {count}.",
    "workspace.changeEndpointRemoved": "Операция удалена.",
    "workspace.changeExport": "Экспорт отчета об изменениях",
    "workspace.changeExportError":
      "Не удалось экспортировать отчет об изменениях.",
    "workspace.changeExportSuccess": "Экспорт отчета начался.",
    "workspace.changeFilterAdded": "Добавлено ({count})",
    "workspace.changeFilterAll": "Все ({count})",
    "workspace.changeFilterBreaking": "Критические ({count})",
    "workspace.changeFilterLabel": "Фильтр изменений API",
    "workspace.changeFilterModified": "Изменено ({count})",
    "workspace.changeFilterRemoved": "Удалено ({count})",
    "workspace.changeImpactBreaking": "Критическое",
    "workspace.changeImpactNonBreaking": "Некритическое",
    "workspace.changeInvalidBaseline":
      "Исправьте ошибки схемы перед созданием базовой версии.",
    "workspace.changeModifiedLabel": "Изменено",
    "workspace.changeMoreDetails": "Еще изменений: {count}",
    "workspace.changeNoBaseline": "Нет базовой версии для сравнения",
    "workspace.changeNoChanges": "Изменений API относительно базы нет.",
    "workspace.changeNoFilteredChanges":
      "Нет изменений, соответствующих фильтру.",
    "workspace.changeRemovedLabel": "Удалено",
    "workspace.changeSetBaseline": "Сделать текущую схему базовой",
    "workspace.changeShowAll": "Показать все ({count})",
    "workspace.changeShowLess": "Показать меньше",
    "workspace.changeStorageError":
      "Базовая версия изменена для этого сеанса, но локальное хранилище не обновлено.",
    "workspace.changeTitle": "Обзор изменений API",
    "workspace.changeUnchangedLabel": "Без изменений",
    "workspace.changeUpdateBaseline": "Обновить базовую версию",
    "workspace.checkpointCount": "Контрольные точки: {count}/{limit}",
    "workspace.checkpointCreate": "Создать точку",
    "workspace.checkpointCreated": 'Контрольная точка "{name}" создана.',
    "workspace.checkpointCreateForm": "Создать контрольную точку схемы",
    "workspace.checkpointDelete": "Удалить",
    "workspace.checkpointDeleteAriaLabel": "Удалить контрольную точку {name}",
    "workspace.checkpointDeleteConfirm": 'Удалить контрольную точку "{name}"?',
    "workspace.checkpointDeleted": 'Контрольная точка "{name}" удалена.',
    "workspace.checkpointDownload": "Скачать",
    "workspace.checkpointDownloadAriaLabel": "Скачать контрольную точку {name}",
    "workspace.checkpointDownloadError":
      "Не удалось скачать контрольную точку.",
    "workspace.checkpointDownloadStarted":
      "Скачивание контрольной точки началось.",
    "workspace.checkpointEndpoints": "Эндпоинтов: {count}",
    "workspace.checkpointInvalid": "Черновик с ошибками",
    "workspace.checkpointName": "Название контрольной точки",
    "workspace.checkpointNamePlaceholder": "До важных изменений",
    "workspace.checkpointNameRequired": "Введите название контрольной точки.",
    "workspace.checkpointNoItems": "Контрольных точек пока нет.",
    "workspace.checkpointRestore": "Восстановить",
    "workspace.checkpointRestoreAriaLabel":
      "Восстановить контрольную точку {name}",
    "workspace.checkpointRestoreConfirm":
      'Восстановить "{name}" в редакторе? Текущие изменения будут заменены.',
    "workspace.checkpointRestored":
      'Контрольная точка "{name}" восстановлена в редакторе.',
    "workspace.checkpointSchemaFallback": "Схема OpenAPI",
    "workspace.checkpointStorageError":
      "Контрольная точка изменена для этого сеанса, но локальное хранилище не обновлено.",
    "workspace.checkpointTitle": "Контрольные точки схемы",
    "workspace.checkpointTooLarge":
      "Размер схемы превышает лимит контрольной точки 2 МБ.",
    "workspace.checkpointValid": "Валидная схема",
    "workspace.cancelRequest": "Отменить запрос",
    "workspace.clearEndpointFilter": "Очистить поиск",
    "workspace.clearResponse": "Очистить ответ",
    "workspace.clearServerOverride": "Очистить свой сервер",
    "workspace.clientErrorResponseOnly": "Описан ответ 4xx",
    "workspace.collapseEndpointDetails": "Скрыть детали",
    "workspace.collapseEndpointDetailsAriaLabel":
      "Скрыть детали эндпоинта {method} {path}",
    "workspace.collapseVisibleEndpointDetails": "Свернуть видимые",
    "workspace.content": "Контент:",
    "workspace.convertTo": "Конвертировать в {format}",
    "workspace.copyCurl": "Скопировать cURL",
    "workspace.copyEndpointLink": "Скопировать ссылку",
    "workspace.copyEndpointLinkAriaLabel":
      "Скопировать ссылку на {method} {path}",
    "workspace.copyEndpointViewLink": "Скопировать ссылку на фильтры",
    "workspace.copyEndpointViewLinkAriaLabel":
      "Скопировать текущие фильтры эндпоинтов как ссылку",
    "workspace.copyFetch": "Скопировать fetch",
    "workspace.copyHttp": "Скопировать HTTP",
    "workspace.copyRequestUrl": "Скопировать URL запроса",
    "workspace.copyResponse": "Скопировать тело ответа",
    "workspace.copyResponseHeaders": "Скопировать заголовки ответа",
    "workspace.copySchema": "Скопировать схему",
    "workspace.cookie": "Cookie",
    "workspace.contractBody": "Структура тела",
    "workspace.contractBodyEmpty":
      "Ожидалось тело ответа типа {expected}, но оно пустое.",
    "workspace.contractBodyInvalidJson":
      "Не удалось разобрать тело ответа как {expected}.",
    "workspace.contractBodyMatched":
      "Структура верхнего уровня типа {type} совпадает.",
    "workspace.contractBodyMissingRequired":
      "Отсутствуют обязательные свойства: {properties}.",
    "workspace.contractBodyNotDocumented":
      "Структура тела для этого ответа не описана.",
    "workspace.contractBodyNotExpected":
      "Для этого метода или статуса тело ответа не ожидается.",
    "workspace.contractBodyTypeMismatch":
      "Ожидался тип {expected}, получен {actual}.",
    "workspace.contractCheckFailed": "Не пройдено",
    "workspace.contractContentType": "Тип содержимого",
    "workspace.contractContentTypeMatched":
      "Получен {actual}, в документации указан {documented}.",
    "workspace.contractContentTypeMismatch":
      "Получен {actual}; ожидался {expected}.",
    "workspace.contractContentTypeMissing":
      "Заголовок Content-Type отсутствует; ожидался {expected}.",
    "workspace.contractContentTypeNotDocumented":
      "Тип содержимого ответа не описан.",
    "workspace.contractCopy": "Копировать JSON отчёта",
    "workspace.contractCopyError":
      "Не удалось скопировать отчёт о контракте ответа.",
    "workspace.contractCopying": "Копирование...",
    "workspace.contractCopySuccess": "Отчёт о контракте ответа скопирован.",
    "workspace.contractFailed": "Найдены проблемы",
    "workspace.contractPassed": "Пройдено",
    "workspace.contractSkipped": "Не проверено",
    "workspace.contractStatus": "Статус",
    "workspace.contractStatusMatched":
      "Получен {actual}, совпадает с описанным ответом {documented}.",
    "workspace.contractStatusUndocumented": "Статус {actual} не описан.",
    "workspace.contractSummaryFailed":
      "Не пройдено проверок: {failed} из {checked}.",
    "workspace.contractSummaryPassed":
      "Все проверенные правила пройдены: {checked}.",
    "workspace.contractTitle": "Контракт ответа",
    "workspace.curl": "cURL",
    "workspace.curlCopied": "cURL скопирован.",
    "workspace.customServerUrl": "Свой URL сервера",
    "workspace.customServerUrlPlaceholder": "https://staging.example.com",
    "workspace.deprecated": "Устаревшие",
    "workspace.deprecatedEndpoint": "Устарел",
    "workspace.deprecatedOnly": "Только устаревшие",
    "workspace.download": "Скачать",
    "workspace.downloadRequestCode": "Скачать сниппет",
    "workspace.downloadRequestCodeAriaLabel":
      "Скачать сниппет {format} для {method} {path}",
    "workspace.downloadResponse": "Скачать ответ",
    "workspace.responseDownloadSuccess": "Скачивание ответа началось.",
    "workspace.responseDownloadError":
      "Не удалось скачать ответ. Попробуйте ещё раз или скопируйте тело ответа.",
    "workspace.draftSaveFailed": "Не удалось сохранить черновик.",
    "workspace.draftSaved": "Черновик сохранён локально.",
    "workspace.draftSaving": "Сохранение черновика...",
    "workspace.editor": "Редактор",
    "workspace.editorCursorPosition": "Строка {line}, столбец {column}",
    "workspace.editorDocumentStats":
      "Строк: {lines}, символов: {characters}, {size} Б",
    "workspace.editorDocumentStatsLabel": "Статистика документа схемы",
    "workspace.editorFontSize": "Размер шрифта редактора",
    "workspace.editorFontSizeLarge": "Крупный",
    "workspace.editorFontSizeMedium": "Средний",
    "workspace.editorFontSizeSmall": "Мелкий",
    "workspace.editorIndentSize": "Размер отступа",
    "workspace.editorIndentSizeFourSpaces": "4 пробела",
    "workspace.editorIndentSizeTwoSpaces": "2 пробела",
    "workspace.editorSelectionStats": "Выделено: {count}",
    "workspace.environmentAddHeader": "Добавить заголовок",
    "workspace.environmentBaseUrlSummary": "Базовый URL: {url}",
    "workspace.environmentCancel": "Отмена",
    "workspace.environmentCustomOverrideNotice":
      "Сейчас приоритет имеет одноразовый пользовательский URL сервера.",
    "workspace.environmentDelete": "Удалить",
    "workspace.environmentDeleteConfirm":
      'Удалить окружение запросов "{name}"?',
    "workspace.environmentDescription":
      "Переключайте общие базовые URL и заголовки запросов для всех эндпоинтов.",
    "workspace.environmentEdit": "Изменить",
    "workspace.environmentEditForm": "Изменить окружение запросов",
    "workspace.environmentHeaderCount": "Общие заголовки: {count}",
    "workspace.environmentHeaderEnabled": "Включить заголовок {index}",
    "workspace.environmentHeaderEnabledLabel": "Вкл.",
    "workspace.environmentHeaderInvalid":
      "Для каждого заполненного заголовка укажите корректное HTTP-имя и однострочное значение.",
    "workspace.environmentHeaderName": "Имя",
    "workspace.environmentHeaderNameLabel": "Имя заголовка {index}",
    "workspace.environmentHeaderNamePlaceholder": "Authorization",
    "workspace.environmentHeaderValue": "Значение",
    "workspace.environmentHeaderValueLabel": "Значение заголовка {index}",
    "workspace.environmentHeaderValuePlaceholder": "Bearer token",
    "workspace.environmentLocalOnly":
      "Профили хранятся в этом браузере. Поля заголовков эндпоинта имеют приоритет над общими.",
    "workspace.environmentName": "Название профиля",
    "workspace.environmentNamePlaceholder": "Тестовое окружение",
    "workspace.environmentNameRequired": "Введите название профиля.",
    "workspace.environmentNew": "Новое окружение",
    "workspace.environmentNewForm": "Создать окружение запросов",
    "workspace.environmentNone": "Сервер схемы (без окружения)",
    "workspace.environmentRemove": "Убрать",
    "workspace.environmentRemoveHeader": "Убрать заголовок {index}",
    "workspace.environmentSave": "Сохранить окружение",
    "workspace.environmentSaved": "Окружения запросов сохранены локально.",
    "workspace.environmentSchemaServer": "Использовать сервер схемы",
    "workspace.environmentSelector": "Активное окружение запросов",
    "workspace.environmentServerInvalid":
      "Введите публичный базовый URL с HTTP или HTTPS либо оставьте поле пустым.",
    "workspace.environmentServerUrl": "Базовый URL (необязательно)",
    "workspace.environmentServerUrlPlaceholder":
      "https://staging.example.com/v1",
    "workspace.environmentSharedHeaders": "Общие заголовки запросов",
    "workspace.environmentStorageError":
      "Окружение изменено для этого сеанса, но локальное хранилище не обновлено.",
    "workspace.environmentTitle": "Окружения запросов",
    "workspace.wordWrap": "Перенос строк",
    "workspace.endpointStats": "Статистика эндпоинтов",
    "workspace.endpointFilterSummary":
      "Показано эндпоинтов: {visible} из {total}",
    "workspace.endpointCollapseSaveError":
      "Детали эндпоинтов изменены для этого сеанса, но не сохранены локально.",
    "workspace.endpointInventoryExportError":
      "Не удалось экспортировать список видимых эндпоинтов.",
    "workspace.endpointInventoryExportSuccess":
      "Экспорт CSV с видимыми эндпоинтами начат.",
    "workspace.endpointLinkCopied": "Ссылка скопирована.",
    "workspace.endpointResponseFilterLabel":
      "Фильтр эндпоинтов по документированным ответам",
    "workspace.endpointSortLabel": "Сортировать эндпоинты",
    "workspace.endpointTraitFilterLabel": "Фильтр эндпоинтов по характеристике",
    "workspace.endpointViewLinkCopied": "Ссылка на фильтры скопирована.",
    "workspace.endpointViewLinkCopyError":
      "Не удалось скопировать ссылку на фильтры.",
    "workspace.errorPosition": "Ошибка в строке {line}, столбец {column}",
    "workspace.executionMode": "Режим выполнения",
    "workspace.executionModeLive": "Реальный",
    "workspace.executionModeMock": "Mock",
    "workspace.executionModeStorageError":
      "Режим изменён для текущего сеанса, но сохранить его не удалось.",
    "workspace.executing": "Выполняется...",
    "workspace.goToLine": "К строке",
    "workspace.goToLineAction": "Перейти",
    "workspace.lineEndings": "Концы строк",
    "workspace.lineEndingsCr": "CR (устаревший)",
    "workspace.lineEndingsMixed": "Смешанные",
    "workspace.lineEndingsNone": "Нет",
    "workspace.matchCase": "Учитывать регистр",
    "workspace.wholeWord": "Слово целиком",
    "workspace.errors.fileReadFailed": "Не удалось прочитать файл.",
    "workspace.confirmLargeImport":
      "Размер файла превышает 5 МБ, что может замедлить редактор. Все равно импортировать?",
    "workspace.errors.infoTitleRequired": "Поле schema info.title обязательно.",
    "workspace.errors.pathsRequired": "Объект schema paths обязателен.",
    "workspace.errors.schemaObject": "Схема должна быть объектом.",
    "workspace.errors.versionRequired":
      "Схема должна содержать версию openapi или swagger.",
    "workspace.expandEndpointDetails": "Показать детали",
    "workspace.expandEndpointDetailsAriaLabel":
      "Показать детали эндпоинта {method} {path}",
    "workspace.expandVisibleEndpointDetails": "Развернуть видимые",
    "workspace.exportEndpointInventory": "Экспорт видимых CSV",
    "workspace.exportEndpointInventoryAriaLabel":
      "Экспортировать видимые эндпоинты в CSV",
    "workspace.fetch": "Fetch",
    "workspace.fetchCopied": "Fetch-код скопирован.",
    "workspace.favoriteEndpoints": "Избранное ({count})",
    "workspace.favoriteSaveError":
      "Избранное обновлено для этого сеанса, но не сохранено локально.",
    "workspace.filterEndpoints":
      "Фильтр по методу, пути, описанию, ID операции, тегу, параметру или auth",
    "workspace.formatSchema": "Форматировать схему",
    "workspace.generateMockResponse": "Создать Mock",
    "workspace.goToError": "Перейти к ошибке",
    "workspace.guestRun": "Гостевой запуск",
    "workspace.generatedMockResponse": "Сгенерированный Mock-ответ",
    "workspace.header": "Заголовок",
    "workspace.http": "HTTP",
    "workspace.httpCopied": "HTTP-запрос скопирован.",
    "workspace.import": "Импорт",
    "workspace.invalid": "Невалидно",
    "workspace.invalidServerOverride":
      "Введите публичный URL сервера с HTTP или HTTPS.",
    "workspace.methodFilterLabel": "Фильтр эндпоинтов по HTTP-методу",
    "workspace.methods": "Методы",
    "workspace.registryAllKinds": "Все типы компонентов",
    "workspace.registryBroken": "Нарушена",
    "workspace.registryBrokenDependencies": "Нарушенных зависимостей: {count}",
    "workspace.registryCopyError": "Не удалось скопировать схему Mermaid.",
    "workspace.registryCopyMermaid": "Копировать Mermaid",
    "workspace.registryCopyReference": "Копировать ссылку",
    "workspace.registryCopySuccess": "Граф зависимостей скопирован.",
    "workspace.registryCycle": "Цикл",
    "workspace.registryDependsOn": "Зависит от",
    "workspace.registryExport": "Экспорт отчёта",
    "workspace.registryExportError":
      "Не удалось экспортировать реестр компонентов.",
    "workspace.registryExportSuccess": "Экспорт реестра компонентов начат.",
    "workspace.registryExternal": "Внешняя",
    "workspace.registryExternalDependencies": "Внешних зависимостей: {count}",
    "workspace.registryFilterAll": "Все ({count})",
    "workspace.registryFilterIssues": "Требуют проверки ({count})",
    "workspace.registryFilterLabel": "Фильтр переиспользуемых компонентов",
    "workspace.registryFilterUnused": "Не используются ({count})",
    "workspace.registryFilterUsed": "Достижимы ({count})",
    "workspace.registryFindingBroken":
      "Локальная ссылка не разрешена: {reference}.",
    "workspace.registryFindingExternal":
      "Внешняя ссылка находится за пределами документа: {reference}.",
    "workspace.registryFindingsTitle": "Проблемы ссылок",
    "workspace.registryHideDetails": "Скрыть сведения",
    "workspace.registryKindCallback": "Обратный вызов",
    "workspace.registryKindExample": "Пример",
    "workspace.registryKindHeader": "Заголовок",
    "workspace.registryKindLink": "Связь",
    "workspace.registryKindMediaType": "Тип содержимого",
    "workspace.registryKindParameter": "Параметр",
    "workspace.registryKindPathItem": "Элемент пути",
    "workspace.registryKindRequestBody": "Тело запроса",
    "workspace.registryKindResponse": "Ответ",
    "workspace.registryKindSchema": "Схема",
    "workspace.registryKindSecurityScheme": "Схема безопасности",
    "workspace.registryKindFilterLabel": "Фильтр компонентов по типу",
    "workspace.registryNoMatches": "Нет компонентов для этого представления.",
    "workspace.registryNoUsage": "Прямые ссылки на компонент отсутствуют.",
    "workspace.registryNone": "Нет",
    "workspace.registryReferenceCopyError":
      "Не удалось скопировать ссылку на {name}.",
    "workspace.registryReferenceCopySuccess": "Ссылка на {name} скопирована.",
    "workspace.registryReferenceCount": "Ссылок: {count}",
    "workspace.registryReferencedBy": "Используется компонентами",
    "workspace.registryRelationships": "Связи компонентов",
    "workspace.registryRootReferenceCount": "Из поверхности API: {count}",
    "workspace.registrySearch": "Поиск переиспользуемых компонентов",
    "workspace.registrySearchPlaceholder":
      "Поиск по именам, указателям или зависимостям",
    "workspace.registryShowAll": "Показать все компоненты ({count})",
    "workspace.registryShowAllFindings": "Показать все проблемы ({count})",
    "workspace.registryShowDetails": "Показать сведения",
    "workspace.registryShowLess": "Показать меньше компонентов",
    "workspace.registryShowLessFindings": "Показать меньше проблем",
    "workspace.registryStatComponents": "Компоненты",
    "workspace.registryStatReferenceIssues": "Проблемы ссылок",
    "workspace.registryStatUnused": "Не используются",
    "workspace.registryStatUsed": "Достижимы",
    "workspace.registrySummary":
      "Не используются: {unused}, нарушенных ссылок: {broken}, внешних ссылок: {external}, циклов: {cycles}.",
    "workspace.registryTitle": "Реестр переиспользуемых компонентов",
    "workspace.registryUnused": "Не используется",
    "workspace.registryUsageSources": "Источники прямых ссылок",
    "workspace.registryUsed": "Достижим",
    "workspace.registryUsedSummary": "Достижимы {used} из {total}",
    "workspace.modelsCopyExample": "Копировать пример",
    "workspace.modelsCopyTypeScript": "Копировать TypeScript",
    "workspace.modelsDeprecated": "Устарело",
    "workspace.modelsEnum": "Значения: {values}",
    "workspace.modelsExample": "Пример",
    "workspace.modelsExampleCopyError": "Не удалось скопировать пример {name}.",
    "workspace.modelsExampleCopySuccess": "Пример {name} скопирован.",
    "workspace.modelsExport": "Экспорт TypeScript",
    "workspace.modelsExportError": "Не удалось экспортировать модели данных.",
    "workspace.modelsExportSuccess": "Экспорт моделей TypeScript начался.",
    "workspace.modelsFilterAll": "Все ({count})",
    "workspace.modelsFilterLabel": "Фильтр моделей данных",
    "workspace.modelsFilterUnused": "Не используются ({count})",
    "workspace.modelsFilterUsed": "Используются ({count})",
    "workspace.modelsFormat": "Формат: {format}",
    "workspace.modelsHideDetails": "Скрыть детали",
    "workspace.modelsNoMatches": "В этом представлении нет моделей данных.",
    "workspace.modelsNoProperties": "Свойства объекта не объявлены.",
    "workspace.modelsNone": "Нет",
    "workspace.modelsNoUsage": "Не используется операциями API.",
    "workspace.modelsNullable": "Может быть null",
    "workspace.modelsOptional": "Необязательно",
    "workspace.modelsProperties": "Свойства",
    "workspace.modelsPropertyCount": "Свойств: {count}",
    "workspace.modelsReadOnly": "Только чтение",
    "workspace.modelsReferencedBy": "Используется моделями",
    "workspace.modelsReferences": "Ссылается на",
    "workspace.modelsRelationships": "Связи моделей",
    "workspace.modelsRequired": "Обязательно",
    "workspace.modelsSearch": "Поиск моделей данных",
    "workspace.modelsSearchPlaceholder": "Модели или свойства",
    "workspace.modelsShowAll": "Показать все ({count})",
    "workspace.modelsShowDetails": "Показать детали",
    "workspace.modelsShowLess": "Показать меньше",
    "workspace.modelsSummary": "Операциями API используются {used} из {total}",
    "workspace.modelsTitle": "Обзор моделей данных",
    "workspace.modelsTypeScript": "TypeScript",
    "workspace.modelsTypeScriptCopyError":
      "Не удалось скопировать объявление TypeScript для {name}.",
    "workspace.modelsTypeScriptCopySuccess":
      "Объявление TypeScript для {name} скопировано.",
    "workspace.modelsUnused": "Не используется",
    "workspace.modelsUsageRequest": "Запрос",
    "workspace.modelsUsageResponse": "Ответ",
    "workspace.modelsUsed": "Используется",
    "workspace.modelsUsedBy": "Используется операциями",
    "workspace.modelsWriteOnly": "Только запись",
    "workspace.mockLatency": "Задержка Mock",
    "workspace.mockLatencyInstant": "Мгновенно",
    "workspace.mockLatencyMilliseconds": "{milliseconds} мс",
    "workspace.mockResponse": "Mock-ответ",
    "workspace.mockSuiteBodyDocumented": "Документированный пример.",
    "workspace.mockSuiteBodyGenerated": "Сгенерированный пример.",
    "workspace.mockSuiteBodyNone": "Нет примера тела ответа.",
    "workspace.mockSuiteChecks":
      "Пройдено: {passed}, ошибок: {failed}, пропущено: {skipped}.",
    "workspace.mockSuiteEmpty": "Результатов набора пока нет.",
    "workspace.mockSuiteExport": "Экспорт JSON набора",
    "workspace.mockSuiteExportError": "Не удалось экспортировать отчет набора.",
    "workspace.mockSuiteExportSuccess": "Экспорт набора начат.",
    "workspace.mockSuiteFailed": "Ошибки",
    "workspace.mockSuiteFilterAll": "Все ({count})",
    "workspace.mockSuiteFilterFailed": "Ошибки ({count})",
    "workspace.mockSuiteFilterLabel":
      "Фильтр результатов набора Mock-контрактов",
    "workspace.mockSuiteFilterPartial": "Частично ({count})",
    "workspace.mockSuiteFilterPassed": "Пройдено ({count})",
    "workspace.mockSuiteNoEndpoints": "В этой области нет эндпоинтов.",
    "workspace.mockSuiteNoFilteredResults":
      "Нет результатов набора для этого фильтра.",
    "workspace.mockSuitePartial": "Частично",
    "workspace.mockSuitePassed": "Пройдено",
    "workspace.mockSuiteResponse": "Ответ {status}",
    "workspace.mockSuiteResultFailed": "Ошибка",
    "workspace.mockSuiteResultPartial": "Частично",
    "workspace.mockSuiteResultPassed": "Пройдено",
    "workspace.mockSuiteResults": "Результаты набора Mock-контрактов",
    "workspace.mockSuiteRun": "Запустить Mock-набор",
    "workspace.mockSuiteScope": "Область набора",
    "workspace.mockSuiteScopeAll": "Все эндпоинты ({count})",
    "workspace.mockSuiteScopeVisible": "Видимые эндпоинты ({count})",
    "workspace.mockSuiteTitle": "Набор Mock-контрактов",
    "workspace.mockSuiteTotal": "Сценарии",
    "workspace.missingErrorResponseOnly": "Не описан ответ об ошибке",
    "workspace.namedExample": "Пример: {name}",
    "workspace.noEndpointsMatch":
      "Нет эндпоинтов, соответствующих текущим фильтрам.",
    "workspace.noFavoriteEndpoints":
      "В текущей схеме нет избранных эндпоинтов.",
    "workspace.nextMatch": "Следующее совпадение",
    "workspace.noResponseExample":
      "Пример ответа недоступен для {method} {path}.",
    "workspace.none": "Нет",
    "workspace.openApiSchema": "Схема OpenAPI",
    "workspace.previousMatch": "Предыдущее совпадение",
    "workspace.operationId": "ID операции: {id}",
    "workspace.parameters": "параметры",
    "workspace.parameterExamplePlaceholder": "Пример: {value}",
    "workspace.parameterBoolean":
      "Параметр {name} должен быть равен true или false.",
    "workspace.parameterEnum":
      "Параметр {name} должен иметь одно из значений: {values}.",
    "workspace.parameterInputLabel": "{location} параметр {name}",
    "workspace.parameterInteger": "Параметр {name} должен быть целым числом.",
    "workspace.parameterMaximum":
      "Параметр {name} должен быть не больше {maximum}.",
    "workspace.parameterMaxLength":
      "Параметр {name} должен содержать не более {maximum} символов.",
    "workspace.parameterMinimum":
      "Параметр {name} должен быть не меньше {minimum}.",
    "workspace.parameterMinLength":
      "Параметр {name} должен содержать не менее {minimum} символов.",
    "workspace.parameterNumber": "Параметр {name} должен быть числом.",
    "workspace.parameterPattern":
      "Параметр {name} должен соответствовать шаблону {pattern}.",
    "workspace.parameterRequired": "Параметр {name} обязателен.",
    "workspace.parameterValuePlaceholder": "Введите значение",
    "workspace.path": "Path",
    "workspace.eventCopy": "Копировать сводку",
    "workspace.eventCopyError":
      "Не удалось скопировать сводку контрактов событий.",
    "workspace.eventCopySuccess": "Сводка контрактов событий скопирована.",
    "workspace.eventDeprecated": "Устарела",
    "workspace.eventDocumentedSummary": "Документировано: {documented}/{total}",
    "workspace.eventExample": "Пример payload",
    "workspace.eventExport": "Экспорт отчёта",
    "workspace.eventExportError": "Не удалось экспортировать отчёт о событиях.",
    "workspace.eventExportSuccess": "Экспорт отчёта о событиях начат.",
    "workspace.eventFilterAll": "Все операции ({count})",
    "workspace.eventFilterCallbacks": "Callbacks ({count})",
    "workspace.eventFilterIssues": "Требуют проверки ({count})",
    "workspace.eventFilterLabel": "Фильтр контрактов событий",
    "workspace.eventFilterWebhooks": "Webhooks ({count})",
    "workspace.eventFindingEmptyChannel": "{name} не объявляет HTTP-операцию.",
    "workspace.eventFindingExternalReference":
      "Внешняя ссылка для {name} не может быть разрешена: {reference}.",
    "workspace.eventFindingUnresolvedReference":
      "Локальная ссылка для {name} не разрешена: {reference}.",
    "workspace.eventFindingsTitle": "Проблемы определений",
    "workspace.eventIndependent": "Независимое событие провайдера",
    "workspace.eventIssueExternalReference":
      "Внешняя ссылка контракта не может быть разрешена здесь: {reference}.",
    "workspace.eventIssueMissingDocumentation":
      "Добавьте summary или description для операции события.",
    "workspace.eventIssueMissingOperationId":
      "Добавьте operationId для стабильной генерации кода и инструментов.",
    "workspace.eventIssueMissingResponses":
      "Опишите хотя бы один ответ получателя.",
    "workspace.eventIssueUnresolvedReference":
      "Локальная ссылка контракта не разрешена: {reference}.",
    "workspace.eventKindCallback": "Callback",
    "workspace.eventKindWebhook": "Webhook",
    "workspace.eventMarkdownSummary":
      "{operations} операций в {channels} каналах ({callbacks} callbacks, {webhooks} webhooks).",
    "workspace.eventMarkdownTitle": "Контракты событий {title}",
    "workspace.eventMarkdownVersion": "Версия схемы: {version}",
    "workspace.eventNoFindings": "Проблем в определениях нет.",
    "workspace.eventNoOperations": "Нет операций событий для этого фильтра.",
    "workspace.eventOperationId": "ID операции",
    "workspace.eventOperationsTitle": "Операции событий",
    "workspace.eventOptional": "Необязательно",
    "workspace.eventPayloads": "Payloads",
    "workspace.eventRequired": "Обязательно",
    "workspace.eventResponses": "Ответы получателя",
    "workspace.eventSecurity": "Безопасность",
    "workspace.eventShowAll": "Показать все операции ({count})",
    "workspace.eventShowLess": "Показать меньше операций",
    "workspace.eventSource": "Исходная операция",
    "workspace.eventStatCallbacks": "Операции callback",
    "workspace.eventStatOperations": "Операции событий",
    "workspace.eventStatPayloads": "С payload",
    "workspace.eventStatWebhooks": "Операции webhook",
    "workspace.eventSummary":
      "Каналов: {channels}; требуют проверки: {issues}.",
    "workspace.eventTitle": "События и callbacks",
    "workspace.eventUrlExpression": "Выражение URL получателя",
    "workspace.postmanCollectionExportError":
      "Не удалось экспортировать коллекцию Postman.",
    "workspace.postmanCollectionExportSuccess":
      "Экспорт коллекции Postman начался.",
    "workspace.postmanEnvironmentExportError":
      "Не удалось экспортировать окружение Postman.",
    "workspace.postmanEnvironmentExportSuccess":
      "Экспорт окружения Postman начался.",
    "workspace.postmanExportCollection": "Экспорт коллекции",
    "workspace.postmanExportEnvironment": "Экспорт окружения",
    "workspace.postmanGroupByTags": "Группировать запросы по тегам",
    "workspace.postmanIncludeResponses": "Добавить примеры ответов",
    "workspace.postmanNoEndpoints":
      "В выбранной области экспорта нет эндпоинтов.",
    "workspace.postmanScopeAll": "Все эндпоинты ({count})",
    "workspace.postmanScopeLabel": "Область экспорта Postman",
    "workspace.postmanScopeVisible": "Текущий вид ({count})",
    "workspace.postmanStatFolders": "Папки",
    "workspace.postmanStatRequests": "Запросы",
    "workspace.postmanStatResponses": "Сохранённые ответы",
    "workspace.postmanStatVariables": "Переменные",
    "workspace.postmanTitle": "Коллекция Postman",
    "workspace.postmanVersion": "Collection 2.1",
    "workspace.coverageBadge": "Проверено операций: {percentage}%",
    "workspace.coverageDocumentedResponses":
      "Наблюдалось документированных ответов: {observed}/{total}",
    "workspace.coverageExport": "Экспорт покрытия",
    "workspace.coverageExportError":
      "Не удалось экспортировать покрытие запросами.",
    "workspace.coverageExportSuccess": "Экспорт покрытия начат.",
    "workspace.coverageFilterAll": "Все ({count})",
    "workspace.coverageFilterAttention": "Требуют внимания ({count})",
    "workspace.coverageFilterCovered": "Покрыты ({count})",
    "workspace.coverageFilterFailing": "Последний завершился ошибкой ({count})",
    "workspace.coverageFilterLabel": "Фильтр покрытия операций запросами",
    "workspace.coverageFilterUndocumented":
      "Недокументированный статус ({count})",
    "workspace.coverageFilterUntested": "Не проверены ({count})",
    "workspace.coverageLoading": "Загрузка сохранённой истории запросов...",
    "workspace.coverageNeverRun": "Не запускалась",
    "workspace.coverageNoFilteredOperations":
      "Нет операций, соответствующих этому фильтру покрытия.",
    "workspace.coverageNoHistory":
      "Сохранённых запросов пока нет. Запустите эндпоинт, чтобы начать измерение покрытия.",
    "workspace.coverageObservedStatuses": "Наблюдаемые статусы",
    "workspace.coverageOperationDetails":
      "Попыток: {attempts} · среднее: {duration} мс · последняя: {latest}",
    "workspace.coverageOperationProgress": "Покрытие операций",
    "workspace.coverageOperationSummary": "Покрытие: {summary}",
    "workspace.coverageRefresh": "Обновить историю",
    "workspace.coverageResponseProgress": "Покрытие ответов",
    "workspace.coverageScope": "Область покрытия",
    "workspace.coverageScopeAll": "Все эндпоинты ({count})",
    "workspace.coverageScopeVisible": "Текущий вид ({count})",
    "workspace.coverageShowAll": "Показать все операции ({count})",
    "workspace.coverageShowLess": "Показать меньше операций",
    "workspace.coverageStateCovered": "Покрыта",
    "workspace.coverageStateFailing": "Последняя с ошибкой",
    "workspace.coverageStateUndocumented": "Недокументированный статус",
    "workspace.coverageStateUntested": "Не проверена",
    "workspace.coverageStatFailures": "Неудачные запросы",
    "workspace.coverageStatOperations": "Проверенные операции",
    "workspace.coverageStatRequests": "Совпавшие запросы",
    "workspace.coverageStatResponses": "Наблюдаемые ответы",
    "workspace.coverageSummary":
      "С этой схемой и областью совпало запросов: {matched} из {saved}.",
    "workspace.coverageTitle": "Покрытие запросами",
    "workspace.coverageTransportError": "ОШИБКА",
    "workspace.coverageUnknownDate": "Неизвестная дата",
    "workspace.coverageViewEndpoint": "Открыть эндпоинт",
    "workspace.coverageWindow": "Период истории",
    "workspace.coverageWindowAll": "Вся сохранённая",
    "workspace.coverageWindowDay": "Последние 24 часа",
    "workspace.coverageWindowWeek": "Последние 7 дней",
    "workspace.docsBadge": "Автономный HTML",
    "workspace.docsDeprecatedExcluded":
      "Исключено устаревших разделов эндпоинтов: {count}.",
    "workspace.docsDownload": "Скачать HTML",
    "workspace.docsDownloadError": "Не удалось скачать файл документации.",
    "workspace.docsDownloadSuccess": "Скачивание документации началось.",
    "workspace.docsIncludeDeprecated": "Включить устаревшие эндпоинты",
    "workspace.docsIncludeExamples": "Включить примеры запросов и ответов",
    "workspace.docsIncludeModels": "Включить связанные модели схемы",
    "workspace.docsNoEndpoints":
      "Для выбранной области документации нет эндпоинтов.",
    "workspace.docsOptionsTitle": "Содержимое документа",
    "workspace.docsPreview": "Открыть предпросмотр",
    "workspace.docsPreviewError":
      "Не удалось открыть предпросмотр. Разрешите всплывающие окна и повторите попытку.",
    "workspace.docsPreviewSuccess": "Документация открыта в новой вкладке.",
    "workspace.docsScopeAll": "Все эндпоинты ({count})",
    "workspace.docsScopeLabel": "Область документации",
    "workspace.docsScopeVisible": "Текущий вид ({count})",
    "workspace.docsStatEndpoints": "Эндпоинты в документе",
    "workspace.docsStatMethods": "HTTP-методы",
    "workspace.docsStatModels": "Связанные модели",
    "workspace.docsStatSecurity": "Схемы доступа",
    "workspace.docsSummary":
      "Разделов эндпоинтов в одном автономном файле с поиском: {count}.",
    "workspace.docsTitle": "Автономная документация API",
    "workspace.nodeMockBadge": "Без зависимостей",
    "workspace.nodeMockCopy": "Копировать сервер",
    "workspace.nodeMockCopyError":
      "Не удалось скопировать исходный код мок-сервера.",
    "workspace.nodeMockCopySuccess": "Исходный код мок-сервера скопирован.",
    "workspace.nodeMockCors": "Включить CORS",
    "workspace.nodeMockDelay": "Задержка по умолчанию (мс)",
    "workspace.nodeMockDownload": "Скачать .mjs",
    "workspace.nodeMockDownloadError": "Не удалось скачать мок-сервер.",
    "workspace.nodeMockDownloadSuccess": "Скачивание мок-сервера началось.",
    "workspace.nodeMockIncludeDeprecated": "Включить устаревшие маршруты",
    "workspace.nodeMockNoEndpoints":
      "Для выбранной области мок-сервера нет эндпоинтов.",
    "workspace.nodeMockPort": "Порт по умолчанию",
    "workspace.nodeMockScopeAll": "Все эндпоинты ({count})",
    "workspace.nodeMockScopeLabel": "Область мок-сервера",
    "workspace.nodeMockScopeVisible": "Текущий вид ({count})",
    "workspace.nodeMockStatBodies": "Тела ответов",
    "workspace.nodeMockStatExcludedDeprecated": "Исключено устаревших",
    "workspace.nodeMockStatRoutes": "Мок-маршруты",
    "workspace.nodeMockStatVariants": "Варианты статусов",
    "workspace.nodeMockSummary":
      "Маршрутов: {routes}, документированных вариантов ответов: {responses}.",
    "workspace.nodeMockTarget": "http://localhost:{port}",
    "workspace.nodeMockTitle": "Мок-сервер Node",
    "workspace.nodeMockValidate": "Проверять обязательные данные",
    "workspace.sdkBadge": "Клиент Fetch",
    "workspace.sdkClientName": "Имя фабрики клиента",
    "workspace.sdkCopy": "Копировать TypeScript",
    "workspace.sdkCopyError": "Не удалось скопировать TypeScript-клиент.",
    "workspace.sdkCopySuccess": "TypeScript-клиент скопирован.",
    "workspace.sdkDeprecated": "Устаревший метод",
    "workspace.sdkEndpoint": "Эндпоинт {path}",
    "workspace.sdkExport": "Скачать клиент",
    "workspace.sdkExportError": "Не удалось скачать TypeScript-клиент.",
    "workspace.sdkExportSuccess": "Загрузка TypeScript-клиента начата.",
    "workspace.sdkGeneratedFactory": "Фабрика: {name}",
    "workspace.sdkGeneratedName": "Созданное имя",
    "workspace.sdkIncludeDeprecated": "Включить устаревшие операции",
    "workspace.sdkIncludeDocumentation": "Включить комментарии документации",
    "workspace.sdkIncludeUnusedModels": "Включить неиспользуемые модели схем",
    "workspace.sdkNoEndpoints":
      "В выбранной области нет эндпоинтов для генерации.",
    "workspace.sdkOperationsTitle": "Созданные методы",
    "workspace.sdkReturns": "Возвращает {type}",
    "workspace.sdkScopeAll": "Все эндпоинты ({count})",
    "workspace.sdkScopeLabel": "Область генерации TypeScript-клиента",
    "workspace.sdkScopeVisible": "Текущее представление ({count})",
    "workspace.sdkShowAll": "Показать все методы ({count})",
    "workspace.sdkShowLess": "Показать меньше методов",
    "workspace.sdkStatExcludedDeprecated": "Исключено устаревших",
    "workspace.sdkStatGeneratedNames": "Созданные имена",
    "workspace.sdkStatMethods": "Методы",
    "workspace.sdkStatModels": "Модели",
    "workspace.sdkSummary":
      "Методов: {operations}, объявлений моделей: {models}.",
    "workspace.sdkTitle": "TypeScript SDK",
    "workspace.workflowCopyError": "Не удалось скопировать Mermaid-схему.",
    "workspace.workflowCopyMermaid": "Копировать Mermaid",
    "workspace.workflowCopySuccess": "Mermaid-схема скопирована.",
    "workspace.workflowCycleBadge": "Цикл",
    "workspace.workflowExport": "Экспорт отчёта",
    "workspace.workflowExportError": "Не удалось экспортировать отчёт.",
    "workspace.workflowExportSuccess": "Экспорт отчёта о связях начат.",
    "workspace.workflowFilterAll": "Все связи ({count})",
    "workspace.workflowFilterCycles": "Связи в циклах ({count})",
    "workspace.workflowFilterLabel": "Фильтр связей API",
    "workspace.workflowFilterProblems": "Требуют проверки ({count})",
    "workspace.workflowFilterResolved": "Разрешены ({count})",
    "workspace.workflowIssueAmbiguousOperationId":
      "Целевой operationId объявлен более чем в одной операции: {target}.",
    "workspace.workflowIssueExternalOperationRef":
      "Внешний operationRef нельзя разрешить внутри текущей схемы: {target}.",
    "workspace.workflowIssueInvalidOperationRef":
      "Локальный operationRef не указывает на операцию пути: {target}.",
    "workspace.workflowIssueMissingOperationId":
      "Операция с целевым operationId не найдена: {target}.",
    "workspace.workflowIssueMissingTarget":
      "Связь не объявляет operationId или operationRef.",
    "workspace.workflowIssueMultipleTargets":
      "Связь объявляет operationId и operationRef; используется operationRef.",
    "workspace.workflowNoLinks": "Нет связей, соответствующих фильтру.",
    "workspace.workflowParameter": "Параметр",
    "workspace.workflowRequestBody": "Тело запроса",
    "workspace.workflowResolvedSummary": "Разрешено: {resolved}/{total}",
    "workspace.workflowServer": "Переопределение сервера",
    "workspace.workflowShowAll": "Показать все связи ({count})",
    "workspace.workflowShowLess": "Показать меньше связей",
    "workspace.workflowSource": "Исходная операция",
    "workspace.workflowStatCycles": "Циклы",
    "workspace.workflowStatLinks": "Связи",
    "workspace.workflowStatOperations": "Связанные операции",
    "workspace.workflowStatProblems": "Требуют проверки",
    "workspace.workflowStatusAmbiguous": "Неоднозначная",
    "workspace.workflowStatusExternal": "Внешняя",
    "workspace.workflowStatusResolved": "Разрешена",
    "workspace.workflowStatusUnresolved": "Не разрешена",
    "workspace.workflowSummary":
      "Связано операций: {operations}; требуют проверки: {problems}.",
    "workspace.workflowTarget": "Целевая операция",
    "workspace.workflowTitle": "Связи API",
    "workspace.workflowUnknownTarget": "Неизвестная цель",
    "workspace.properties": "Свойства:",
    "workspace.query": "Query",
    "workspace.requestBody": "Тело запроса",
    "workspace.requestBodyContractTitle": "Контракт тела запроса",
    "workspace.requestCancelled": "Запрос отменён.",
    "workspace.formatRequestBody": "Форматировать JSON",
    "workspace.requestBodyInputLabel": "Редактируемое тело запроса",
    "workspace.requestBodyInvalidJson":
      "Введите корректный JSON перед выполнением.",
    "workspace.requestBodyRequired": "Тело запроса обязательно.",
    "workspace.requestCodeFormat": "Формат кода запроса",
    "workspace.requestContentType": "Тип содержимого запроса",
    "workspace.requestPreview": "Предпросмотр запроса",
    "workspace.requestPresetCancel": "Отмена",
    "workspace.requestPresetCreateForm": "Сохранить шаблон запроса",
    "workspace.requestPresetDelete": "Удалить",
    "workspace.requestPresetDeleteConfirm": 'Удалить шаблон запроса "{name}"?',
    "workspace.requestPresetDeleted": "Шаблон запроса удалён.",
    "workspace.requestPresetName": "Название шаблона",
    "workspace.requestPresetNamePlaceholder": "Успешный сценарий",
    "workspace.requestPresetNameRequired": "Введите название шаблона.",
    "workspace.requestPresetNone": "Шаблон не выбран",
    "workspace.requestPresetSave": "Сохранить шаблон",
    "workspace.requestPresetSaveAs": "Сохранить как шаблон",
    "workspace.requestPresetSaved": "Шаблон запроса сохранён локально.",
    "workspace.requestPresetSelector": "Шаблон запроса",
    "workspace.requestPresetStorageError":
      "Шаблон изменён для этого сеанса, но локальное хранилище не обновлено.",
    "workspace.requestPresetUpdate": "Обновить шаблон",
    "workspace.requestSize": "Запрос {size} Б",
    "workspace.requestTimeout": "Тайм-аут запроса",
    "workspace.requestUrlCopied": "URL запроса скопирован.",
    "workspace.required": "Обязательно",
    "workspace.resetEditor": "Сбросить редактор",
    "workspace.resetEditorConfirm":
      "Сбросить редактор до схемы по умолчанию? Несохранённые изменения будут потеряны.",
    "workspace.resetEndpointFilters": "Сбросить фильтры",
    "workspace.resetTryItOut": "Сбросить значения",
    "workspace.removeEndpointFavorite": "Удалить {method} {path} из избранного",
    "workspace.remoteImportCancel": "Отменить загрузку",
    "workspace.remoteImportClose": "Закрыть импорт по URL",
    "workspace.remoteImportEmpty": "Удалённая схема пуста.",
    "workspace.remoteImportFetchFailed":
      "Не удалось загрузить удалённую схему. Проверьте URL и повторите попытку.",
    "workspace.remoteImportForm": "Импорт схемы OpenAPI по URL",
    "workspace.remoteImportHttpError": "Удалённый сервер вернул HTTP {status}.",
    "workspace.remoteImportInvalidResponse":
      "Сервис импорта схем вернул некорректный ответ.",
    "workspace.remoteImportInvalidUrl":
      "Введите публичный URL схемы с HTTP или HTTPS.",
    "workspace.remoteImportLoad": "Загрузить схему",
    "workspace.remoteImportLoading": "Загрузка...",
    "workspace.remoteImportOpen": "Импорт по URL",
    "workspace.remoteImportTooLarge":
      "Размер удалённой схемы превышает лимит импорта 5 МБ.",
    "workspace.remoteImportUrl": "URL схемы OpenAPI",
    "workspace.remoteImportUrlPlaceholder": "https://example.com/openapi.yaml",
    "workspace.response": "Ответ",
    "workspace.responseBody": "Тело ответа",
    "workspace.responseContentType": "Тип содержимого тестового ответа",
    "workspace.responseCopied": "Ответ скопирован.",
    "workspace.responseHeaders": "Заголовки ответа",
    "workspace.responseHeadersCopied": "Заголовки ответа скопированы.",
    "workspace.responseSize": "Ответ {size} Б",
    "workspace.responseStatus": "Статус тестового ответа",
    "workspace.responses": "Ответы",
    "workspace.saveSchema": "Сохранить схему",
    "workspace.schemaSearchSummary": "{current} из {total}",
    "workspace.searchSchema": "Поиск по схеме",
    "workspace.savedToHistory": "Сохранено в истории",
    "workspace.schemaCopied": "Схема скопирована.",
    "workspace.schemaCopyFailed": "Не удалось скопировать схему.",
    "workspace.schemaDownloadFailed": "Не удалось скачать схему.",
    "workspace.schemaDownloadStarted": "Скачивание схемы началось.",
    "workspace.schemaImported": "Импортирован файл {file} ({size} Б).",
    "workspace.schemaSaveFailed": "Не удалось сохранить схему локально.",
    "workspace.schemaSaved": "Схема сохранена.",
    "workspace.securityAccessOptional": "Необязательная авторизация",
    "workspace.securityAccessPublic": "Публичный",
    "workspace.securityAccessSecured": "Защищённый",
    "workspace.securityAllSchemes": "Все схемы",
    "workspace.securityAnd": "И",
    "workspace.securityCopy": "Копировать сводку",
    "workspace.securityCopyError":
      "Не удалось скопировать сводку безопасности.",
    "workspace.securityCopySuccess": "Сводка безопасности скопирована.",
    "workspace.securityCoverage": "Строго защищено: {percentage}%",
    "workspace.securityExport": "Экспорт отчёта",
    "workspace.securityExportError":
      "Не удалось экспортировать отчёт безопасности.",
    "workspace.securityExportSuccess": "Экспорт отчёта безопасности начался.",
    "workspace.securityFilterAll": "Все ({count})",
    "workspace.securityFilterIssues": "Требуют проверки ({count})",
    "workspace.securityFilterLabel": "Фильтр операций по безопасности",
    "workspace.securityFilterOptional": "Необязательная ({count})",
    "workspace.securityFilterPublic": "Публичные ({count})",
    "workspace.securityFilterSecured": "Защищённые ({count})",
    "workspace.securityFindingIncompleteApiKey":
      "В схеме {scheme} не указано имя или расположение ключа API.",
    "workspace.securityFindingIncompleteHttp":
      "В схеме {scheme} не указан тип HTTP-аутентификации.",
    "workspace.securityFindingOptional":
      "Пустая альтернатива безопасности разрешает анонимный доступ.",
    "workspace.securityFindingUndefined":
      "Требование ссылается на необъявленную схему {scheme}.",
    "workspace.securityFindingUnsupported":
      "Тип схемы {scheme} не поддерживает автоматический анализ.",
    "workspace.securityFindingUnused":
      "Схема {scheme} объявлена, но не используется операциями.",
    "workspace.securityFindingsSummary":
      "Замечаний: {count} · ошибок: {errors} · предупреждений: {warnings}",
    "workspace.securityFindingsTitle": "Замечания",
    "workspace.securityIncompleteDefinition": "Неполное описание",
    "workspace.securityMarkdownCoverage":
      "Строго защищено: {secured}/{total} ({percentage}%)",
    "workspace.securityMarkdownTitle": "Профиль безопасности: {title}",
    "workspace.securityMarkdownVersion": "Версия: {version}",
    "workspace.securityNoFindings": "Замечаний по безопасности нет.",
    "workspace.securityNoOperations":
      "Нет операций, соответствующих выбранному представлению.",
    "workspace.securityNoSchemes": "Схемы безопасности не объявлены.",
    "workspace.securityOperationsTitle": "Матрица доступа к операциям",
    "workspace.securityOr": "ИЛИ",
    "workspace.securityRequirementOptional":
      "Анонимный доступ ИЛИ {requirements}",
    "workspace.securityRequirementPublic": "Аутентификация не требуется",
    "workspace.securityRequirementSecured": "Требуется: {requirements}",
    "workspace.securitySchemeFilterLabel": "Фильтр по схеме безопасности",
    "workspace.securitySchemeUsage": "{type}, операций: {count}",
    "workspace.securitySchemesSummary": "Используется {used} из {total}",
    "workspace.securitySchemesTitle": "Схемы безопасности",
    "workspace.securitySeverityError": "Ошибка",
    "workspace.securitySeverityInfo": "Информация",
    "workspace.securitySeverityWarning": "Предупреждение",
    "workspace.securityShowAll": "Показать все ({count})",
    "workspace.securityShowLess": "Показать меньше",
    "workspace.securityStatOptional": "Необязательная",
    "workspace.securityStatPublic": "Публичные",
    "workspace.securityStatSchemes": "Схемы в работе",
    "workspace.securityStatSecured": "Строго защищённые",
    "workspace.securityTitle": "Профиль безопасности API",
    "workspace.securityViewEndpoint": "Открыть эндпоинт",
    "workspace.secured": "С защитой",
    "workspace.securedOnly": "Только с защитой",
    "workspace.server": "Сервер",
    "workspace.serverErrorResponseOnly": "Описан ответ 5xx",
    "workspace.serverSelector": "Выберите API-сервер",
    "workspace.signInToSave":
      "Войдите, чтобы сохранять и восстанавливать схемы.",
    "workspace.sortByMethod": "По HTTP-методу",
    "workspace.sortByPath": "По пути А-Я",
    "workspace.sortSchemaOrder": "Порядок схемы",
    "workspace.successResponseOnly": "Описан ответ 2xx",
    "workspace.tryItOut": "Отправить запрос",
    "workspace.tagFilterLabel": "Фильтр эндпоинтов по тегу",
    "workspace.tagFilterOption": "{tag} ({count})",
    "workspace.timeoutSeconds": "{seconds} с",
    "workspace.type": "Тип:",
    "workspace.totalEndpoints": "Эндпоинты",
    "workspace.unsecuredOnly": "Только без защиты",
    "workspace.unsavedSchemaChanges": "Есть несохранённые изменения схемы.",
    "workspace.valid": "Валидно",
    "workspace.version": "Версия {version}",
    "workspace.viewer": "Просмотр",
    "workspace.withRequestBodies": "С телом",
    "workspace.withRequestBodyOnly": "С телом запроса",
    "workspace.withoutRequestBodyOnly": "Без тела запроса",
    "workspace.requestAuthAccessToken": "Токен доступа",
    "workspace.requestAuthApiKey": "Ключ API",
    "workspace.requestAuthApiKeySummary": "Ключ API · {location}: {name}",
    "workspace.requestAuthApplied": "Авторизация настроена",
    "workspace.requestAuthBasicSummary": "HTTP Basic авторизация",
    "workspace.requestAuthBearerSummary": "HTTP Bearer · {format}",
    "workspace.requestAuthClear": "Очистить данные",
    "workspace.requestAuthConfiguredCount": "Настроено: {count}",
    "workspace.requestAuthDescription":
      "Используйте схемы безопасности этого API в примерах запросов и Try It Out.",
    "workspace.requestAuthEnable": "Включить авторизацию {name}",
    "workspace.requestAuthHide": "Скрыть",
    "workspace.requestAuthHideFor": "Скрыть секрет для {name}",
    "workspace.requestAuthOAuthSummary": "Токен доступа OAuth 2",
    "workspace.requestAuthOpenIdSummary": "Токен доступа OpenID Connect",
    "workspace.requestAuthPassword": "Пароль",
    "workspace.requestAuthPasswordFor": "Пароль для {name}",
    "workspace.requestAuthSecretFor": "Учётные данные для {name}",
    "workspace.requestAuthSecretPlaceholder": "Введите учётные данные",
    "workspace.requestAuthSessionOnly":
      "Учётные данные хранятся только в памяти этой вкладки и не сохраняются в окружениях, шаблонах или истории запросов.",
    "workspace.requestAuthShow": "Показать",
    "workspace.requestAuthShowFor": "Показать секрет для {name}",
    "workspace.requestAuthTitle": "Авторизация",
    "workspace.requestAuthToken": "токен",
    "workspace.requestAuthUnsupportedSummary":
      "Эту схему безопасности нельзя применить автоматически.",
    "workspace.requestAuthUsername": "Имя пользователя",
    "workspace.requestAuthUsernameFor": "Имя пользователя для {name}",
    "workspace.examplesTitle": "Проверка примеров",
    "workspace.examplesDescription":
      "Сверяет каждый документированный пример со схемой, чтобы документация, моки и сгенерированные тесты оставались достоверными.",
    "workspace.examplesConformance": "Соответствие {percentage}%",
    "workspace.examplesSummary":
      "Примеров: {total} · несоответствий: {invalid} · с предупреждениями: {warnings} · пропущено: {skipped}",
    "workspace.examplesTruncated":
      "Проверка остановлена досрочно, чтобы редактор не зависал; часть примеров не проверена.",
    "workspace.examplesCopy": "Копировать отчёт по примерам",
    "workspace.examplesExport": "Экспортировать отчёт по примерам",
    "workspace.examplesCopySuccess": "Отчёт по примерам скопирован.",
    "workspace.examplesCopyError": "Не удалось скопировать отчёт по примерам.",
    "workspace.examplesExportSuccess": "Экспорт отчёта по примерам начался.",
    "workspace.examplesExportError":
      "Не удалось экспортировать отчёт по примерам.",
    "workspace.examplesStatValid": "Соответствуют схеме",
    "workspace.examplesStatWarning": "С предупреждениями",
    "workspace.examplesStatInvalid": "Несоответствия",
    "workspace.examplesStatSkipped": "Не проверены",
    "workspace.examplesProgressLabel":
      "Результаты примеров: соответствуют {valid}, с предупреждениями {warnings}, не соответствуют {invalid}, не проверены {skipped}",
    "workspace.examplesStatusFilterLabel": "Фильтр примеров по результату",
    "workspace.examplesFilterAll": "Все ({count})",
    "workspace.examplesFilterInvalid": "Несоответствия ({count})",
    "workspace.examplesFilterWarning": "Предупреждения ({count})",
    "workspace.examplesFilterValid": "Соответствуют ({count})",
    "workspace.examplesFilterSkipped": "Не проверены ({count})",
    "workspace.examplesKindFilterLabel": "Расположение примера",
    "workspace.examplesKindAll": "Все расположения",
    "workspace.examplesKindParameter": "Параметры",
    "workspace.examplesKindRequestBody": "Тела запросов",
    "workspace.examplesKindResponse": "Ответы",
    "workspace.examplesKindHeader": "Заголовки ответов",
    "workspace.examplesKindSchema": "Схемы компонентов",
    "workspace.examplesBadgeParameter": "Параметр",
    "workspace.examplesBadgeRequestBody": "Тело запроса",
    "workspace.examplesBadgeResponse": "Ответ",
    "workspace.examplesBadgeHeader": "Заголовок",
    "workspace.examplesBadgeSchema": "Схема",
    "workspace.examplesStatusValid": "Соответствует",
    "workspace.examplesStatusWarning": "Требует внимания",
    "workspace.examplesStatusInvalid": "Несоответствие",
    "workspace.examplesStatusSkipped": "Не проверен",
    "workspace.examplesSearchLabel": "Поиск примеров",
    "workspace.examplesSearchPlaceholder":
      "Поиск по эндпоинту, расположению или имени примера",
    "workspace.examplesDefaultName": "пример",
    "workspace.examplesNoMatches": "Нет примеров, подходящих под фильтры.",
    "workspace.examplesAllClear":
      "Все проверенные примеры соответствуют своим схемам.",
    "workspace.examplesShowAll": "Показать все примеры ({count})",
    "workspace.examplesShowLess": "Показать меньше примеров",
    "workspace.examplesRevealInEditor": "Показать в редакторе",
    "workspace.examplesRevealAriaLabel":
      "Показать {name} для {location} в редакторе",
    "workspace.examplesRevealError":
      "Не удалось найти пример в редакторе. Дождитесь обновления схемы и попробуйте снова.",
    "workspace.examplesOpenEndpoint": "Открыть эндпоинт",
    "workspace.examplesOpenEndpointAriaLabel":
      "Открыть эндпоинт {method} {path}",
    "workspace.examplesHiddenIssues": "Ещё проблем: {count}",
    "workspace.examplesRoot": "значение",
    "workspace.examplesIssueAdditionalProperties":
      'Свойство "{property}" не разрешено схемой.',
    "workspace.examplesIssueAnyOf":
      "Значение не подходит ни под одну из схем anyOf ({options}).",
    "workspace.examplesIssueConst": "Значение должно быть равно {expected}.",
    "workspace.examplesIssueEnum": "Значение должно быть одним из: {allowed}.",
    "workspace.examplesIssueFormat":
      "Значение не является корректным {format}.",
    "workspace.examplesIssueMaxItems":
      "Список должен содержать не более {limit} элементов.",
    "workspace.examplesIssueMaxLength":
      "Текст должен содержать не более {limit} символов.",
    "workspace.examplesIssueMaxProperties":
      "Объект должен содержать не более {limit} свойств.",
    "workspace.examplesIssueMaximum":
      "Значение должно быть {comparison} {limit}.",
    "workspace.examplesIssueMinItems":
      "Список должен содержать не менее {limit} элементов.",
    "workspace.examplesIssueMinLength":
      "Текст должен содержать не менее {limit} символов.",
    "workspace.examplesIssueMinProperties":
      "Объект должен содержать не менее {limit} свойств.",
    "workspace.examplesIssueMinimum":
      "Значение должно быть {comparison} {limit}.",
    "workspace.examplesIssueMultipleOf":
      "Значение должно быть кратно {divisor}.",
    "workspace.examplesIssueNot": "Значение соответствует запрещённой схеме.",
    "workspace.examplesIssueOneOf":
      "Значение не подходит ни под одну из схем oneOf ({options}).",
    "workspace.examplesIssueOneOfMultiple":
      "Значение подходит под несколько схем oneOf ({matches}); ожидается ровно одна.",
    "workspace.examplesIssuePattern":
      "Текст не соответствует шаблону {pattern}.",
    "workspace.examplesIssueReadOnly":
      'Свойство только для чтения "{property}" не должно быть в примере запроса.',
    "workspace.examplesIssueRequired":
      'Отсутствует обязательное свойство "{property}".',
    "workspace.examplesIssueSerialized":
      "Пример записан JSON-строкой; используйте структурированное значение.",
    "workspace.examplesIssueType": "Ожидается {expected}, получено {actual}.",
    "workspace.examplesIssueUniqueItems":
      "Элементы списка должны быть уникальными; элемент {index} повторяется.",
    "workspace.examplesIssueWriteOnly":
      'Свойство только для записи "{property}" не должно быть в примере ответа.',
    "workspace.examplesSkipExternalValue":
      "Используется externalValue, который не загружается для проверки.",
    "workspace.examplesSkipLimit":
      "Пропущено после достижения лимита проверки.",
    "workspace.examplesSkipMediaType":
      "Этот тип содержимого не проверяется как структурированные данные.",
    "workspace.examplesSkipMissingSchema":
      "Для этого примера не описана схема.",
    "workspace.examplesSkipUnresolvedReference":
      "Не удалось разрешить ссылку на схему или пример.",
    "workspace.examplesMarkdownTitle": "Проверка примеров: {title}",
    "workspace.examplesMarkdownVersion": "Версия: {version}",
    "workspace.examplesMarkdownSummary":
      "Проверено примеров: {total}; соответствуют {valid}, с предупреждениями {warnings}, не соответствуют {invalid}, не проверены {skipped} (соответствие {percentage}%).",
    "workspace.examplesMarkdownFindings": "Находки",
    "workspace.examplesMarkdownNoFindings":
      "Несоответствий и предупреждений не найдено.",
    "workspace.toolNavLabel": "Инструменты рабочей области",
    "workspace.toolNavTitle": "Перейти к",
    "workspace.toolNavCount": "Инструментов: {count}",
    "workspace.toolNavEndpoints": "Список эндпоинтов",
    "workspace.toolNavCheckpoints": "Контрольные точки",
    "workspace.toolNavComponents": "Компоненты",
    "workspace.toolNavModels": "Модели данных",
    "workspace.toolNavWorkflows": "Связи",
    "workspace.toolNavEvents": "Колбэки",
    "workspace.toolNavSecurity": "Безопасность",
    "workspace.toolNavAudit": "Аудит качества",
    "workspace.toolNavExamples": "Примеры",
    "workspace.toolNavChanges": "Обзор изменений",
    "workspace.toolNavMockSuite": "Мок-набор",
    "workspace.toolNavCoverage": "Покрытие",
    "workspace.toolNavHar": "HAR-трафик",
    "workspace.toolNavTestPlan": "Тест-план",
    "workspace.toolNavPostman": "Postman",
    "workspace.toolNavSlice": "Срез API",
    "workspace.toolNavTypeScript": "Клиент TypeScript",
    "workspace.toolNavDocs": "HTML-документация",
    "workspace.toolNavMockServer": "Мок-сервер",
    "workspace.toolNavSmokeTests": "Смоук-тесты",
    "workspace.toolNavGroupDesign": "Проектирование",
    "workspace.toolNavGroupQuality": "Качество",
    "workspace.toolNavGroupTesting": "Тестирование",
    "workspace.toolNavGroupExport": "Экспорт",
    "workspace.styleTitle": "Стайлгайд API",
    "workspace.styleDescription":
      "Проверяет именование, дизайн путей, пагинацию и модели ошибок на соответствие соглашениям команды.",
    "workspace.styleScore": "Оценка стиля {score}",
    "workspace.styleScoreLabel": "Оценка стиля {score} из 100",
    "workspace.styleSummary":
      "Находок: {findings} · исправить обязательно: {errors} · желательно: {warnings} · рассмотреть: {notes}",
    "workspace.styleRulesPassing": "Правил пройдено: {passing}/{enabled}",
    "workspace.styleTruncated":
      "Показаны только первые находки, чтобы редактор не зависал; счётчики правил учитывают все находки.",
    "workspace.styleCopy": "Копировать отчёт по стилю",
    "workspace.styleExport": "Экспортировать отчёт по стилю",
    "workspace.styleExportRuleset": "Экспортировать набор правил",
    "workspace.styleImportRuleset": "Импортировать набор правил",
    "workspace.styleImportRulesetFile": "Файл набора правил стайлгайда",
    "workspace.styleCopySuccess": "Отчёт по стилю скопирован.",
    "workspace.styleCopyError": "Не удалось скопировать отчёт по стилю.",
    "workspace.styleExportSuccess": "Экспорт отчёта по стилю начался.",
    "workspace.styleExportError": "Не удалось экспортировать отчёт по стилю.",
    "workspace.styleRulesetExportSuccess": "Экспорт набора правил начался.",
    "workspace.styleRulesetExportError":
      "Не удалось экспортировать набор правил.",
    "workspace.styleImportSuccess": "Набор правил импортирован и применён.",
    "workspace.styleImportInvalid":
      "Файл не является корректным набором правил стайлгайда RSSwag.",
    "workspace.styleImportTooLarge": "Файл набора правил слишком большой.",
    "workspace.styleImportReadError":
      "Не удалось прочитать файл набора правил.",
    "workspace.styleStorageError":
      "Соглашения действуют в этой сессии, но не сохранены в браузере.",
    "workspace.styleRevealError":
      "Не удалось найти это место в редакторе. Дождитесь обновления схемы и попробуйте снова.",
    "workspace.styleConfigure": "Соглашения и правила",
    "workspace.styleConfigureHint":
      "Изменения применяются сразу и запоминаются в этом браузере.",
    "workspace.styleConventionPathCase": "Сегменты путей",
    "workspace.styleConventionParameterCase": "Параметры запроса и пути",
    "workspace.styleConventionPropertyCase": "Свойства схем",
    "workspace.styleConventionOperationIdCase": "Идентификаторы операций",
    "workspace.styleResetConfig": "Сбросить по умолчанию",
    "workspace.styleRuleFindings": "Находок: {count}",
    "workspace.styleRulePassing": "Пройдено",
    "workspace.styleRuleNotApplicable": "Не применимо",
    "workspace.styleRuleDisabled": "Выключено",
    "workspace.styleRuleToggle": "Включить правило: {rule}",
    "workspace.styleCategoryPaths": "Пути и URL",
    "workspace.styleCategoryOperations": "Операции и методы",
    "workspace.styleCategoryParameters": "Параметры и пагинация",
    "workspace.styleCategorySchemas": "Схемы и свойства",
    "workspace.styleCategoryResponses": "Ответы с ошибками",
    "workspace.styleCategoryDocument": "Документ и теги",
    "workspace.styleCategoryCardSummary": "Правил пройдено: {passing}/{total}",
    "workspace.styleCategoryFilterAria":
      "Показать находки категории {category}",
    "workspace.styleSeverityError": "Исправить обязательно",
    "workspace.styleSeverityWarning": "Желательно исправить",
    "workspace.styleSeverityInfo": "Рассмотреть",
    "workspace.styleSeverityFilterLabel": "Фильтр находок по важности",
    "workspace.styleFilterAll": "Все находки ({count})",
    "workspace.styleFilterError": "Исправить обязательно ({count})",
    "workspace.styleFilterWarning": "Желательно исправить ({count})",
    "workspace.styleFilterInfo": "Рассмотреть ({count})",
    "workspace.styleCategoryFilterLabel": "Категория правил",
    "workspace.styleCategoryAll": "Все категории",
    "workspace.styleSearchLabel": "Поиск находок стиля",
    "workspace.styleSearchPlaceholder": "Поиск по правилу, эндпоинту или имени",
    "workspace.styleNoFindings":
      "Находок нет. API соответствует всем включённым правилам.",
    "workspace.styleNoMatches": "Нет находок, подходящих под фильтры.",
    "workspace.styleShowAll": "Показать все находки ({count})",
    "workspace.styleShowLess": "Показать меньше находок",
    "workspace.styleSuggestion": "Предлагается: {suggestion}",
    "workspace.styleReveal": "Показать в редакторе",
    "workspace.styleRevealAriaLabel":
      "Показать находку «{rule}» в {pointer} в редакторе",
    "workspace.styleOpenEndpoint": "Открыть эндпоинт",
    "workspace.styleOpenEndpointAriaLabel":
      "Открыть {method} {path} из стайлгайда",
    "workspace.styleMarkdownTitle": "Стайлгайд API: {title}",
    "workspace.styleMarkdownVersion": "Версия: {version}",
    "workspace.styleMarkdownSummary":
      "Оценка стиля {score}/100 · правил пройдено {passing}/{enabled} · исправить обязательно: {errors}, желательно: {warnings}, рассмотреть: {notes}.",
    "workspace.styleMarkdownConventions": "Соглашения",
    "workspace.styleMarkdownRules": "Правила",
    "workspace.styleMarkdownFindings": "Находки",
    "workspace.styleRulePathAmbiguousTitle": "Однозначные шаблоны путей",
    "workspace.styleRulePathAmbiguousMessage":
      "Конфликтует с {conflict}; оба шаблона совпадают с одними и теми же URL.",
    "workspace.styleRulePathCasingTitle": "Регистр сегментов пути",
    "workspace.styleRulePathCasingMessage":
      "Используйте {convention} для сегментов пути: {segments}.",
    "workspace.styleRulePathTrailingSlashTitle": "Без завершающих слэшей",
    "workspace.styleRulePathTrailingSlashMessage":
      "Уберите завершающий слэш из пути.",
    "workspace.styleRulePathVerbsTitle": "Ресурсно-ориентированные пути",
    "workspace.styleRulePathVerbsMessage":
      "Избегайте глагола в «{segment}»; действие выражает HTTP-метод.",
    "workspace.styleRulePathFileExtensionTitle":
      "Без расширений файлов в путях",
    "workspace.styleRulePathFileExtensionMessage":
      "Уберите «{extension}» и выбирайте формат через заголовок Accept.",
    "workspace.styleRuleOperationIdCasingTitle":
      "Регистр идентификаторов операций",
    "workspace.styleRuleOperationIdCasingMessage":
      "Используйте {convention} для operationId «{name}».",
    "workspace.styleRuleRequestBodyOnSafeMethodTitle":
      "Без тела у GET, HEAD и DELETE",
    "workspace.styleRuleRequestBodyOnSafeMethodMessage":
      "Запросы {method} не должны содержать тело; многие клиенты и прокси его отбрасывают.",
    "workspace.styleRulePostCreateStatusTitle": "201 для созданных ресурсов",
    "workspace.styleRulePostCreateStatusMessage":
      "Этот POST описывает только 200; укажите 201 Created (или 202/204), если он создаёт ресурс.",
    "workspace.styleRuleSummaryStyleTitle": "Краткие описания операций",
    "workspace.styleRuleSummaryStyleMessage":
      "Держите summary короче {limit} символов и без точки в конце (сейчас {length}).",
    "workspace.styleRuleParameterCasingTitle": "Регистр параметров",
    "workspace.styleRuleParameterCasingMessage":
      "Используйте {convention} для параметра {location} «{name}».",
    "workspace.styleRuleReservedHeaderParameterTitle":
      "Без зарезервированных заголовков",
    "workspace.styleRuleReservedHeaderParameterMessage":
      "OpenAPI игнорирует параметр заголовка «{name}»; используйте типы содержимого или схемы безопасности.",
    "workspace.styleRulePaginationStyleTitle": "Единая пагинация",
    "workspace.styleRulePaginationStyleMessage":
      "Используется пагинация {style}, тогда как большинство эндпоинтов используют {dominant}.",
    "workspace.styleRulePageSizeNameTitle": "Единый параметр размера страницы",
    "workspace.styleRulePageSizeNameMessage":
      "Для размера страницы используется «{name}», тогда как большинство эндпоинтов используют «{dominant}».",
    "workspace.styleRuleParameterDescriptionTitle": "Описания параметров",
    "workspace.styleRuleParameterDescriptionMessage":
      "Опишите параметр {location} «{name}».",
    "workspace.styleRuleSchemaNameCasingTitle": "Регистр имён схем",
    "workspace.styleRuleSchemaNameCasingMessage":
      "Используйте PascalCase для схемы «{name}».",
    "workspace.styleRulePropertyCasingTitle": "Регистр свойств",
    "workspace.styleRulePropertyCasingMessage":
      "Используйте {convention} для свойства «{name}».",
    "workspace.styleRuleEnumValueCasingTitle": "Единый регистр enum",
    "workspace.styleRuleEnumValueCasingMessage":
      "Значения enum смешивают регистр: {values}.",
    "workspace.styleRulePropertyTypeTitle": "Типизированные свойства",
    "workspace.styleRulePropertyTypeMessage":
      "У свойства «{name}» нет типа, ссылки или композиции.",
    "workspace.styleRuleErrorSchemaConsistencyTitle": "Единая модель ошибок",
    "workspace.styleRuleErrorSchemaConsistencyMessage":
      "{status} использует {schema}, тогда как большинство ответов с ошибками используют {dominant}.",
    "workspace.styleRuleServerHttpsTitle": "HTTPS-серверы",
    "workspace.styleRuleServerHttpsMessage": "Обслуживайте {url} по HTTPS.",
    "workspace.styleRuleTagDeclaredTitle": "Объявленные теги",
    "workspace.styleRuleTagDeclaredMessage":
      "Тег «{tag}» используется, но не объявлен в корневом списке tags.",
    "workspace.styleRuleTagDescriptionTitle": "Описания тегов",
    "workspace.styleRuleTagDescriptionMessage": "Опишите тег «{tag}».",
    "workspace.styleRuleInfoMetadataTitle": "Метаданные API",
    "workspace.styleRuleInfoMetadataMessage":
      "Добавьте info.{field}, чтобы потребители знали назначение API, владельца и условия использования.",
    "workspace.toolNavStyleGuide": "Стайлгайд",
    "workspace.upgradeTitle": "Помощник обновления OpenAPI",
    "workspace.upgradeDescription":
      "Переведите документ на новую версию OpenAPI, проверьте каждое изменение и примените его безопасно с контрольной точкой.",
    "workspace.upgradeSourceSwagger2": "Swagger 2.0",
    "workspace.upgradeSourceOpenApi30": "OpenAPI 3.0",
    "workspace.upgradePath": "{source} → OpenAPI {target}",
    "workspace.upgradeTargetLabel": "Целевая версия",
    "workspace.upgradeFormatLabel": "Формат результата",
    "workspace.upgradeFormatYaml": "Документ YAML",
    "workspace.upgradeFormatJson": "Документ JSON",
    "workspace.upgradePreview": "Предпросмотр обновления",
    "workspace.upgradeHidePreview": "Скрыть предпросмотр",
    "workspace.upgradeStatChanges": "Автоматические изменения",
    "workspace.upgradeStatWarnings": "Ручная проверка",
    "workspace.upgradeStatEndpoints": "Сохранено эндпоинтов",
    "workspace.upgradeStatEndpointsValue": "{upgraded}/{source}",
    "workspace.upgradeStatLines": "Строк в результате",
    "workspace.upgradeParityOk": "Все эндпоинты сохранены: {count}.",
    "workspace.upgradeParityMissing":
      "Будут потеряны эндпоинты ({count}): {endpoints}",
    "workspace.upgradeInvalidOutput":
      "Обновлённый документ не удалось разобрать, поэтому его нельзя применить.",
    "workspace.upgradeChangesTitle": "Автоматические изменения",
    "workspace.upgradeNoChanges": "Структурные изменения не требуются.",
    "workspace.upgradeWarningsTitle": "Проверить после обновления",
    "workspace.upgradeNoWarnings": "Ручная проверка не требуется.",
    "workspace.upgradeChangeVersion": "Объявляет OpenAPI {target}",
    "workspace.upgradeChangeServers":
      "Формирует URL серверов из host, basePath и schemes: {count}",
    "workspace.upgradeChangeSchemas":
      "Переносит definitions в components/schemas: {count}",
    "workspace.upgradeChangeParameters":
      "Переводит параметры на описание через schema: {count}",
    "workspace.upgradeChangeRequestBodies":
      "Создаёт тела запросов из параметров body и formData: {count}",
    "workspace.upgradeChangeFormData":
      "Превращает поля формы в свойства тела запроса: {count}",
    "workspace.upgradeChangeResponses":
      "Оборачивает схемы ответов в content с типами содержимого: {count}",
    "workspace.upgradeChangeSecuritySchemes":
      "Переводит securityDefinitions в схемы безопасности: {count}",
    "workspace.upgradeChangeReferences":
      "Переписывает ссылки $ref на components: {count}",
    "workspace.upgradeChangeSerializationStyles":
      "Заменяет collectionFormat на style и explode: {count}",
    "workspace.upgradeChangeFileTypes":
      "Заменяет тип file на бинарные строки: {count}",
    "workspace.upgradeChangeNullable": "Преобразует признаки nullable: {count}",
    "workspace.upgradeChangeBounds":
      "Переводит исключающие границы в числовые ключевые слова: {count}",
    "workspace.upgradeChangeSchemaExamples":
      "Превращает example в схемах в массивы examples: {count}",
    "workspace.upgradeChangeWebhooks": "Переносит x-webhooks в webhooks",
    "workspace.upgradeWarningBodyAndFormData":
      "Операция смешивает параметры body и formData; поля формы не преобразованы.",
    "workspace.upgradeWarningExternalReference":
      "Внешняя ссылка {reference} переписана, но связанный файл нужно обновить отдельно.",
    "workspace.upgradeWarningFormDataMediaType":
      "Поля формы объявлены с {consumes}; вместо этого использован тип формы.",
    "workspace.upgradeWarningMissingResponseDescription":
      "У ответа не было описания, поэтому добавлено пустое.",
    "workspace.upgradeWarningNullableComposition":
      "Nullable-ссылка или композиция обёрнута в anyOf с null; проверьте сгенерированные типы.",
    "workspace.upgradeWarningOperationSchemes":
      "Схемы уровня операции ({schemes}) превращены в серверы операции.",
    "workspace.upgradeWarningUnresolvedReference":
      "Ссылку {reference} не удалось разрешить, она сохранена.",
    "workspace.upgradeWarningUnsupportedCollectionFormat":
      "У формата коллекции «{format}» параметра «{name}» нет аналога в OpenAPI 3.",
    "workspace.upgradeWarningUnsupportedOauthFlow":
      "Поток OAuth «{flow}» не распознан, требуется описание flows.",
    "workspace.upgradeWarningWebsocketScheme":
      "Сервер использует схему {scheme}; убедитесь, что инструменты её поддерживают.",
    "workspace.upgradeOutputLabel": "Обновлённый документ",
    "workspace.upgradeCopy": "Копировать обновлённый документ",
    "workspace.upgradeDownload": "Скачать обновлённый документ",
    "workspace.upgradeCopyNotes": "Копировать заметки о миграции",
    "workspace.upgradeSaveCheckpoint":
      "Сначала сохранить текущий документ как контрольную точку",
    "workspace.upgradeApply": "Применить в редакторе",
    "workspace.upgradeCopySuccess": "Обновлённый документ скопирован.",
    "workspace.upgradeCopyError":
      "Не удалось скопировать обновлённый документ.",
    "workspace.upgradeDownloadSuccess":
      "Скачивание обновлённого документа началось.",
    "workspace.upgradeDownloadError":
      "Не удалось скачать обновлённый документ.",
    "workspace.upgradeNotesCopied": "Заметки о миграции скопированы.",
    "workspace.upgradeNotesError": "Не удалось скопировать заметки о миграции.",
    "workspace.upgradeCheckpointError":
      "Не удалось сохранить контрольную точку, поэтому редактор не изменён. Удалите старые точки или примените без неё.",
    "workspace.upgradeCheckpointName": "До обновления до OpenAPI {version}",
    "workspace.upgradeApplied":
      "Документ обновлён до OpenAPI {version}. Предыдущая версия сохранена как контрольная точка.",
    "workspace.upgradeAppliedWithoutCheckpoint":
      "Документ обновлён до OpenAPI {version}.",
    "workspace.upgradeReveal": "Показать в редакторе",
    "workspace.upgradeRevealAriaLabel":
      "Показать заметку об обновлении в {pointer} в редакторе",
    "workspace.upgradeRevealError":
      "Не удалось найти это место в редакторе. Дождитесь обновления схемы и попробуйте снова.",
    "workspace.upgradeMarkdownTitle": "Заметки об обновлении OpenAPI: {title}",
    "workspace.toolNavUpgrade": "Обновление OpenAPI",
    "workspace.moreSnippetLanguages": "Другие языки…",
    "workspace.snippetLanguageAriaLabel":
      "Другие языки кода для {method} {path}",
    "workspace.copySnippet": "Скопировать код",
    "workspace.snippetCopied": "Фрагмент кода скопирован.",
    "workspace.codeSamplesTitle": "Примеры кода",
    "workspace.codeSamplesDescription":
      "Генерирует готовые запросы на 15 языках для руководств, README или x-codeSamples в Redoc на основе документированных примеров.",
    "workspace.codeSamplesLanguagesLabel": "Языки",
    "workspace.codeSamplesSelectAll": "Выбрать все",
    "workspace.codeSamplesSelectNone": "Очистить",
    "workspace.codeSamplesScopeLabel": "Эндпоинты",
    "workspace.codeSamplesScopeAll": "Все эндпоинты спецификации ({count})",
    "workspace.codeSamplesScopeVisible": "Отфильтрованные эндпоинты ({count})",
    "workspace.codeSamplesAuth": "Добавлять заглушки авторизации",
    "workspace.codeSamplesAuthHint":
      "Для защищённых эндпоинтов используются заглушки вроде YOUR_TOKEN; сохранённые учётные данные не включаются.",
    "workspace.codeSamplesSummary":
      "Эндпоинтов: {endpoints} × языков: {languages} = примеров: {samples}",
    "workspace.codeSamplesNoLanguages":
      "Выберите хотя бы один язык, чтобы сгенерировать примеры.",
    "workspace.codeSamplesNoEndpoints":
      "Нет эндпоинтов, подходящих под текущие фильтры.",
    "workspace.codeSamplesPreviewEndpoint": "Эндпоинт для предпросмотра",
    "workspace.codeSamplesPreviewLanguages": "Язык предпросмотра",
    "workspace.codeSamplesPreviewAriaLabel":
      "Предпросмотр примера для {method} {path} на {language}",
    "workspace.codeSamplesCopySample": "Скопировать пример",
    "workspace.codeSamplesCopyMarkdown": "Скопировать руководство Markdown",
    "workspace.codeSamplesDownloadMarkdown": "Скачать руководство Markdown",
    "workspace.codeSamplesDownloadSpec": "Скачать спецификацию с x-codeSamples",
    "workspace.codeSamplesSampleCopied": "Пример скопирован.",
    "workspace.codeSamplesMarkdownCopied": "Руководство Markdown скопировано.",
    "workspace.codeSamplesCopyError": "Не удалось скопировать в буфер обмена.",
    "workspace.codeSamplesMarkdownDownloaded":
      "Скачивание руководства Markdown началось.",
    "workspace.codeSamplesSpecDownloaded":
      "Скачивание спецификации началось; примеры добавлены в операции: {count}.",
    "workspace.codeSamplesDownloadError": "Не удалось начать скачивание.",
    "workspace.codeSamplesMarkdownTitle": "Примеры кода {title}",
    "workspace.codeSamplesMarkdownSummary":
      "Версия {version} · эндпоинтов: {count} · {languages}",
    "workspace.toolNavCodeSamples": "Примеры кода",
    "workspace.codeSamplesShowOptions": "Выбрать языки и предпросмотр",
    "workspace.codeSamplesHideOptions": "Скрыть настройки",
    "workspace.snippetLanguageMenuLabel": "Языки кода для {method} {path}",
  },
} as const;

export type Language = keyof typeof translations;
export type TranslationKey = keyof typeof translations.en;

export function isLanguage(value: string | null): value is Language {
  return value === "en" || value === "ru";
}

export function translate(
  language: Language,
  key: TranslationKey,
  params: Record<string, string> = {},
): string {
  const message = String(
    translations[language][key] || translations.en[key] || key,
  );

  return Object.entries(params).reduce<string>(
    (text, [paramKey, paramValue]) =>
      text.replaceAll(`{${paramKey}}`, paramValue),
    message,
  );
}
