const en = {
  "journey.title": "API journey and state-machine studio",
  "journey.help":
    "Model legal action/status sequences, inspect a state graph, check captured traces, generate coverage paths and compare model versions with shortest counterexamples. Everything runs offline; existing REST execution is unchanged.",
  "journey.guide": "Sequential contract semantics, limits and exports",
  "journey.semantics":
    "An event is an exact action label plus an integer HTTP status. Enabled transitions must be deterministic for each state/action/status. A trace is accepted if every event matches and its final state can finish; a legal prefix ending elsewhere is incomplete. The first rejected event stops trace evaluation. States that can finish may still have outgoing transitions. Broken references and overlaps remain editable but block execution and compatibility proofs.",
  "journey.proofHelp":
    "Compatibility checks preserve legal prefixes and the ability to finish, in both directions. Breadth-first product-state search returns a shortest lost-event or lost-completion sequence. Names and state IDs do not define behavior. Exhausted pair budgets mean inconclusive, never compatible. These are sequential finite-state contracts, without payload, authentication, timing or concurrent-causality validation.",
  "journey.privacy":
    "Projects, coverage suites, SVG diagrams and monitor exports contain action labels, which may include private routes. Reports omit action values while retaining your chosen names/IDs, state/transition IDs, statuses, outcomes and coverage counts. Imported runtime/results are ignored. Work stays in tab memory; export before reloading. No requests or storage writes are made by this studio.",
  "journey.limits":
    "Limits: 5 models, 40 states and 120 transitions per model, 20 exact statuses per transition, 30 saved traces, 200 events per trace, 2 MiB projects and 16 MiB reports/suites. Coverage generation produces up to 500 cases. Comparison explores up to 2,000 state pairs per direction. HAR inputs are limited to 5 MiB and 5,000 entries.",
  "journey.demo": "Load order-journey demo",
  "journey.new": "New journey project",
  "journey.import": "Import journey project",
  "journey.export": "Export journey project",
  "journey.name": "Journey project name",
  "journey.save": "Save journey edits",
  "journey.discard": "Discard journey edits",
  "journey.pending":
    "Save or discard edits before switching saved selections, running, importing or exporting. The graph and analysis describe the saved model.",
  "journey.modelSection": "Journey models and state graph",
  "journey.model": "Selected journey model",
  "journey.modelName": "Journey model name",
  "journey.addModel": "Add journey model",
  "journey.cloneModel": "Duplicate journey model",
  "journey.deleteModel": "Delete journey model and its expectations",
  "journey.initial": "Initial journey state",
  "journey.initialMarker": "Initial",
  "journey.state": "Selected journey state",
  "journey.stateName": "Journey state name",
  "journey.terminal": "A trace may finish in this state",
  "journey.addState": "Add journey state",
  "journey.deleteState": "Delete state, retaining transition references",
  "journey.stateHelp":
    "Deleting a state retains its transition and initial references for review. Choose valid replacements to repair the graph. At least one state is retained.",
  "journey.graph": "Interactive saved journey graph",
  "journey.legend":
    "Green marks the initial state. Double borders mark states where a trace may finish. Dashed edges are disabled. Select a state or transition with a click, Enter or Space.",
  "journey.selectState": "Select journey state {name}",
  "journey.selectTransition": "Select journey transition {name}",
  "journey.missingState": "Missing state: {id}",
  "journey.analysis": "Saved graph analysis",
  "journey.valid": "Executable graph",
  "journey.invalid": "Graph needs repair",
  "journey.reachable":
    "Reachable states: {reachable}/{total}; reachable transitions: {transitions}.",
  "journey.findings": "Graph findings: {total}; showing up to 100.",
  "journey.diagnostic.initial": "The initial state is missing",
  "journey.diagnostic.dangling-from": "Transition source state is missing",
  "journey.diagnostic.dangling-to": "Transition target state is missing",
  "journey.diagnostic.overlap":
    "Enabled transitions overlap for an action/status",
  "journey.diagnostic.unreachable":
    "State cannot be reached from the initial state",
  "journey.diagnostic.dead-end":
    "Reachable nonfinishing state has no outgoing transition",
  "journey.diagnostic.no-terminal": "No state allows a trace to finish",
  "journey.transitionSection": "Action and response transitions",
  "journey.transition": "Selected journey transition",
  "journey.transitionName": "Journey transition name",
  "journey.enabled": "Enable journey transition",
  "journey.from": "Transition source state",
  "journey.to": "Transition target state",
  "journey.action": "Exact action label",
  "journey.statuses": "Exact HTTP statuses (comma-separated)",
  "journey.addTransition": "Add disabled transition",
  "journey.cloneTransition": "Duplicate transition as disabled",
  "journey.deleteTransition": "Delete journey transition",
  "journey.noTransitions":
    "No transitions. Events will be rejected until a matching transition is enabled.",
  "journey.loadActions": "Read OpenAPI operation labels",
  "journey.catalog": "Use an OpenAPI action label",
  "journey.catalogPlaceholder": "Choose an operation label",
  "journey.catalogHelp":
    "OpenAPI supplies METHOD /path template labels only. State transitions, status behavior and workflow order remain explicit; the editor is never modified.",
  "journey.traceSection": "Observed traces and regression expectations",
  "journey.trace": "Selected journey trace",
  "journey.traceName": "Journey trace name",
  "journey.steps": "Observed action/status events (JSON array)",
  "journey.expect": "Expected trace outcomes by model ID (JSON object)",
  "journey.traceHelp":
    "Each event is {action,status}. Expectations map model IDs to accepted, incomplete or rejected. Missing entries are unchecked; invalid graphs always fail. Trace evaluation stops at the first rejected event and leaves later events unevaluated.",
  "journey.addTrace": "Add journey trace",
  "journey.cloneTrace": "Duplicate journey trace",
  "journey.deleteTrace": "Delete journey trace",
  "journey.noTraces":
    "No saved traces. Add one, import HAR, or save a coverage path or counterexample.",
  "journey.importHar": "Import HAR as a new journey trace",
  "journey.harHelp":
    "Import uses capture entry order without inferring concurrency. Exact action paths take priority over single-segment {parameter} templates in the selected model. Unknown actions are retained as METHOD /actual/path so violations remain visible. Ambiguous templates reject the import. Origins, queries, credentials, headers, bodies and timings are discarded; invalid/no-status entries are counted as skipped. Review the sequence before running.",
  "journey.harLoaded":
    "Imported {count} journey events; skipped invalid entries: {skipped}.",
  "journey.runTrace": "Check selected trace against all models",
  "journey.runAll": "Run all journey traces and models",
  "journey.busy": "Working on journey operation…",
  "journey.progress": "Trace checks completed: {done}/{total}.",
  "journey.cancel": "Cancel journey operation",
  "journey.results": "Journey regression results",
  "journey.result": "Selected journey trace result",
  "journey.search": "Search journey regression results",
  "journey.modelTrace": "Model / trace",
  "journey.outcome": "Trace outcome",
  "journey.expected": "Expected outcome",
  "journey.finalState": "Final state",
  "journey.checked": "Checked",
  "journey.unchecked": "Unchecked",
  "journey.pass": "Pass",
  "journey.fail": "Fail",
  "journey.outcome.accepted": "Accepted completion",
  "journey.outcome.incomplete": "Valid incomplete prefix",
  "journey.outcome.rejected": "Rejected sequence",
  "journey.outcome.invalid": "Invalid graph",
  "journey.inspection": "Selected trace and conformance details (JSON)",
  "journey.compareSection":
    "Behavioral compatibility and shortest counterexamples",
  "journey.baseline": "Baseline journey model",
  "journey.candidate": "Candidate journey model",
  "journey.maxPairs": "Maximum explored state pairs per direction (1–2000)",
  "journey.compare": "Compare journey behavior",
  "journey.comparison": "Behavioral comparison",
  "journey.classification.equivalent": "Equivalent sequential behavior",
  "journey.classification.expanded":
    "Candidate adds behavior and preserves baseline",
  "journey.classification.restricted": "Candidate removes behavior",
  "journey.classification.changed": "Behavior changes in both directions",
  "journey.classification.inconclusive":
    "Inconclusive: search budget exhausted",
  "journey.classification.invalid": "Comparison blocked by an invalid graph",
  "journey.forward": "Baseline behavior retained by candidate",
  "journey.reverse": "Candidate behavior retained by baseline",
  "journey.inclusion.included": "All reachable behavior retained",
  "journey.inclusion.counterexample": "Shortest counterexample found",
  "journey.inclusion.bounded": "Search budget exhausted",
  "journey.inclusion.invalid": "Invalid graph",
  "journey.reason.missing-transition":
    "A previously legal event has no matching transition",
  "journey.reason.completion-lost":
    "A previously complete sequence can no longer finish",
  "journey.pairs": "State pairs checked: {count}.",
  "journey.witness": "Shortest counterexample events (JSON)",
  "journey.witnessLength":
    "Counterexample length: {count} events; saved traces allow up to 200.",
  "journey.saveForward": "Save baseline counterexample as regression trace",
  "journey.saveReverse": "Save candidate counterexample as regression trace",
  "journey.suiteSection": "Generate shortest coverage paths",
  "journey.suiteMode": "Coverage objective",
  "journey.mode.states": "Reachable states",
  "journey.mode.transitions": "Reachable transitions",
  "journey.mode.events": "Reachable transition/status pairs",
  "journey.maxCases": "Maximum generated cases (1–500)",
  "journey.generate": "Generate journey coverage suite",
  "journey.suiteHelp":
    "Each case uses a shortest route to a coverage objective and records whether it finishes or remains a valid prefix. Only reachable enabled behavior is counted. A case cap may produce partial coverage. Saved cases are independent copies; expectations for other models remain unchecked.",
  "journey.coverage":
    "Coverage objectives: {covered}/{total}; generated cases: {cases}.",
  "journey.complete": "Coverage complete",
  "journey.partial": "Partial coverage",
  "journey.generatedCase": "Selected generated journey case",
  "journey.generatedInspection": "Generated coverage path (JSON)",
  "journey.saveCase": "Save generated path as regression trace",
  "journey.exportSuite": "Download journey coverage suite",
  "journey.includeDetails": "Include per-event decisions in report",
  "journey.report": "Download journey analysis report",
  "journey.exportSvg": "Download journey graph SVG",
  "journey.exportMonitor": "Download standalone journey monitor",
  "journey.monitorHelp":
    "Create one monitor per sequential workflow. observe({action,status}) records an already completed event; it sends no requests and cannot undo side effects. A rejected observation keeps the current state, so later observations may recover. reset() starts again. snapshot() returns copies of state and the latest 200 observations, with a dropped count. Runtime journals include action labels; identity, concurrency, persistence and authentication remain application responsibilities.",
  "journey.saved": "Journey edits saved.",
  "journey.monitorCounts":
    "snapshot.rejected counts all rejected observations since reset, even after old journal entries are dropped. canFinish describes the last known state, not the validity of the whole observed history.",
  "journey.loaded": "Journey project loaded.",
  "journey.traceAdded": "Journey regression trace saved.",
  "journey.finished":
    "Journey checks passed: {passed}/{total}; checked: {checked}; unchecked: {unchecked}.",
  "journey.cancelled":
    "Operation cancelled; partial results were not published.",
  "journey.downloaded": "Journey file downloaded.",
  "journey.error.json": "Use valid bounded JSON.",
  "journey.error.project":
    "Use valid model/state/transition IDs, status lists and expectation IDs.",
  "journey.error.trace":
    "Use bounded action/status events and valid trace outcomes.",
  "journey.error.limit":
    "The project, trace, coverage request or export exceeds the documented limits.",
  "journey.error.graph":
    "Repair missing references and overlapping enabled transitions before generating or exporting a monitor.",
  "journey.error.cancelled": "The journey operation was cancelled.",
  "journey.error.har":
    "Use a HAR with HTTP responses and unambiguous action templates. Review capture order and templates.",
  "journey.error.schema":
    "The editor must contain a valid OpenAPI document with operations.",
  "journey.error.download": "The browser blocked the download. Try again.",
} as const;
const ru: Record<keyof typeof en, string> = {
  "journey.title": "Студия API-сценариев и автоматов состояний",
  "journey.help":
    "Моделируйте допустимые последовательности действий и статусов, изучайте граф, проверяйте записи, создавайте пути покрытия и сравнивайте версии с кратчайшими контрпримерами. Всё работает локально; REST-запросы не меняются.",
  "journey.guide":
    "Семантика последовательных контрактов, ограничения и экспорт",
  "journey.semantics":
    "Событие — точная метка действия и целый HTTP-статус. Включённые переходы должны быть однозначны для состояния, действия и статуса. Запись принята, если все события совпали и конечное состояние допускает завершение; иначе допустимый префикс считается незавершённым. Проверка останавливается на первом отказе. Завершающие состояния могут иметь исходящие переходы. Сломанные ссылки и пересечения сохраняются для правки, но блокируют выполнение и доказательства совместимости.",
  "journey.proofHelp":
    "Совместимость сохраняет допустимые префиксы и возможность завершения в обоих направлениях. Поиск в ширину по парам состояний находит кратчайшую потерянную последовательность или завершение. Имена и ID состояний не определяют поведение. Исчерпание бюджета означает неопределённый результат. Это последовательные конечные модели без проверки данных, аутентификации, времени и причинности параллельных запросов.",
  "journey.privacy":
    "Проекты, наборы покрытия, SVG и мониторы содержат метки действий, включая частные маршруты. Отчёты исключают действия, сохраняя выбранные имена/ID, состояния, переходы, статусы, исходы и счётчики. Импортированные результаты и состояние игнорируются. Работа хранится в памяти вкладки; экспортируйте её перед перезагрузкой. Студия не отправляет запросы и не пишет в хранилище.",
  "journey.limits":
    "Лимиты: 5 моделей, 40 состояний и 120 переходов на модель, 20 статусов на переход, 30 сохранённых записей, 200 событий на запись, 2 МиБ на проект и 16 МиБ на отчёт/набор. Генерация — до 500 тестов. Сравнение — до 2000 пар состояний на направление. HAR — до 5 МиБ и 5000 элементов.",
  "journey.demo": "Загрузить пример жизненного цикла заказа",
  "journey.new": "Новый проект API-сценариев",
  "journey.import": "Импорт проекта API-сценариев",
  "journey.export": "Экспорт проекта API-сценариев",
  "journey.name": "Название проекта API-сценариев",
  "journey.save": "Сохранить изменения сценария",
  "journey.discard": "Отменить изменения сценария",
  "journey.pending":
    "Сохраните или отмените правки перед переключением, запуском, импортом или экспортом. Граф и анализ описывают сохранённую модель.",
  "journey.modelSection": "Модели сценариев и граф состояний",
  "journey.model": "Выбранная модель сценария",
  "journey.modelName": "Название модели сценария",
  "journey.addModel": "Добавить модель сценария",
  "journey.cloneModel": "Дублировать модель сценария",
  "journey.deleteModel": "Удалить модель и её ожидания",
  "journey.initial": "Начальное состояние сценария",
  "journey.initialMarker": "Начало",
  "journey.state": "Выбранное состояние сценария",
  "journey.stateName": "Название состояния сценария",
  "journey.terminal": "В этом состоянии запись может завершиться",
  "journey.addState": "Добавить состояние сценария",
  "journey.deleteState": "Удалить состояние, сохранив ссылки переходов",
  "journey.stateHelp":
    "Удаление состояния сохраняет ссылки переходов и начального состояния для проверки. Выберите корректные замены. Хотя бы одно состояние сохраняется.",
  "journey.graph": "Интерактивный граф сохранённого сценария",
  "journey.legend":
    "Зелёный цвет — начало. Двойная рамка — возможность завершения. Пунктир — отключённый переход. Выбирайте элементы щелчком, Enter или пробелом.",
  "journey.selectState": "Выбрать состояние сценария {name}",
  "journey.selectTransition": "Выбрать переход сценария {name}",
  "journey.missingState": "Отсутствует состояние: {id}",
  "journey.analysis": "Анализ сохранённого графа",
  "journey.valid": "Граф допускает выполнение",
  "journey.invalid": "Граф требует исправления",
  "journey.reachable":
    "Достижимых состояний: {reachable}/{total}; переходов: {transitions}.",
  "journey.findings": "Замечаний графа: {total}; показано не более 100.",
  "journey.diagnostic.initial": "Начальное состояние отсутствует",
  "journey.diagnostic.dangling-from": "Исходное состояние перехода отсутствует",
  "journey.diagnostic.dangling-to": "Целевое состояние перехода отсутствует",
  "journey.diagnostic.overlap":
    "Включённые переходы пересекаются по действию и статусу",
  "journey.diagnostic.unreachable": "Состояние недостижимо из начального",
  "journey.diagnostic.dead-end":
    "Достижимое незавершающее состояние не имеет переходов",
  "journey.diagnostic.no-terminal": "Нет состояния, допускающего завершение",
  "journey.transitionSection": "Переходы действий и ответов",
  "journey.transition": "Выбранный переход сценария",
  "journey.transitionName": "Название перехода сценария",
  "journey.enabled": "Включить переход сценария",
  "journey.from": "Исходное состояние перехода",
  "journey.to": "Целевое состояние перехода",
  "journey.action": "Точная метка действия",
  "journey.statuses": "Точные HTTP-статусы (через запятую)",
  "journey.addTransition": "Добавить отключённый переход",
  "journey.cloneTransition": "Дублировать переход отключённым",
  "journey.deleteTransition": "Удалить переход сценария",
  "journey.noTransitions":
    "Переходов нет. События отклоняются, пока не включён совпадающий переход.",
  "journey.loadActions": "Прочитать метки операций OpenAPI",
  "journey.catalog": "Выбрать действие из OpenAPI",
  "journey.catalogPlaceholder": "Выберите метку операции",
  "journey.catalogHelp":
    "OpenAPI предоставляет только метки METHOD /шаблон пути. Переходы состояний, статусы и порядок задаются явно; редактор не меняется.",
  "journey.traceSection": "Записи событий и ожидаемые результаты",
  "journey.trace": "Выбранная запись сценария",
  "journey.traceName": "Название записи сценария",
  "journey.steps": "События действий и статусов (массив JSON)",
  "journey.expect": "Ожидаемые исходы по ID моделей (объект JSON)",
  "journey.traceHelp":
    "Событие содержит {action,status}. Ожидания задают accepted, incomplete или rejected по ID модели. Отсутствующие ожидания не проверяются; неверный граф всегда даёт ошибку. Проверка заканчивается на первом отказе, последующие события не оцениваются.",
  "journey.addTrace": "Добавить запись сценария",
  "journey.cloneTrace": "Дублировать запись сценария",
  "journey.deleteTrace": "Удалить запись сценария",
  "journey.noTraces":
    "Записей нет. Добавьте запись, импортируйте HAR или сохраните путь покрытия либо контрпример.",
  "journey.importHar": "Импорт HAR в новую запись сценария",
  "journey.harHelp":
    "Сохраняется порядок элементов HAR без вывода о параллельности. Точные пути важнее односегментных шаблонов {parameter} выбранной модели. Неизвестные действия сохраняются как METHOD /фактический/путь, чтобы нарушения оставались видны. Неоднозначные шаблоны блокируют импорт. Домены, запросы URL, учётные данные, заголовки, тела и время отбрасываются; неверные элементы учитываются как пропущенные. Проверьте последовательность перед запуском.",
  "journey.harLoaded":
    "Импортировано событий: {count}; пропущено неверных элементов: {skipped}.",
  "journey.runTrace": "Проверить выбранную запись по всем моделям",
  "journey.runAll": "Запустить все записи и модели сценариев",
  "journey.busy": "Выполняется операция сценария…",
  "journey.progress": "Проверено записей: {done}/{total}.",
  "journey.cancel": "Отменить операцию сценария",
  "journey.results": "Результаты проверок сценариев",
  "journey.result": "Выбранный результат записи сценария",
  "journey.search": "Поиск результатов сценариев",
  "journey.modelTrace": "Модель / запись",
  "journey.outcome": "Исход записи",
  "journey.expected": "Ожидаемый исход",
  "journey.finalState": "Конечное состояние",
  "journey.checked": "Проверено",
  "journey.unchecked": "Без ожидания",
  "journey.pass": "Успех",
  "journey.fail": "Ошибка",
  "journey.outcome.accepted": "Принятое завершение",
  "journey.outcome.incomplete": "Допустимый незавершённый префикс",
  "journey.outcome.rejected": "Отклонённая последовательность",
  "journey.outcome.invalid": "Неверный граф",
  "journey.inspection": "Выбранная запись и результаты соответствия (JSON)",
  "journey.compareSection":
    "Поведенческая совместимость и кратчайшие контрпримеры",
  "journey.baseline": "Базовая модель сценария",
  "journey.candidate": "Сравниваемая модель сценария",
  "journey.maxPairs": "Максимум проверяемых пар на направление (1–2000)",
  "journey.compare": "Сравнить поведение сценариев",
  "journey.comparison": "Сравнение поведения",
  "journey.classification.equivalent":
    "Эквивалентное последовательное поведение",
  "journey.classification.expanded":
    "Расширение с сохранением базового поведения",
  "journey.classification.restricted": "Сравниваемая модель удаляет поведение",
  "journey.classification.changed": "Изменения в обоих направлениях",
  "journey.classification.inconclusive":
    "Результат неопределён: исчерпан бюджет",
  "journey.classification.invalid": "Сравнение заблокировано неверным графом",
  "journey.forward": "Сохранение базового поведения в новой модели",
  "journey.reverse": "Сохранение нового поведения в базовой модели",
  "journey.inclusion.included": "Всё достижимое поведение сохранено",
  "journey.inclusion.counterexample": "Найден кратчайший контрпример",
  "journey.inclusion.bounded": "Исчерпан бюджет поиска",
  "journey.inclusion.invalid": "Неверный граф",
  "journey.reason.missing-transition":
    "Допустимое ранее событие больше не имеет перехода",
  "journey.reason.completion-lost":
    "Завершённая ранее последовательность больше не может завершиться",
  "journey.pairs": "Проверено пар состояний: {count}.",
  "journey.witness": "События кратчайшего контрпримера (JSON)",
  "journey.witnessLength":
    "Длина контрпримера: {count} событий; сохранённая запись допускает до 200.",
  "journey.saveForward": "Сохранить базовый контрпример как тест",
  "journey.saveReverse": "Сохранить новый контрпример как тест",
  "journey.suiteSection": "Генерация кратчайших путей покрытия",
  "journey.suiteMode": "Цель покрытия",
  "journey.mode.states": "Достижимые состояния",
  "journey.mode.transitions": "Достижимые переходы",
  "journey.mode.events": "Достижимые пары переход/статус",
  "journey.maxCases": "Максимум созданных тестов (1–500)",
  "journey.generate": "Создать набор покрытия сценария",
  "journey.suiteHelp":
    "Каждый тест использует кратчайший путь к цели и отмечает завершение либо допустимый префикс. Учитывается только достижимое включённое поведение. Лимит тестов может дать частичное покрытие. Сохранённые тесты независимы; ожидания других моделей остаются непроверенными.",
  "journey.coverage":
    "Целей покрыто: {covered}/{total}; тестов создано: {cases}.",
  "journey.complete": "Полное покрытие",
  "journey.partial": "Частичное покрытие",
  "journey.generatedCase": "Выбранный созданный тест сценария",
  "journey.generatedInspection": "Созданный путь покрытия (JSON)",
  "journey.saveCase": "Сохранить созданный путь как тест",
  "journey.exportSuite": "Скачать набор покрытия сценария",
  "journey.includeDetails": "Включить решения по событиям в отчёт",
  "journey.report": "Скачать отчёт анализа сценариев",
  "journey.exportSvg": "Скачать граф сценария SVG",
  "journey.exportMonitor": "Скачать автономный монитор сценария",
  "journey.monitorHelp":
    "Создавайте отдельный монитор на последовательный процесс. observe({action,status}) записывает уже завершённое событие; запросы не отправляются, эффекты не отменяются. Отказ сохраняет текущее состояние, последующие события могут продолжить работу. reset() начинает заново. snapshot() возвращает копии состояния и последних 200 наблюдений со счётчиком отброшенных. Журнал содержит действия; идентификация, параллельность, хранение и аутентификация остаются задачами приложения.",
  "journey.saved": "Изменения сценария сохранены.",
  "journey.monitorCounts":
    "snapshot.rejected считает все отказы после reset, даже если старые записи журнала отброшены. canFinish описывает последнее известное состояние, а не корректность всей наблюдавшейся истории.",
  "journey.loaded": "Проект сценариев загружен.",
  "journey.traceAdded": "Проверочная запись сценария сохранена.",
  "journey.finished":
    "Успешных проверок сценариев: {passed}/{total}; с ожиданиями: {checked}; без ожиданий: {unchecked}.",
  "journey.cancelled":
    "Операция отменена; частичные результаты не опубликованы.",
  "journey.downloaded": "Файл сценария скачан.",
  "journey.error.json": "Используйте корректный ограниченный JSON.",
  "journey.error.project":
    "Укажите корректные ID моделей, состояний, переходов, списки статусов и ожидания.",
  "journey.error.trace":
    "Используйте ограниченные события действий/статусов и корректные исходы записей.",
  "journey.error.limit":
    "Превышены ограничения проекта, записи, покрытия или экспорта.",
  "journey.error.graph":
    "Исправьте ссылки и пересекающиеся включённые переходы перед генерацией или экспортом монитора.",
  "journey.error.cancelled": "Операция сценария отменена.",
  "journey.error.har":
    "Используйте HAR с HTTP-ответами и однозначными шаблонами действий. Проверьте порядок и шаблоны.",
  "journey.error.schema":
    "Редактор должен содержать корректный OpenAPI с операциями.",
  "journey.error.download":
    "Браузер заблокировал скачивание. Повторите попытку.",
};
export const journeyTranslations = { en, ru };
