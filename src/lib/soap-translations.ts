export const soapTranslations = {
  en: {
    "soap.title": "SOAP contract studio",
    "soap.help":
      "Explore WSDL 1.1 document/literal services, generate SOAP 1.1/1.2 XML templates, inspect messages and faults, and keep reusable response checks. This studio is independent of the OpenAPI editor. Work stays in tab memory.",
    "soap.scope":
      "Uses inline XML Schema elements/types and local qualified references. Templates are examples, not XSD certification. RPC/encoded bindings, declared SOAP binding headers, WSDL 2, attachments, WS-Security automation, and unresolved external definitions are unsupported. Imports/includes are never fetched.",
    "soap.privacy":
      "Projects and XML downloads contain your WSDL, URLs, messages, and assertion values; SOAP XML headers may contain secrets. HTTP session headers are excluded. Reports omit message values, endpoint URLs, fault details, and assertion literals, but retain case names and operation IDs. Review exports before sharing.",
    "soap.limits":
      "Limits: 512 KiB per XML document, 10,000 elements, depth 48, 100 operations, 20 response cases, 20 checks per case, a 2 MiB project, and a 30-second live deadline. The envelope inspector expects one document payload per Body.",
    "soap.demo": "Load SOAP customer demo",
    "soap.new": "New SOAP workspace",
    "soap.import": "Import SOAP project",
    "soap.export": "Export SOAP project",
    "soap.importWsdl": "Import WSDL file into draft",
    "soap.wsdl": "WSDL 1.1 contract draft",
    "soap.create": "Create SOAP project from WSDL (replaces studio work)",
    "soap.discard": "Discard pending SOAP edits",
    "soap.pending":
      "Save or discard pending edits before switching, running, importing, or exporting.",
    "soap.projectName": "SOAP project name",
    "soap.namespaces": "Assertion namespace prefixes (JSON object)",
    "soap.saveSettings": "Save SOAP project settings",
    "soap.operation": "SOAP operation",
    "soap.inventory": "SOAP operation inventory",
    "soap.operationDetails":
      "{service} / {port} · SOAP {version} · action: {action}",
    "soap.elements": "Inline global elements: {count}",
    "soap.external":
      "{count} external imports/includes remain unresolved and are not fetched.",
    "soap.unsupported":
      "{count} operations need unsupported or unresolved binding definitions.",
    "soap.selectedUnsupported":
      "This operation cannot generate or send a document/literal request: {reason}",
    "soap.url": "SOAP endpoint URL",
    "soap.action": "SOAP action",
    "soap.timeout": "SOAP request timeout, ms (100–30000)",
    "soap.request": "SOAP request envelope XML",
    "soap.optional": "Include optional template fields",
    "soap.generate": "Generate SOAP request template",
    "soap.saveRequest": "Save SOAP request draft",
    "soap.validate": "Check SOAP request envelope",
    "soap.valid":
      "SOAP version and request payload element match the selected operation. XSD content is not fully validated.",
    "soap.downloadRequest": "Download SOAP request XML",
    "soap.downloadCurl": "Download SOAP cURL command",
    "soap.headers": "SOAP session-only HTTP headers (JSON object)",
    "soap.liveHelp":
      "Send explicitly performs a POST and may change the remote service. Browser CORS must allow the endpoint and headers. Cookies and redirects are disabled. SOAP 1.1 sends quoted SOAPAction with text/xml; SOAP 1.2 uses application/soap+xml with an action parameter. The studio controls these headers. UTF-8 responses, including HTTP error faults, remain available for inspection.",
    "soap.send": "Send live SOAP request",
    "soap.cancel": "Cancel SOAP task",
    "soap.busy": "SOAP task in progress…",
    "soap.exchange": "Live response: HTTP {status} · {bytes} bytes · {ms} ms",
    "soap.capture": "Save live SOAP response as case",
    "soap.captured": "Live response saved as a regression case.",
    "soap.cases": "SOAP response regression cases",
    "soap.case": "Selected SOAP response case",
    "soap.noCases":
      "No saved response cases. Add a case or record a live response.",
    "soap.addCase": "Add SOAP response case",
    "soap.deleteCase": "Delete SOAP response case",
    "soap.caseName": "SOAP case name",
    "soap.caseOperation": "SOAP case operation",
    "soap.caseStatus": "Fixture HTTP status (100–599)",
    "soap.caseExpected": "Expected SOAP response outcome",
    "soap.outcome.success": "Success payload",
    "soap.outcome.fault": "SOAP fault",
    "soap.outcome.invalid": "Invalid XML / SOAP envelope",
    "soap.caseResponse": "SOAP response fixture XML",
    "soap.rules": "SOAP response checks (JSON array)",
    "soap.rulesHelp":
      "Paths start at the payload element, for example /c:GetCustomerResponse/c:customer/c:id. Bind c to the namespace URI above; unprefixed names mean no namespace. Child steps, [1]-based sibling indexes, and a final /@attribute are supported. Operators: exists, absent, equals, contains, count. Equality/contains checks require a match and check every matched value. Invalid-envelope cases must have no path checks.",
    "soap.ruleExample":
      'Example: [{"name":"ID","path":"/c:GetCustomerResponse/c:customer/c:id","operator":"equals","expected":"0","trim":true}]',
    "soap.saveCase": "Save SOAP response case",
    "soap.replay": "Check selected SOAP response case",
    "soap.runAll": "Run all SOAP response cases",
    "soap.caseHelp":
      "Offline checks compare envelope version, expected success/fault/invalid outcome, documented response wrapper, and path assertions. Successful payloads also require HTTP 2xx. Faults can use HTTP errors. These checks do not execute server logic or fully validate XSD types.",
    "soap.results": "SOAP regression results",
    "soap.progress":
      "Checked {count}/{total} cases: {passed} passed, {failed} failed.",
    "soap.passed": "Passed",
    "soap.failed": "Failed",
    "soap.result":
      "{name}: {result} · {outcome} · HTTP {status} · {checks} path checks",
    "soap.resultChecks":
      "Outcome: {outcome} · response wrapper: {wrapper} · HTTP: {http} · path checks passed: {passed}/{total}",
    "soap.report": "Download SOAP regression report",
    "soap.inspector": "SOAP message inspector",
    "soap.inspectedXml": "Inspected response XML (first 16000 characters)",
    "soap.tree": "Namespace-aware SOAP payload tree (first 16000 characters)",
    "soap.fault": "SOAP fault details (first 16000 characters)",
    "soap.inspectedVersion": "Inspected SOAP version: {version}",
    "soap.inspectCase": "Inspect draft response XML",
    "soap.downloadResponse": "Download inspected SOAP XML",
    "soap.copyResponse": "Copy inspected SOAP XML",
    "soap.saved": "SOAP changes saved.",
    "soap.imported": "SOAP project imported.",
    "soap.downloaded": "SOAP download started.",
    "soap.copied": "SOAP XML copied.",
    "soap.downloadError": "Could not start the SOAP download.",
    "soap.copyError": "Could not copy the SOAP XML.",
    "soap.error.xml":
      "Malformed XML, unbound prefix, unsupported processing instruction, or invalid UTF-8 response.",
    "soap.error.limit":
      "An XML, nesting, count, project, or request deadline setting exceeds the supported limits.",
    "soap.error.doctype": "DTD and entity declarations are not allowed.",
    "soap.error.wsdl":
      "Use a WSDL 1.1 definitions document with unique local names.",
    "soap.error.reference":
      "A namespace prefix, message, port type, element, type, or saved operation reference cannot be resolved locally.",
    "soap.error.unsupported":
      "This contract uses an unsupported SOAP binding or message style.",
    "soap.error.schema":
      "This XML Schema structure cannot generate a complete template. Edit the XML manually; examples are not XSD certification.",
    "soap.error.recursive":
      "A required recursive type prevents a finite XML example. Omit optional recursion or edit the XML manually.",
    "soap.error.envelope":
      "Expected a SOAP 1.1 or 1.2 Envelope in its standard namespace.",
    "soap.error.version":
      "The envelope SOAP version does not match the selected operation.",
    "soap.error.body":
      "Use one document payload in Body, a matching request wrapper, and valid SOAP fault fields. Header must precede Body.",
    "soap.error.path":
      "Check namespace bindings and simple absolute XML paths; XPath expressions and unknown prefixes are unsupported.",
    "soap.error.rule":
      "Check response-rule fields, operators, expected count values, and the 20-rule limit.",
    "soap.error.project":
      "Invalid SOAP project, request settings, name, or duplicate case IDs.",
    "soap.error.case":
      "Check case fields, referenced operation, HTTP status, expected outcome, and case count.",
    "soap.error.url":
      "Use an absolute HTTP(S) endpoint URL without embedded credentials or a fragment.",
    "soap.error.headers":
      "Use distinct HTTP header names with string values. SOAP media/action headers and browser-owned headers are controlled by the studio.",
    "soap.error.timeout": "The SOAP request deadline was reached.",
    "soap.error.cancelled": "SOAP task cancelled.",
    "soap.error.network":
      "SOAP request failed. Check connectivity, browser CORS, and endpoint access.",
    "soap.error.mime":
      "The response media type must be text/xml or application/xml for SOAP 1.1, or application/soap+xml for SOAP 1.2.",
  },
  ru: {
    "soap.title": "Студия контрактов SOAP",
    "soap.help":
      "Изучайте сервисы WSDL 1.1 document/literal, создавайте шаблоны XML SOAP 1.1/1.2, просматривайте сообщения и ошибки, сохраняйте проверки ответов. Студия независима от редактора OpenAPI. Данные остаются в памяти вкладки.",
    "soap.scope":
      "Поддерживаются встроенные элементы/типы XML Schema и локальные квалифицированные ссылки. Шаблоны — примеры, а не полная проверка XSD. RPC/encoded, объявленные SOAP-заголовки привязки, WSDL 2, вложения, автоматизация WS-Security и внешние определения не поддерживаются. Импорты не загружаются.",
    "soap.privacy":
      "Проекты и XML содержат WSDL, URL, сообщения и ожидаемые значения; SOAP-заголовки XML могут содержать секреты. HTTP-заголовки сеанса исключаются. Отчёты не содержат значений сообщений, URL сервисов, деталей ошибок и ожидаемых строк, но сохраняют имена кейсов и ID операций. Проверяйте файлы перед передачей.",
    "soap.limits":
      "Ограничения: 512 КиБ на XML, 10000 элементов, глубина 48, 100 операций, 20 кейсов, 20 проверок на кейс, 2 МиБ на проект и 30 секунд на запрос. Инспектор ожидает один документ в Body.",
    "soap.demo": "Загрузить пример SOAP-клиентов",
    "soap.new": "Новая рабочая область SOAP",
    "soap.import": "Импортировать проект SOAP",
    "soap.export": "Экспортировать проект SOAP",
    "soap.importWsdl": "Импортировать WSDL в черновик",
    "soap.wsdl": "Черновик контракта WSDL 1.1",
    "soap.create": "Создать проект из WSDL (заменяет данные студии)",
    "soap.discard": "Отменить несохранённые изменения SOAP",
    "soap.pending":
      "Сохраните или отмените изменения перед переключением, запуском, импортом или экспортом.",
    "soap.projectName": "Название проекта SOAP",
    "soap.namespaces": "Префиксы пространств имён проверок (JSON)",
    "soap.saveSettings": "Сохранить настройки проекта SOAP",
    "soap.operation": "Операция SOAP",
    "soap.inventory": "Инвентаризация операций SOAP",
    "soap.operationDetails":
      "{service} / {port} · SOAP {version} · действие: {action}",
    "soap.elements": "Встроенных глобальных элементов: {count}",
    "soap.external":
      "Внешних импортов: {count}; они не разрешены и не загружаются.",
    "soap.unsupported":
      "Операций с неподдерживаемыми или отсутствующими определениями: {count}.",
    "soap.selectedUnsupported":
      "Для этой операции нельзя создать или отправить запрос document/literal: {reason}",
    "soap.url": "URL сервиса SOAP",
    "soap.action": "Действие SOAP",
    "soap.timeout": "Тайм-аут SOAP, мс (100–30000)",
    "soap.request": "XML конверта запроса SOAP",
    "soap.optional": "Включить необязательные поля в шаблон",
    "soap.generate": "Создать шаблон запроса SOAP",
    "soap.saveRequest": "Сохранить черновик запроса SOAP",
    "soap.validate": "Проверить конверт запроса SOAP",
    "soap.valid":
      "Версия SOAP и корневой элемент запроса соответствуют операции. Полная проверка содержимого XSD не выполняется.",
    "soap.downloadRequest": "Скачать XML запроса SOAP",
    "soap.downloadCurl": "Скачать команду cURL SOAP",
    "soap.headers": "HTTP-заголовки SOAP, только в сеансе (JSON)",
    "soap.liveHelp":
      "Отправка выполняет POST и может изменить удалённый сервис. CORS должен разрешать URL и заголовки. Cookie и перенаправления отключены. SOAP 1.1 использует SOAPAction в кавычках и text/xml; SOAP 1.2 — application/soap+xml с параметром action. Этими заголовками управляет студия. Ответы UTF-8, включая HTTP-ошибки SOAP, доступны для просмотра.",
    "soap.send": "Отправить реальный запрос SOAP",
    "soap.cancel": "Отменить задачу SOAP",
    "soap.busy": "Выполняется задача SOAP…",
    "soap.exchange": "Реальный ответ: HTTP {status} · {bytes} байт · {ms} мс",
    "soap.capture": "Сохранить реальный ответ SOAP как кейс",
    "soap.captured": "Реальный ответ сохранён как регрессионный кейс.",
    "soap.cases": "Регрессионные кейсы ответов SOAP",
    "soap.case": "Выбранный кейс ответа SOAP",
    "soap.noCases":
      "Сохранённых кейсов нет. Добавьте кейс или запишите реальный ответ.",
    "soap.addCase": "Добавить кейс ответа SOAP",
    "soap.deleteCase": "Удалить кейс ответа SOAP",
    "soap.caseName": "Название кейса SOAP",
    "soap.caseOperation": "Операция кейса SOAP",
    "soap.caseStatus": "HTTP-статус фикстуры (100–599)",
    "soap.caseExpected": "Ожидаемый результат ответа SOAP",
    "soap.outcome.success": "Успешный ответ",
    "soap.outcome.fault": "Ошибка SOAP",
    "soap.outcome.invalid": "Некорректный XML / конверт SOAP",
    "soap.caseResponse": "XML фикстуры ответа SOAP",
    "soap.rules": "Проверки ответа SOAP (JSON-массив)",
    "soap.rulesHelp":
      "Путь начинается с корневого элемента: /c:GetCustomerResponse/c:customer/c:id. Свяжите c с URI выше; имена без префикса не имеют пространства имён. Доступны дочерние шаги, индексы [1] и конечный /@атрибут. Операторы: exists, absent, equals, contains, count. equals/contains проверяют все совпадения и не проходят при пустой выборке. Некорректные конверты должны иметь пустой список проверок.",
    "soap.ruleExample":
      'Пример: [{"name":"ID","path":"/c:GetCustomerResponse/c:customer/c:id","operator":"equals","expected":"0","trim":true}]',
    "soap.saveCase": "Сохранить кейс ответа SOAP",
    "soap.replay": "Проверить выбранный кейс SOAP",
    "soap.runAll": "Запустить все кейсы ответов SOAP",
    "soap.caseHelp":
      "Локальная проверка сравнивает версию, ожидаемый успех/ошибку/некорректность, корневой элемент ответа и проверки путей. Успешный ответ требует HTTP 2xx. SOAP-ошибки могут приходить с HTTP-ошибкой. Логика сервера и полная проверка XSD не выполняются.",
    "soap.results": "Результаты проверок SOAP",
    "soap.progress":
      "Проверено кейсов: {count}/{total}; успешно: {passed}, с ошибками: {failed}.",
    "soap.passed": "Успешно",
    "soap.failed": "Ошибка",
    "soap.result":
      "{name}: {result} · {outcome} · HTTP {status} · проверок путей: {checks}",
    "soap.resultChecks":
      "Результат: {outcome} · элемент ответа: {wrapper} · HTTP: {http} · успешных проверок путей: {passed}/{total}",
    "soap.report": "Скачать регрессионный отчёт SOAP",
    "soap.inspector": "Инспектор сообщений SOAP",
    "soap.inspectedXml": "XML просматриваемого ответа (первые 16000 символов)",
    "soap.tree": "Дерево SOAP с пространствами имён (первые 16000 символов)",
    "soap.fault": "Подробности ошибки SOAP (первые 16000 символов)",
    "soap.inspectedVersion": "Версия просматриваемого SOAP: {version}",
    "soap.inspectCase": "Просмотреть XML черновика ответа",
    "soap.downloadResponse": "Скачать просматриваемый XML SOAP",
    "soap.copyResponse": "Копировать просматриваемый XML SOAP",
    "soap.saved": "Изменения SOAP сохранены.",
    "soap.imported": "Проект SOAP импортирован.",
    "soap.downloaded": "Скачивание SOAP началось.",
    "soap.copied": "XML SOAP скопирован.",
    "soap.downloadError": "Не удалось начать скачивание SOAP.",
    "soap.copyError": "Не удалось скопировать XML SOAP.",
    "soap.error.xml":
      "Некорректный XML, неизвестный префикс, неподдерживаемая инструкция обработки или неверный UTF-8.",
    "soap.error.limit":
      "Превышены ограничения XML, глубины, количества, проекта или настройки тайм-аута.",
    "soap.error.doctype": "Объявления DTD и сущностей запрещены.",
    "soap.error.wsdl":
      "Нужен документ WSDL 1.1 definitions с уникальными локальными именами.",
    "soap.error.reference":
      "Не удалось локально разрешить префикс, сообщение, тип порта, элемент, тип или ссылку на операцию.",
    "soap.error.unsupported":
      "Контракт использует неподдерживаемую привязку SOAP или стиль сообщений.",
    "soap.error.schema":
      "Эта структура XSD не позволяет создать полный шаблон. Измените XML вручную; пример не заменяет проверку XSD.",
    "soap.error.recursive":
      "Обязательный рекурсивный тип не позволяет создать конечный XML. Исключите необязательную рекурсию или измените XML вручную.",
    "soap.error.envelope":
      "Ожидается Envelope SOAP 1.1/1.2 в стандартном пространстве имён.",
    "soap.error.version":
      "Версия конверта SOAP не соответствует выбранной операции.",
    "soap.error.body":
      "Нужен один документ в Body, соответствующий элемент запроса и корректные поля SOAP-ошибки. Header должен предшествовать Body.",
    "soap.error.path":
      "Проверьте привязки пространств имён и простые абсолютные пути XML; выражения XPath и неизвестные префиксы не поддерживаются.",
    "soap.error.rule":
      "Проверьте поля правил, операторы, ожидаемое количество и ограничение 20 правил.",
    "soap.error.project":
      "Некорректный проект SOAP, параметры запроса, название или повторяющиеся ID кейсов.",
    "soap.error.case":
      "Проверьте поля кейса, операцию, HTTP-статус, ожидаемый результат и количество кейсов.",
    "soap.error.url":
      "Нужен абсолютный HTTP(S) URL без встроенных учётных данных и фрагмента.",
    "soap.error.headers":
      "Используйте уникальные HTTP-заголовки со строковыми значениями. Заголовками SOAP и браузера управляет студия.",
    "soap.error.timeout": "Истёк тайм-аут запроса SOAP.",
    "soap.error.cancelled": "Задача SOAP отменена.",
    "soap.error.network":
      "Ошибка SOAP-запроса. Проверьте соединение, CORS и доступ к сервису.",
    "soap.error.mime":
      "Нужен text/xml или application/xml для SOAP 1.1 либо application/soap+xml для SOAP 1.2.",
  },
} as const;
