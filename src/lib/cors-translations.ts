const en = {
  "cors.title": "CORS policy studio",
  "cors.help":
    "Design cross-origin server policies and rehearse browser requests with supplied responses and a virtual clock. Compare policies, inspect preflight decisions and script-visible data, and export standalone Fetch middleware. Rehearsal sends no requests and work stays in this tab.",
  "cors.scopeTitle": "Model scope, fixtures and limits",
  "cors.scope":
    "Models HTTP CORS checks, exact origins, ambient credential modes, header safelists, response exposure and a bounded preflight cache. Redirect chains, CSP, mixed content, CORP/ORB, cookie storage, service workers and browser-specific extensions are outside the model. One scenario represents a browser context; partition labels separate top-level contexts.",
  "cors.fixtureHelp":
    "Policy mode replaces Access-Control headers while retaining application headers and merging Vary. Disable policy generation to test captured CORS headers exactly. A passed check means expectations and budgets matched; an intentionally blocked request can pass. Strict input checks report headers that browsers would drop rather than silently changing a request.",
  "cors.privacy":
    "Projects and response fixtures can contain credentials and private data. Decision reports omit URLs, origins, header names/values, bodies and partition labels; names and IDs remain. Middleware exports contain only the selected public policy. Work is not saved in browser storage; export a project to resume later.",
  "cors.limits":
    "Up to 5 policies, 10 scenarios, 100 requests per scenario, 256 preflight grants, 64 KiB per response body and 2 MiB per project. Each policy/scenario starts with an empty cache. Requests run sequentially at or after their scheduled times.",
  "cors.authorizationHelp":
    "CORS controls whether browser scripts can read cross-origin responses. It is not server authorization: a simple request or an actual request that fails response checks may still reach the application. Allowed-method lists govern preflights and do not prevent simple GET/HEAD/POST requests.",
  "cors.demo": "Load browser CORS lifecycle demo",
  "cors.new": "New CORS project",
  "cors.import": "Import CORS project",
  "cors.export": "Export CORS project",
  "cors.save": "Save CORS edits",
  "cors.discard": "Discard CORS edits",
  "cors.pending":
    "Save or discard edits before switching selections, rehearsing, importing or exporting.",
  "cors.projectName": "CORS project name",
  "cors.maxAgeCap": "Modeled browser Max-Age cap, seconds (0–86400)",
  "cors.cacheCapacity": "Preflight cache grant capacity (1–256)",
  "cors.policy": "CORS policy",
  "cors.policyName": "CORS policy name",
  "cors.addPolicy": "Copy CORS policy",
  "cors.deletePolicy": "Delete CORS policy",
  "cors.origins": "Allowed origins (one per line; * alone or explicit null)",
  "cors.methods": "Allowed preflight methods (comma-separated, case-sensitive)",
  "cors.requestHeaders": "Allowed request header names (comma-separated)",
  "cors.exposeHeaders": "Exposed response header names (comma-separated)",
  "cors.credentials": "Allow credentialed cross-origin responses",
  "cors.maxAge": "Server Access-Control-Max-Age, seconds (0–86400)",
  "cors.findings": "CORS policy review",
  "cors.finding.credential-wildcard-origin":
    "Credentialed requests cannot use Access-Control-Allow-Origin: *. Choose explicit origins before exporting middleware.",
  "cors.finding.credential-wildcard-method":
    "With credentials, * is a literal method name. Use explicit methods before exporting middleware.",
  "cors.finding.credential-wildcard-header":
    "With credentials, * is a literal request header name. Use explicit header names before exporting middleware.",
  "cors.finding.credential-wildcard-exposure":
    "With credentials, * does not expose all response headers. List names explicitly before exporting middleware.",
  "cors.finding.null-origin":
    "The literal null origin covers opaque origins. Review that this permission is intended.",
  "cors.scenario": "CORS scenario",
  "cors.scenarioName": "CORS scenario name",
  "cors.addScenario": "Add CORS scenario",
  "cors.deleteScenario": "Delete CORS scenario",
  "cors.budget.maxBlocked": "Maximum blocked requests (0–100)",
  "cors.budget.maxPreflights": "Maximum preflight requests (0–100)",
  "cors.budget.maxWaitMs": "Maximum modeled network wait, ms (0–12000000)",
  "cors.case": "Browser request case",
  "cors.caseName": "Browser request name",
  "cors.addCase": "Add browser request",
  "cors.deleteCase": "Delete browser request",
  "cors.atMs": "Request schedule offset, ms (0–604800000)",
  "cors.partition": "Browser partition label",
  "cors.origin": "Calling page origin (HTTP(S) origin or null)",
  "cors.url": "Target request URL",
  "cors.method": "Browser request method",
  "cors.mode": "Fetch request mode",
  "cors.mode.cors": "cors: check cross-origin permissions",
  "cors.mode.same-origin": "same-origin: refuse cross-origin targets",
  "cors.mode.no-cors": "no-cors: opaque cross-origin response",
  "cors.credentialMode": "Fetch ambient credential mode",
  "cors.credential.omit": "omit: no ambient credentials",
  "cors.credential.same-origin":
    "same-origin: credentials for same-origin targets",
  "cors.credential.include": "include: enable ambient credentials",
  "cors.browserHeaders": "Application request headers (JSON object)",
  "cors.force": "Force a CORS preflight even for otherwise safelisted inputs",
  "cors.preflightFixture": "Preflight response fixture",
  "cors.actualFixture": "Actual response fixture",
  "cors.preflightPolicy":
    "Generate preflight CORS headers from each replay policy",
  "cors.responsePolicy":
    "Generate actual response CORS headers from each replay policy",
  "cors.preflightStatus": "Preflight HTTP status (0 = network error)",
  "cors.responseStatus": "Actual HTTP status (0 = network error)",
  "cors.preflightDelay": "Preflight delay, ms (0–60000)",
  "cors.responseDelay": "Actual response delay, ms (0–60000)",
  "cors.preflightHeaders": "Preflight response headers (JSON object)",
  "cors.responseHeaders": "Actual response headers (JSON object)",
  "cors.responseBody": "Actual response body fixture (decoded text)",
  "cors.expectOutcome": "Expected browser outcome",
  "cors.expectPreflight": "Expected preflight behavior",
  "cors.expectStatus":
    "Expected script-visible status (empty = unchecked, 0 = hidden)",
  "cors.unchecked": "No expectation",
  "cors.run": "Compare policies for selected CORS scenario",
  "cors.runAll": "Rehearse all CORS scenarios and policies",
  "cors.report": "Download CORS decision report",
  "cors.middleware": "Download Fetch CORS middleware",
  "cors.middlewarePreview": "Standalone Fetch middleware preview",
  "cors.middlewareSource": "Generated CORS middleware source",
  "cors.comparison": "CORS policy comparison",
  "cors.result": "CORS replay result",
  "cors.resultSelector": "Select CORS replay result",
  "cors.timeline": "Browser CORS request timeline",
  "cors.search": "Search CORS decisions",
  "cors.filter": "CORS outcome filter",
  "cors.all": "All outcomes",
  "cors.inspect": "Inspect CORS request",
  "cors.inspector": "CORS exchange inspector",
  "cors.exchange": "Modeled request and server headers (JSON)",
  "cors.visibleHeaders": "Headers visible to the browser script (JSON)",
  "cors.visibleBody": "Body visible to the browser script",
  "cors.requestAttempted": "Actual request attempted: {value}",
  "cors.ambient": "Ambient credentials enabled on actual request: {value}",
  "cors.preflightNeverCredentials":
    "Preflights carry no Cookie or Authorization credential values.",
  "cors.yes": "yes",
  "cors.no": "no",
  "cors.cache": "Final preflight cache grants",
  "cors.cacheData": "Preflight cache grants (JSON)",
  "cors.noMatches": "No CORS decisions match this filter.",
  "cors.passed": "Passed",
  "cors.failed": "Failed",
  "cors.column.time": "Time, ms",
  "cors.column.request": "Request",
  "cors.column.outcome": "Outcome / script status",
  "cors.column.preflight": "Preflight",
  "cors.column.check": "Expectation check",
  "cors.metric.requests": "Browser requests",
  "cors.metric.allowed": "Readable responses",
  "cors.metric.blocked": "Blocked requests / responses",
  "cors.metric.opaque": "Opaque responses",
  "cors.metric.invalid": "Unsupported request inputs",
  "cors.metric.preflights": "Preflight requests",
  "cors.metric.cacheHits": "Preflights avoided by cache",
  "cors.metric.actualRequests": "Actual request attempts",
  "cors.metric.totalWaitMs": "Modeled network wait, ms",
  "cors.metric.evictions": "Preflight grant evictions",
  "cors.outcome.allowed": "Readable response",
  "cors.outcome.blocked": "CORS blocked",
  "cors.outcome.opaque": "Opaque response",
  "cors.outcome.invalid": "Unsupported input / redirect",
  "cors.preflight.sent": "OPTIONS sent",
  "cors.preflight.cached": "Cached permission",
  "cors.preflight.not-needed": "No preflight",
  "cors.reason.same-origin":
    "Caller and target share an origin; CORS permission is not required.",
  "cors.reason.same-origin-mode":
    "Fetch same-origin mode rejects a cross-origin target before sending it.",
  "cors.reason.no-cors-method":
    "No-cors requests only support GET, HEAD and POST.",
  "cors.reason.no-cors-header":
    "This no-cors request contains an application header the browser would remove.",
  "cors.reason.forbidden-header":
    "A browser-controlled request header cannot be supplied as an application header.",
  "cors.reason.preflight-required":
    "The method, header names/values or force flag require a preflight.",
  "cors.reason.preflight-cached":
    "Unexpired grants match the partition, caller origin, exact URL and credential mode.",
  "cors.reason.simple-request":
    "The request uses a safelisted method and header values, so it needs no preflight.",
  "cors.reason.preflight-network":
    "The preflight fixture represents a network failure.",
  "cors.reason.preflight-status":
    "Preflights require a successful 2xx HTTP response.",
  "cors.reason.missing-origin": "Access-Control-Allow-Origin is missing.",
  "cors.reason.origin-mismatch":
    "Access-Control-Allow-Origin does not exactly equal the serialized caller origin.",
  "cors.reason.wildcard-credentials":
    "A wildcard origin cannot authorize a request with credential mode include.",
  "cors.reason.credentials-header":
    "Credential mode include requires the exact Access-Control-Allow-Credentials value true.",
  "cors.reason.allow-list":
    "The preflight method/header permission list contains invalid syntax.",
  "cors.reason.method-denied":
    "The non-safelisted request method is not granted; method matching is case-sensitive.",
  "cors.reason.header-denied":
    "A non-safelisted request header is not granted by the preflight response.",
  "cors.reason.authorization-explicit":
    "Authorization requires an explicit allowed header name; * does not grant it.",
  "cors.reason.response-network":
    "The actual response fixture represents a network failure.",
  "cors.reason.redirect":
    "Redirect chains are outside this model. Supply the final response or a separate case.",
  "cors.reason.response-allowed":
    "The script can read the response status, body and permitted headers, including HTTP error statuses.",
  "cors.reason.opaque":
    "Cross-origin no-cors returns an opaque response: status, headers and body are hidden.",
  "cors.reason.vary-origin":
    "If this response changes by caller origin, include Vary: Origin for HTTP caches.",
  "cors.reason.cache-evicted":
    "The bounded cache evicted its oldest grant; a browser may also evict permissions early.",
  "cors.loaded": "CORS project loaded. Rehearse it to calculate fresh results.",
  "cors.saved": "CORS edits saved; previous results cleared.",
  "cors.completed":
    "CORS rehearsal finished: {passed}/{total} policy/scenario combinations passed.",
  "cors.reading": "Reading CORS project…",
  "cors.downloaded": "Download started.",
  "cors.downloadFailed": "Could not start the download.",
  "cors.error.project":
    "Invalid CORS project or edits. Check names, numeric limits, ordered schedules, modes, expectations and empty-body statuses.",
  "cors.error.json":
    "Invalid JSON. Your saved project and draft were retained.",
  "cors.error.headers":
    "Invalid headers. Use unique case-insensitive names and string byte values without control characters. Unicode above U+00FF is not a Fetch header byte value.",
  "cors.error.origin":
    "Use a complete HTTP(S) origin without a path, credentials, query or fragment, or the literal null.",
  "cors.error.url":
    "Use an absolute HTTP(S) target URL without credentials, fragments or outer whitespace.",
  "cors.error.limit":
    "The CORS project exceeds the displayed size or count limits.",
  "cors.error.export":
    "Resolve credential/wildcard findings before exporting middleware; use explicit origins, methods and header names.",
} as const;

