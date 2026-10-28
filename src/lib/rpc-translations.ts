const en = {
  "rpc.title": "JSON-RPC and OpenRPC studio",
  "rpc.help":
    "Explore OpenRPC contracts, build JSON-RPC 2.0 calls and batches, inspect correlated responses, rehearse static fixtures and regression cases, or explicitly send an HTTP POST. The OpenAPI editor is independent and work stays in this tab.",
  "rpc.scopeTitle": "Scope, limits and export contents",
  "rpc.scope":
    "Supports local OpenRPC 1.x method/content references and a bounded subset of JSON Schema checks. Patterns, formats, compositions and other unsupported constraints are marked partial; external references are never fetched. This is not full OpenRPC meta-schema or JSON Schema validation. Numeric IDs must be safe integers; string and explicit null IDs are supported. Omitted ID means notification.",
  "rpc.limits":
    "Limits: 100 methods, 40 parameters per method, 30 requests per batch, 50 fixtures, 30 regression cases, 256 KiB per request/response, 1 MiB per contract and 2 MiB per project. Schema checks share a 10,000-step budget per exchange; reports retain at most 50 issues per check. Live responses have byte and timeout limits.",
  "rpc.privacy":
    "Projects, contracts, requests, responses, cURL and mock-handler exports can contain private data. Reports omit URLs, RPC ID values, parameters, results, error messages/data and assertion literals; method names and project/case metadata remain. Live headers are session-only, omitted from exports, and cleared when changing endpoint origin or loading a project.",
  "rpc.mockHelp":
    "Fixtures return the same saved result or error for a method regardless of parameter values. They do not execute application code or fall back to live traffic. Contract checks are separate. Notifications never have a response, including unknown-method notifications; absence of a response does not confirm application handling.",
  "rpc.liveHelp":
    "Live mode sends one explicit browser POST with your session headers, no ambient cookies, redirects, retries or HTTP cache. The API must permit browser CORS. Calls may change server data. Cancel stops waiting; the server may already have processed the request.",
  "rpc.new": "New JSON-RPC starter project",
  "rpc.demo": "Load JSON-RPC lifecycle demo",
  "rpc.import": "Import JSON-RPC project",
  "rpc.export": "Export JSON-RPC project",
  "rpc.save": "Save RPC edits",
  "rpc.discard": "Discard RPC edits",
  "rpc.pending":
    "Save or discard project, fixture and case edits before switching stored selections, rehearsing, sending live requests or exporting.",
  "rpc.projectName": "JSON-RPC project name",
  "rpc.endpoint": "JSON-RPC HTTP endpoint",
  "rpc.timeout": "RPC timeout, ms (100–30000)",
  "rpc.contractSection": "OpenRPC contract",
  "rpc.contract": "OpenRPC contract JSON draft",
  "rpc.importContract": "Import OpenRPC contract JSON",
  "rpc.exportContract": "Download OpenRPC contract",
  "rpc.contractLoaded":
    "OpenRPC loaded into the contract draft. Save to adopt it; the HTTP endpoint was retained.",
  "rpc.useServer": "Use first absolute HTTP server URL",
  "rpc.noServer":
    "No usable absolute HTTP(S) server URL was found. Enter the endpoint explicitly.",
  "rpc.method": "OpenRPC method",
  "rpc.noMethods":
    "No resolvable methods. Edit the contract or use the raw request editor.",
  "rpc.methodSource": "Selected OpenRPC method JSON",
  "rpc.addMethod": "Add OpenRPC method draft",
  "rpc.contractIssue.reference":
    "Method entry {index} contains an unresolved local or external reference and cannot be explored.",
  "rpc.contractIssue.reserved":
    "Method entry {index} uses the reserved rpc. namespace; review its extension semantics.",
  "rpc.methodInfo":
    "{count} parameters; parameter structure: {structure}; result: {result}.",
  "rpc.hasResult": "described",
  "rpc.notificationOnly": "notification only",
  "rpc.builder": "Call builder and current exchange",
  "rpc.params": "RPC parameters JSON (empty omits params)",
  "rpc.id": "RPC request ID as JSON",
  "rpc.notification": "Build a notification (omit ID)",
  "rpc.style": "Generated parameter style",
  "rpc.named": "Named object",
  "rpc.positional": "Positional array",
  "rpc.generateParams": "Generate parameter sample",
  "rpc.build": "Replace request draft with built call",
  "rpc.append": "Append built call to batch draft",
  "rpc.builderHelp":
    "Build or append updates the request draft; save before execution. Numeric builder IDs advance after a call. Samples cover common schema shapes and may need editing to satisfy constraints. Result assertions use request indexes, independent of response order.",
  "rpc.request": "JSON-RPC request or batch draft",
  "rpc.response": "JSON-RPC response fixture draft (empty for notifications)",
  "rpc.status": "RPC response HTTP status (200–599)",
  "rpc.inspect": "Inspect current RPC draft exchange",
  "rpc.mock": "Rehearse current RPC request offline",
  "rpc.live": "Send live JSON-RPC POST",
  "rpc.headers": "Session-only RPC HTTP headers (JSON object)",
  "rpc.cancel": "Cancel live RPC request",
  "rpc.running": "Waiting for the JSON-RPC endpoint…",
  "rpc.downloadRequest": "Download JSON-RPC request",
  "rpc.downloadResponse": "Download JSON-RPC response",
  "rpc.downloadCurl": "Download RPC cURL (POSIX, without session headers)",
  "rpc.inspection": "JSON-RPC exchange inspection",
  "rpc.inspectionStale":
    "The drafts have changed since this snapshot. Inspect again to check the current exchange.",
  "rpc.exchangeStats":
    "HTTP {status}; {bytes} response bytes; {duration} ms; {requests} request entries; {notifications} notifications.",
  "rpc.protocolState":
    "Wire protocol: {status}; complete contract checks: {contract}.",
  "rpc.valid": "valid",
  "rpc.invalid": "invalid",
  "rpc.complete": "complete",
  "rpc.incomplete": "needs review",
  "rpc.column.index": "Request index",
  "rpc.column.method": "Method",
  "rpc.column.id": "RPC ID",
  "rpc.column.outcome": "Outcome",
  "rpc.column.input": "Parameters",
  "rpc.column.output": "Result contract",
  "rpc.row": "Inspected RPC request index",
  "rpc.resultValue": "Correlated result JSON",
  "rpc.contractDetails": "Parameter and result check details (JSON)",
  "rpc.inspectionReport": "Download RPC inspection report",
  "rpc.outcome.result": "Result",
  "rpc.outcome.error": "RPC error",
  "rpc.outcome.notification": "Notification (unconfirmed)",
  "rpc.outcome.missing": "Missing response",
  "rpc.check.valid": "matches supported checks",
  "rpc.check.invalid": "contract mismatch",
  "rpc.check.partial": "partial check",
  "rpc.check.unknown": "not checked / unknown",
  "rpc.mockSection": "Static method fixtures",
  "rpc.mockSelect": "Selected RPC fixture",
  "rpc.mockMethod": "RPC fixture method name",
  "rpc.mockKind": "RPC fixture response kind",
  "rpc.mockValue": "RPC fixture result or error JSON",
  "rpc.addMock": "Add fixture for selected method",
  "rpc.deleteMock": "Delete RPC fixture",
  "rpc.noMocks": "No method fixtures. Unmatched calls return -32601 offline.",
  "rpc.mockExport": "Download standalone RPC mock handler",
  "rpc.caseSection": "Regression cases",
  "rpc.caseSelect": "Selected RPC regression case",
  "rpc.caseName": "RPC regression case name",
  "rpc.caseMode": "RPC case response source",
  "rpc.caseMode.mock": "Current method fixtures",
  "rpc.caseMode.fixture": "Saved response fixture",
  "rpc.caseRequest": "RPC case request JSON",
  "rpc.caseResponse": "RPC case response JSON",
  "rpc.caseStatus": "RPC case HTTP status (200–599)",
  "rpc.caseExpect": "Expected RPC case outcome",
  "rpc.expect.valid": "Valid protocol exchange",
  "rpc.expect.invalid": "Invalid request or response",
  "rpc.expect.error": "Valid exchange containing an RPC error",
  "rpc.expect.notification": "Notifications without response frames",
  "rpc.caseErrorCode": "Required RPC error code (empty = unchecked)",
  "rpc.caseContract": "Require complete supported contract checks",
  "rpc.caseResults":
    "Expected results by zero-based request index (JSON object)",
  "rpc.caseResultsHelp":
    'Example: {"0":3,"2":{"name":"Ada"}}. Each entry checks the correlated result for that request index; objects compare independent of key order. Notifications and missing responses cannot satisfy a result assertion.',
  "rpc.addCase": "Add RPC regression case",
  "rpc.capture": "Capture inspected exchange as RPC case",
  "rpc.recordResults": "Record current result values as regression assertions",
  "rpc.deleteCase": "Delete RPC regression case",
  "rpc.loadCase": "Load RPC case into exchange draft",
  "rpc.noCases":
    "No regression cases yet. Add a case or capture an inspected exchange.",
  "rpc.runCase": "Run selected RPC regression case",
  "rpc.runAll": "Run all RPC regression cases",
  "rpc.report": "Download RPC regression report",
  "rpc.caseResultsTitle": "RPC regression results",
  "rpc.caseVerdict":
    "Protocol expectation: {protocol}; contract requirement: {contract}; outcome and value assertions: {values}.",
  "rpc.caseAdded": "RPC regression case added.",
  "rpc.passed": "Passed",
  "rpc.failed": "Failed",
  "rpc.completed": "RPC regression checks finished: {passed}/{total} passed.",
  "rpc.loaded":
    "JSON-RPC project loaded. Session headers cleared and imported results discarded.",
  "rpc.saved":
    "RPC edits saved. Session headers are cleared if the endpoint origin changed.",
  "rpc.inspected":
    "RPC exchange inspected. Notifications are not confirmations of application handling.",
  "rpc.received":
    "RPC response received. Review and save the response draft before capture or export.",
  "rpc.captured": "Inspected exchange captured as a saved response case.",
  "rpc.reading": "Reading RPC file…",
  "rpc.downloaded": "Download started.",
  "rpc.downloadFailed": "Could not start the download.",
  "rpc.error.json":
    "Invalid JSON, excessive nesting or unsupported numeric precision. Saved work was retained.",
  "rpc.error.limit":
    "The RPC frame, contract, project or operation exceeds its displayed size/count limits.",
  "rpc.error.contract":
    "Invalid supported OpenRPC structure. Check version/info, method names, descriptors, unique parameters and required-before-optional ordering.",
  "rpc.error.reference":
    "A local reference is invalid, cyclic or unresolved. External references are not fetched.",
  "rpc.error.project":
    "Invalid RPC project or edits. Check names, numeric limits, fixture kinds, unique IDs and result-assertion indexes.",
  "rpc.error.request":
    "Invalid or ambiguous RPC request. Use jsonrpc 2.0, structured or omitted params, unique typed IDs, safe integer numeric IDs, and a nonempty batch of at most 30 entries.",
  "rpc.error.url":
    "Use an absolute HTTP(S) endpoint without userinfo, fragments or outer whitespace.",
  "rpc.error.headers":
    "Invalid HTTP headers. Use unique names and string values; Content-Type and browser-controlled headers are reserved.",
  "rpc.error.network":
    "The RPC request failed. Check the endpoint, connection and browser CORS permissions.",
  "rpc.error.timeout":
    "The RPC timeout was reached; the request or body read was cancelled.",
  "rpc.error.cancelled":
    "Live RPC request cancelled. The server may already have processed it.",
  "rpc.error.mime":
    "A nonempty RPC response must use application/json, application/json-rpc or an application/*+json media type.",
  "rpc.finding.request":
    "The request is outside the supported JSON-RPC envelope shape.",
  "rpc.finding.duplicate-id":
    "Client request IDs must be unique within a batch.",
  "rpc.finding.null-id":
    "An explicit null ID is a call, not a notification; null IDs are discouraged by JSON-RPC.",
  "rpc.finding.reserved-method":
    "The rpc. method namespace is reserved for protocol extensions.",
  "rpc.finding.response-json": "The response is not supported JSON.",
  "rpc.finding.response-shape":
    "Single calls require an object; batches require a nonempty response array.",
  "rpc.finding.response-envelope":
    "Response requires jsonrpc 2.0, a matching ID, and exactly one result or valid error object.",
  "rpc.finding.duplicate-response":
    "More than one response uses the same typed ID.",
  "rpc.finding.unknown-id":
    "A response ID does not match any call in the request frame.",
  "rpc.finding.missing-response":
    "A call with an ID has no corresponding response.",
  "rpc.finding.notification-response":
    "Notifications must not produce response frames, including an empty response array.",
  "rpc.finding.notification-http":
    "An HTTP failure cannot confirm delivery of a notification, even with an empty body.",
  "rpc.finding.http-status":
    "HTTP status is outside 2xx. JSON-RPC protocol and HTTP status are inspected separately.",
} as const;
const ru: Record<keyof typeof en, string> = {
  "rpc.title": "Студия JSON-RPC и OpenRPC",
  "rpc.help":
    "Изучайте OpenRPC, собирайте вызовы и пакеты JSON-RPC 2.0, сопоставляйте ответы, проверяйте фикстуры и регрессионные примеры либо явно отправляйте HTTP POST. Редактор OpenAPI независим; работа остаётся во вкладке.",
  "rpc.scopeTitle": "Область модели, ограничения и экспорт",
  "rpc.scope":
    "Поддерживаются локальные ссылки методов и дескрипторов OpenRPC 1.x и ограниченный набор проверок JSON Schema. Шаблоны, форматы, композиции и другие ограничения отмечаются как частичная проверка; внешние ссылки не загружаются. Это не полная проверка метасхемы OpenRPC или JSON Schema. Числовые ID — безопасные целые; строки и явный null поддерживаются. Отсутствие ID означает уведомление.",
  "rpc.limits":
    "До 100 методов, 40 параметров на метод, 30 запросов в пакете, 50 фикстур, 30 примеров, 256 КиБ на запрос/ответ, 1 МиБ на контракт и 2 МиБ на проект. Общий бюджет проверок схем — 10 000 шагов на обмен; до 50 замечаний на проверку. Живые ответы ограничены по байтам и времени.",
  "rpc.privacy":
    "Проекты, контракты, запросы, ответы, cURL и обработчики могут содержать личные данные. Отчёты исключают URL, значения RPC ID, параметры, результаты, сообщения/данные ошибок и значения утверждений; имена методов и метаданные проектов/примеров остаются. Живые заголовки не экспортируются и очищаются при смене источника URL или загрузке проекта.",
  "rpc.mockHelp":
    "Фикстура возвращает одинаковый результат или ошибку независимо от параметров. Код приложения не выполняется; перехода к живой сети нет. Проверки контракта независимы. Уведомления не имеют ответов, включая неизвестные методы; отсутствие ответа не подтверждает обработку приложением.",
  "rpc.liveHelp":
    "Живой режим отправляет один явный POST браузера с вашими заголовками, без автоматических cookie, редиректов, повторов и HTTP-кеша. API должен разрешать CORS браузера. Вызов может менять данные сервера. Отмена прекращает ожидание; сервер мог уже обработать запрос.",
  "rpc.new": "Новый стартовый проект JSON-RPC",
  "rpc.demo": "Загрузить примеры жизненного цикла JSON-RPC",
  "rpc.import": "Импорт проекта JSON-RPC",
  "rpc.export": "Экспорт проекта JSON-RPC",
  "rpc.save": "Сохранить изменения RPC",
  "rpc.discard": "Отменить изменения RPC",
  "rpc.pending":
    "Сохраните или отмените изменения проекта, фикстуры и примера перед переключением, запуском, живой отправкой или экспортом.",
  "rpc.projectName": "Название проекта JSON-RPC",
  "rpc.endpoint": "HTTP-адрес JSON-RPC",
  "rpc.timeout": "Тайм-аут RPC, мс (100–30000)",
  "rpc.contractSection": "Контракт OpenRPC",
  "rpc.contract": "Черновик контракта OpenRPC JSON",
  "rpc.importContract": "Импорт контракта OpenRPC JSON",
  "rpc.exportContract": "Скачать контракт OpenRPC",
  "rpc.contractLoaded":
    "OpenRPC загружен в черновик. Сохраните для применения; HTTP-адрес оставлен прежним.",
  "rpc.useServer": "Использовать первый абсолютный HTTP URL сервера",
  "rpc.noServer":
    "Подходящий абсолютный HTTP(S) URL не найден. Укажите адрес явно.",
  "rpc.method": "Метод OpenRPC",
  "rpc.noMethods":
    "Нет методов с разрешимыми ссылками. Измените контракт или используйте редактор запроса.",
  "rpc.methodSource": "JSON выбранного метода OpenRPC",
  "rpc.addMethod": "Добавить черновик метода OpenRPC",
  "rpc.contractIssue.reference":
    "Запись метода {index} содержит неразрешённую ссылку и недоступна для изучения.",
  "rpc.contractIssue.reserved":
    "Запись метода {index} использует зарезервированное пространство rpc.; проверьте семантику расширения.",
  "rpc.methodInfo":
    "Параметров: {count}; структура: {structure}; результат: {result}.",
  "rpc.hasResult": "описан",
  "rpc.notificationOnly": "только уведомление",
  "rpc.builder": "Сборка вызова и текущий обмен",
  "rpc.params": "Параметры RPC JSON (пусто = без params)",
  "rpc.id": "ID запроса RPC в формате JSON",
  "rpc.notification": "Создать уведомление (без ID)",
  "rpc.style": "Стиль генерируемых параметров",
  "rpc.named": "Именованный объект",
  "rpc.positional": "Позиционный массив",
  "rpc.generateParams": "Сгенерировать пример параметров",
  "rpc.build": "Заменить черновик запроса собранным вызовом",
  "rpc.append": "Добавить собранный вызов в пакет",
  "rpc.builderHelp":
    "Сборка обновляет черновик; сохраните перед выполнением. Числовые ID увеличиваются после вызова. Примеры покрывают обычные формы схем и могут требовать правок. Ожидания результатов привязаны к индексам запросов, а не порядку ответов.",
  "rpc.request": "Черновик запроса или пакета JSON-RPC",
  "rpc.response": "Черновик ответа JSON-RPC (пусто для уведомлений)",
  "rpc.status": "HTTP-статус ответа RPC (200–599)",
  "rpc.inspect": "Проверить текущий черновик обмена RPC",
  "rpc.mock": "Проверить текущий запрос RPC автономно",
  "rpc.live": "Отправить живой POST JSON-RPC",
  "rpc.headers": "Сессионные HTTP-заголовки RPC (объект JSON)",
  "rpc.cancel": "Отменить живой запрос RPC",
  "rpc.running": "Ожидание ответа JSON-RPC…",
  "rpc.downloadRequest": "Скачать запрос JSON-RPC",
  "rpc.downloadResponse": "Скачать ответ JSON-RPC",
  "rpc.downloadCurl": "Скачать cURL RPC (POSIX, без сессионных заголовков)",
  "rpc.inspection": "Проверка обмена JSON-RPC",
  "rpc.inspectionStale":
    "Черновики изменились после этого снимка. Проверьте обмен заново для актуальных данных.",
  "rpc.exchangeStats":
    "HTTP {status}; байт ответа: {bytes}; {duration} мс; запросов: {requests}; уведомлений: {notifications}.",
  "rpc.protocolState":
    "Протокол: {status}; полнота проверок контракта: {contract}.",
  "rpc.valid": "корректен",
  "rpc.invalid": "некорректен",
  "rpc.complete": "полные",
  "rpc.incomplete": "нужна проверка",
  "rpc.column.index": "Индекс запроса",
  "rpc.column.method": "Метод",
  "rpc.column.id": "RPC ID",
  "rpc.column.outcome": "Результат",
  "rpc.column.input": "Параметры",
  "rpc.column.output": "Контракт результата",
  "rpc.row": "Индекс изучаемого запроса RPC",
  "rpc.resultValue": "JSON сопоставленного результата",
  "rpc.contractDetails": "Детали проверок параметров и результата (JSON)",
  "rpc.inspectionReport": "Скачать отчёт о проверке RPC",
  "rpc.outcome.result": "Результат",
  "rpc.outcome.error": "Ошибка RPC",
  "rpc.outcome.notification": "Уведомление (без подтверждения)",
  "rpc.outcome.missing": "Нет ответа",
  "rpc.check.valid": "соответствует поддержанным проверкам",
  "rpc.check.invalid": "не соответствует контракту",
  "rpc.check.partial": "частичная проверка",
  "rpc.check.unknown": "не проверено / неизвестно",
  "rpc.mockSection": "Статические фикстуры методов",
  "rpc.mockSelect": "Выбранная фикстура RPC",
  "rpc.mockMethod": "Имя метода фикстуры RPC",
  "rpc.mockKind": "Вид ответа фикстуры RPC",
  "rpc.mockValue": "JSON результата или ошибки фикстуры RPC",
  "rpc.addMock": "Добавить фикстуру выбранного метода",
  "rpc.deleteMock": "Удалить фикстуру RPC",
  "rpc.noMocks":
    "Нет фикстур методов. Неизвестные вызовы автономно возвращают -32601.",
  "rpc.mockExport": "Скачать самостоятельный mock-обработчик RPC",
  "rpc.caseSection": "Регрессионные примеры",
  "rpc.caseSelect": "Выбранный регрессионный пример RPC",
  "rpc.caseName": "Название регрессионного примера RPC",
  "rpc.caseMode": "Источник ответа примера RPC",
  "rpc.caseMode.mock": "Текущие фикстуры методов",
  "rpc.caseMode.fixture": "Сохранённый ответ",
  "rpc.caseRequest": "JSON запроса примера RPC",
  "rpc.caseResponse": "JSON ответа примера RPC",
  "rpc.caseStatus": "HTTP-статус примера RPC (200–599)",
  "rpc.caseExpect": "Ожидаемый результат примера RPC",
  "rpc.expect.valid": "Корректный обмен протокола",
  "rpc.expect.invalid": "Некорректный запрос или ответ",
  "rpc.expect.error": "Корректный обмен с ошибкой RPC",
  "rpc.expect.notification": "Уведомления без ответов",
  "rpc.caseErrorCode": "Необходимый код ошибки RPC (пусто = без проверки)",
  "rpc.caseContract": "Требовать полные поддерживаемые проверки контракта",
  "rpc.caseResults":
    "Ожидаемые результаты по индексам запросов с нуля (объект JSON)",
  "rpc.caseResultsHelp":
    'Пример: {"0":3,"2":{"name":"Ada"}}. Значения проверяются по сопоставленному результату для индекса запроса; порядок ключей объекта не важен. Уведомления и отсутствующие ответы не проходят проверку результата.',
  "rpc.addCase": "Добавить регрессионный пример RPC",
  "rpc.capture": "Сохранить изученный обмен как пример RPC",
  "rpc.recordResults": "Записать текущие результаты как регрессионные ожидания",
  "rpc.deleteCase": "Удалить регрессионный пример RPC",
  "rpc.loadCase": "Загрузить пример RPC в черновик обмена",
  "rpc.noCases":
    "Регрессионных примеров нет. Добавьте пример или сохраните изученный обмен.",
  "rpc.runCase": "Запустить выбранный регрессионный пример RPC",
  "rpc.runAll": "Запустить все регрессионные примеры RPC",
  "rpc.report": "Скачать регрессионный отчёт RPC",
  "rpc.caseResultsTitle": "Результаты регрессионных проверок RPC",
  "rpc.caseVerdict":
    "Ожидание протокола: {protocol}; требование контракта: {contract}; проверки исхода и значений: {values}.",
  "rpc.caseAdded": "Регрессионный случай RPC добавлен.",
  "rpc.passed": "Пройдено",
  "rpc.failed": "Не пройдено",
  "rpc.completed": "Проверки RPC завершены: пройдено {passed}/{total}.",
  "rpc.loaded":
    "Проект JSON-RPC загружен. Сессионные заголовки очищены; импортированные результаты отброшены.",
  "rpc.saved":
    "Изменения RPC сохранены. При смене источника URL сессионные заголовки очищаются.",
  "rpc.inspected":
    "Обмен RPC проверен. Уведомления не подтверждают обработку приложением.",
  "rpc.received":
    "Ответ RPC получен. Проверьте и сохраните черновик перед записью примера или экспортом.",
  "rpc.captured": "Изученный обмен сохранён как пример ответа.",
  "rpc.reading": "Чтение файла RPC…",
  "rpc.downloaded": "Загрузка началась.",
  "rpc.downloadFailed": "Не удалось начать загрузку.",
  "rpc.error.json":
    "Некорректный JSON, чрезмерная вложенность или неподдерживаемая точность чисел. Сохранённая работа не изменена.",
  "rpc.error.limit":
    "Кадр, контракт, проект или операция RPC превышает указанные ограничения.",
  "rpc.error.contract":
    "Некорректная структура OpenRPC. Проверьте версию/info, методы, дескрипторы, уникальность и порядок обязательных/необязательных параметров.",
  "rpc.error.reference":
    "Локальная ссылка некорректна, циклична или не разрешена. Внешние ссылки не загружаются.",
  "rpc.error.project":
    "Некорректный проект RPC или изменения. Проверьте имена, числа, виды фикстур, уникальные ID и индексы ожиданий.",
  "rpc.error.request":
    "Некорректный или неоднозначный запрос RPC. Нужны jsonrpc 2.0, структурированные либо отсутствующие params, уникальные типизированные ID, безопасные целые числовые ID и непустой пакет до 30 записей.",
  "rpc.error.url":
    "Укажите абсолютный HTTP(S) URL без учётных данных, фрагмента и внешних пробелов.",
  "rpc.error.headers":
    "Некорректные HTTP-заголовки. Нужны уникальные имена и строки; Content-Type и заголовки под управлением браузера зарезервированы.",
  "rpc.error.network":
    "Запрос RPC завершился ошибкой. Проверьте адрес, соединение и CORS браузера.",
  "rpc.error.timeout":
    "Достигнут тайм-аут RPC; ожидание запроса или тела отменено.",
  "rpc.error.cancelled":
    "Живой запрос RPC отменён. Сервер мог уже обработать его.",
  "rpc.error.mime":
    "Непустой ответ RPC должен иметь тип application/json, application/json-rpc или application/*+json.",
  "rpc.finding.request":
    "Запрос не соответствует поддерживаемой форме JSON-RPC.",
  "rpc.finding.duplicate-id": "ID вызовов внутри пакета должны быть уникальны.",
  "rpc.finding.null-id":
    "Явный null ID — вызов, не уведомление; JSON-RPC не рекомендует null ID.",
  "rpc.finding.reserved-method":
    "Пространство имён rpc. зарезервировано для расширений протокола.",
  "rpc.finding.response-json": "Ответ не является поддерживаемым JSON.",
  "rpc.finding.response-shape":
    "Для одного вызова нужен объект; для пакета — непустой массив ответов.",
  "rpc.finding.response-envelope":
    "Ответ требует jsonrpc 2.0, сопоставленный ID и ровно один result либо корректный error.",
  "rpc.finding.duplicate-response":
    "Несколько ответов используют один типизированный ID.",
  "rpc.finding.unknown-id":
    "ID ответа не соответствует ни одному вызову запроса.",
  "rpc.finding.missing-response":
    "Для вызова с ID нет соответствующего ответа.",
  "rpc.finding.notification-response":
    "Уведомления не должны порождать ответы, включая пустой массив.",
  "rpc.finding.notification-http":
    "Ошибка HTTP не подтверждает доставку уведомления даже при пустом теле.",
  "rpc.finding.http-status":
    "HTTP-статус вне 2xx. Протокол JSON-RPC и HTTP-статус проверяются отдельно.",
};
export const rpcTranslations = { en, ru };
