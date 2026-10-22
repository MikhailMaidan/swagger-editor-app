export const streamingTranslations = {
  en: {
    "streamStudio.title": "Streaming HTTP studio",
    "streamStudio.description":
      "Inspect live Server-Sent Events and NDJSON streams, replay wire fixtures across byte boundaries, and save reusable framing regression cases.",
    "streamStudio.help":
      "Live connections start only with Connect and use browser Fetch directly. CORS and browser network rules apply. Ambient cookies are omitted and redirects are rejected. Nothing is added to login credentials, request history or browser storage. Closing this panel keeps work and active streams; disconnect to stop traffic.",
    "streamStudio.project": "Streaming project",
    "streamStudio.projectName": "Streaming project name",
    "streamStudio.newProject": "New streaming project",
    "streamStudio.demo": "Load streaming framing demo",
    "streamStudio.demoLoaded":
      "Five offline cases loaded, including Unicode, heartbeats, malformed NDJSON and incomplete SSE at EOF. No connection was opened.",
    "streamStudio.importProject": "Restore streaming project (JSON)",
    "streamStudio.importTranscript": "Import stream transcript (JSON)",
    "streamStudio.projectLoaded":
      "Project restored without session headers or imported run results.",
    "streamStudio.transcriptLoaded":
      "Transcript imported without connecting. Captured values are available in the inspector.",
    "streamStudio.downloadProject": "Download streaming project",
    "streamStudio.exportHelp":
      "Projects include the saved URL, request body and wire fixtures. Session headers are excluded. Transcripts and record exports contain payload values and event IDs; reports omit those values. All work stays in this tab until explicitly copied or downloaded.",
    "streamStudio.connection": "Live HTTP stream",
    "streamStudio.connectionHelp":
      "GET and POST are supported. Only GET SSE can reconnect, within your explicit limit; POST is never resent automatically. SSE retry hints above 30000 ms stop reconnection instead of being shortened. Use a supported browser context and a server that allows your origin and explicit headers.",
    "streamStudio.url": "Streaming HTTP URL",
    "streamStudio.format": "Live stream format",
    "streamStudio.method": "Streaming HTTP method",
    "streamStudio.body": "Streaming POST request body",
    "streamStudio.config.handshakeMs": "Stream handshake timeout (ms)",
    "streamStudio.config.idleMs": "Stream idle timeout (ms)",
    "streamStudio.config.durationMs": "Maximum stream session duration (ms)",
    "streamStudio.config.maxRecords": "Maximum session records (1–1000)",
    "streamStudio.config.reconnects": "Automatic GET SSE reconnects (0–5)",
    "streamStudio.config.retryMs": "Default SSE reconnect delay (ms, 0–30000)",
    "streamStudio.lastEventId": "Initial Last-Event-ID cursor",
    "streamStudio.stopText": "Stop on exact record data (blank disables)",
    "streamStudio.requireContentType":
      "Require the selected stream Content-Type",
    "streamStudio.requireFinalNewline": "Require a final NDJSON newline",
    "streamStudio.ignoreEmptyLines": "Ignore empty NDJSON lines",
    "streamStudio.saveConnection": "Save streaming connection settings",
    "streamStudio.discardConnection": "Discard streaming connection edits",
    "streamStudio.connectionSaved": "Streaming connection settings saved.",
    "streamStudio.headers": "Session-only stream headers (JSON object)",
    "streamStudio.headersHelp":
      "Enter explicit Authorization or custom headers here. They stay in memory and are never included in project/report exports. Accept and Last-Event-ID are controlled by the studio; browser transport/cookie headers cannot be supplied.",
    "streamStudio.clearHeaders": "Clear session stream headers",
    "streamStudio.connect": "Connect HTTP stream",
    "streamStudio.disconnect": "Disconnect HTTP stream",
    "streamStudio.useCursor": "Use current SSE cursor for next connection",
    "streamStudio.state.idle": "idle",
    "streamStudio.state.connecting": "connecting",
    "streamStudio.state.streaming": "streaming",
    "streamStudio.state.waiting": "waiting to reconnect",
    "streamStudio.state.closed": "closed",
    "streamStudio.sessionSummary":
      "State: {state}; connections {connections}; records {records}; received {bytes} bytes; heartbeats {comments}.",
    "streamStudio.cursor":
      "Current SSE cursor: {id}; reconnect delay {delay} ms.",
    "streamStudio.httpStatus": "Last HTTP status: {status}.",
    "streamStudio.downloadSessionReport":
      "Download value-free stream session report",
    "streamStudio.sessionTime":
      "Session elapsed: {elapsed} ms; first record: {first} ms.",
    "streamStudio.stop.eof": "The response reached EOF.",
    "streamStudio.stop.no-content":
      "HTTP 204 ended the stream without reconnection.",
    "streamStudio.stop.cancelled": "The stream was disconnected.",
    "streamStudio.stop.handshake-timeout": "The stream handshake timed out.",
    "streamStudio.stop.idle-timeout":
      "No incoming bytes arrived within the idle limit.",
    "streamStudio.stop.duration-limit":
      "The maximum session duration was reached.",
    "streamStudio.stop.record-limit":
      "The configured record limit was reached.",
    "streamStudio.stop.sentinel": "The exact stop-data sentinel was received.",
    "streamStudio.stop.http":
      "The response HTTP status is unsupported for this stream.",
    "streamStudio.stop.mime":
      "The response Content-Type does not match the selected framing.",
    "streamStudio.stop.retry-limit":
      "The server retry hint exceeds the bounded reconnect delay; no shortened retry was sent.",
    "streamStudio.stop.json":
      "NDJSON contained invalid, unsafe or excessively nested JSON.",
    "streamStudio.stop.utf8": "NDJSON contained invalid UTF-8.",
    "streamStudio.stop.framing":
      "The stream framing or final-newline requirement was violated.",
    "streamStudio.stop.limit":
      "A stream byte, line or record limit was reached.",
    "streamStudio.stop.headers":
      "The resume cursor could not be represented safely as an HTTP header.",
    "streamStudio.stop.network":
      "The browser could not complete the stream; check the server, CORS, network and browser permissions.",
    "streamStudio.cases": "Streaming replay regression cases",
    "streamStudio.selectedCase": "Selected stream replay case",
    "streamStudio.caseName": "Stream replay case name",
    "streamStudio.caseFormat": "Replay framing format",
    "streamStudio.wire": "Raw stream wire fixture",
    "streamStudio.wireEncoding": "Replay wire encoding",
    "streamStudio.chunkBytes": "Replay chunk size (bytes, 1–65536)",
    "streamStudio.expectedError": "Expected replay parser error",
    "streamStudio.minRecords": "Minimum expected replay records",
    "streamStudio.maxRecords": "Maximum expected replay records",
    "streamStudio.checks": "Stream record checks (JSON array)",
    "streamStudio.checksHelp":
      "Checks use name, select (index/last/every/some), zero-based index, optional event filter, textMode (any/equals/contains), text and json. JSON rules use the existing body assertion format. An empty selection fails even for every. A matching expected parser rejection passes only when counts and checks also match.",
    "streamStudio.addCase": "Add stream replay case",
    "streamStudio.duplicateCase": "Duplicate stream replay case",
    "streamStudio.removeCase": "Remove stream replay case",
    "streamStudio.saveCase": "Save stream replay case",
    "streamStudio.discardCase": "Discard stream replay case edits",
    "streamStudio.caseSaved":
      "Replay case saved; previous case results cleared.",
    "streamStudio.exampleCheck": "Insert example JSON record check",
    "streamStudio.replay": "Replay selected stream fixture",
    "streamStudio.runCases": "Run saved stream replay cases",
    "streamStudio.sweep": "Run byte-boundary regression sweep",
    "streamStudio.caseHelp":
      "Replay is offline. The sweep tests every saved fixture with chunks of 1, 2, 3, 7, 64 and 4096 bytes. SSE replaces malformed UTF-8 and dispatches only on blank lines. NDJSON uses strict UTF-8, LF/CRLF delimiters and bounded JSON values. Raw fixtures contain payload values.",
    "streamStudio.dirty":
      "Save or discard edits before switching context, connecting, replaying or exporting.",
    "streamStudio.busy":
      "Working locally… completed {count}/{total} replay variants.",
    "streamStudio.cancel": "Cancel streaming work",
    "streamStudio.cancelled":
      "Work cancelled. Completed replay variants are retained; unfinished variants are omitted.",
    "streamStudio.results": "Stream replay results",
    "streamStudio.resultsSummary":
      "Completed {completed}/{total} variants: {passed} passed, {failed} failed.",
    "streamStudio.partial":
      "Incomplete replay run. Completed variants do not establish full coverage.",
    "streamStudio.downloadCasesReport":
      "Download value-free streaming replay report",
    "streamStudio.caseResult":
      "{name} · chunk {chunk} bytes · {status} · records {count} · parser {error}",
    "streamStudio.passed": "passed",
    "streamStudio.failed": "failed",
    "streamStudio.parser.none": "none",
    "streamStudio.parser.json": "invalid JSON",
    "streamStudio.parser.utf8": "invalid UTF-8",
    "streamStudio.parser.framing": "framing error",
    "streamStudio.parser.limit": "limit exceeded",
    "streamStudio.checkResult":
      "{name}: {status}; matched {matched}/{selected} selected records.",
    "streamStudio.transcript": "Stream record inspector",
    "streamStudio.history":
      "Retained {count} records; dropped from the bounded inspector: {dropped}.",
    "streamStudio.search": "Search stream records",
    "streamStudio.eventFilter": "Stream event type filter",
    "streamStudio.allEvents": "All event types",
    "streamStudio.selectRecord": "Inspect stream record {sequence}",
    "streamStudio.recordSummary":
      "#{sequence} · {event} · id {id} · {bytes} bytes · {time} ms · connection {connection}",
    "streamStudio.preview":
      "Selected stream record data (first 16000 characters)",
    "streamStudio.previewHelp":
      "The inspector preview is bounded; copy and transcript downloads preserve the full retained record.",
    "streamStudio.copyRecord": "Copy full selected stream record data",
    "streamStudio.clearRecords": "Clear stream inspector",
    "streamStudio.downloadTranscript": "Download stream transcript",
    "streamStudio.downloadRecords": "Download stream records (NDJSON)",
    "streamStudio.captureCase": "Create replay case from retained records",
    "streamStudio.captureHelp":
      "Recording reconstructs application records only, without heartbeat/retry control lines, original byte splits or response boundaries. When records were dropped, only the retained subset is captured.",
    "streamStudio.caseCaptured":
      "Retained records copied into a new replay case. The original cases were preserved.",
    "streamStudio.downloaded": "Download started.",
    "streamStudio.downloadFailed": "Download was blocked. Try again.",
    "streamStudio.copied": "Record copied to clipboard.",
    "streamStudio.copyFailed": "Could not copy the record.",
    "streamStudio.error.project":
      "Use a valid RSSwag streaming project with unique case identities. Existing work was retained.",
    "streamStudio.error.connection":
      "Use bounded stream settings. GET cannot have a body; only GET SSE can reconnect automatically.",
    "streamStudio.error.url":
      "Use an absolute HTTP(S) URL without credentials, whitespace or a fragment.",
    "streamStudio.error.headers":
      "Use at most 30 distinct valid session headers without forbidden transport/cookie fields or unsafe cursor/header characters.",
    "streamStudio.error.json":
      "Use valid bounded JSON with finite numbers and safe integers.",
    "streamStudio.error.utf8": "The NDJSON stream contains invalid UTF-8.",
    "streamStudio.error.framing":
      "Use supported framing and valid final delimiters.",
    "streamStudio.error.limit":
      "A stream, project, replay case or inspector limit was exceeded.",
    "streamStudio.error.case":
      "Use a named replay case with bounded wire input, chunk size and expected record counts.",
    "streamStudio.error.check":
      "Use valid record selectors, text matching and body-only JSON assertion rules.",
    "streamStudio.error.transcript":
      "Use a valid bounded stream transcript with increasing sequence, time and connection fields.",
    "streamStudio.error.cancelled": "Streaming work cancelled.",
    "streamStudio.error.network":
      "Could not complete streaming work in this browser context.",
  },
  ru: {
    "streamStudio.title": "Студия потокового HTTP",
    "streamStudio.description":
      "Изучайте потоки Server-Sent Events и NDJSON, воспроизводите исходные данные с разбиением по байтам и сохраняйте регрессионные проверки формата.",
    "streamStudio.help":
      "Подключение начинается только кнопкой подключения через Fetch браузера. Действуют CORS и сетевые правила браузера. Cookie не передаются, перенаправления запрещены. Данные не добавляются в учётные данные, историю запросов или хранилище браузера. Закрытие панели сохраняет работу и активные потоки; отключитесь, чтобы остановить трафик.",
    "streamStudio.project": "Потоковый проект",
    "streamStudio.projectName": "Название потокового проекта",
    "streamStudio.newProject": "Новый потоковый проект",
    "streamStudio.demo": "Загрузить демо потоковых форматов",
    "streamStudio.demoLoaded":
      "Загружены пять локальных случаев: Unicode, сигналы активности, некорректный NDJSON и незавершённый SSE в конце файла. Подключение не открывалось.",
    "streamStudio.importProject": "Восстановить потоковый проект (JSON)",
    "streamStudio.importTranscript": "Импортировать журнал потока (JSON)",
    "streamStudio.projectLoaded":
      "Проект восстановлен без заголовков сессии и импортированных результатов.",
    "streamStudio.transcriptLoaded":
      "Журнал импортирован без подключения. Захваченные значения доступны для просмотра.",
    "streamStudio.downloadProject": "Скачать потоковый проект",
    "streamStudio.exportHelp":
      "Проекты содержат сохранённый URL, тело запроса и исходные образцы потока. Заголовки сессии исключены. Журналы и экспорт записей содержат значения и идентификаторы событий; отчёты исключают эти значения. Работа остаётся во вкладке до явного копирования или скачивания.",
    "streamStudio.connection": "Живой HTTP-поток",
    "streamStudio.connectionHelp":
      "Поддерживаются GET и POST. Переподключаться может только GET SSE в указанном пределе; POST автоматически не повторяется. Подсказка SSE retry свыше 30000 мс останавливает переподключение, а не сокращается. Сервер должен разрешать ваш origin и явно заданные заголовки.",
    "streamStudio.url": "URL потокового HTTP",
    "streamStudio.format": "Формат живого потока",
    "streamStudio.method": "Метод потокового HTTP",
    "streamStudio.body": "Тело потокового POST-запроса",
    "streamStudio.config.handshakeMs": "Тайм-аут подключения потока (мс)",
    "streamStudio.config.idleMs": "Тайм-аут бездействия потока (мс)",
    "streamStudio.config.durationMs":
      "Максимальная длительность потоковой сессии (мс)",
    "streamStudio.config.maxRecords": "Максимум записей сессии (1–1000)",
    "streamStudio.config.reconnects":
      "Автоматические переподключения GET SSE (0–5)",
    "streamStudio.config.retryMs":
      "Ожидание переподключения SSE по умолчанию (мс, 0–30000)",
    "streamStudio.lastEventId": "Начальный курсор Last-Event-ID",
    "streamStudio.stopText":
      "Остановка по точному содержимому записи (пусто отключает)",
    "streamStudio.requireContentType":
      "Требовать Content-Type выбранного формата",
    "streamStudio.requireFinalNewline":
      "Требовать завершающий перенос строки NDJSON",
    "streamStudio.ignoreEmptyLines": "Пропускать пустые строки NDJSON",
    "streamStudio.saveConnection": "Сохранить настройки потокового подключения",
    "streamStudio.discardConnection": "Отменить правки потокового подключения",
    "streamStudio.connectionSaved":
      "Настройки потокового подключения сохранены.",
    "streamStudio.headers": "Заголовки потока только для сессии (объект JSON)",
    "streamStudio.headersHelp":
      "Задайте Authorization или собственные заголовки. Они остаются в памяти и не попадают в проекты и отчёты. Accept и Last-Event-ID задаёт студия; транспортные заголовки браузера и Cookie запрещены.",
    "streamStudio.clearHeaders": "Очистить заголовки потоковой сессии",
    "streamStudio.connect": "Подключить HTTP-поток",
    "streamStudio.disconnect": "Отключить HTTP-поток",
    "streamStudio.useCursor":
      "Использовать текущий курсор SSE для следующего подключения",
    "streamStudio.state.idle": "ожидание",
    "streamStudio.state.connecting": "подключение",
    "streamStudio.state.streaming": "получение потока",
    "streamStudio.state.waiting": "ожидание переподключения",
    "streamStudio.state.closed": "закрыто",
    "streamStudio.sessionSummary":
      "Состояние: {state}; подключений {connections}; записей {records}; получено {bytes} байт; сигналов активности {comments}.",
    "streamStudio.cursor":
      "Текущий курсор SSE: {id}; ожидание переподключения {delay} мс.",
    "streamStudio.httpStatus": "Последний HTTP-статус: {status}.",
    "streamStudio.downloadSessionReport":
      "Скачать отчёт потоковой сессии без значений",
    "streamStudio.sessionTime":
      "Длительность сессии: {elapsed} мс; первая запись: {first} мс.",
    "streamStudio.stop.eof": "Ответ достиг конца потока.",
    "streamStudio.stop.no-content":
      "HTTP 204 завершил поток без переподключения.",
    "streamStudio.stop.cancelled": "Поток отключён.",
    "streamStudio.stop.handshake-timeout": "Истёк тайм-аут подключения потока.",
    "streamStudio.stop.idle-timeout":
      "За время ожидания не поступило новых байтов.",
    "streamStudio.stop.duration-limit":
      "Достигнута максимальная длительность сессии.",
    "streamStudio.stop.record-limit": "Достигнут заданный предел записей.",
    "streamStudio.stop.sentinel": "Получены точные данные условия остановки.",
    "streamStudio.stop.http":
      "HTTP-статус ответа не поддерживается для этого потока.",
    "streamStudio.stop.mime":
      "Content-Type ответа не соответствует выбранному формату.",
    "streamStudio.stop.retry-limit":
      "Подсказка сервера retry превышает предел ожидания; сокращённый повтор не отправлен.",
    "streamStudio.stop.json":
      "NDJSON содержит некорректный, небезопасный или чрезмерно вложенный JSON.",
    "streamStudio.stop.utf8": "NDJSON содержит некорректный UTF-8.",
    "streamStudio.stop.framing":
      "Нарушен формат потока или требование завершающего переноса.",
    "streamStudio.stop.limit":
      "Достигнут предел байтов, строки или записи потока.",
    "streamStudio.stop.headers":
      "Курсор возобновления нельзя безопасно представить заголовком HTTP.",
    "streamStudio.stop.network":
      "Браузер не завершил получение потока; проверьте сервер, CORS, сеть и разрешения браузера.",
    "streamStudio.cases": "Регрессионные случаи воспроизведения потока",
    "streamStudio.selectedCase": "Выбранный случай воспроизведения потока",
    "streamStudio.caseName": "Название случая воспроизведения потока",
    "streamStudio.caseFormat": "Формат воспроизведения",
    "streamStudio.wire": "Исходный образец потока",
    "streamStudio.wireEncoding": "Кодировка исходного образца",
    "streamStudio.chunkBytes":
      "Размер фрагмента воспроизведения (байт, 1–65536)",
    "streamStudio.expectedError": "Ожидаемая ошибка разбора",
    "streamStudio.minRecords": "Минимум ожидаемых записей",
    "streamStudio.maxRecords": "Максимум ожидаемых записей",
    "streamStudio.checks": "Проверки записей потока (массив JSON)",
    "streamStudio.checksHelp":
      "Проверки содержат name, select (index/last/every/some), index с нуля, фильтр event, textMode (any/equals/contains), text и json. Для JSON используется существующий формат проверок тела. Пустой выбор не проходит даже every. Ожидаемая ошибка проходит только при совпадении количества и проверок.",
    "streamStudio.addCase": "Добавить случай воспроизведения потока",
    "streamStudio.duplicateCase": "Дублировать случай воспроизведения потока",
    "streamStudio.removeCase": "Удалить случай воспроизведения потока",
    "streamStudio.saveCase": "Сохранить случай воспроизведения потока",
    "streamStudio.discardCase": "Отменить правки случая воспроизведения",
    "streamStudio.caseSaved": "Случай сохранён; прежние результаты очищены.",
    "streamStudio.exampleCheck": "Вставить пример проверки JSON-записи",
    "streamStudio.replay": "Воспроизвести выбранный образец потока",
    "streamStudio.runCases": "Запустить сохранённые случаи воспроизведения",
    "streamStudio.sweep": "Запустить проверки байтовых границ",
    "streamStudio.caseHelp":
      "Воспроизведение локальное. Проверка границ разбивает каждый образец на фрагменты по 1, 2, 3, 7, 64 и 4096 байт. SSE заменяет некорректный UTF-8 и выдаёт события только по пустой строке. NDJSON использует строгий UTF-8, разделители LF/CRLF и ограниченный JSON. Исходные образцы содержат значения данных.",
    "streamStudio.dirty":
      "Сохраните или отмените правки перед сменой контекста, подключением, воспроизведением или экспортом.",
    "streamStudio.busy":
      "Локальная обработка… завершено вариантов: {count}/{total}.",
    "streamStudio.cancel": "Отменить потоковую обработку",
    "streamStudio.cancelled":
      "Обработка отменена. Завершённые варианты сохранены, незавершённые исключены.",
    "streamStudio.results": "Результаты воспроизведения потока",
    "streamStudio.resultsSummary":
      "Завершено {completed}/{total} вариантов: {passed} пройдено, {failed} не пройдено.",
    "streamStudio.partial":
      "Воспроизведение не завершено. Готовые варианты не подтверждают полное покрытие.",
    "streamStudio.downloadCasesReport":
      "Скачать отчёт воспроизведения без значений",
    "streamStudio.caseResult":
      "{name} · фрагмент {chunk} байт · {status} · записей {count} · разбор: {error}",
    "streamStudio.passed": "пройдено",
    "streamStudio.failed": "не пройдено",
    "streamStudio.parser.none": "нет ошибок",
    "streamStudio.parser.json": "некорректный JSON",
    "streamStudio.parser.utf8": "некорректный UTF-8",
    "streamStudio.parser.framing": "ошибка формата",
    "streamStudio.parser.limit": "превышен предел",
    "streamStudio.checkResult":
      "{name}: {status}; совпало {matched}/{selected} выбранных записей.",
    "streamStudio.transcript": "Просмотр записей потока",
    "streamStudio.history":
      "Сохранено записей: {count}; удалено из ограниченного просмотра: {dropped}.",
    "streamStudio.search": "Поиск записей потока",
    "streamStudio.eventFilter": "Фильтр типа события потока",
    "streamStudio.allEvents": "Все типы событий",
    "streamStudio.selectRecord": "Просмотреть запись потока {sequence}",
    "streamStudio.recordSummary":
      "#{sequence} · {event} · id {id} · {bytes} байт · {time} мс · подключение {connection}",
    "streamStudio.preview": "Данные выбранной записи (первые 16000 символов)",
    "streamStudio.previewHelp":
      "Предпросмотр ограничен; копирование и скачивание журнала сохраняют полные данные оставшейся записи.",
    "streamStudio.copyRecord": "Копировать полные данные выбранной записи",
    "streamStudio.clearRecords": "Очистить просмотр потока",
    "streamStudio.downloadTranscript": "Скачать журнал потока",
    "streamStudio.downloadRecords": "Скачать записи потока (NDJSON)",
    "streamStudio.captureCase": "Создать случай из сохранённых записей",
    "streamStudio.captureHelp":
      "Запись восстанавливает только данные событий без сигналов активности, retry, исходного разбиения и границ ответов. Если записи удалялись, захватывается только оставшаяся часть.",
    "streamStudio.caseCaptured":
      "Сохранённые записи скопированы в новый случай. Исходные случаи оставлены.",
    "streamStudio.downloaded": "Скачивание началось.",
    "streamStudio.downloadFailed":
      "Скачивание заблокировано. Повторите попытку.",
    "streamStudio.copied": "Запись скопирована в буфер обмена.",
    "streamStudio.copyFailed": "Не удалось скопировать запись.",
    "streamStudio.error.project":
      "Используйте корректный потоковый проект RSSwag с уникальными идентификаторами случаев. Прежняя работа сохранена.",
    "streamStudio.error.connection":
      "Используйте допустимые настройки потока. У GET нет тела; автоматически переподключается только GET SSE.",
    "streamStudio.error.url":
      "Используйте абсолютный URL HTTP(S) без учётных данных, пробелов и фрагмента.",
    "streamStudio.error.headers":
      "Задайте до 30 различных допустимых заголовков без запрещённых транспортных/Cookie полей и небезопасных символов заголовка или курсора.",
    "streamStudio.error.json":
      "Используйте корректный ограниченный JSON с конечными числами и безопасными целыми.",
    "streamStudio.error.utf8": "Поток NDJSON содержит некорректный UTF-8.",
    "streamStudio.error.framing":
      "Используйте поддерживаемый формат и корректные завершающие разделители.",
    "streamStudio.error.limit":
      "Превышен предел потока, проекта, случая воспроизведения или просмотра.",
    "streamStudio.error.case":
      "Укажите название случая, допустимый образец, размер фрагмента и ожидаемое количество записей.",
    "streamStudio.error.check":
      "Используйте корректные селекторы записей, текстовые сравнения и JSON-проверки только тела.",
    "streamStudio.error.transcript":
      "Используйте корректный ограниченный журнал с возрастающими номерами, временем и номерами подключений.",
    "streamStudio.error.cancelled": "Потоковая обработка отменена.",
    "streamStudio.error.network":
      "Не удалось завершить потоковую обработку в этом браузере.",
  },
} as const;