const ru: Record<keyof typeof en, string> = {
  "cors.title": "Студия политик CORS",
  "cors.help":
    "Создавайте политики CORS и моделируйте запросы браузера с заданными ответами и виртуальными часами. Сравнивайте политики, изучайте предварительные проверки и доступные скрипту данные, экспортируйте Fetch middleware. Моделирование не отправляет запросы; работа остаётся во вкладке.",
  "cors.scopeTitle": "Область модели, ответы и ограничения",
  "cors.scope":
    "Моделируются HTTP-проверки CORS, точные источники, режимы учётных данных, списки заголовков, доступ к ответам и ограниченный кеш предварительных проверок. Перенаправления, CSP, смешанный контент, CORP/ORB, хранилище cookie, service workers и расширения браузеров не моделируются. Сценарий представляет контекст браузера; метки разделов отделяют контексты верхнего уровня.",
  "cors.fixtureHelp":
    "Режим политики заменяет заголовки Access-Control, сохраняет заголовки приложения и объединяет Vary. Отключите генерацию для проверки фактических заголовков CORS. Успешная проверка означает совпадение ожиданий и бюджетов: намеренная блокировка тоже может пройти. Заголовки, которые браузер удалил бы, явно отмечаются как неподдерживаемый ввод.",
  "cors.privacy":
    "Проекты и примеры ответов могут содержать секреты. Отчёты исключают URL, источники, имена и значения заголовков, тела и метки разделов; имена и ID сохраняются. Middleware содержит только выбранную публичную политику. Работа не сохраняется в хранилище браузера; экспортируйте проект для продолжения.",
  "cors.limits":
    "До 5 политик, 10 сценариев, 100 запросов на сценарий, 256 разрешений кеша, 64 КиБ на тело и 2 МиБ на проект. Каждая пара политики и сценария начинает с пустого кеша. Запросы выполняются последовательно не раньше указанного времени.",
  "cors.authorizationHelp":
    "CORS определяет доступ скрипта браузера к ответу другого источника. Это не авторизация сервера: простой запрос или запрос с отказом проверки ответа может дойти до приложения. Списки методов относятся к предварительным проверкам и не запрещают простые GET/HEAD/POST.",
  "cors.demo": "Загрузить примеры жизненного цикла CORS",
  "cors.new": "Новый проект CORS",
  "cors.import": "Импорт проекта CORS",
  "cors.export": "Экспорт проекта CORS",
  "cors.save": "Сохранить изменения CORS",
  "cors.discard": "Отменить изменения CORS",
  "cors.pending":
    "Сохраните или отмените изменения перед переключением, моделированием, импортом или экспортом.",
  "cors.projectName": "Название проекта CORS",
  "cors.maxAgeCap": "Предел Max-Age модели браузера, с (0–86400)",
  "cors.cacheCapacity": "Ёмкость кеша разрешений (1–256)",
  "cors.policy": "Политика CORS",
  "cors.policyName": "Название политики CORS",
  "cors.addPolicy": "Копировать политику CORS",
  "cors.deletePolicy": "Удалить политику CORS",
  "cors.origins":
    "Разрешённые источники (по строке; отдельно * или явный null)",
  "cors.methods":
    "Методы предварительной проверки (через запятую, с учётом регистра)",
  "cors.requestHeaders": "Разрешённые заголовки запроса (через запятую)",
  "cors.exposeHeaders": "Доступные скрипту заголовки ответа (через запятую)",
  "cors.credentials":
    "Разрешить ответы с учётными данными для другого источника",
  "cors.maxAge": "Access-Control-Max-Age сервера, с (0–86400)",
  "cors.findings": "Проверка политики CORS",
  "cors.finding.credential-wildcard-origin":
    "Запросы с учётными данными не допускают Access-Control-Allow-Origin: *. Укажите точные источники перед экспортом middleware.",
  "cors.finding.credential-wildcard-method":
    "С учётными данными * означает буквальное имя метода. Укажите методы явно перед экспортом middleware.",
  "cors.finding.credential-wildcard-header":
    "С учётными данными * означает буквальное имя заголовка. Укажите имена явно перед экспортом middleware.",
  "cors.finding.credential-wildcard-exposure":
    "С учётными данными * не открывает все заголовки ответа. Перечислите имена явно перед экспортом middleware.",
  "cors.finding.null-origin":
    "Буквальный источник null охватывает непрозрачные источники. Проверьте необходимость этого разрешения.",
  "cors.scenario": "Сценарий CORS",
  "cors.scenarioName": "Название сценария CORS",
  "cors.addScenario": "Добавить сценарий CORS",
  "cors.deleteScenario": "Удалить сценарий CORS",
  "cors.budget.maxBlocked": "Максимум заблокированных запросов (0–100)",
  "cors.budget.maxPreflights": "Максимум предварительных запросов (0–100)",
  "cors.budget.maxWaitMs":
    "Максимум моделируемого ожидания сети, мс (0–12000000)",
  "cors.case": "Пример запроса браузера",
  "cors.caseName": "Название запроса браузера",
  "cors.addCase": "Добавить запрос браузера",
  "cors.deleteCase": "Удалить запрос браузера",
  "cors.atMs": "Время запуска запроса, мс (0–604800000)",
  "cors.partition": "Метка раздела браузера",
  "cors.origin": "Источник вызывающей страницы (HTTP(S) или null)",
  "cors.url": "Целевой URL запроса",
  "cors.method": "Метод запроса браузера",
  "cors.mode": "Режим запроса Fetch",
  "cors.mode.cors": "cors: проверять доступ к другому источнику",
  "cors.mode.same-origin": "same-origin: запрещать другие источники",
  "cors.mode.no-cors": "no-cors: непрозрачный ответ другого источника",
  "cors.credentialMode": "Режим учётных данных Fetch",
  "cors.credential.omit": "omit: без автоматических учётных данных",
  "cors.credential.same-origin": "same-origin: данные только своему источнику",
  "cors.credential.include": "include: включить автоматические учётные данные",
  "cors.browserHeaders": "Заголовки запроса приложения (объект JSON)",
  "cors.force": "Принудительная предварительная проверка CORS",
  "cors.preflightFixture": "Пример предварительного ответа",
  "cors.actualFixture": "Пример фактического ответа",
  "cors.preflightPolicy":
    "Генерировать заголовки предварительного ответа из политики",
  "cors.responsePolicy":
    "Генерировать заголовки фактического ответа из политики",
  "cors.preflightStatus":
    "HTTP-статус предварительного ответа (0 = сетевая ошибка)",
  "cors.responseStatus": "HTTP-статус фактического ответа (0 = сетевая ошибка)",
  "cors.preflightDelay": "Задержка предварительного ответа, мс (0–60000)",
  "cors.responseDelay": "Задержка фактического ответа, мс (0–60000)",
  "cors.preflightHeaders": "Заголовки предварительного ответа (объект JSON)",
  "cors.responseHeaders": "Заголовки фактического ответа (объект JSON)",
  "cors.responseBody": "Тело фактического ответа (декодированный текст)",
  "cors.expectOutcome": "Ожидаемый результат браузера",
  "cors.expectPreflight": "Ожидаемая предварительная проверка",
  "cors.expectStatus":
    "Ожидаемый статус для скрипта (пусто = без проверки, 0 = скрыт)",
  "cors.unchecked": "Без ожидания",
  "cors.run": "Сравнить политики для выбранного сценария CORS",
  "cors.runAll": "Моделировать все сценарии и политики CORS",
  "cors.report": "Скачать отчёт о решениях CORS",
  "cors.middleware": "Скачать Fetch middleware CORS",
  "cors.middlewarePreview": "Предпросмотр самостоятельного Fetch middleware",
  "cors.middlewareSource": "Исходный код middleware CORS",
  "cors.comparison": "Сравнение политик CORS",
  "cors.result": "Результат моделирования CORS",
  "cors.resultSelector": "Выбрать результат моделирования CORS",
  "cors.timeline": "Временная шкала запросов CORS",
  "cors.search": "Поиск решений CORS",
  "cors.filter": "Фильтр результатов CORS",
  "cors.all": "Все результаты",
  "cors.inspect": "Изучить запрос CORS",
  "cors.inspector": "Инспектор обмена CORS",
  "cors.exchange": "Заголовки моделируемого запроса и сервера (JSON)",
  "cors.visibleHeaders": "Заголовки, доступные скрипту браузера (JSON)",
  "cors.visibleBody": "Тело, доступное скрипту браузера",
  "cors.requestAttempted": "Фактический запрос предпринят: {value}",
  "cors.ambient":
    "Автоматические учётные данные в фактическом запросе: {value}",
  "cors.preflightNeverCredentials":
    "Предварительные запросы не содержат значений Cookie и Authorization.",
  "cors.yes": "да",
  "cors.no": "нет",
  "cors.cache": "Итоговый кеш предварительных разрешений",
  "cors.cacheData": "Разрешения предварительного кеша (JSON)",
  "cors.noMatches": "Для этого фильтра нет решений CORS.",
  "cors.passed": "Пройдено",
  "cors.failed": "Не пройдено",
  "cors.column.time": "Время, мс",
  "cors.column.request": "Запрос",
  "cors.column.outcome": "Результат / статус для скрипта",
  "cors.column.preflight": "Предварительная проверка",
  "cors.column.check": "Проверка ожиданий",
  "cors.metric.requests": "Запросы браузера",
  "cors.metric.allowed": "Доступные ответы",
  "cors.metric.blocked": "Заблокированные запросы / ответы",
  "cors.metric.opaque": "Непрозрачные ответы",
  "cors.metric.invalid": "Неподдерживаемый ввод",
  "cors.metric.preflights": "Предварительные запросы",
  "cors.metric.cacheHits": "Проверки, заменённые кешем",
  "cors.metric.actualRequests": "Попытки фактических запросов",
  "cors.metric.totalWaitMs": "Моделируемое ожидание сети, мс",
  "cors.metric.evictions": "Вытеснения разрешений кеша",
  "cors.outcome.allowed": "Доступный ответ",
  "cors.outcome.blocked": "Блокировка CORS",
  "cors.outcome.opaque": "Непрозрачный ответ",
  "cors.outcome.invalid": "Неподдерживаемый ввод / редирект",
  "cors.preflight.sent": "Отправлен OPTIONS",
  "cors.preflight.cached": "Разрешение из кеша",
  "cors.preflight.not-needed": "Без предварительной проверки",
  "cors.reason.same-origin":
    "Источники страницы и цели совпадают; разрешение CORS не требуется.",
  "cors.reason.same-origin-mode":
    "Режим same-origin блокирует другой источник до отправки запроса.",
  "cors.reason.no-cors-method":
    "Режим no-cors поддерживает только GET, HEAD и POST.",
  "cors.reason.no-cors-header":
    "В no-cors указан заголовок приложения, который браузер удалил бы.",
  "cors.reason.forbidden-header":
    "Заголовок под управлением браузера нельзя задавать как заголовок приложения.",
  "cors.reason.preflight-required":
    "Метод, заголовки или принудительный флаг требуют предварительной проверки.",
  "cors.reason.preflight-cached":
    "Действующие разрешения соответствуют разделу, источнику, точному URL и режиму учётных данных.",
  "cors.reason.simple-request":
    "Метод и значения заголовков входят в безопасный список; предварительная проверка не нужна.",
  "cors.reason.preflight-network":
    "Предварительный ответ моделирует сетевую ошибку.",
  "cors.reason.preflight-status":
    "Для предварительной проверки нужен успешный статус HTTP 2xx.",
  "cors.reason.missing-origin": "Отсутствует Access-Control-Allow-Origin.",
  "cors.reason.origin-mismatch":
    "Access-Control-Allow-Origin не совпадает с сериализованным источником страницы.",
  "cors.reason.wildcard-credentials":
    "Источник * не разрешает запрос с режимом учётных данных include.",
  "cors.reason.credentials-header":
    "Для include нужно точное значение true у Access-Control-Allow-Credentials.",
  "cors.reason.allow-list":
    "Список разрешённых методов или заголовков имеет некорректный синтаксис.",
  "cors.reason.method-denied":
    "Метод вне безопасного списка не разрешён; регистр методов учитывается.",
  "cors.reason.header-denied":
    "Заголовок вне безопасного списка не разрешён предварительным ответом.",
  "cors.reason.authorization-explicit":
    "Authorization требует явного имени в списке; * не разрешает его.",
  "cors.reason.response-network":
    "Фактический ответ моделирует сетевую ошибку.",
  "cors.reason.redirect":
    "Цепочки перенаправлений не моделируются. Задайте конечный ответ или отдельный пример.",
  "cors.reason.response-allowed":
    "Скрипту доступны статус, тело и разрешённые заголовки, включая статусы ошибок HTTP.",
  "cors.reason.opaque":
    "В no-cors ответ другого источника непрозрачен: статус, заголовки и тело скрыты.",
  "cors.reason.vary-origin":
    "Если ответ зависит от источника страницы, добавьте Vary: Origin для HTTP-кешей.",
  "cors.reason.cache-evicted":
    "Ограниченный кеш вытеснил старейшее разрешение; браузер тоже может удалять разрешения досрочно.",
  "cors.loaded":
    "Проект CORS загружен. Запустите моделирование для расчёта результатов.",
  "cors.saved": "Изменения CORS сохранены; прежние результаты удалены.",
  "cors.completed":
    "Моделирование CORS завершено: пройдено {passed}/{total} сочетаний политик и сценариев.",
  "cors.reading": "Чтение проекта CORS…",
  "cors.downloaded": "Загрузка началась.",
  "cors.downloadFailed": "Не удалось начать загрузку.",
  "cors.error.project":
    "Некорректный проект CORS или изменения. Проверьте имена, числа, порядок времени, режимы, ожидания и статусы без тела.",
  "cors.error.json":
    "Некорректный JSON. Сохранённый проект и черновик оставлены без изменений.",
  "cors.error.headers":
    "Некорректные заголовки. Нужны уникальные без учёта регистра имена и строковые байтовые значения без управляющих символов. Unicode выше U+00FF не является байтом заголовка Fetch.",
  "cors.error.origin":
    "Укажите полный источник HTTP(S) без пути, учётных данных, запроса и фрагмента либо буквальный null.",
  "cors.error.url":
    "Укажите абсолютный HTTP(S) URL без учётных данных, фрагмента и внешних пробелов.",
  "cors.error.limit":
    "Проект CORS превышает указанные ограничения размера или количества.",
  "cors.error.export":
    "Устраните замечания по учётным данным и * перед экспортом middleware; задайте точные источники, методы и имена заголовков.",
};
export const corsTranslations = { en, ru };
