const en = {
  "transfer.title": "Resumable download and byte-range studio",
  "transfer.help":
    "Inspect exact binary HTTP ranges, rehearse interrupted downloads and resource revisions, validate multipart responses and export a server/client toolkit. All work in this studio is offline and remains in this tab.",
  "transfer.guide": "Protocol rules, integrity, limits and exported data",
  "transfer.protocol":
    "GET supports closed, open-ended and suffix byte ranges. Unsatisfiable members are skipped; an entirely unsatisfiable valid set returns 416. Invalid/unknown units or excessive ranges are ignored with a full 200. Empty resources ignore Range. Overlapping/adjacent intervals are merged, retaining the earliest request position. HEAD ignores Range and returns full metadata without a body.",
  "transfer.validators":
    "If-Range requires the exact strong ETag. Weak tags, invalid values and mismatches return a full representation. HTTP dates require exact IMF-fixdate equality and the explicit strong-date assertion; enable it only when the timestamp is a reliable strong validator. ETags are SHA-256 of the exact identity-coded bytes. Other HTTP preconditions, routing and authentication belong before the exported range responder.",
  "transfer.integrity":
    "The client requests only missing intervals with If-Range, validates status, lengths, Content-Range and ETag, and rejects encoded or malformed chunks atomically. A new full representation resets old fragments. Final SHA-256 detects corruption that range metadata cannot detect. Only complete verified output is downloadable. A digest from the same origin detects inconsistent bytes; it does not authenticate that origin.",
  "transfer.profile":
    "The packet inspector accepts a bounded identity-coded profile: 200, 206, 416 and 200 HEAD. Multipart uses canonical CRLF framing, one Content-Type and Content-Range per part, ASCII boundaries up to 70 characters, no preamble/epilogue or extra part headers. It preserves arbitrary binary bytes and verifies lengths/totals. It is not a general MIME parser.",
  "transfer.limits":
    "Limits: 3 resources/4 MiB of decoded bytes combined, 12 scenarios, 200 attempts, 100 scheduled faults, 1 MiB chunks, 16 requested ranges, 80 digits per range number, 4 KiB range fields, 32 response headers, 16 multipart parts, 6 MiB JSON imports/projects and 16 MiB reports. Unsupported range limits fall back to a full response. Other limit failures preserve saved work.",
  "transfer.privacy":
    "Projects, packets, binary downloads and checkpoints contain your bytes and metadata. Treat them as potentially private. Reports omit bytes, headers, ETags, digests and resource identities; scenario names/IDs, offsets, counts and optional attempt decisions remain. Toolkit exports include saved metadata defaults but no resource payloads, cases or checkpoints. No requests, editor changes, authentication changes or persistent writes occur here.",
  "transfer.demo": "Load interrupted-download demo",
  "transfer.new": "New transfer project",
  "transfer.import": "Import transfer project",
  "transfer.export": "Export transfer project",
  "transfer.name": "Transfer project name",
  "transfer.save": "Save transfer edits",
  "transfer.discard": "Discard transfer edits",
  "transfer.pending":
    "Save or discard edits before switching saved selections, running, importing or exporting.",
  "transfer.resources": "Binary resource revisions",
  "transfer.resource": "Selected binary resource",
  "transfer.resourceName": "Binary resource name",
  "transfer.type": "Resource Content-Type",
  "transfer.modified": "Last-Modified (IMF-fixdate, empty = absent)",
  "transfer.dateStrong": "Assert Last-Modified is a strong validator",
  "transfer.ranges": "Support byte-range requests",
  "transfer.format": "Resource byte editor format",
  "transfer.payload": "Exact resource bytes",
  "transfer.bytesHelp":
    "Base64 must be canonical; hex accepts whitespace and complete byte pairs. UTF-8 conversion refuses invalid binary text. File imports append an independent revision without changing existing resources.",
  "transfer.addResource": "Add binary resource",
  "transfer.cloneResource": "Duplicate binary resource",
  "transfer.deleteResource": "Delete unused binary resource",
  "transfer.resourceHelp":
    "A resource referenced by a scenario cannot be deleted. Rebind/remove those scenarios first. Byte edits never change another revision.",
  "transfer.file": "Import binary file as a new resource",
  "transfer.etag": "Computed resource ETag",
  "transfer.byteCount": "Saved resource size: {count} bytes.",
  "transfer.waiting": "Computing byte fingerprint…",
  "transfer.scenarios": "Transfer fault scenarios",
  "transfer.scenario": "Selected transfer scenario",
  "transfer.scenarioName": "Transfer scenario name",
  "transfer.initial": "Initial resource revision",
  "transfer.replacement": "Replacement resource revision",
  "transfer.noReplacement": "Keep the initial revision",
  "transfer.switchAt": "Switch server revision at attempt (1–200)",
  "transfer.chunk": "Requested chunk size, bytes (1–1048576)",
  "transfer.attempts": "Maximum GET attempts (1–200)",
  "transfer.faults": "Scheduled transfer faults (JSON array)",
  "transfer.faultHelp":
    "Entries are {at:attempt,kind:drop|truncate|corrupt|wrong-range|wrong-validator|ignore-range}. Attempt numbers start at 1 and must be unique. A corruption can pass chunk metadata checks and fail the final digest. Revision switching happens before that attempt is served; a transfer that already completed does not observe later changes.",
  "transfer.expect": "Transfer expectation (JSON object or null)",
  "transfer.expectHelp":
    "Use {outcome:complete|exhausted|integrity-failed,maxRejected:0,maxRestarts:0}. Counts are upper bounds. null leaves the result unchecked. Selected runs may use an imported checkpoint; full suites always start clean and retain summaries only.",
  "transfer.addScenario": "Add transfer scenario",
  "transfer.cloneScenario": "Duplicate transfer scenario",
  "transfer.deleteScenario": "Delete transfer scenario",
  "transfer.noScenarios":
    "The scenario library is empty. Add a scenario to test transfers.",
  "transfer.run": "Run selected transfer with retained bytes",
  "transfer.runAll": "Run all transfer scenarios",
  "transfer.probe": "Inspect a range request",
  "transfer.method": "Range probe method",
  "transfer.range": "Probe Range",
  "transfer.rangeMissing": "Omit Range",
  "transfer.ifRange": "Probe If-Range",
  "transfer.ifRangeMissing": "Omit If-Range",
  "transfer.useTag": "Use saved resource ETag in If-Range",
  "transfer.sendProbe": "Rehearse range request offline",
  "transfer.packetImport": "Import captured range-response packet",
  "transfer.packetExport": "Export exact range-response packet",
  "transfer.packetHelp":
    "A packet has kind:rsswag-range-response, version:1, method:GET|HEAD, status, headers and canonical base64. Import validates it atomically without changing resource definitions. The wire-body download retains multipart framing; part downloads contain only that interval's bytes.",
  "transfer.response": "Inspected range response",
  "transfer.wire": "Download exact response body",
  "transfer.part": "Selected response part",
  "transfer.partBytes": "Download selected part bytes",
  "transfer.preview": "Binary hex preview (first 256 bytes)",
  "transfer.responseMeta": "Response status, headers and byte intervals",
  "transfer.checkpoint": "Transfer resume checkpoint",
  "transfer.checkpointImport": "Import transfer checkpoint",
  "transfer.checkpointExport": "Export inspected transfer checkpoint",
  "transfer.clearCheckpoint": "Forget imported checkpoint",
  "transfer.useCheckpoint": "Use imported checkpoint for the selected run",
  "transfer.checkpointHelp":
    "Checkpoints retain received byte intervals, total size and strong ETag. Overlaps/invalid bounds are refused. A different initial ETag/size discards old fragments and counts a restart. Checkpoint bytes are untrusted until the final digest passes. Matrix runs do not use the imported checkpoint.",
  "transfer.checkpointLoaded":
    "Checkpoint loaded: {covered}/{total} bytes retained.",
  "transfer.checkpointNone": "No imported resume checkpoint.",
  "transfer.busy": "Working on transfer… {done}/{total}",
  "transfer.cancel": "Cancel transfer operation",
  "transfer.cancelled":
    "Transfer operation cancelled; previous complete results remain.",
  "transfer.results": "Transfer rehearsal results",
  "transfer.result": "Selected transfer result",
  "transfer.outcome": "Outcome",
  "transfer.complete": "Complete and verified",
  "transfer.exhausted": "Attempt budget exhausted",
  "transfer.integrityFailed": "Final integrity check failed",
  "transfer.passed": "Passed",
  "transfer.failed": "Failed",
  "transfer.unchecked": "Unchecked",
  "transfer.completed":
    "Transfer checks finished: {passed}/{checked} expectations passed; {total} scenarios.",
  "transfer.coverage": "Received byte coverage",
  "transfer.stats":
    "Received {covered}/{total} bytes; {attempts} GET attempts; {rejected} rejected; {restarts} restarts; {wire} wire bytes.",
  "transfer.timeline": "Transfer attempt journal",
  "transfer.search": "Search transfer attempts by status, fault or decision",
  "transfer.attempt": "Attempt",
  "transfer.requested": "Requested interval",
  "transfer.status": "Status",
  "transfer.fault": "Fault",
  "transfer.decision": "Decision",
  "transfer.accepted": "Accepted",
  "transfer.rejected": "Rejected",
  "transfer.output": "Download verified assembled bytes",
  "transfer.record": "Record inspected transfer expectation",
  "transfer.retention":
    "Run a selected scenario to retain its checkpoint and verified bytes. Suite results contain summaries only.",
  "transfer.details": "Include attempt decisions in transfer report",
  "transfer.report": "Download transfer report",
  "transfer.toolkit": "Download server and resumable-client toolkit",
  "transfer.toolkitHelp":
    "The dependency-free ES module exports createByteRangeResponder, downloadBytes, parseByteRanges, inspectRangeResponse and normalizeCheckpoint. Pass resource bytes to the responder; route/authenticate/evaluate other preconditions first. Calling downloadBytes explicitly sends bounded HEAD/GET requests from its runtime with redirects refused, identity coding and a default five-minute deadline. The studio itself stays offline.",
  "transfer.saved": "Transfer edits saved.",
  "transfer.loaded": "Transfer project loaded.",
  "transfer.recorded": "Transfer expectation saved; rerun to verify it.",
  "transfer.packetLoaded": "Range response inspected successfully.",
  "transfer.downloaded": "Download started.",
  "transfer.error.json": "Invalid JSON. Correct the draft and try again.",
  "transfer.error.project":
    "Invalid transfer definition. Check names, IDs, media type, exact HTTP date, scenario references, integer limits, faults and expectations.",
  "transfer.error.limit":
    "A transfer size or count limit was exceeded. Saved work remains intact.",
  "transfer.error.bytes":
    "Invalid byte encoding. Check canonical base64, complete hex pairs or valid UTF-8.",
  "transfer.error.crypto":
    "SHA-256 is unavailable. Use a secure browser context and try again.",
  "transfer.error.packet":
    "The response does not match the supported byte-range packet profile. Check framing, lengths, ranges, headers and encoding.",
  "transfer.error.checkpoint":
    "Invalid checkpoint. Check the strong ETag, total size, byte intervals and overlaps.",
  "transfer.error.download": "The browser blocked the download. Try again.",
  "transfer.error.unknown":
    "The transfer operation could not finish. Saved work remains intact.",
} as const;
const ru: Record<keyof typeof en, string> = {
  "transfer.title": "Студия возобновляемых загрузок и диапазонов байтов",
  "transfer.help":
    "Изучайте двоичные диапазоны HTTP, проверяйте прерывания и смену версий, валидируйте составные ответы и экспортируйте серверный и клиентский модуль. Студия работает офлайн в этой вкладке.",
  "transfer.guide": "Правила протокола, целостность, лимиты и экспорт",
  "transfer.protocol":
    "GET поддерживает закрытые, открытые и суффиксные диапазоны. Недоступные элементы пропускаются; полностью недоступный корректный набор даёт 416. Ошибочный синтаксис, неизвестные единицы и превышение числа диапазонов игнорируются с полным 200. Для пустых ресурсов Range игнорируется. Смежные и пересекающиеся интервалы объединяются с сохранением ранней позиции запроса. HEAD возвращает полные метаданные без тела.",
  "transfer.validators":
    "If-Range требует точного сильного ETag. Слабые метки, ошибочные значения и несовпадения дают полный ответ. HTTP-даты требуют точного IMF-fixdate и явного подтверждения силы даты; включайте его только для надёжного сильного валидатора. ETag — SHA-256 исходных байтов без кодирования. Другие условия HTTP, маршрутизация и авторизация выполняются перед экспортированным модулем.",
  "transfer.integrity":
    "Клиент запрашивает только пропуски с If-Range, проверяет статус, длины, Content-Range и ETag, целиком отвергая ошибочные или закодированные части. Новое полное представление сбрасывает старые части. Итоговый SHA-256 обнаруживает порчу, невидимую по метаданным. Скачать можно только полностью проверенный результат. Хеш с того же сервера проверяет согласованность байтов, но не подтверждает подлинность сервера.",
  "transfer.profile":
    "Инспектор поддерживает ограниченный профиль без кодирования: 200, 206, 416 и 200 HEAD. Multipart требует CRLF, по одному Content-Type и Content-Range на часть, ASCII-разделители до 70 символов, без преамбулы, эпилога и дополнительных заголовков частей. Проверяются длины и общий размер, произвольные байты сохраняются. Это не универсальный MIME-парсер.",
  "transfer.limits":
    "Лимиты: 3 ресурса/4 МиБ исходных байтов суммарно, 12 сценариев, 200 попыток, 100 сбоев, части до 1 МиБ, 16 диапазонов, до 80 цифр в смещении, поля диапазонов до 4 КиБ, 32 заголовка ответа, 16 multipart-частей, JSON до 6 МиБ и отчёты до 16 МиБ. Превышение лимитов Range даёт полный ответ. Остальные ошибки сохраняют работу.",
  "transfer.privacy":
    "Проекты, пакеты, файлы и контрольные точки содержат ваши байты и метаданные; они могут быть закрытыми. Отчёты исключают байты, заголовки, ETag, хеши и ID ресурсов; сохраняются названия/ID сценариев, смещения, счётчики и решения попыток. Экспорт кода содержит настройки метаданных без содержимого ресурсов и проверок. Студия не отправляет запросы, не меняет редактор, авторизацию или постоянное хранилище.",
  "transfer.demo": "Загрузить пример прерываемых загрузок",
  "transfer.new": "Новый проект загрузок",
  "transfer.import": "Импортировать проект загрузок",
  "transfer.export": "Экспортировать проект загрузок",
  "transfer.name": "Название проекта загрузок",
  "transfer.save": "Сохранить изменения загрузок",
  "transfer.discard": "Отменить изменения загрузок",
  "transfer.pending":
    "Сохраните или отмените изменения перед выбором, запуском, импортом или экспортом.",
  "transfer.resources": "Версии двоичных ресурсов",
  "transfer.resource": "Выбранный двоичный ресурс",
  "transfer.resourceName": "Название двоичного ресурса",
  "transfer.type": "Content-Type ресурса",
  "transfer.modified": "Last-Modified (IMF-fixdate, пусто = отсутствует)",
  "transfer.dateStrong": "Считать Last-Modified сильным валидатором",
  "transfer.ranges": "Поддерживать запросы диапазонов байтов",
  "transfer.format": "Формат редактора байтов",
  "transfer.payload": "Точные байты ресурса",
  "transfer.bytesHelp":
    "Base64 должен быть каноническим; hex допускает пробелы и полные пары цифр. UTF-8 отклоняет некорректные двоичные данные. Импорт файла добавляет независимую версию, сохраняя существующие ресурсы.",
  "transfer.addResource": "Добавить двоичный ресурс",
  "transfer.cloneResource": "Дублировать двоичный ресурс",
  "transfer.deleteResource": "Удалить неиспользуемый двоичный ресурс",
  "transfer.resourceHelp":
    "Ресурс нельзя удалить, пока сценарий ссылается на него. Измените ссылки или удалите сценарии. Редактирование байтов не меняет другие версии.",
  "transfer.file": "Импортировать двоичный файл как новый ресурс",
  "transfer.etag": "Вычисленный ETag ресурса",
  "transfer.byteCount": "Размер сохранённого ресурса: {count} байт.",
  "transfer.waiting": "Вычисление отпечатка байтов…",
  "transfer.scenarios": "Сценарии сбоев загрузки",
  "transfer.scenario": "Выбранный сценарий загрузки",
  "transfer.scenarioName": "Название сценария загрузки",
  "transfer.initial": "Начальная версия ресурса",
  "transfer.replacement": "Новая версия ресурса",
  "transfer.noReplacement": "Сохранять начальную версию",
  "transfer.switchAt": "Сменить версию сервера на попытке (1–200)",
  "transfer.chunk": "Размер запрашиваемой части, байт (1–1048576)",
  "transfer.attempts": "Максимум попыток GET (1–200)",
  "transfer.faults": "Расписание сбоев загрузки (массив JSON)",
  "transfer.faultHelp":
    "Запись: {at:номер,kind:drop|truncate|corrupt|wrong-range|wrong-validator|ignore-range}. Номера начинаются с 1 и уникальны. Порча может пройти проверку части и обнаружиться итоговым хешем. Версия меняется перед указанной попыткой; завершённая загрузка не видит более поздних изменений.",
  "transfer.expect": "Ожидание загрузки (объект JSON или null)",
  "transfer.expectHelp":
    "Укажите {outcome:complete|exhausted|integrity-failed,maxRejected:0,maxRestarts:0}. Счётчики — верхние границы. null отключает ожидание. Отдельный запуск может использовать контрольную точку; набор всегда начинается с нуля и сохраняет только сводки.",
  "transfer.addScenario": "Добавить сценарий загрузки",
  "transfer.cloneScenario": "Дублировать сценарий загрузки",
  "transfer.deleteScenario": "Удалить сценарий загрузки",
  "transfer.noScenarios":
    "Библиотека сценариев пуста. Добавьте сценарий для проверки загрузок.",
  "transfer.run": "Запустить выбранную загрузку с сохранением байтов",
  "transfer.runAll": "Запустить все сценарии загрузок",
  "transfer.probe": "Исследовать запрос диапазонов",
  "transfer.method": "Метод проверки диапазонов",
  "transfer.range": "Range проверки",
  "transfer.rangeMissing": "Не отправлять Range",
  "transfer.ifRange": "If-Range проверки",
  "transfer.ifRangeMissing": "Не отправлять If-Range",
  "transfer.useTag": "Использовать ETag сохранённого ресурса в If-Range",
  "transfer.sendProbe": "Проверить запрос диапазонов офлайн",
  "transfer.packetImport": "Импортировать пакет ответа с диапазонами",
  "transfer.packetExport": "Экспортировать точный пакет ответа",
  "transfer.packetHelp":
    "Пакет содержит kind:rsswag-range-response, version:1, method:GET|HEAD, status, headers и канонический base64. Импорт проверяет его целиком без изменения ресурсов. Файл тела сохраняет multipart-оформление; файл части содержит только байты её интервала.",
  "transfer.response": "Исследуемый ответ с диапазонами",
  "transfer.wire": "Скачать точное тело ответа",
  "transfer.part": "Выбранная часть ответа",
  "transfer.partBytes": "Скачать байты выбранной части",
  "transfer.preview": "Двоичный hex-просмотр (первые 256 байт)",
  "transfer.responseMeta": "Статус, заголовки и интервалы байтов ответа",
  "transfer.checkpoint": "Контрольная точка возобновления",
  "transfer.checkpointImport": "Импортировать контрольную точку загрузки",
  "transfer.checkpointExport": "Экспортировать контрольную точку результата",
  "transfer.clearCheckpoint": "Забыть импортированную контрольную точку",
  "transfer.useCheckpoint":
    "Использовать контрольную точку в выбранном запуске",
  "transfer.checkpointHelp":
    "Контрольная точка содержит интервалы байтов, размер и сильный ETag. Пересечения и некорректные границы отклоняются. При другом начальном ETag/размере старые части сбрасываются с учётом перезапуска. Байты не считаются проверенными до итогового хеша. Полный набор не использует импортированную точку.",
  "transfer.checkpointLoaded":
    "Контрольная точка загружена: {covered}/{total} байт.",
  "transfer.checkpointNone": "Импортированной контрольной точки нет.",
  "transfer.busy": "Выполнение загрузки… {done}/{total}",
  "transfer.cancel": "Отменить операцию загрузки",
  "transfer.cancelled":
    "Операция загрузки отменена; предыдущие полные результаты сохранены.",
  "transfer.results": "Результаты проверок загрузки",
  "transfer.result": "Выбранный результат загрузки",
  "transfer.outcome": "Результат",
  "transfer.complete": "Завершено и проверено",
  "transfer.exhausted": "Исчерпан лимит попыток",
  "transfer.integrityFailed": "Итоговая проверка целостности не пройдена",
  "transfer.passed": "Пройдено",
  "transfer.failed": "Ошибка",
  "transfer.unchecked": "Без ожидания",
  "transfer.completed":
    "Проверки загрузок: пройдено {passed}/{checked}; сценариев {total}.",
  "transfer.coverage": "Покрытие полученных байтов",
  "transfer.stats":
    "Получено {covered}/{total} байт; GET-попыток {attempts}; отказов {rejected}; перезапусков {restarts}; передано {wire} байт.",
  "transfer.timeline": "Журнал попыток загрузки",
  "transfer.search": "Поиск попыток по статусу, сбою или решению",
  "transfer.attempt": "Попытка",
  "transfer.requested": "Запрошенный интервал",
  "transfer.status": "Статус",
  "transfer.fault": "Сбой",
  "transfer.decision": "Решение",
  "transfer.accepted": "Принято",
  "transfer.rejected": "Отклонено",
  "transfer.output": "Скачать проверенные собранные байты",
  "transfer.record": "Сохранить ожидание выбранной загрузки",
  "transfer.retention":
    "Запустите отдельный сценарий для сохранения контрольной точки и проверенных байтов. Набор сохраняет только сводки.",
  "transfer.details": "Включить решения попыток в отчёт загрузки",
  "transfer.report": "Скачать отчёт загрузки",
  "transfer.toolkit": "Скачать серверный и клиентский модуль загрузок",
  "transfer.toolkitHelp":
    "ES-модуль без зависимостей экспортирует createByteRangeResponder, downloadBytes, parseByteRanges, inspectRangeResponse и normalizeCheckpoint. Передайте байты серверному модулю; заранее выполните маршрутизацию, авторизацию и другие условия HTTP. Явный вызов downloadBytes отправляет HEAD/GET из своей среды, запрещает перенаправления и кодирование и по умолчанию ограничен пятью минутами. Сама студия работает офлайн.",
  "transfer.saved": "Изменения загрузок сохранены.",
  "transfer.loaded": "Проект загрузок загружен.",
  "transfer.recorded":
    "Ожидание загрузки сохранено; запустите проверку повторно.",
  "transfer.packetLoaded": "Ответ с диапазонами успешно проверен.",
  "transfer.downloaded": "Скачивание началось.",
  "transfer.error.json": "Некорректный JSON. Исправьте черновик и повторите.",
  "transfer.error.project":
    "Некорректное определение загрузки. Проверьте имена, ID, формат, точную HTTP-дату, ссылки сценариев, целые числа, сбои и ожидания.",
  "transfer.error.limit":
    "Превышен лимит размера или количества. Сохранённая работа не изменилась.",
  "transfer.error.bytes":
    "Ошибка кодирования байтов. Проверьте канонический base64, полные hex-пары или корректный UTF-8.",
  "transfer.error.crypto":
    "SHA-256 недоступен. Используйте защищённый контекст браузера и повторите.",
  "transfer.error.packet":
    "Ответ не соответствует профилю диапазонов. Проверьте оформление, длины, интервалы, заголовки и кодирование.",
  "transfer.error.checkpoint":
    "Некорректная контрольная точка. Проверьте сильный ETag, размер, интервалы и пересечения.",
  "transfer.error.download":
    "Браузер заблокировал скачивание. Повторите действие.",
  "transfer.error.unknown":
    "Не удалось завершить операцию загрузки. Сохранённая работа не изменилась.",
};
export const transferTranslations = { en, ru };
