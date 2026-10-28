const en = {
  "hook.title": "Webhook signature and replay studio",
  "hook.help":
    "Verify exact webhook bytes, rehearse receiver policies and key rotation, sign local fixtures, and export a server verifier. All work is offline and independent of the OpenAPI editor.",
  "hook.scopeTitle": "Signing formats, replay scope and export contents",
  "hook.scope":
    "Supports GitHub HMAC-SHA256, Stripe v1 HMAC-SHA256 and Standard Webhooks v1 HMAC-SHA256. Standard Webhooks asymmetric signatures and Svix-prefixed header aliases are not implemented. Unknown signature versions never authenticate a delivery. Uses Web Crypto signature verification, with no JSON parsing before verification.",
  "hook.bytesHelp":
    "UTF-8 text is signed exactly as entered, including whitespace. Use canonical padded Base64 for binary payloads or exact CRLF/BOM preservation. Changing encoding does not convert the payload. No formatting, newline normalization or decompression is performed by the verifier.",
  "hook.replayHelp":
    "Runs start with empty independent replay stores per receiver profile and sort arrivals by offset, preserving source order for ties. Only authenticated deliveries passing the required freshness policy reserve an identity. Signed-ID replay uses the authenticated Standard Webhooks ID; body replay uses the SHA-256 of exact payload bytes, ignoring unsigned delivery headers and signatures. Identical payloads can be distinct business events; choose this policy deliberately. Full stores reject new identities until expiry and never evict live entries.",
  "hook.privacy":
    "Secrets stay in tab memory and are omitted from project, fixture, report and verifier exports. Loading a project clears session secrets and prior results. Projects and signed fixtures retain raw bodies, headers and signatures, which may contain private data. Reports omit those values, signed IDs, absolute timestamps and replay fingerprints; your slot/profile/delivery IDs and names remain. Exported verification code has no replay store: add durable atomic idempotency before business effects.",
  "hook.limits":
    "Limits: 8 key slots, 8 receiver profiles, 40 deliveries, 256 KiB per decoded body, 32 KiB of captured headers, 16 signatures per delivery, 2 MiB per project and 4 MiB per HAR. Replay stores hold at most 500 entries. Timestamp headers must be canonical integer Unix seconds. Standard Webhooks IDs cannot contain dots or whitespace; its decoded secrets must be 24–64 bytes.",
  "hook.demo": "Load webhook security demo",
  "hook.new": "New webhook verification project",
  "hook.import": "Import webhook project",
  "hook.export": "Export webhook project (without session secrets)",
  "hook.save": "Save webhook edits",
  "hook.discard": "Discard webhook edits",
  "hook.pending":
    "Save or discard project, receiver, key-slot and delivery edits before switching stored selections, running the sequence or exporting.",
  "hook.name": "Webhook project name",
  "hook.clock": "Virtual clock start, Unix seconds",
  "hook.keys": "Session signing and verification keys",
  "hook.key": "Selected webhook key slot",
  "hook.keyName": "Webhook key slot name",
  "hook.keyEnabled": "Enable this key slot for verification",
  "hook.keyProvider": "New key slot provider",
  "hook.addKey": "Add webhook key slot",
  "hook.deleteKey": "Delete unused webhook key slot",
  "hook.secret": "Session-only webhook secret",
  "hook.secretHelp":
    "GitHub and Stripe use the entire literal UTF-8 secret, including Stripe's whsec_ prefix. Standard Webhooks decodes the Base64 after its optional whsec_ prefix. Each receiver trusts only its permitted active slots. Generated secrets are for local fixtures and do not configure a provider.",
  "hook.showSecret": "Show session secret",
  "hook.generateSecret": "Generate local test secret",
  "hook.forgetSecret": "Forget selected webhook secret",
  "hook.forgetAll": "Forget all webhook session secrets",
  "hook.secretCount":
    "{count} session secrets available; none are saved in exports.",
  "hook.profiles": "Receiver policies",
  "hook.profile": "Selected webhook receiver profile",
  "hook.profileName": "Webhook receiver profile name",
  "hook.provider": "Signature provider",
  "hook.allowKey": "Permit key slot {id}",
  "hook.addProfile": "Duplicate webhook receiver profile",
  "hook.deleteProfile": "Delete unused webhook receiver profile",
  "hook.requireTimestamp": "Require an authenticated fresh timestamp",
  "hook.maxAge": "Maximum timestamp age, seconds (0–86400)",
  "hook.future": "Allowed future clock skew, seconds (0–3600)",
  "hook.replay": "Replay identity policy",
  "hook.replay.off": "Off (signature/freshness only)",
  "hook.replay.body": "Exact authenticated body digest",
  "hook.replay.signed-id": "Authenticated Standard Webhooks ID",
  "hook.ttl": "Replay identity retention, seconds (1–86400)",
  "hook.capacity": "Replay store capacity (1–500)",
  "hook.githubHelp":
    "GitHub signs only the body. Its delivery ID, event header and timestamps are not authenticated by X-Hub-Signature-256. Requiring a signed timestamp rejects GitHub deliveries.",
  "hook.deliveries": "Captured deliveries and regression expectations",
  "hook.delivery": "Selected webhook delivery",
  "hook.deliveryName": "Webhook delivery name",
  "hook.deliveryProfile": "Delivery receiver profile",
  "hook.at": "Arrival offset, seconds (0–86400)",
  "hook.encoding": "Payload representation",
  "hook.encoding.utf8": "Exact UTF-8 text",
  "hook.encoding.base64": "Raw bytes as Base64",
  "hook.body": "Raw webhook body",
  "hook.importPayload": "Import original payload file as Base64",
  "hook.payloadLoaded":
    "Exact payload bytes loaded as a Base64 draft. Save before sequence replay or export.",
  "hook.headers": "Captured webhook HTTP headers (JSON object)",
  "hook.expected": "Expected receiver outcome",
  "hook.outcome.accepted": "Accepted",
  "hook.outcome.rejected": "Rejected",
  "hook.outcome.duplicate": "Duplicate suppressed",
  "hook.outcome.capacity": "Replay store full",
  "hook.addDelivery": "Add unsigned webhook delivery",
  "hook.cloneDelivery": "Duplicate webhook delivery",
  "hook.deleteDelivery": "Delete webhook delivery",
  "hook.timestamp": "Fixture signing timestamp, Unix seconds",
  "hook.signedId": "Fixture signed message ID (Standard Webhooks)",
  "hook.rotation":
    "Sign with every permitted active session key (rotation fixture)",
  "hook.useArrival": "Use selected delivery arrival as signing timestamp",
  "hook.sign": "Sign webhook delivery draft",
  "hook.signHelp":
    "Signing updates the headers draft. Save it before sequence replay or export. GitHub uses one key; other providers can sign rotation fixtures with several keys. Payloads and signing inputs never leave this tab.",
  "hook.inspect": "Inspect webhook signature and freshness",
  "hook.inspection": "Webhook signature inspection (without replay state)",
  "hook.inspectReport": "Download webhook signature report",
  "hook.inspectionStale":
    "This inspection belongs to an earlier draft; inspect again to check current edits.",
  "hook.decision":
    "Signature: {signature}; freshness: {freshness}; policy: {outcome}; {bytes} raw bytes.",
  "hook.signature.valid": "valid",
  "hook.signature.invalid": "invalid",
  "hook.signature.not-checked": "not checked",
  "hook.freshness.valid": "fresh",
  "hook.freshness.expired": "expired",
  "hook.freshness.future": "too far in the future",
  "hook.freshness.unavailable": "not authenticated by this provider",
  "hook.freshness.not-checked": "not checked",
  "hook.run": "Rehearse all webhook deliveries",
  "hook.report": "Download webhook replay report",
  "hook.results": "Webhook delivery sequence results",
  "hook.result": "Selected webhook replay result",
  "hook.details": "Selected webhook verification details (JSON)",
  "hook.runStats":
    "{passed}/{total} expectations passed; {accepted} accepted; {rejected} rejected; {duplicates} duplicates; {capacity} capacity refusals.",
  "hook.row":
    "{name}: {outcome}; expectation {passed}; offset {offset}s; {count} replay entries.",
  "hook.passed": "passed",
  "hook.failed": "failed",
  "hook.importHar": "Import webhook POST requests from HAR",
  "hook.harHelp":
    "HAR import assigns POST requests to the selected receiver profile and keeps text/headers only. Ambiguous, compressed, form-parameter or byte-length-mismatched captures are skipped. Capture tools can alter bytes; prefer original payload files for verification. Imported arrivals start at offset 0 and expectations need review.",
  "hook.exportFixture": "Download signed webhook fixture",
  "hook.exportVerifier": "Download standalone webhook verifier",
  "hook.verifierHelp":
    "The generated Fetch-compatible verification module requires runtime secrets, reads raw POST bodies with size/time/cancellation bounds, and returns body bytes only on successful signature/freshness checks. It does not process events, implement replay protection or provide durable idempotency.",
  "hook.cancel": "Cancel webhook operation",
  "hook.busy": "Working on webhook operation…",
  "hook.loaded":
    "Webhook project loaded; previous secrets and results cleared.",
  "hook.demoLoaded":
    "Twelve synthetic webhook examples loaded with public demo secrets. Use them only for local testing.",
  "hook.saved":
    "Webhook edits saved; previous inspections and replay results cleared.",
  "hook.signed":
    "Fixture signature written to the headers draft. Save to use it in the sequence.",
  "hook.inspected":
    "Signature/freshness inspected. Run the delivery sequence to evaluate replay protection.",
  "hook.completed":
    "Webhook delivery rehearsal finished: {passed}/{total} expectations passed.",
  "hook.harLoaded":
    "Imported {count} POST captures; skipped {skipped}. Review bytes, times, profile and expectations before replay.",
  "hook.forgotten": "Webhook session secrets forgotten; prior results cleared.",
  "hook.downloaded": "Download started.",
  "hook.downloadFailed": "Could not start the download.",
  "hook.error.project":
    "Invalid webhook project or edits. Check names, unique IDs, numeric bounds and profile/key references. Saved work was retained.",
  "hook.error.json":
    "Invalid JSON, excessive nesting or unsupported numeric precision. Saved work was retained.",
  "hook.error.limit":
    "Webhook data or operation exceeds its displayed byte/count limits. Saved work was retained.",
  "hook.error.encoding":
    "Invalid payload encoding. Use well-formed UTF-8 text or canonical padded Base64.",
  "hook.error.headers":
    "Invalid or ambiguous HTTP headers. Use unique case-insensitive names and string values without control characters.",
  "hook.error.key":
    "No usable signing key or invalid secret. Check provider encoding, active permitted slots and Standard Webhooks key length.",
  "hook.error.crypto":
    "Web Crypto is unavailable or the cryptographic operation failed. Use a secure browser context.",
  "hook.error.cancelled":
    "Webhook operation cancelled; late results were discarded.",
  "hook.error.har":
    "No usable webhook POST captures found in this HAR. Saved work was retained.",
  "hook.finding.missing-header":
    "Required provider signature metadata is missing.",
  "hook.finding.header-format":
    "Provider signature headers are malformed or ambiguous.",
  "hook.finding.signature-limit":
    "Too many signature candidates to inspect safely.",
  "hook.finding.missing-key":
    "No permitted active session key is available for this provider.",
  "hook.finding.signature-mismatch":
    "No permitted key matches a supported signature over the exact bytes.",
  "hook.finding.expired":
    "The authenticated timestamp is older than the policy allows.",
  "hook.finding.future": "The timestamp exceeds the allowed future clock skew.",
  "hook.finding.timestamp-unavailable":
    "This policy requires a timestamp that this signing format does not authenticate.",
  "hook.finding.github-metadata":
    "GitHub authenticates the body only; other delivery headers remain untrusted.",
  "hook.finding.weak-key":
    "The matching literal secret is shorter than 16 bytes. Use a high-entropy provider secret.",
  "hook.finding.unsupported-version":
    "Unknown signature versions were ignored; only supported HMAC signatures can authenticate.",
} as const;
const ru: Record<keyof typeof en, string> = {
  "hook.title": "Студия подписей и повторов вебхуков",
  "hook.help":
    "Проверяйте точные байты вебхуков, политики получателя и ротацию ключей, подписывайте локальные примеры и экспортируйте серверную проверку. Всё работает локально независимо от редактора OpenAPI.",
  "hook.scopeTitle": "Форматы подписей, повторы и содержимое экспорта",
  "hook.scope":
    "Поддерживаются GitHub HMAC-SHA256, Stripe v1 HMAC-SHA256 и Standard Webhooks v1 HMAC-SHA256. Асимметричные подписи и псевдонимы заголовков Svix не реализованы. Неизвестные версии не подтверждают подлинность. Проверка использует Web Crypto без предварительного разбора JSON.",
  "hook.bytesHelp":
    "Текст UTF-8 подписывается точно, включая пробелы. Для двоичных данных и точного сохранения CRLF/BOM используйте канонический Base64 с дополнением. Смена представления не преобразует данные. Проверка не форматирует текст, не меняет переводы строк и не распаковывает тело.",
  "hook.replayHelp":
    "Запуск создаёт пустое хранилище повторов для каждого профиля и сортирует поступления по смещению, сохраняя исходный порядок при совпадении. Запись резервируется только после проверки подписи и обязательной свежести. Политика ID использует подписанный ID Standard Webhooks; политика тела — SHA-256 точных байтов без неподписанных заголовков и подписей. Одинаковые тела могут быть разными событиями. Заполненное хранилище отклоняет новые записи до истечения срока и не вытесняет действующие.",
  "hook.privacy":
    "Секреты остаются в памяти вкладки и исключаются из экспорта проекта, примеров, отчётов и кода. Импорт проекта очищает секреты и результаты. Проекты сохраняют исходные тела, заголовки и подписи, где могут быть приватные данные. Отчёты исключают эти значения, подписанные ID, абсолютное время и отпечатки повторов; заданные вами ID и названия остаются. Экспорт проверки не содержит хранилища повторов: перед бизнес-действиями добавьте постоянную атомарную идемпотентность.",
  "hook.limits":
    "Лимиты: 8 ключей, 8 профилей, 40 доставок, 256 КиБ на декодированное тело, 32 КиБ заголовков, 16 подписей, 2 МиБ на проект и 4 МиБ на HAR. До 500 записей повторов. Время — канонические целые секунды Unix. ID Standard Webhooks не содержит точек и пробелов; декодированный секрет — 24–64 байта.",
  "hook.demo": "Загрузить примеры безопасности вебхуков",
  "hook.new": "Новый проект проверки вебхуков",
  "hook.import": "Импорт проекта вебхуков",
  "hook.export": "Экспорт проекта вебхуков (без секретов сессии)",
  "hook.save": "Сохранить изменения вебхуков",
  "hook.discard": "Отменить изменения вебхуков",
  "hook.pending":
    "Сохраните или отмените изменения проекта, получателя, ключа и доставки перед переключением, запуском последовательности или экспортом.",
  "hook.name": "Название проекта вебхуков",
  "hook.clock": "Начало виртуального времени, секунды Unix",
  "hook.keys": "Ключи подписи и проверки в сессии",
  "hook.key": "Выбранный слот ключа вебхука",
  "hook.keyName": "Название слота ключа вебхука",
  "hook.keyEnabled": "Включить этот ключ для проверки",
  "hook.keyProvider": "Провайдер нового ключа",
  "hook.addKey": "Добавить слот ключа вебхука",
  "hook.deleteKey": "Удалить неиспользуемый слот ключа",
  "hook.secret": "Секрет вебхука только для сессии",
  "hook.secretHelp":
    "GitHub и Stripe используют весь секрет UTF-8, включая префикс whsec_ у Stripe. Standard Webhooks декодирует Base64 после необязательного whsec_. Получатель доверяет только разрешённым активным слотам. Созданные секреты предназначены для локальных примеров и не настраивают провайдера.",
  "hook.showSecret": "Показать секрет сессии",
  "hook.generateSecret": "Создать локальный тестовый секрет",
  "hook.forgetSecret": "Забыть выбранный секрет вебхука",
  "hook.forgetAll": "Забыть все секреты вебхуков сессии",
  "hook.secretCount":
    "Доступно секретов сессии: {count}; они не сохраняются при экспорте.",
  "hook.profiles": "Политики получателей",
  "hook.profile": "Выбранный профиль получателя вебхуков",
  "hook.profileName": "Название профиля получателя",
  "hook.provider": "Провайдер подписи",
  "hook.allowKey": "Разрешить слот ключа {id}",
  "hook.addProfile": "Дублировать профиль получателя",
  "hook.deleteProfile": "Удалить неиспользуемый профиль получателя",
  "hook.requireTimestamp": "Требовать подписанное свежее время",
  "hook.maxAge": "Максимальный возраст времени, секунды (0–86400)",
  "hook.future": "Допуск будущего времени, секунды (0–3600)",
  "hook.replay": "Политика идентификации повторов",
  "hook.replay.off": "Выключена (только подпись и свежесть)",
  "hook.replay.body": "Хеш точных подписанных байтов тела",
  "hook.replay.signed-id": "Подписанный ID Standard Webhooks",
  "hook.ttl": "Хранение идентификатора, секунды (1–86400)",
  "hook.capacity": "Ёмкость хранилища повторов (1–500)",
  "hook.githubHelp":
    "GitHub подписывает только тело. ID доставки, событие и время не подтверждаются X-Hub-Signature-256. Требование подписанного времени отклоняет доставки GitHub.",
  "hook.deliveries": "Захваченные доставки и ожидаемые результаты",
  "hook.delivery": "Выбранная доставка вебхука",
  "hook.deliveryName": "Название доставки вебхука",
  "hook.deliveryProfile": "Профиль получателя доставки",
  "hook.at": "Смещение поступления, секунды (0–86400)",
  "hook.encoding": "Представление тела",
  "hook.encoding.utf8": "Точный текст UTF-8",
  "hook.encoding.base64": "Исходные байты в Base64",
  "hook.body": "Исходное тело вебхука",
  "hook.importPayload": "Импорт исходного файла тела в Base64",
  "hook.payloadLoaded":
    "Точные байты тела загружены в черновик Base64. Сохраните перед запуском или экспортом.",
  "hook.headers": "Захваченные HTTP-заголовки вебхука (JSON)",
  "hook.expected": "Ожидаемый исход получателя",
  "hook.outcome.accepted": "Принято",
  "hook.outcome.rejected": "Отклонено",
  "hook.outcome.duplicate": "Повтор подавлен",
  "hook.outcome.capacity": "Хранилище повторов заполнено",
  "hook.addDelivery": "Добавить неподписанную доставку",
  "hook.cloneDelivery": "Дублировать доставку вебхука",
  "hook.deleteDelivery": "Удалить доставку вебхука",
  "hook.timestamp": "Время подписи примера, секунды Unix",
  "hook.signedId": "Подписанный ID примера (Standard Webhooks)",
  "hook.rotation": "Подписать всеми разрешёнными активными ключами (ротация)",
  "hook.useArrival": "Использовать время поступления выбранной доставки",
  "hook.sign": "Подписать черновик доставки вебхука",
  "hook.signHelp":
    "Подпись обновляет черновик заголовков. Сохраните его перед запуском или экспортом. GitHub использует один ключ; остальные провайдеры поддерживают несколько ключей для ротации. Тело и данные подписи остаются в этой вкладке.",
  "hook.inspect": "Проверить подпись и свежесть вебхука",
  "hook.inspection": "Проверка подписи вебхука (без состояния повторов)",
  "hook.inspectReport": "Скачать отчёт проверки подписи",
  "hook.inspectionStale":
    "Проверка относится к предыдущему черновику; повторите её для текущих изменений.",
  "hook.decision":
    "Подпись: {signature}; свежесть: {freshness}; политика: {outcome}; исходных байтов: {bytes}.",
  "hook.signature.valid": "верна",
  "hook.signature.invalid": "неверна",
  "hook.signature.not-checked": "не проверена",
  "hook.freshness.valid": "свежее",
  "hook.freshness.expired": "устарело",
  "hook.freshness.future": "слишком далеко в будущем",
  "hook.freshness.unavailable": "не подписано этим провайдером",
  "hook.freshness.not-checked": "не проверено",
  "hook.run": "Проверить все доставки вебхуков",
  "hook.report": "Скачать отчёт повторов вебхуков",
  "hook.results": "Результаты последовательности доставок вебхуков",
  "hook.result": "Выбранный результат повтора вебхука",
  "hook.details": "Детали выбранной проверки вебхука (JSON)",
  "hook.runStats":
    "Ожиданий пройдено: {passed}/{total}; принято: {accepted}; отклонено: {rejected}; повторов: {duplicates}; отказов ёмкости: {capacity}.",
  "hook.row":
    "{name}: {outcome}; ожидание {passed}; смещение {offset}с; записей повторов: {count}.",
  "hook.passed": "пройдено",
  "hook.failed": "не пройдено",
  "hook.importHar": "Импорт POST-запросов вебхуков из HAR",
  "hook.harHelp":
    "Импорт HAR назначает POST-запросы выбранному профилю и сохраняет текст и заголовки. Неоднозначные, сжатые, параметрические или не совпадающие по длине записи пропускаются. Захват может менять байты; для проверки предпочтительны исходные файлы тела. Смещения равны 0, ожидания нужно проверить.",
  "hook.exportFixture": "Скачать подписанный пример вебхука",
  "hook.exportVerifier": "Скачать автономную проверку вебхуков",
  "hook.verifierHelp":
    "Созданный Fetch-совместимый модуль получает секреты во время исполнения, читает исходное POST-тело с ограничениями размера, времени и отмены и возвращает байты только после успешной проверки. Он не обрабатывает события, не защищает от повторов и не обеспечивает постоянную идемпотентность.",
  "hook.cancel": "Отменить операцию вебхуков",
  "hook.busy": "Выполняется операция вебхуков…",
  "hook.loaded":
    "Проект вебхуков загружен; предыдущие секреты и результаты очищены.",
  "hook.demoLoaded":
    "Загружены 12 синтетических примеров с публичными тестовыми секретами. Используйте только для локального тестирования.",
  "hook.saved":
    "Изменения сохранены; прежние проверки и результаты повторов очищены.",
  "hook.signed":
    "Подпись записана в черновик заголовков. Сохраните его для запуска последовательности.",
  "hook.inspected":
    "Подпись и свежесть проверены. Для оценки повторов запустите последовательность.",
  "hook.completed":
    "Проверка доставок завершена: ожиданий пройдено {passed}/{total}.",
  "hook.harLoaded":
    "Импортировано POST-записей: {count}; пропущено: {skipped}. Проверьте байты, время, профиль и ожидания.",
  "hook.forgotten": "Секреты вебхуков забыты; прежние результаты очищены.",
  "hook.downloaded": "Скачивание начато.",
  "hook.downloadFailed": "Не удалось начать скачивание.",
  "hook.error.project":
    "Некорректный проект или изменения. Проверьте названия, уникальные ID, числовые пределы и ссылки профилей и ключей. Сохранённая работа не изменена.",
  "hook.error.json":
    "Некорректный JSON, чрезмерная вложенность или неподдерживаемая точность чисел. Сохранённая работа не изменена.",
  "hook.error.limit":
    "Превышены указанные ограничения размера или количества. Сохранённая работа не изменена.",
  "hook.error.encoding":
    "Некорректное представление тела. Используйте корректный UTF-8 или канонический Base64 с дополнением.",
  "hook.error.headers":
    "Некорректные или неоднозначные заголовки. Используйте уникальные без учёта регистра имена и строки без управляющих символов.",
  "hook.error.key":
    "Нет подходящего ключа подписи или неверен секрет. Проверьте кодировку, разрешённые активные слоты и длину ключа Standard Webhooks.",
  "hook.error.crypto":
    "Web Crypto недоступен или операция не выполнена. Используйте защищённый контекст браузера.",
  "hook.error.cancelled":
    "Операция вебхуков отменена; запоздавшие результаты отброшены.",
  "hook.error.har":
    "В HAR нет подходящих POST-записей вебхуков. Сохранённая работа не изменена.",
  "hook.finding.missing-header":
    "Отсутствуют обязательные заголовки подписи провайдера.",
  "hook.finding.header-format":
    "Заголовки подписи повреждены или неоднозначны.",
  "hook.finding.signature-limit":
    "Слишком много кандидатов подписей для безопасной проверки.",
  "hook.finding.missing-key":
    "Для провайдера нет доступного разрешённого активного ключа сессии.",
  "hook.finding.signature-mismatch":
    "Ни один разрешённый ключ не подтверждает подпись точных байтов.",
  "hook.finding.expired": "Подписанное время старше допустимого политикой.",
  "hook.finding.future": "Время превышает допустимый сдвиг в будущее.",
  "hook.finding.timestamp-unavailable":
    "Политика требует время, которое этот формат не подписывает.",
  "hook.finding.github-metadata":
    "GitHub подтверждает только тело; остальные заголовки не проверены.",
  "hook.finding.weak-key":
    "Совпавший текстовый секрет короче 16 байт. Используйте секрет провайдера с высокой энтропией.",
  "hook.finding.unsupported-version":
    "Неизвестные версии проигнорированы; подлинность подтверждают только поддерживаемые HMAC-подписи.",
};
export const webhookTranslations = { en, ru };
