export const collectionTranslations = {
  en: {
    "collection.title": "API collection studio",
    "collection.help":
      "Collect paginated JSON APIs with reusable GET plans. Rehearse with exact-URL fixtures or explicitly run live browser requests. Work stays in memory, including session headers. The OpenAPI editor is independent.",
    "collection.privacy":
      "Projects, captured fixtures, URLs, and datasets may contain sensitive data. Reports omit URLs, headers, record values, and assertion literals; plan names and IDs remain. Review exports before sharing.",
    "collection.liveHelp":
      "Live GET uses explicit session headers, no ambient cookies, and no redirects. Continuations must stay on the initial origin. Browser CORS must allow the API and expose Link for link pagination. Requests run sequentially without retries.",
    "collection.limits":
      "Limits: 10 plans, 40 fixtures, 100 pages, 5,000 received records, 512 KiB per page, 2 MiB per collection/project, and 120 seconds. Pages commit atomically. An interrupted run retains completed pages and fails the completion check.",
    "collection.demo": "Load five-pattern pagination demo",
    "collection.new": "New collection project",
    "collection.import": "Import collection project",
    "collection.export": "Export collection project",
    "collection.projectName": "Collection project name",
    "collection.plan": "Collection plan",
    "collection.addPlan": "Add collection plan",
    "collection.deletePlan": "Delete collection plan",
    "collection.save": "Save collection plan",
    "collection.discard": "Discard pending collection edits",
    "collection.pending":
      "Save or discard pending edits before switching plans, importing, exporting, or running.",
    "collection.name": "Plan name",
    "collection.url": "Initial collection URL",
    "collection.strategy": "Pagination strategy",
    "collection.strategy.link": "HTTP Link: rel=next",
    "collection.strategy.next-url": "JSON next URL",
    "collection.strategy.cursor": "JSON cursor token",
    "collection.strategy.page": "Page number",
    "collection.strategy.offset": "Offset",
    "collection.itemsPointer": "Items JSON Pointer (empty = root array)",
    "collection.nextPointer": "Next URL / cursor JSON Pointer",
    "collection.parameter": "Page / offset / cursor query parameter",
    "collection.sizeParameter": "Page-size query parameter (optional)",
    "collection.start": "Initial page / offset (0–1,000,000,000)",
    "collection.pageSize": "Page size (1–1000)",
    "collection.stopOnShortPage":
      "Finish indexed pagination on a short page (otherwise wait for an empty page)",
    "collection.navigationHelp":
      "Next URL, cursor, and Link strategies finish when continuation is absent, null, or empty. Empty intermediate pages are allowed. Page/offset strategies finish on an empty page, or a short page when enabled. Identity pointers are relative to each item; duplicate policy None keeps all items.",
    "collection.identityPointer": "Item identity JSON Pointer",
    "collection.deduplicate": "Duplicate policy",
    "collection.deduplicate.none": "None: retain every record",
    "collection.deduplicate.first": "Keep first occurrence",
    "collection.deduplicate.last": "Keep last value in original position",
    "collection.deduplicate.error": "Fail on a duplicate",
    "collection.maxPages": "Maximum pages (1–100)",
    "collection.maxRecords": "Maximum received records (1–5000)",
    "collection.maxBytes": "Maximum response bytes (1–2097152)",
    "collection.requestTimeoutMs": "Per-page timeout, ms (100–30000)",
    "collection.durationMs": "Overall timeout, ms (100–120000)",
    "collection.intervalMs": "Delay between pages, ms (0–5000)",
    "collection.minRecords": "Minimum collected records (0–5000)",
    "collection.expectedMaxRecords":
      "Maximum expected collected records (0–5000)",
    "collection.maxDuplicates": "Allowed duplicates (0–5000)",
    "collection.assertions": "Per-record body assertions (JSON array)",
    "collection.assertionsHelp":
      'Use {"name":"ID exists","target":"body","path":"/id","operator":"exists","expected":""}. Supports exists, absent, equals, contains, type, length, gte, lte. Up to 20 rules; each applies to every collected record, and an empty dataset fails a record rule.',
    "collection.fixtures": "Offline page fixtures",
    "collection.fixture": "Selected page fixture",
    "collection.noFixtures":
      "No offline fixtures yet. Add a response fixture or record completed live pages.",
    "collection.addFixture": "Add page fixture",
    "collection.deleteFixture": "Delete page fixture",
    "collection.saveFixture": "Save page fixture",
    "collection.fixtureName": "Fixture name",
    "collection.fixtureUrl": "Fixture request URL",
    "collection.fixtureStatus": "Fixture HTTP status (100–599)",
    "collection.fixtureLink": "Fixture Link response header",
    "collection.fixtureMime": "Fixture Content-Type",
    "collection.fixtureBody": "Fixture response body",
    "collection.fixtureHelp":
      "Fixtures match normalized request URLs, including query parameters. JSON bodies and failure responses can be edited. Only Content-Type and Link response headers are retained. Missing fixtures never trigger network traffic.",
    "collection.headers": "Session-only live headers (JSON object)",
    "collection.offline": "Collect selected plan offline",
    "collection.suite": "Run all offline collection plans",
    "collection.live": "Collect selected plan live",
    "collection.cancel": "Cancel collection",
    "collection.running":
      "Collecting {plan}: {pages} pages, {records} records.",
    "collection.progress":
      "Finished {count}/{total} plans: {passed} passed, {failed} failed.",
    "collection.results": "Collection results",
    "collection.resultPlan": "Inspect collection result",
    "collection.passed": "Passed",
    "collection.failed": "Failed",
    "collection.summary":
      "{mode} · {pages} pages · {received} received · {records} collected · {duplicates} duplicates · {bytes} bytes · {ms} ms",
    "collection.mode.offline": "Offline",
    "collection.mode.live": "Live",
    "collection.stop": "Stopped: {reason}",
    "collection.reason.complete": "Pagination completed",
    "collection.journal": "Page journal",
    "collection.page": "Page",
    "collection.pageUrl": "Request URL",
    "collection.pageStatus": "HTTP status",
    "collection.pageItems": "Received / added / duplicates",
    "collection.pageOutcome": "Page outcome",
    "collection.accepted": "Accepted",
    "collection.rejected": "Rejected",
    "collection.checks": "Acceptance checks",
    "collection.check.complete": "Traversal completed",
    "collection.check.count": "Collected count within expected range",
    "collection.check.duplicates": "Duplicate count within budget",
    "collection.check.record":
      "Record assertion #{index}: {checked} checked, {failed} failed",
    "collection.record": "Collected record",
    "collection.search": "Search collected records",
    "collection.recordCount":
      "{shown}/{total} records match. The list shows up to 100; exports include the full collection.",
    "collection.recordData":
      "Selected collected record (first 16000 characters)",
    "collection.noRecords": "No matching collected records.",
    "collection.json": "Download collected JSON",
    "collection.ndjson": "Download collected NDJSON",
    "collection.csv": "Download collected CSV",
    "collection.copy": "Copy collected JSON",
    "collection.report": "Download collection report",
    "collection.capture": "Record pages as offline fixtures",
    "collection.captured": "Recorded response pages as offline fixtures.",
    "collection.saved": "Collection changes saved.",
    "collection.imported": "Collection project imported.",
    "collection.downloaded": "Collection download started.",
    "collection.copied": "Collected JSON copied.",
    "collection.downloadError": "Could not start the collection download.",
    "collection.copyError": "Could not copy the collected JSON.",
    "collection.error.project":
      "Invalid collection project, duplicate IDs/URLs, or too many entries.",
    "collection.error.plan":
      "Check the plan fields, numeric limits, expected count range, and body assertions.",
    "collection.error.fixture":
      "Invalid or missing fixture, duplicate request URL, or fixture count limit exceeded.",
    "collection.error.pointer":
      "Use a valid JSON Pointer, such as /items or /pagination/next. Escape ~ as ~0 and / as ~1.",
    "collection.error.headers":
      "Use a JSON object of distinct header names and string values. Cookie and browser-owned headers are unavailable.",
    "collection.error.url": "Use an HTTP(S) URL without embedded credentials.",
    "collection.error.origin":
      "A continuation changed origin or the response was redirected.",
    "collection.error.loop":
      "A repeated request URL was detected; traversal stopped.",
    "collection.error.status":
      "The page did not return a successful 2xx status.",
    "collection.error.content-type":
      "The page must return application/json or an application/*+json media type.",
    "collection.error.json":
      "Invalid, oversized, deeply nested, unsafe-number, or malformed UTF-8 JSON data.",
    "collection.error.items":
      "The items JSON Pointer must resolve to an array.",
    "collection.error.cursor":
      "The next URL must be a string; a cursor must be a string or number.",
    "collection.error.identity":
      "An item identity is missing or is not a JSON scalar.",
    "collection.error.duplicate":
      "A duplicate item identity was found under the fail-on-duplicate policy.",
    "collection.error.max-pages":
      "The page limit was reached before pagination completed.",
    "collection.error.max-records":
      "The received-record limit was reached. An overflowing page was not added.",
    "collection.error.max-bytes":
      "The response, page, project, or export size limit was exceeded.",
    "collection.error.timeout":
      "The page or overall collection deadline was reached.",
    "collection.error.cancelled":
      "Collection cancelled. Completed pages remain available.",
    "collection.error.network":
      "The request failed. Check connectivity and browser CORS access.",
    "collection.error.link":
      "The Link header is malformed or contains multiple next targets.",
  },
  ru: {
    "collection.title": "Студия сбора API",
    "collection.help":
      "Собирайте JSON API с пагинацией по повторно используемым GET-планам. Проверяйте их на фикстурах с точными URL или явно запускайте запросы в браузере. Данные и заголовки сеанса остаются в памяти. Редактор OpenAPI работает независимо.",
    "collection.privacy":
      "Проекты, фикстуры, URL и наборы данных могут содержать конфиденциальные сведения. Отчёты исключают URL, заголовки, значения записей и ожидаемые значения проверок; имена и ID планов сохраняются. Проверяйте файлы перед передачей.",
    "collection.liveHelp":
      "GET-запросы используют явные заголовки сеанса, без фоновых cookie и перенаправлений. Продолжения должны оставаться на исходном origin. CORS должен разрешать доступ к API и заголовку Link. Запросы выполняются последовательно, без повторов.",
    "collection.limits":
      "Ограничения: 10 планов, 40 фикстур, 100 страниц, 5000 полученных записей, 512 КиБ на страницу, 2 МиБ на сбор/проект и 120 секунд. Страницы добавляются целиком. При прерывании готовые страницы сохраняются, но проверка завершения не проходит.",
    "collection.demo": "Загрузить пример пяти видов пагинации",
    "collection.new": "Новый проект сбора",
    "collection.import": "Импортировать проект сбора",
    "collection.export": "Экспортировать проект сбора",
    "collection.projectName": "Название проекта сбора",
    "collection.plan": "План сбора",
    "collection.addPlan": "Добавить план сбора",
    "collection.deletePlan": "Удалить план сбора",
    "collection.save": "Сохранить план сбора",
    "collection.discard": "Отменить несохранённые изменения сбора",
    "collection.pending":
      "Сохраните или отмените изменения перед переключением планов, импортом, экспортом или запуском.",
    "collection.name": "Название плана",
    "collection.url": "Начальный URL сбора",
    "collection.strategy": "Стратегия пагинации",
    "collection.strategy.link": "HTTP Link: rel=next",
    "collection.strategy.next-url": "Следующий URL в JSON",
    "collection.strategy.cursor": "Токен курсора в JSON",
    "collection.strategy.page": "Номер страницы",
    "collection.strategy.offset": "Смещение",
    "collection.itemsPointer": "JSON Pointer массива (пусто = корневой массив)",
    "collection.nextPointer": "JSON Pointer следующего URL / курсора",
    "collection.parameter": "Параметр запроса страницы / смещения / курсора",
    "collection.sizeParameter": "Параметр размера страницы (необязательно)",
    "collection.start": "Начальная страница / смещение (0–1 000 000 000)",
    "collection.pageSize": "Размер страницы (1–1000)",
    "collection.stopOnShortPage":
      "Завершать индексную пагинацию на неполной странице (иначе ждать пустую)",
    "collection.navigationHelp":
      "Стратегии URL, курсора и Link завершаются при отсутствии, null или пустом продолжении. Пустые промежуточные страницы допустимы. Страница/смещение завершаются на пустой или, при включённой настройке, неполной странице. Указатели ID относительны записи; политика «Без удаления» сохраняет всё.",
    "collection.identityPointer": "JSON Pointer идентификатора записи",
    "collection.deduplicate": "Политика дубликатов",
    "collection.deduplicate.none": "Без удаления: сохранить все записи",
    "collection.deduplicate.first": "Сохранить первое вхождение",
    "collection.deduplicate.last":
      "Сохранить последнее значение на исходной позиции",
    "collection.deduplicate.error": "Ошибка при дубликате",
    "collection.maxPages": "Максимум страниц (1–100)",
    "collection.maxRecords": "Максимум полученных записей (1–5000)",
    "collection.maxBytes": "Максимум байтов ответов (1–2097152)",
    "collection.requestTimeoutMs": "Тайм-аут страницы, мс (100–30000)",
    "collection.durationMs": "Общий тайм-аут, мс (100–120000)",
    "collection.intervalMs": "Пауза между страницами, мс (0–5000)",
    "collection.minRecords": "Минимум собранных записей (0–5000)",
    "collection.expectedMaxRecords": "Максимум ожидаемых записей (0–5000)",
    "collection.maxDuplicates": "Допустимо дубликатов (0–5000)",
    "collection.assertions": "Проверки каждой записи (JSON-массив)",
    "collection.assertionsHelp":
      'Пример: {"name":"ID exists","target":"body","path":"/id","operator":"exists","expected":""}. Операторы: exists, absent, equals, contains, type, length, gte, lte. До 20 правил для каждой записи; пустой набор не проходит проверку записей.',
    "collection.fixtures": "Локальные фикстуры страниц",
    "collection.fixture": "Выбранная фикстура страницы",
    "collection.noFixtures":
      "Фикстур пока нет. Добавьте ответ или запишите готовые страницы реального запроса.",
    "collection.addFixture": "Добавить фикстуру страницы",
    "collection.deleteFixture": "Удалить фикстуру страницы",
    "collection.saveFixture": "Сохранить фикстуру страницы",
    "collection.fixtureName": "Название фикстуры",
    "collection.fixtureUrl": "URL запроса фикстуры",
    "collection.fixtureStatus": "HTTP-статус фикстуры (100–599)",
    "collection.fixtureLink": "Заголовок Link фикстуры",
    "collection.fixtureMime": "Content-Type фикстуры",
    "collection.fixtureBody": "Тело ответа фикстуры",
    "collection.fixtureHelp":
      "Фикстуры соответствуют нормализованным URL с параметрами запроса. Можно изменять JSON и ответы с ошибками. Сохраняются только Content-Type и Link. Отсутствие фикстуры не вызывает сетевой запрос.",
    "collection.headers": "Заголовки реальных запросов, только в сеансе (JSON)",
    "collection.offline": "Собрать выбранный план локально",
    "collection.suite": "Запустить все планы сбора локально",
    "collection.live": "Собрать выбранный план по сети",
    "collection.cancel": "Отменить сбор",
    "collection.running": "Сбор {plan}: {pages} страниц, {records} записей.",
    "collection.progress":
      "Выполнено планов: {count}/{total}; успешно: {passed}, с ошибками: {failed}.",
    "collection.results": "Результаты сбора",
    "collection.resultPlan": "Просмотр результата сбора",
    "collection.passed": "Успешно",
    "collection.failed": "Ошибка",
    "collection.summary":
      "{mode} · страниц: {pages} · получено: {received} · собрано: {records} · дубликатов: {duplicates} · байтов: {bytes} · {ms} мс",
    "collection.mode.offline": "Локально",
    "collection.mode.live": "По сети",
    "collection.stop": "Остановка: {reason}",
    "collection.reason.complete": "Пагинация завершена",
    "collection.journal": "Журнал страниц",
    "collection.page": "Страница",
    "collection.pageUrl": "URL запроса",
    "collection.pageStatus": "HTTP-статус",
    "collection.pageItems": "Получено / добавлено / дубликатов",
    "collection.pageOutcome": "Результат страницы",
    "collection.accepted": "Принята",
    "collection.rejected": "Отклонена",
    "collection.checks": "Проверки приёмки",
    "collection.check.complete": "Обход завершён",
    "collection.check.count": "Количество записей в ожидаемом диапазоне",
    "collection.check.duplicates": "Количество дубликатов в пределах бюджета",
    "collection.check.record":
      "Проверка записи №{index}: проверено {checked}, ошибок {failed}",
    "collection.record": "Собранная запись",
    "collection.search": "Поиск собранных записей",
    "collection.recordCount":
      "Совпадений: {shown}/{total}. Список показывает до 100; экспорт включает все записи.",
    "collection.recordData": "Выбранная запись (первые 16000 символов)",
    "collection.noRecords": "Подходящих собранных записей нет.",
    "collection.json": "Скачать собранный JSON",
    "collection.ndjson": "Скачать собранный NDJSON",
    "collection.csv": "Скачать собранный CSV",
    "collection.copy": "Копировать собранный JSON",
    "collection.report": "Скачать отчёт сбора",
    "collection.capture": "Записать страницы как локальные фикстуры",
    "collection.captured": "Страницы ответов записаны как локальные фикстуры.",
    "collection.saved": "Изменения сбора сохранены.",
    "collection.imported": "Проект сбора импортирован.",
    "collection.downloaded": "Скачивание сбора началось.",
    "collection.copied": "Собранный JSON скопирован.",
    "collection.downloadError": "Не удалось начать скачивание сбора.",
    "collection.copyError": "Не удалось скопировать собранный JSON.",
    "collection.error.project":
      "Некорректный проект, повторяющиеся ID/URL или слишком много элементов.",
    "collection.error.plan":
      "Проверьте поля плана, ограничения, диапазон количества и проверки записей.",
    "collection.error.fixture":
      "Фикстура некорректна, отсутствует, повторяет URL или превышен лимит фикстур.",
    "collection.error.pointer":
      "Используйте JSON Pointer, например /items или /pagination/next. Экранируйте ~ как ~0, / как ~1.",
    "collection.error.headers":
      "Нужен JSON-объект уникальных заголовков со строковыми значениями. Cookie и управляемые браузером заголовки недоступны.",
    "collection.error.url":
      "Укажите HTTP(S) URL без встроенных учётных данных.",
    "collection.error.origin":
      "Продолжение изменило origin или ответ был перенаправлен.",
    "collection.error.loop":
      "Обнаружен повторяющийся URL запроса; обход остановлен.",
    "collection.error.status":
      "Страница вернула статус вне успешного диапазона 2xx.",
    "collection.error.content-type":
      "Страница должна возвращать application/json или application/*+json.",
    "collection.error.json":
      "Некорректный, слишком большой, глубоко вложенный JSON, небезопасное число или неверный UTF-8.",
    "collection.error.items": "Указатель элементов должен вести к массиву.",
    "collection.error.cursor":
      "Следующий URL должен быть строкой, курсор — строкой или числом.",
    "collection.error.identity":
      "Идентификатор записи отсутствует или не является скаляром JSON.",
    "collection.error.duplicate":
      "Найден повторный идентификатор при политике ошибки на дубликатах.",
    "collection.error.max-pages":
      "Лимит страниц достигнут до завершения пагинации.",
    "collection.error.max-records":
      "Достигнут лимит полученных записей. Переполняющая страница не добавлена.",
    "collection.error.max-bytes":
      "Превышен размер ответа, страницы, проекта или экспорта.",
    "collection.error.timeout": "Истёк тайм-аут страницы или всего сбора.",
    "collection.error.cancelled": "Сбор отменён. Готовые страницы доступны.",
    "collection.error.network":
      "Ошибка запроса. Проверьте подключение и CORS в браузере.",
    "collection.error.link":
      "Заголовок Link некорректен или содержит несколько следующих адресов.",
  },
} as const;
