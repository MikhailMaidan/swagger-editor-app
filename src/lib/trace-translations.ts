const en = {
  "trace.title": "Distributed trace and latency studio",
  "trace.help":
    "Import OpenTelemetry JSON traces, explore span waterfalls and service dependencies, inspect events/links, measure overlapping child time, and run reusable latency and error budgets. Work stays in this tab and is independent of the OpenAPI editor.",
  "trace.scopeTitle": "Timing semantics, supported formats and export contents",
  "trace.scope":
    "Supports bounded OTLP/HTTP JSON resourceSpans/scopeSpans, numeric span/status enums, typed attributes, events and links. IDs are hexadecimal; nanosecond timestamps stay exact decimal strings. Unsafe numeric timestamps/int64 values must be strings. Unknown source fields are retained in source/project exports but ignored by analysis. Binary Protobuf, Jaeger, live collectors and automatic instrumentation are outside this studio.",
  "trace.timingHelp":
    "Elapsed time is the observed min-start to max-end window, not a sum of spans. Exclusive time subtracts the union of clipped direct-child intervals; overlaps are counted once. Missing spans, instrumentation gaps and clock skew limit interpretation. Cyclic spans have unavailable exclusive time. Service sums can overlap and are not wall-clock request latency. Error status is explicit OTLP ERROR, not inferred from HTTP attributes. P95 uses nearest rank.",
  "trace.privacy":
    "Raw OTLP, selected-span, trace-slice and project exports can contain private attributes, events, IDs, timestamps and status messages. Reports and offline viewers omit those values; service/namespace labels, viewer operation names and user-defined budget metadata remain. Context exports contain raw tracing headers. Nothing is sent to a collector, added to API requests or saved in browser storage.",
  "trace.limits":
    "Limits: 1,000 spans, 100 resource/scope groups per container, 64 attributes per list, 50 events/links per span, 30 budgets and 2 MiB per OTLP input or project. Nested attribute values and JSON are bounded. Waterfall pages show 100 spans. Supports strict traceparent version 00, up to 32 tracestate entries and 512 ASCII bytes; future traceparent versions are not propagated.",
  "trace.demo": "Load distributed trace demo",
  "trace.new": "New distributed trace project",
  "trace.import": "Import distributed trace project",
  "trace.export": "Export distributed trace project",
  "trace.name": "Distributed trace project name",
  "trace.sourceSection": "OpenTelemetry trace source",
  "trace.source": "OTLP JSON source draft",
  "trace.importOtlp": "Import OTLP trace JSON",
  "trace.exportOtlp": "Download saved OTLP source",
  "trace.exportSlice": "Download selected trace OTLP slice",
  "trace.save": "Save and analyze trace edits",
  "trace.discard": "Discard trace edits",
  "trace.pending":
    "Save or discard source, project, context and budget edits before switching saved budgets, running checks or exporting.",
  "trace.loaded":
    "Trace project loaded; previous results and view filters cleared.",
  "trace.sourceLoaded":
    "OTLP loaded into the source draft. Save and analyze to adopt it; saved work was retained.",
  "trace.saved":
    "Trace edits saved and analyzed; previous budget results cleared.",
  "trace.busy": "Reading trace file…",
  "trace.cancel": "Cancel trace file import",
  "trace.overview": "Capture overview",
  "trace.stats":
    "{spans} spans; {traces} observed traces; {services} services; {errors} error spans; {diagnostics} diagnostics.",
  "trace.waterfall": "Trace waterfall",
  "trace.trace": "Selected trace ID",
  "trace.traceOption": "{index}: {id} ({count} spans)",
  "trace.summary":
    "Observed elapsed: {elapsed} ms; {spans} spans; {errors} errors; {roots} roots or detached spans.",
  "trace.search": "Search span names, services, scopes and IDs",
  "trace.serviceFilter": "Waterfall service filter",
  "trace.allServices": "All services",
  "trace.errorsOnly": "Show only explicit error spans",
  "trace.shown":
    "Showing {shown} of {total} matching spans; page {page} of {pages}.",
  "trace.previous": "Previous span page",
  "trace.next": "Next span page",
  "trace.operation": "Operation / service",
  "trace.timeline": "Observed timeline",
  "trace.duration": "Duration (ms)",
  "trace.self": "Exclusive (ms)",
  "trace.status": "Span status",
  "trace.status.0": "Unset",
  "trace.status.1": "OK",
  "trace.status.2": "Error",
  "trace.selectSpan": "Inspect span {name}",
  "trace.bar": "{name}: offset {offset} ms; duration {duration} ms",
  "trace.unavailable": "Unavailable",
  "trace.detailsSection": "Selected span details",
  "trace.details": "Selected span, typed attributes, events and links (JSON)",
  "trace.parent": "Focus captured parent span",
  "trace.link": "Focus captured linked span {index}",
  "trace.exportSpan": "Download selected span JSON",
  "trace.useContext": "Use selected span as trace context",
  "trace.services": "All captured services",
  "trace.service": "Service / namespace",
  "trace.spans": "Spans",
  "trace.errors": "Errors",
  "trace.p95": "P95 span (ms)",
  "trace.inclusive": "Sum inclusive (ms)",
  "trace.selfTotal": "Sum known exclusive (ms)",
  "trace.dependencies": "Captured service dependencies",
  "trace.from": "Parent service",
  "trace.to": "Child service",
  "trace.calls": "Parent/child edges",
  "trace.max": "Max child duration (ms)",
  "trace.dependencyHelp":
    "Edges count captured parent/child relationships across services. Links do not create call edges. Child durations include downstream work; these are not network-only timings.",
  "trace.noDependencies": "No captured cross-service parent/child edges.",
  "trace.diagnostics": "Capture diagnostics",
  "trace.diagnosticRow": "Span {index} ({name}): {reason}",
  "trace.diagnostic.missing-parent": "Parent span is absent from this capture.",
  "trace.diagnostic.cycle":
    "Parent relationships form a cycle; exclusive timing is unavailable.",
  "trace.diagnostic.child-outside":
    "Child timing falls outside its parent's observed interval; exclusive calculation clips the overlap.",
  "trace.diagnostic.event-outside":
    "An event timestamp falls outside its span.",
  "trace.diagnostic.missing-link":
    "A linked span is not present in this capture.",
  "trace.diagnostic.dropped-data":
    "OTLP reports dropped attributes, events or links.",
  "trace.budgets": "Latency and capture regression budgets",
  "trace.budget": "Selected trace budget",
  "trace.budgetName": "Trace budget name",
  "trace.budgetService": "Budget service selector",
  "trace.missingService": "Unavailable saved service target",
  "trace.budgetOperation": "Exact operation name (empty = any)",
  "trace.budgetTrace": "Exact trace ID (empty = any)",
  "trace.metric": "Budget metric",
  "trace.metric.elapsed": "Maximum matched elapsed per trace (ms)",
  "trace.metric.duration": "Maximum matched span duration (ms)",
  "trace.metric.self": "Maximum matched exclusive duration (ms)",
  "trace.metric.errors": "Matched explicit error count",
  "trace.metric.diagnostics": "Matched diagnostic count",
  "trace.metric.spans": "Matched span count",
  "trace.budgetMax": "Inclusive maximum (ms or count)",
  "trace.minMatches": "Minimum matched spans (0–1000)",
  "trace.budgetHelp":
    "Selectors combine with AND and match exact values. Durations accept six decimal places of milliseconds (one nanosecond); counts are integers. Elapsed uses the observed window of matching spans separately per trace and takes the maximum. Empty matches fail the minimum coverage requirement by default. Cyclic exclusive timing cannot satisfy an exclusive budget.",
  "trace.addBudget": "Add trace budget",
  "trace.cloneBudget": "Duplicate trace budget",
  "trace.deleteBudget": "Delete trace budget",
  "trace.noBudgets":
    "No budgets yet. Add one to check latency, errors or capture coverage.",
  "trace.run": "Evaluate all trace budgets",
  "trace.completed": "Trace budget checks finished: {passed}/{total} passed.",
  "trace.results": "Trace budget results",
  "trace.resultRow":
    "{name}: {state}; value {value}; maximum {max}; {matches} matched spans; {reason}.",
  "trace.passed": "Passed",
  "trace.failed": "Failed",
  "trace.reason.none": "requirements satisfied",
  "trace.reason.coverage": "insufficient matching spans",
  "trace.reason.unavailable": "exclusive timing unavailable",
  "trace.reason.threshold": "maximum exceeded",
  "trace.report": "Download trace analysis report",
  "trace.viewer": "Download offline HTML waterfall",
  "trace.viewerHelp":
    "The offline viewer includes every span of the selected trace, regardless of current view filters. It has local search, service/error filters and span timing details, without raw IDs, absolute times, attributes, events or status messages. Viewer labels are English.",
  "trace.contextSection": "Trace-context propagation workbench",
  "trace.traceparent": "traceparent header draft (version 00)",
  "trace.tracestate": "tracestate header draft",
  "trace.sampled": "Sample outgoing context",
  "trace.newContext": "Start a new trace context",
  "trace.childContext": "Generate outgoing child context",
  "trace.inspectContext": "Inspect tracing header drafts",
  "trace.contextResult": "Trace-context inspection (JSON)",
  "trace.vendorKey": "Tracestate vendor key",
  "trace.vendorValue": "Tracestate vendor value",
  "trace.updateVendor": "Move vendor entry to front",
  "trace.vendorUpdated":
    "Vendor entry updated; {count} whole rightmost entries removed to fit limits.",
  "trace.contextHelp":
    "Child generation keeps the trace ID, creates a new nonzero span ID and sets the sampled bit from your choice. New traces clear tracestate. Vendor updates move an entry left and truncate whole entries from the right if necessary. No headers are applied to existing API requests. Invalid tracestate does not invalidate a parsed parent, but must be corrected or cleared before child generation.",
  "trace.exportContext": "Download saved trace-context headers",
  "trace.contextUpdated": "Context written to the drafts. Save before export.",
  "trace.contextInspected": "Tracing header drafts inspected.",
  "trace.downloaded": "Download started.",
  "trace.downloadFailed": "Could not start the download.",
  "trace.error.json":
    "Invalid JSON, excessive nesting or nonfinite numeric values. Saved work was retained.",
  "trace.error.limit":
    "Trace input, project or analysis exceeds its displayed size/count limits. Saved work was retained.",
  "trace.error.otlp":
    "Invalid supported OTLP JSON shape. Check resourceSpans/scopeSpans, names, numeric enums and event/link fields.",
  "trace.error.id":
    "Invalid or duplicate span identity. Use nonzero hexadecimal trace/span IDs of 32/16 characters; traceparent requires lowercase.",
  "trace.error.time":
    "Invalid nanosecond timestamp or reversed interval. Use decimal uint64 strings; numeric timestamps must be safe integers.",
  "trace.error.attributes":
    "Invalid typed attribute, duplicate attribute key or ambiguous AnyValue. Keep int64 values as exact decimal strings.",
  "trace.error.project":
    "Invalid trace project or budget edits. Check names, numeric limits, selectors, metric thresholds and unique budget IDs.",
  "trace.error.context":
    "Invalid or unsupported traceparent. This workbench supports exact version-00 headers only.",
  "trace.error.state":
    "Invalid tracestate. Check unique vendor keys, ASCII values, 32-entry and 512-byte limits.",
  "trace.error.crypto": "Secure random ID generation is unavailable or failed.",
  "trace.error.cancelled":
    "Trace import cancelled; late results were discarded.",
} as const;
const ru: Record<keyof typeof en, string> = {
  "trace.title": "Студия распределённых трассировок и задержек",
  "trace.help":
    "Импортируйте OpenTelemetry JSON, изучайте временную диаграмму спанов и зависимости сервисов, события и связи, измеряйте перекрытия и проверяйте бюджеты задержек и ошибок. Работа остаётся в памяти вкладки и не зависит от OpenAPI.",
  "trace.scopeTitle": "Расчёт времени, форматы и содержимое экспорта",
  "trace.scope":
    "Поддерживается ограниченный OTLP/HTTP JSON resourceSpans/scopeSpans, числовые перечисления, типизированные атрибуты, события и связи. ID шестнадцатеричные; наносекунды хранятся точными десятичными строками. Небезопасные числовые timestamp/int64 должны быть строками. Неизвестные поля сохраняются в исходнике и проекте, но не анализируются. Binary Protobuf, Jaeger, живые коллекторы и автоматическая инструментация не реализованы.",
  "trace.timingHelp":
    "Общее время — наблюдаемое окно от минимального начала до максимального конца, а не сумма спанов. Собственное время вычитает объединение пересечений прямых дочерних интервалов; перекрытия считаются один раз. Неполный захват и сдвиги часов ограничивают выводы. У циклических спанов собственное время недоступно. Суммы сервисов могут перекрываться и не равны времени запроса. Ошибка определяется явным OTLP ERROR, а не HTTP-атрибутами. P95 — ближайший ранг.",
  "trace.privacy":
    "Экспорт OTLP, спана, среза и проекта может содержать приватные атрибуты, события, ID, время и сообщения. Отчёты и автономный просмотрщик исключают эти значения; названия сервисов, операций просмотрщика и метаданные бюджетов остаются. Экспорт контекста содержит исходные заголовки. Данные не отправляются коллектору, не добавляются к API-запросам и не сохраняются в браузере.",
  "trace.limits":
    "Лимиты: 1000 спанов, 100 групп ресурсов/областей на контейнер, 64 атрибута в списке, 50 событий/связей на спан, 30 бюджетов и 2 МиБ на OTLP или проект. Вложенность ограничена. Страница показывает 100 спанов. Поддерживается строгая версия traceparent 00, до 32 записей tracestate и 512 ASCII-байтов; будущие версии не распространяются.",
  "trace.demo": "Загрузить пример распределённой трассировки",
  "trace.new": "Новый проект трассировки",
  "trace.import": "Импорт проекта трассировки",
  "trace.export": "Экспорт проекта трассировки",
  "trace.name": "Название проекта трассировки",
  "trace.sourceSection": "Исходник трассировки OpenTelemetry",
  "trace.source": "Черновик исходника OTLP JSON",
  "trace.importOtlp": "Импорт трассировки OTLP JSON",
  "trace.exportOtlp": "Скачать сохранённый OTLP",
  "trace.exportSlice": "Скачать OTLP выбранной трассировки",
  "trace.save": "Сохранить и проанализировать трассировку",
  "trace.discard": "Отменить изменения трассировки",
  "trace.pending":
    "Сохраните или отмените изменения исходника, проекта, контекста и бюджета перед переключением бюджетов, проверкой или экспортом.",
  "trace.loaded": "Проект загружен; предыдущие результаты и фильтры очищены.",
  "trace.sourceLoaded":
    "OTLP загружен в черновик. Сохраните и проанализируйте для применения; сохранённая работа не изменена.",
  "trace.saved":
    "Изменения сохранены и проанализированы; прежние результаты бюджетов очищены.",
  "trace.busy": "Чтение файла трассировки…",
  "trace.cancel": "Отменить импорт трассировки",
  "trace.overview": "Обзор захвата",
  "trace.stats":
    "Спанов: {spans}; трассировок: {traces}; сервисов: {services}; ошибок: {errors}; диагностик: {diagnostics}.",
  "trace.waterfall": "Временная диаграмма трассировки",
  "trace.trace": "ID выбранной трассировки",
  "trace.traceOption": "{index}: {id} (спанов: {count})",
  "trace.summary":
    "Наблюдаемое время: {elapsed} мс; спанов: {spans}; ошибок: {errors}; корневых или отсоединённых: {roots}.",
  "trace.search": "Поиск имён спанов, сервисов, областей и ID",
  "trace.serviceFilter": "Фильтр сервиса диаграммы",
  "trace.allServices": "Все сервисы",
  "trace.errorsOnly": "Показывать только явные ошибки",
  "trace.shown":
    "Показано {shown} из {total} совпадений; страница {page} из {pages}.",
  "trace.previous": "Предыдущая страница спанов",
  "trace.next": "Следующая страница спанов",
  "trace.operation": "Операция / сервис",
  "trace.timeline": "Наблюдаемая временная шкала",
  "trace.duration": "Длительность (мс)",
  "trace.self": "Собственное время (мс)",
  "trace.status": "Статус спана",
  "trace.status.0": "Не задан",
  "trace.status.1": "OK",
  "trace.status.2": "Ошибка",
  "trace.selectSpan": "Проверить спан {name}",
  "trace.bar": "{name}: смещение {offset} мс; длительность {duration} мс",
  "trace.unavailable": "Недоступно",
  "trace.detailsSection": "Детали выбранного спана",
  "trace.details": "Спан, типизированные атрибуты, события и связи (JSON)",
  "trace.parent": "Перейти к захваченному родительскому спану",
  "trace.link": "Перейти к связанному спану {index}",
  "trace.exportSpan": "Скачать JSON выбранного спана",
  "trace.useContext": "Использовать выбранный спан как контекст",
  "trace.services": "Все захваченные сервисы",
  "trace.service": "Сервис / пространство имён",
  "trace.spans": "Спаны",
  "trace.errors": "Ошибки",
  "trace.p95": "P95 спана (мс)",
  "trace.inclusive": "Сумма включённого времени (мс)",
  "trace.selfTotal": "Сумма известного собственного времени (мс)",
  "trace.dependencies": "Захваченные зависимости сервисов",
  "trace.from": "Родительский сервис",
  "trace.to": "Дочерний сервис",
  "trace.calls": "Связи родитель/потомок",
  "trace.max": "Максимальная длительность потомка (мс)",
  "trace.dependencyHelp":
    "Рёбра считают захваченные отношения родитель/потомок между сервисами. Links не создают вызовы. Длительность потомков включает вложенную работу, а не только сеть.",
  "trace.noDependencies":
    "Нет захваченных межсервисных отношений родитель/потомок.",
  "trace.diagnostics": "Диагностика захвата",
  "trace.diagnosticRow": "Спан {index} ({name}): {reason}",
  "trace.diagnostic.missing-parent": "Родительский спан отсутствует в захвате.",
  "trace.diagnostic.cycle":
    "Родительские связи образуют цикл; собственное время недоступно.",
  "trace.diagnostic.child-outside":
    "Время потомка выходит за интервал родителя; для собственного времени используется пересечение.",
  "trace.diagnostic.event-outside": "Время события выходит за интервал спана.",
  "trace.diagnostic.missing-link": "Связанный спан отсутствует в захвате.",
  "trace.diagnostic.dropped-data":
    "OTLP сообщает об отброшенных атрибутах, событиях или связях.",
  "trace.budgets": "Регрессионные бюджеты задержек и захвата",
  "trace.budget": "Выбранный бюджет трассировки",
  "trace.budgetName": "Название бюджета трассировки",
  "trace.budgetService": "Селектор сервиса бюджета",
  "trace.missingService": "Недоступная сохранённая цель сервиса",
  "trace.budgetOperation": "Точное имя операции (пусто = любая)",
  "trace.budgetTrace": "Точный ID трассировки (пусто = любой)",
  "trace.metric": "Метрика бюджета",
  "trace.metric.elapsed": "Максимальное окно совпадений по трассировке (мс)",
  "trace.metric.duration": "Максимальная длительность спана (мс)",
  "trace.metric.self": "Максимальное собственное время (мс)",
  "trace.metric.errors": "Количество явных ошибок",
  "trace.metric.diagnostics": "Количество диагностик",
  "trace.metric.spans": "Количество совпавших спанов",
  "trace.budgetMax": "Включительный максимум (мс или количество)",
  "trace.minMatches": "Минимум совпавших спанов (0–1000)",
  "trace.budgetHelp":
    "Селекторы объединяются через И и совпадают точно. Длительность допускает 6 десятичных знаков миллисекунд (1 нс), количества — целые. Общее время берёт окно совпадений отдельно по каждой трассировке и выбирает максимум. Пустые совпадения по умолчанию не проходят минимум покрытия. Циклические спаны не могут пройти бюджет собственного времени.",
  "trace.addBudget": "Добавить бюджет трассировки",
  "trace.cloneBudget": "Дублировать бюджет трассировки",
  "trace.deleteBudget": "Удалить бюджет трассировки",
  "trace.noBudgets":
    "Бюджетов пока нет. Добавьте проверку задержек, ошибок или покрытия.",
  "trace.run": "Проверить все бюджеты трассировки",
  "trace.completed": "Проверка бюджетов завершена: {passed}/{total} пройдено.",
  "trace.results": "Результаты бюджетов трассировки",
  "trace.resultRow":
    "{name}: {state}; значение {value}; максимум {max}; спанов {matches}; {reason}.",
  "trace.passed": "Пройдено",
  "trace.failed": "Не пройдено",
  "trace.reason.none": "требования выполнены",
  "trace.reason.coverage": "недостаточно совпавших спанов",
  "trace.reason.unavailable": "собственное время недоступно",
  "trace.reason.threshold": "максимум превышен",
  "trace.report": "Скачать отчёт анализа трассировки",
  "trace.viewer": "Скачать автономную HTML-диаграмму",
  "trace.viewerHelp":
    "Автономный просмотрщик включает все спаны выбранной трассировки независимо от фильтров. Доступны локальный поиск, фильтры сервисов/ошибок и детали времени без исходных ID, абсолютного времени, атрибутов, событий и сообщений. Подписи просмотрщика на английском.",
  "trace.contextSection": "Мастерская распространения контекста",
  "trace.traceparent": "Черновик заголовка traceparent (версия 00)",
  "trace.tracestate": "Черновик заголовка tracestate",
  "trace.sampled": "Включить выборку исходящего контекста",
  "trace.newContext": "Начать новый контекст трассировки",
  "trace.childContext": "Создать исходящий дочерний контекст",
  "trace.inspectContext": "Проверить черновики заголовков",
  "trace.contextResult": "Проверка контекста трассировки (JSON)",
  "trace.vendorKey": "Ключ провайдера tracestate",
  "trace.vendorValue": "Значение провайдера tracestate",
  "trace.updateVendor": "Переместить запись провайдера в начало",
  "trace.vendorUpdated":
    "Запись обновлена; для соблюдения лимитов удалено правых записей: {count}.",
  "trace.contextHelp":
    "Дочерний контекст сохраняет ID трассировки, создаёт новый ненулевой ID спана и задаёт sampled по вашему выбору. Новая трассировка очищает tracestate. Обновление провайдера перемещает запись влево и при необходимости удаляет целые правые записи. Заголовки не применяются к API-запросам. Некорректный tracestate не отменяет разобранный parent, но его нужно исправить или очистить перед генерацией потомка.",
  "trace.exportContext": "Скачать сохранённые заголовки контекста",
  "trace.contextUpdated":
    "Контекст записан в черновики. Сохраните перед экспортом.",
  "trace.contextInspected": "Черновики заголовков проверены.",
  "trace.downloaded": "Скачивание начато.",
  "trace.downloadFailed": "Не удалось начать скачивание.",
  "trace.error.json":
    "Некорректный JSON, чрезмерная вложенность или бесконечные числа. Сохранённая работа не изменена.",
  "trace.error.limit":
    "Превышены указанные ограничения размера или количества. Сохранённая работа не изменена.",
  "trace.error.otlp":
    "Некорректная структура OTLP JSON. Проверьте resourceSpans/scopeSpans, названия, числовые перечисления, события и связи.",
  "trace.error.id":
    "Некорректный или дублирующийся ID спана. Используйте ненулевые hex ID длиной 32/16 символов; traceparent требует нижний регистр.",
  "trace.error.time":
    "Некорректное время или обратный интервал. Используйте десятичные строки uint64; числовое время должно быть безопасным целым.",
  "trace.error.attributes":
    "Некорректный атрибут, повтор ключа или неоднозначный AnyValue. Храните int64 точными десятичными строками.",
  "trace.error.project":
    "Некорректный проект или бюджет. Проверьте названия, пределы, селекторы, пороги и уникальные ID бюджетов.",
  "trace.error.context":
    "Некорректный или неподдерживаемый traceparent. Поддерживается только точная версия 00.",
  "trace.error.state":
    "Некорректный tracestate. Проверьте уникальность ключей, ASCII-значения, 32 записи и 512 байтов.",
  "trace.error.crypto":
    "Генерация криптографически случайных ID недоступна или не выполнена.",
  "trace.error.cancelled":
    "Импорт трассировки отменён; запоздавшие результаты отброшены.",
};
export const traceTranslations = { en, ru };
