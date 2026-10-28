const en = {
  "cache.title": "HTTP cache studio",
  "cache.help":
    "Model HTTP caching with a fixed virtual clock and supplied origin responses. Compare private and shared policies, inspect decisions, and test freshness or bandwidth budgets. Everything stays in this tab; replay never sends requests.",
  "cache.scope":
    "This is a sequential cache model, not the browser cache. GET representations are cached; HEAD, ranges and client preconditions pass through. Stale-while-revalidate, partial bodies and request collapsing are outside this model. Qualified private/no-cache directives are handled conservatively.",
  "cache.privacy":
    "Projects, HAR files and response downloads include URLs, headers and bodies and can contain credentials. Reports omit these values and override text; names and IDs remain. Review artifacts before sharing.",
  "cache.limits":
    "Up to 5 policies, 10 scenarios, 100 requests per scenario, 100 cache entries, 128 KiB per body and 2 MiB per project. Requests execute sequentially at or after their scheduled times. Each policy/scenario starts with an empty cache.",
  "cache.demo": "Load HTTP cache lifecycle demo",
  "cache.new": "New HTTP cache project",
  "cache.import": "Import HTTP cache project",
  "cache.har": "Import HAR as cache project",
  "cache.export": "Export HTTP cache project",
  "cache.save": "Save cache edits",
  "cache.discard": "Discard cache edits",
  "cache.pending":
    "Save or discard your edits before switching selections, running, importing or exporting.",
  "cache.projectName": "Cache project name",
  "cache.startTime": "Virtual start time (UTC ISO timestamp)",
  "cache.policy": "Cache policy",
  "cache.policyName": "Cache policy name",
  "cache.addPolicy": "Add cache policy",
  "cache.deletePolicy": "Delete cache policy",
  "cache.mode": "Cache type",
  "cache.mode.private": "Private cache (one user)",
  "cache.mode.shared": "Shared cache (proxy / CDN)",
  "cache.capacity": "Cache entry capacity (1–100)",
  "cache.maxBodyBytes": "Maximum cached body bytes (1–131072)",
  "cache.heuristic": "Use Last-Modified heuristic (10%, capped at one day)",
  "cache.staleIfError": "Allow stale-if-error when directives permit it",
  "cache.override": "Override origin Cache-Control for this policy comparison",
  "cache.overrideValue":
    "Replacement response Cache-Control (empty removes directives)",
  "cache.overrideHelp":
    "An override replaces Cache-Control on every supplied origin response, including 304 responses. It changes only this offline experiment. Other headers and request constraints still apply.",
  "cache.scenario": "Cache scenario",
  "cache.scenarioName": "Cache scenario name",
  "cache.addScenario": "Add cache scenario",
  "cache.deleteScenario": "Delete cache scenario",
  "cache.budget.minHitPercent": "Minimum cache hit percentage",
  "cache.budget.maxOriginRequests": "Maximum origin requests",
  "cache.budget.maxOriginBodyBytes": "Maximum origin body bytes",
  "cache.budget.maxErrors": "Maximum errors / HTTP 5xx responses",
  "cache.step": "Cache request",
  "cache.addStep": "Add cache request",
  "cache.deleteStep": "Delete cache request",
  "cache.stepName": "Cache request name",
  "cache.atMs": "Scheduled offset, ms (0–604800000)",
  "cache.method": "Cache request method",
  "cache.url": "Cache request URL",
  "cache.requestHeaders": "Cache request headers (JSON object)",
  "cache.originKind": "Origin fixture type",
  "cache.origin.response": "HTTP response",
  "cache.origin.network-error": "Network error",
  "cache.origin.none": "No fixture (must be served from cache)",
  "cache.status": "Origin HTTP status (200–599)",
  "cache.delayMs": "Origin response delay, ms (0–60000)",
  "cache.responseHeaders": "Origin response headers (JSON object)",
  "cache.body": "Origin response body (decoded text)",
  "cache.expectOutcome": "Expected cache decision",
  "cache.expectStatus":
    "Expected effective status (empty = unchecked, 0 = no response)",
  "cache.any": "No expectation",
  "cache.fixtureHelp":
    "Origin fixtures are used only when replay contacts the modeled origin. A fresh hit ignores its fixture. 304 requires a stored representation and a generated validator. Times must be in ascending order; 204, 205 and 304 bodies must be empty.",
  "cache.run": "Compare policies for selected scenario",
  "cache.runAll": "Run all cache scenarios and policies",
  "cache.report": "Download cache decision report",
  "cache.responseExport": "Download effective cache response",
  "cache.comparison": "Cache policy comparison",
  "cache.result": "Cache replay result",
  "cache.timeline": "Cache request timeline",
  "cache.search": "Search cache decisions",
  "cache.filter": "Cache decision filter",
  "cache.all": "All decisions",
  "cache.inspect": "Inspect cache decision",
  "cache.inspector": "Effective response and conditional request",
  "cache.inspectedHeaders": "Effective and conditional headers (JSON)",
  "cache.inspectedBody": "Effective cached / origin body",
  "cache.entries": "Stored cache entries",
  "cache.entry": "Stored cache entry",
  "cache.entryData": "Stored representation and freshness (JSON)",
  "cache.noEntries": "The modeled cache is empty.",
  "cache.noMatches": "No decisions match the current filter.",
  "cache.passed": "Passed",
  "cache.failed": "Failed",
  "cache.column.time": "Time, ms",
  "cache.column.request": "Request",
  "cache.column.decision": "Decision / status",
  "cache.column.freshness": "Age / lifetime, seconds",
  "cache.column.check": "Check",
  "cache.metric.requests": "Requests",
  "cache.metric.hits": "Cache hits",
  "cache.metric.hitPercent": "Hit percentage",
  "cache.metric.originRequests": "Origin requests",
  "cache.metric.revalidations": "304 revalidations",
  "cache.metric.originBodyBytes": "Origin body bytes",
  "cache.metric.cacheBodyBytes": "Body bytes from cache",
  "cache.metric.totalWaitMs": "Total origin wait, ms",
  "cache.metric.errors": "Errors / HTTP 5xx",
  "cache.metric.evictions": "LRU evictions",
  "cache.metric.invalidations": "Invalidated entries",
  "cache.outcome.miss": "Origin response (cache miss)",
  "cache.outcome.fresh": "Fresh cache hit",
  "cache.outcome.stale": "Stale cache hit (max-stale)",
  "cache.outcome.revalidated": "Revalidated with 304",
  "cache.outcome.stale-error": "Stale fallback after origin error",
  "cache.outcome.bypass": "Cache bypass",
  "cache.outcome.only-if-cached": "Cache-only miss (504)",
  "cache.outcome.error": "Replay error",
  "cache.reason.not-found": "No stored representation for this URL.",
  "cache.reason.vary-miss":
    "Stored variants or authorization permissions do not match this request.",
  "cache.reason.fresh":
    "The stored response satisfies freshness and request constraints.",
  "cache.reason.request-revalidate":
    "Request directives require a newer or validated response.",
  "cache.reason.response-revalidate":
    "Response no-cache requires validation before reuse.",
  "cache.reason.expired": "The stored response is stale.",
  "cache.reason.max-stale": "The request permits this amount of staleness.",
  "cache.reason.stale-if-error":
    "The origin failed within the permitted stale-if-error window.",
  "cache.reason.method":
    "This request method bypasses GET representation caching.",
  "cache.reason.range-or-conditional":
    "Ranges and client preconditions pass through unchanged.",
  "cache.reason.request-no-store":
    "Request no-store bypasses lookup and storage in this model.",
  "cache.reason.response-no-store": "Response no-store prevents storage.",
  "cache.reason.private": "A shared cache cannot store this private response.",
  "cache.reason.authorization":
    "The response does not permit shared caching of an authorized request.",
  "cache.reason.status": "This response status is not supported for storage.",
  "cache.reason.vary":
    "Vary is invalid or contains *, so this response is not stored.",
  "cache.reason.invalid-control":
    "Ambiguous or malformed Cache-Control prevents storage.",
  "cache.reason.body-limit":
    "The response exceeds this policy's cached-body limit.",
  "cache.reason.stored":
    "The representation was stored with its Vary request values.",
  "cache.reason.not-cacheable":
    "This status requires explicit cacheability information.",
  "cache.reason.etag": "Added If-None-Match from the stored ETag.",
  "cache.reason.last-modified":
    "Added If-Modified-Since from the stored Last-Modified.",
  "cache.reason.not-modified":
    "304 updated metadata and retained the stored body and status.",
  "cache.reason.invalid-304":
    "304 has no matching stored representation / generated validator.",
  "cache.reason.only-if-cached":
    "No acceptable cached response; only-if-cached returns 504 without an origin request.",
  "cache.reason.missing-origin":
    "Replay needs an origin response but this request has no fixture.",
  "cache.reason.network-error":
    "The origin fixture represents a network failure.",
  "cache.reason.evicted":
    "The least recently used entry was evicted to admit this representation.",
  "cache.reason.invalidated":
    "A successful unsafe request invalidated matching target or same-origin Location entries.",
  "cache.reason.revalidation-required":
    "Response directives prohibit serving this representation stale.",
  "cache.saved": "Cache edits saved; previous replay results cleared.",
  "cache.loaded":
    "Cache project loaded. Run replay to calculate fresh results.",
  "cache.harLoaded":
    "HAR imported: {count} requests, {skipped} unsupported methods skipped, {missing} bodies absent. Missing bodies are modeled as empty text. Overlapping requests are replayed sequentially.",
  "cache.completed":
    "Cache replay finished: {passed}/{total} policy/scenario combinations passed.",
  "cache.downloaded": "Download started.",
  "cache.downloadFailed": "Could not start the download.",
  "cache.reading": "Reading cache project…",
  "cache.error.json":
    "Invalid JSON. Your saved project and draft were retained.",
  "cache.error.project":
    "Invalid cache project or edits. Check names, numbers, timestamps, ordered times, expectations and empty-body status codes.",
  "cache.error.headers":
    "Invalid headers: use a JSON object of unique, case-insensitive header names and string values without line breaks.",
  "cache.error.url":
    "Use an absolute HTTP(S) URL without credentials or a fragment.",
  "cache.error.limit":
    "The cache project, HAR file or response exceeds the displayed size/count limits.",
  "cache.error.har":
    "Invalid or unsupported HAR capture. Import HAR 1.2 with valid times, headers and text or base64 UTF-8 response bodies.",
} as const;
const ru: Record<keyof typeof en, string> = {
  "cache.title": "Студия HTTP-кеша",
  "cache.help":
    "Моделируйте HTTP-кеширование с виртуальными часами и заданными ответами сервера. Сравнивайте личные и общие кеши, изучайте решения и проверяйте бюджеты. Всё остаётся в этой вкладке; воспроизведение не отправляет запросы.",
  "cache.scope":
    "Это последовательная модель, а не кеш браузера. Кешируются представления GET; HEAD, диапазоны и клиентские предусловия проходят напрямую. Фоновая ревалидация, частичные тела и объединение запросов не моделируются. Директивы private/no-cache со списками полей обрабатываются консервативно.",
  "cache.privacy":
    "Проекты, HAR и загружаемые ответы содержат URL, заголовки и тела, включая возможные секреты. Отчёты исключают эти значения и текст переопределений; имена и ID сохраняются. Проверяйте файлы перед передачей.",
  "cache.limits":
    "До 5 политик, 10 сценариев, 100 запросов на сценарий, 100 записей кеша, 128 КиБ на тело и 2 МиБ на проект. Запросы выполняются последовательно не раньше указанного времени. Каждая пара политики и сценария начинает с пустого кеша.",
  "cache.demo": "Загрузить примеры жизненного цикла HTTP-кеша",
  "cache.new": "Новый проект HTTP-кеша",
  "cache.import": "Импорт проекта HTTP-кеша",
  "cache.har": "Импорт HAR в проект кеша",
  "cache.export": "Экспорт проекта HTTP-кеша",
  "cache.save": "Сохранить изменения кеша",
  "cache.discard": "Отменить изменения кеша",
  "cache.pending":
    "Сохраните или отмените изменения перед переключением, запуском, импортом или экспортом.",
  "cache.projectName": "Название проекта кеша",
  "cache.startTime": "Начальное виртуальное время (UTC ISO)",
  "cache.policy": "Политика кеша",
  "cache.policyName": "Название политики кеша",
  "cache.addPolicy": "Добавить политику кеша",
  "cache.deletePolicy": "Удалить политику кеша",
  "cache.mode": "Тип кеша",
  "cache.mode.private": "Личный кеш (один пользователь)",
  "cache.mode.shared": "Общий кеш (прокси / CDN)",
  "cache.capacity": "Ёмкость кеша (1–100 записей)",
  "cache.maxBodyBytes": "Максимум байт кешируемого тела (1–131072)",
  "cache.heuristic": "Эвристика Last-Modified (10%, не более суток)",
  "cache.staleIfError": "Разрешить stale-if-error при допустимых директивах",
  "cache.override": "Переопределить Cache-Control сервера для сравнения",
  "cache.overrideValue":
    "Новый Cache-Control ответа (пустое поле удаляет директивы)",
  "cache.overrideHelp":
    "Заменяет Cache-Control во всех заданных ответах, включая 304, только в этом автономном эксперименте. Остальные заголовки и ограничения запроса сохраняются.",
  "cache.scenario": "Сценарий кеша",
  "cache.scenarioName": "Название сценария кеша",
  "cache.addScenario": "Добавить сценарий кеша",
  "cache.deleteScenario": "Удалить сценарий кеша",
  "cache.budget.minHitPercent": "Минимальный процент попаданий в кеш",
  "cache.budget.maxOriginRequests": "Максимум запросов к серверу",
  "cache.budget.maxOriginBodyBytes": "Максимум байт тел от сервера",
  "cache.budget.maxErrors": "Максимум ошибок / ответов HTTP 5xx",
  "cache.step": "Запрос кеша",
  "cache.addStep": "Добавить запрос кеша",
  "cache.deleteStep": "Удалить запрос кеша",
  "cache.stepName": "Название запроса кеша",
  "cache.atMs": "Время запуска, мс (0–604800000)",
  "cache.method": "Метод запроса кеша",
  "cache.url": "URL запроса кеша",
  "cache.requestHeaders": "Заголовки запроса кеша (объект JSON)",
  "cache.originKind": "Тип ответа сервера",
  "cache.origin.response": "HTTP-ответ",
  "cache.origin.network-error": "Сетевая ошибка",
  "cache.origin.none": "Без ответа (обязателен кеш)",
  "cache.status": "HTTP-статус сервера (200–599)",
  "cache.delayMs": "Задержка ответа сервера, мс (0–60000)",
  "cache.responseHeaders": "Заголовки ответа сервера (объект JSON)",
  "cache.body": "Тело ответа сервера (декодированный текст)",
  "cache.expectOutcome": "Ожидаемое решение кеша",
  "cache.expectStatus":
    "Ожидаемый статус (пусто = без проверки, 0 = без ответа)",
  "cache.any": "Без ожидания",
  "cache.fixtureHelp":
    "Ответ сервера используется только при обращении к моделируемому серверу. Свежее попадание игнорирует ответ. Для 304 нужны сохранённое представление и сформированный валидатор. Время задаётся по возрастанию; тела ответов 204, 205 и 304 должны быть пустыми.",
  "cache.run": "Сравнить политики для выбранного сценария",
  "cache.runAll": "Запустить все сценарии и политики кеша",
  "cache.report": "Скачать отчёт о решениях кеша",
  "cache.responseExport": "Скачать итоговый ответ кеша",
  "cache.comparison": "Сравнение политик кеша",
  "cache.result": "Результат воспроизведения кеша",
  "cache.timeline": "Временная шкала запросов кеша",
  "cache.search": "Поиск решений кеша",
  "cache.filter": "Фильтр решений кеша",
  "cache.all": "Все решения",
  "cache.inspect": "Изучить решение кеша",
  "cache.inspector": "Итоговый ответ и условный запрос",
  "cache.inspectedHeaders": "Итоговые и условные заголовки (JSON)",
  "cache.inspectedBody": "Итоговое тело из кеша / сервера",
  "cache.entries": "Сохранённые записи кеша",
  "cache.entry": "Запись кеша",
  "cache.entryData": "Представление и свежесть (JSON)",
  "cache.noEntries": "Моделируемый кеш пуст.",
  "cache.noMatches": "Нет решений для текущего фильтра.",
  "cache.passed": "Пройдено",
  "cache.failed": "Не пройдено",
  "cache.column.time": "Время, мс",
  "cache.column.request": "Запрос",
  "cache.column.decision": "Решение / статус",
  "cache.column.freshness": "Возраст / срок свежести, с",
  "cache.column.check": "Проверка",
  "cache.metric.requests": "Запросы",
  "cache.metric.hits": "Попадания в кеш",
  "cache.metric.hitPercent": "Процент попаданий",
  "cache.metric.originRequests": "Запросы к серверу",
  "cache.metric.revalidations": "Ревалидации 304",
  "cache.metric.originBodyBytes": "Байты тел от сервера",
  "cache.metric.cacheBodyBytes": "Байты тел из кеша",
  "cache.metric.totalWaitMs": "Общее ожидание сервера, мс",
  "cache.metric.errors": "Ошибки / HTTP 5xx",
  "cache.metric.evictions": "Вытеснения LRU",
  "cache.metric.invalidations": "Аннулированные записи",
  "cache.outcome.miss": "Ответ сервера (промах кеша)",
  "cache.outcome.fresh": "Свежее попадание в кеш",
  "cache.outcome.stale": "Устаревшее попадание (max-stale)",
  "cache.outcome.revalidated": "Ревалидация через 304",
  "cache.outcome.stale-error": "Устаревший ответ при ошибке сервера",
  "cache.outcome.bypass": "Обход кеша",
  "cache.outcome.only-if-cached": "Промах только кеша (504)",
  "cache.outcome.error": "Ошибка воспроизведения",
  "cache.reason.not-found": "Для этого URL нет сохранённого представления.",
  "cache.reason.vary-miss":
    "Варианты или разрешения авторизации не соответствуют запросу.",
  "cache.reason.fresh":
    "Сохранённый ответ удовлетворяет свежести и ограничениям запроса.",
  "cache.reason.request-revalidate":
    "Директивы запроса требуют более нового или проверенного ответа.",
  "cache.reason.response-revalidate":
    "Директива no-cache ответа требует проверки перед использованием.",
  "cache.reason.expired": "Сохранённый ответ устарел.",
  "cache.reason.max-stale": "Запрос допускает такую степень устаревания.",
  "cache.reason.stale-if-error":
    "Сервер недоступен в пределах разрешённого окна stale-if-error.",
  "cache.reason.method": "Этот метод обходит кеширование представлений GET.",
  "cache.reason.range-or-conditional":
    "Диапазоны и клиентские предусловия передаются без изменений.",
  "cache.reason.request-no-store":
    "Директива no-store запроса отключает поиск и сохранение в этой модели.",
  "cache.reason.response-no-store":
    "Директива no-store ответа запрещает сохранение.",
  "cache.reason.private": "Общий кеш не может сохранять личный ответ.",
  "cache.reason.authorization":
    "Ответ не разрешает общее кеширование авторизованного запроса.",
  "cache.reason.status": "Сохранение ответа с этим статусом не поддерживается.",
  "cache.reason.vary": "Vary некорректен или содержит *, ответ не сохранён.",
  "cache.reason.invalid-control":
    "Неоднозначный или некорректный Cache-Control запрещает сохранение.",
  "cache.reason.body-limit":
    "Ответ превышает ограничение политики на размер тела.",
  "cache.reason.stored":
    "Представление сохранено со значениями заголовков Vary.",
  "cache.reason.not-cacheable":
    "Для этого статуса нужны явные указания кешируемости.",
  "cache.reason.etag": "Добавлен If-None-Match из сохранённого ETag.",
  "cache.reason.last-modified": "Добавлен If-Modified-Since из Last-Modified.",
  "cache.reason.not-modified":
    "304 обновил метаданные, сохранив тело и статус.",
  "cache.reason.invalid-304":
    "Для 304 нет подходящего представления или сформированного валидатора.",
  "cache.reason.only-if-cached":
    "Подходящего ответа нет; only-if-cached возвращает 504 без обращения к серверу.",
  "cache.reason.missing-origin":
    "Нужен ответ сервера, но для запроса он не задан.",
  "cache.reason.network-error": "Ответ сервера моделирует сетевую ошибку.",
  "cache.reason.evicted":
    "Наименее недавно использованная запись вытеснена для нового представления.",
  "cache.reason.invalidated":
    "Успешный небезопасный метод аннулировал записи URL запроса или Location того же источника.",
  "cache.reason.revalidation-required":
    "Директивы ответа запрещают выдачу устаревшего представления.",
  "cache.saved": "Изменения кеша сохранены; прежние результаты удалены.",
  "cache.loaded":
    "Проект кеша загружен. Запустите воспроизведение для расчёта результатов.",
  "cache.harLoaded":
    "HAR импортирован: запросов {count}, пропущено методов {skipped}, отсутствует тел {missing}. Отсутствующие тела считаются пустыми. Перекрывающиеся запросы выполняются последовательно.",
  "cache.completed":
    "Воспроизведение завершено: пройдено {passed}/{total} сочетаний политик и сценариев.",
  "cache.downloaded": "Загрузка началась.",
  "cache.downloadFailed": "Не удалось начать загрузку.",
  "cache.reading": "Чтение проекта кеша…",
  "cache.error.json":
    "Некорректный JSON. Сохранённый проект и черновик оставлены без изменений.",
  "cache.error.project":
    "Некорректный проект или изменения. Проверьте имена, числа, время, порядок запросов, ожидания и статусы без тела.",
  "cache.error.headers":
    "Некорректные заголовки: нужен объект JSON с уникальными без учёта регистра именами и строковыми значениями без переносов.",
  "cache.error.url":
    "Укажите абсолютный HTTP(S) URL без учётных данных и фрагмента.",
  "cache.error.limit":
    "Проект, HAR или ответ превышает указанные ограничения размера или количества.",
  "cache.error.har":
    "Некорректный или неподдерживаемый HAR. Нужен HAR 1.2 с корректным временем, заголовками и текстовыми либо base64 UTF-8 телами ответов.",
};
export const cacheTranslations = { en, ru };
