export const oauthTranslations = {
  en: {
    "oauth.title": "OAuth authorization studio",
    "oauth.help":
      "Obtain API access tokens with public-client authorization code + S256 PKCE or device authorization. Refresh, revoke, and explicitly apply a live Bearer token to an OpenAPI auth scheme. This does not sign you into RSSwag or validate OpenID Connect identity tokens.",
    "oauth.privacy":
      "Tokens, codes, device grants, PKCE verifiers, and callback URLs stay in memory. Public profile exports exclude session credentials; they include client IDs, URLs, scopes, resource/audience settings, and names. Reports retain profile IDs/names and protocol events, without credential values. Review profile metadata before sharing.",
    "oauth.network":
      "Live operations use direct browser requests with CORS, no ambient cookies, no redirects, and no automatic token-request retries. Use HTTPS; HTTP is allowed only for localhost/127.0.0.1/[::1]. Client secrets, implicit/password grants, DPoP, and OpenID Connect login validation are unsupported. ID tokens are ignored.",
    "oauth.limits":
      "Limits: 10 profiles, 128 KiB per project, 64 KiB per response/request form, 30 seconds per request, 5 minutes per authorization request, and 200 retained journal events. Device grants last up to 15 minutes; each polling run has a 5-minute budget. Poll cancellation preserves a still-valid device grant for manual resumption.",
    "oauth.demo": "Run offline OAuth lifecycle demo",
    "oauth.demoHelp":
      "The demo uses synthetic responses and a virtual clock: device pending → slow_down → token → rotated refresh. No real requests are made, and synthetic tokens cannot be applied to API authentication.",
    "oauth.new": "New OAuth project",
    "oauth.import": "Import public OAuth profiles",
    "oauth.export": "Export public OAuth profiles",
    "oauth.projectName": "OAuth project name",
    "oauth.profile": "Public OAuth client profile",
    "oauth.add": "Add OAuth profile",
    "oauth.delete": "Delete OAuth profile",
    "oauth.save": "Save OAuth profile",
    "oauth.discard": "Discard pending OAuth edits",
    "oauth.pending":
      "Save or discard edits before switching or running. Saving a profile clears its current token session and matching tokens previously applied by this studio.",
    "oauth.name": "OAuth profile name",
    "oauth.issuer": "Exact authorization-server issuer",
    "oauth.metadataUrl":
      "Metadata URL (optional; otherwise RFC 8414 discovery)",
    "oauth.authorizationEndpoint": "Authorization endpoint",
    "oauth.tokenEndpoint": "Token endpoint",
    "oauth.deviceEndpoint": "Device authorization endpoint (optional)",
    "oauth.revocationEndpoint": "Token revocation endpoint (optional)",
    "oauth.clientId": "Public client ID",
    "oauth.scope": "Requested scopes (space-separated)",
    "oauth.resource": "Resource parameter (optional)",
    "oauth.audience": "Audience parameter (optional provider extension)",
    "oauth.timeoutMs": "OAuth HTTP timeout, ms (100–30000)",
    "oauth.requireIssuer":
      "Require an exact iss parameter in the authorization callback",
    "oauth.discover": "Fetch authorization-server metadata",
    "oauth.metadata": "Authorization-server metadata JSON",
    "oauth.applyMetadata": "Apply pasted OAuth metadata to draft",
    "oauth.metadataHelp":
      "Discovery must stay on the issuer origin and match its exact issuer string. Endpoints become pending edits for review; omitted endpoints are cleared. Advertised client-auth methods must permit none and PKCE must include S256. An advertised callback issuer requirement is retained.",
    "oauth.redirect": "Register this exact OAuth redirect URI",
    "oauth.redirectHelp":
      "Register the exact displayed URI, including its issuer-bound as query, for this public client. Keep issuer checks enabled when supported. The popup has no opener. A state-bound same-origin channel delivers the response; otherwise paste the original callback URL. State is one-time and expires after five minutes.",
    "oauth.authorize": "Authorize with PKCE popup",
    "oauth.prepare": "Prepare PKCE authorization link",
    "oauth.authorizationUrl": "Session authorization URL",
    "oauth.openAuthorization": "Open authorization page",
    "oauth.copyAuthorization": "Copy authorization URL",
    "oauth.popupBlocked":
      "Popup unavailable. Open or copy the prepared authorization URL and use automatic callback delivery or paste the callback URL below.",
    "oauth.callback": "Session-only callback URL",
    "oauth.exchange": "Validate callback and exchange code",
    "oauth.deviceStart": "Request device authorization",
    "oauth.deviceCode": "Device user code",
    "oauth.deviceLink": "Open device verification page",
    "oauth.deviceHelp":
      "Verify the displayed code on the authorization server, then start polling. The device code itself stays private. Polling waits for the server interval, adds five seconds on slow_down, and stops on denial, expiry, or errors. A network timeout stops polling and increases the delay for manual resumption.",
    "oauth.devicePoll": "Poll device authorization",
    "oauth.cancel": "Cancel OAuth operation",
    "oauth.forget": "Forget OAuth session credentials",
    "oauth.session": "OAuth token session",
    "oauth.state": "OAuth state: {phase}",
    "oauth.busy": "OAuth operation in progress…",
    "oauth.liveSource": "Live authorization server",
    "oauth.demoSource": "Offline synthetic demonstration",
    "oauth.tokenType": "Token type: {type}",
    "oauth.grantedScopes": "Granted scopes: {scope}",
    "oauth.expires": "Access token expires in {seconds} seconds.",
    "oauth.unknownExpiry": "The server supplied no access-token expiration.",
    "oauth.noToken": "No usable access token in this session.",
    "oauth.accessToken": "Session access token",
    "oauth.refreshToken": "Session refresh token",
    "oauth.reveal": "Reveal session token values",
    "oauth.copyToken": "Copy live access token",
    "oauth.refresh": "Refresh OAuth access token",
    "oauth.revokeAccess": "Revoke access token",
    "oauth.revokeRefresh": "Revoke refresh token",
    "oauth.target": "API authentication target",
    "oauth.noTargets":
      "No compatible OAuth, OpenID Connect, or Bearer scheme is available in the current OpenAPI document.",
    "oauth.applyToken": "Use live token for selected API scheme",
    "oauth.applyHelp":
      "This explicitly replaces only the selected session credential. Refresh does not automatically replace an already-applied token. Forget/revoke/profile changes remove this studio’s applied credentials only while their exact values still match; unrelated or manually changed credentials remain.",
    "oauth.applied":
      "Live token applied to the selected API authentication scheme.",
    "oauth.forgotten": "OAuth session credentials forgotten.",
    "oauth.polls": "Device polls: {count}; next poll in {seconds} seconds.",
    "oauth.journal": "OAuth protocol journal (last 200 events)",
    "oauth.event": "#{sequence} · {ms} ms · {phase}",
    "oauth.report": "Download credential-free OAuth report",
    "oauth.saved": "Public OAuth profile saved.",
    "oauth.imported": "Public OAuth profiles imported.",
    "oauth.metadataReady":
      "Metadata applied to the draft. Review and save the profile before authorization.",
    "oauth.downloaded": "OAuth profile/report download started.",
    "oauth.copied": "Session value copied.",
    "oauth.copyError": "Could not copy the session value.",
    "oauth.downloadError": "Could not start the OAuth download.",
    "oauth.phase.idle": "Idle",
    "oauth.phase.preparing": "Preparing S256 PKCE",
    "oauth.phase.awaiting-authorization": "Waiting for authorization callback",
    "oauth.phase.exchanging": "Exchanging one-time code",
    "oauth.phase.device-starting": "Requesting device grant",
    "oauth.phase.device-awaiting": "Waiting for device approval",
    "oauth.phase.polling": "Polling device authorization",
    "oauth.phase.ready": "Access token received",
    "oauth.phase.refreshing": "Refreshing token",
    "oauth.phase.revoking": "Revoking token",
    "oauth.phase.revoked": "Revocation accepted; local tokens cleared",
    "oauth.phase.cancelled": "Cancelled",
    "oauth.phase.expired": "Expired",
    "oauth.phase.error": "Protocol/request error",
    "oauth.error.profile":
      "Check public-client settings, required client ID/endpoints, numeric limits, and URL query parameters. Secret parameters and request objects are not supported.",
    "oauth.error.project":
      "Invalid public OAuth project, profile count, name, version, or duplicate IDs.",
    "oauth.error.url":
      "Use HTTPS or literal loopback HTTP without embedded credentials or fragments. Issuers cannot contain a query.",
    "oauth.error.scope": "Use valid space-separated OAuth scope tokens.",
    "oauth.error.metadata":
      "Invalid metadata or unsupported public-client/S256 capabilities.",
    "oauth.error.issuer":
      "The response issuer does not exactly match the configured issuer, or a required iss parameter is missing.",
    "oauth.error.crypto":
      "S256 PKCE requires secure browser cryptography and a valid verifier.",
    "oauth.error.callback":
      "Invalid callback URI or parameters. Only a query-mode authorization-code response is supported.",
    "oauth.error.state":
      "Callback state is missing, mismatched, or already consumed. Start a new authorization if needed.",
    "oauth.error.expired":
      "The authorization/device grant or access token has expired.",
    "oauth.error.token":
      "Malformed OAuth token response or invalid expiration/credential fields.",
    "oauth.error.token-type":
      "Only Bearer access tokens are supported; sender-constrained token types need another client.",
    "oauth.error.device":
      "Invalid or unavailable device grant. Request a new device authorization.",
    "oauth.error.busy": "Another OAuth request is in progress.",
    "oauth.error.cancelled": "OAuth operation cancelled.",
    "oauth.error.timeout": "The OAuth HTTP or polling deadline was reached.",
    "oauth.error.network":
      "OAuth request failed. Check browser CORS, connectivity, and endpoint access.",
    "oauth.error.http":
      "The authorization server returned an unsuccessful HTTP response.",
    "oauth.error.json":
      "Expected a bounded UTF-8 JSON object from the authorization server.",
    "oauth.error.limit":
      "The OAuth response, request form, project, or configured limit was exceeded.",
    "oauth.error.oauth-error":
      "The authorization server rejected or deferred this request.",
    "oauth.error.unavailable":
      "A usable live token or required refresh/revocation capability is unavailable.",
    "oauth.remote.invalid_request": "Server: invalid_request",
    "oauth.remote.invalid_client": "Server: invalid_client",
    "oauth.remote.invalid_grant": "Server: invalid_grant",
    "oauth.remote.unauthorized_client": "Server: unauthorized_client",
    "oauth.remote.unsupported_grant_type": "Server: unsupported_grant_type",
    "oauth.remote.invalid_scope": "Server: invalid_scope",
    "oauth.remote.access_denied": "Server: access_denied",
    "oauth.remote.authorization_pending": "Server: authorization_pending",
    "oauth.remote.slow_down": "Server: slow_down",
    "oauth.remote.expired_token": "Server: expired_token",
    "oauth.remote.server_error": "Server: server_error",
    "oauth.remote.temporarily_unavailable": "Server: temporarily_unavailable",
    "oauth.remote.unsupported_token_type": "Server: unsupported_token_type",
  },
  ru: {
    "oauth.title": "Студия авторизации OAuth",
    "oauth.help":
      "Получайте токены API через authorization code + S256 PKCE или авторизацию устройства для публичных клиентов. Обновляйте, отзывайте и явно применяйте Bearer-токен к схеме OpenAPI. Это не вход в RSSwag и не проверка личности OpenID Connect.",
    "oauth.privacy":
      "Токены, коды, гранты устройств, верификаторы PKCE и URL ответов остаются в памяти. Экспорт публичных профилей исключает данные сеанса, но содержит client ID, URL, scopes, resource/audience и названия. Отчёты сохраняют ID/названия профилей и события без значений секретов. Проверяйте метаданные перед передачей.",
    "oauth.network":
      "Реальные операции используют запросы браузера с CORS, без фоновых cookie, перенаправлений и автоматических повторов запросов токенов. Нужен HTTPS; HTTP разрешён только для localhost/127.0.0.1/[::1]. Секреты клиентов, implicit/password, DPoP и проверка входа OIDC не поддерживаются. ID-токены игнорируются.",
    "oauth.limits":
      "Ограничения: 10 профилей, 128 КиБ на проект, 64 КиБ на ответ/форму, 30 секунд на запрос, 5 минут на авторизацию и 200 событий журнала. Грант устройства — до 15 минут, один запуск опроса — до 5 минут. Отмена сохраняет действующий грант для ручного возобновления.",
    "oauth.demo": "Запустить локальный пример OAuth",
    "oauth.demoHelp":
      "Пример использует синтетические ответы и виртуальное время: ожидание устройства → slow_down → токен → ротация refresh. Сеть не используется, синтетические токены нельзя применить к API.",
    "oauth.new": "Новый проект OAuth",
    "oauth.import": "Импортировать публичные профили OAuth",
    "oauth.export": "Экспортировать публичные профили OAuth",
    "oauth.projectName": "Название проекта OAuth",
    "oauth.profile": "Профиль публичного клиента OAuth",
    "oauth.add": "Добавить профиль OAuth",
    "oauth.delete": "Удалить профиль OAuth",
    "oauth.save": "Сохранить профиль OAuth",
    "oauth.discard": "Отменить несохранённые изменения OAuth",
    "oauth.pending":
      "Сохраните или отмените изменения перед переключением и запуском. Сохранение профиля очищает его сеанс токенов и совпадающие токены, ранее применённые этой студией.",
    "oauth.name": "Название профиля OAuth",
    "oauth.issuer": "Точный issuer сервера авторизации",
    "oauth.metadataUrl": "URL метаданных (необязательно; иначе RFC 8414)",
    "oauth.authorizationEndpoint": "URL авторизации",
    "oauth.tokenEndpoint": "URL выдачи токенов",
    "oauth.deviceEndpoint": "URL авторизации устройства (необязательно)",
    "oauth.revocationEndpoint": "URL отзыва токенов (необязательно)",
    "oauth.clientId": "ID публичного клиента",
    "oauth.scope": "Запрашиваемые scopes (через пробел)",
    "oauth.resource": "Параметр resource (необязательно)",
    "oauth.audience": "Параметр audience (расширение провайдера)",
    "oauth.timeoutMs": "Тайм-аут OAuth HTTP, мс (100–30000)",
    "oauth.requireIssuer":
      "Требовать точное совпадение iss в ответе авторизации",
    "oauth.discover": "Загрузить метаданные сервера авторизации",
    "oauth.metadata": "JSON метаданных сервера авторизации",
    "oauth.applyMetadata": "Применить JSON метаданных OAuth к черновику",
    "oauth.metadataHelp":
      "Discovery должен оставаться на origin issuer и точно совпадать с его строкой. URL становятся черновиком для проверки; отсутствующие очищаются. Объявленные способы аутентификации должны допускать none, а PKCE — S256. Требование issuer сохраняется.",
    "oauth.redirect": "Зарегистрируйте этот точный redirect URI OAuth",
    "oauth.redirectHelp":
      "Зарегистрируйте точный URI, включая параметр as с привязкой к issuer. Сохраняйте проверку issuer, если сервер её поддерживает. Окно не имеет opener. Ответ передаётся через канал того же origin с привязкой state; иначе вставьте исходный URL вручную. State одноразовый и действует пять минут.",
    "oauth.authorize": "Авторизовать через окно PKCE",
    "oauth.prepare": "Подготовить ссылку авторизации PKCE",
    "oauth.authorizationUrl": "URL авторизации сеанса",
    "oauth.openAuthorization": "Открыть страницу авторизации",
    "oauth.copyAuthorization": "Копировать URL авторизации",
    "oauth.popupBlocked":
      "Окно недоступно. Откройте или скопируйте подготовленный URL и используйте автоматическую передачу ответа либо вставьте его ниже.",
    "oauth.callback": "URL ответа, только в сеансе",
    "oauth.exchange": "Проверить ответ и обменять код",
    "oauth.deviceStart": "Запросить авторизацию устройства",
    "oauth.deviceCode": "Код пользователя для устройства",
    "oauth.deviceLink": "Открыть страницу подтверждения устройства",
    "oauth.deviceHelp":
      "Проверьте код на сервере авторизации и запустите опрос. Секретный device code не показывается. Опрос соблюдает интервал сервера, добавляет пять секунд при slow_down и останавливается при отказе, истечении срока или ошибке. Сетевой тайм-аут увеличивает паузу для ручного возобновления.",
    "oauth.devicePoll": "Опросить авторизацию устройства",
    "oauth.cancel": "Отменить операцию OAuth",
    "oauth.forget": "Забыть данные сеанса OAuth",
    "oauth.session": "Сеанс токенов OAuth",
    "oauth.state": "Состояние OAuth: {phase}",
    "oauth.busy": "Выполняется операция OAuth…",
    "oauth.liveSource": "Реальный сервер авторизации",
    "oauth.demoSource": "Локальный синтетический пример",
    "oauth.tokenType": "Тип токена: {type}",
    "oauth.grantedScopes": "Предоставленные scopes: {scope}",
    "oauth.expires": "Токен доступа истекает через {seconds} секунд.",
    "oauth.unknownExpiry": "Сервер не указал срок действия токена доступа.",
    "oauth.noToken": "В сеансе нет пригодного токена доступа.",
    "oauth.accessToken": "Токен доступа сеанса",
    "oauth.refreshToken": "Refresh-токен сеанса",
    "oauth.reveal": "Показать значения токенов сеанса",
    "oauth.copyToken": "Копировать реальный токен доступа",
    "oauth.refresh": "Обновить токен доступа OAuth",
    "oauth.revokeAccess": "Отозвать токен доступа",
    "oauth.revokeRefresh": "Отозвать refresh-токен",
    "oauth.target": "Целевая схема аутентификации API",
    "oauth.noTargets":
      "В текущем OpenAPI нет совместимой схемы OAuth, OpenID Connect или Bearer.",
    "oauth.applyToken": "Использовать реальный токен в выбранной схеме API",
    "oauth.applyHelp":
      "Действие явно заменяет только выбранные данные сеанса. Обновление не заменяет ранее применённый токен автоматически. Очистка/отзыв/смена профиля удаляет применённые студией токены только при точном совпадении; другие и изменённые вручную значения сохраняются.",
    "oauth.applied":
      "Реальный токен применён к выбранной схеме аутентификации API.",
    "oauth.forgotten": "Данные сеанса OAuth забыты.",
    "oauth.polls":
      "Опросов устройства: {count}; следующий через {seconds} секунд.",
    "oauth.journal": "Журнал протокола OAuth (последние 200 событий)",
    "oauth.event": "№{sequence} · {ms} мс · {phase}",
    "oauth.report": "Скачать отчёт OAuth без секретов",
    "oauth.saved": "Публичный профиль OAuth сохранён.",
    "oauth.imported": "Публичные профили OAuth импортированы.",
    "oauth.metadataReady":
      "Метаданные применены к черновику. Проверьте и сохраните профиль до авторизации.",
    "oauth.downloaded": "Скачивание профиля/отчёта OAuth началось.",
    "oauth.copied": "Значение сеанса скопировано.",
    "oauth.copyError": "Не удалось скопировать значение сеанса.",
    "oauth.downloadError": "Не удалось начать скачивание OAuth.",
    "oauth.phase.idle": "Ожидание",
    "oauth.phase.preparing": "Подготовка S256 PKCE",
    "oauth.phase.awaiting-authorization": "Ожидание ответа авторизации",
    "oauth.phase.exchanging": "Обмен одноразового кода",
    "oauth.phase.device-starting": "Запрос гранта устройства",
    "oauth.phase.device-awaiting": "Ожидание подтверждения устройства",
    "oauth.phase.polling": "Опрос авторизации устройства",
    "oauth.phase.ready": "Токен доступа получен",
    "oauth.phase.refreshing": "Обновление токена",
    "oauth.phase.revoking": "Отзыв токена",
    "oauth.phase.revoked": "Отзыв принят; локальные токены очищены",
    "oauth.phase.cancelled": "Отменено",
    "oauth.phase.expired": "Срок действия истёк",
    "oauth.phase.error": "Ошибка протокола/запроса",
    "oauth.error.profile":
      "Проверьте настройки публичного клиента, ID/URL, ограничения и параметры URL. Секретные параметры и request objects не поддерживаются.",
    "oauth.error.project":
      "Некорректный публичный проект OAuth, количество профилей, название, версия или повторяющиеся ID.",
    "oauth.error.url":
      "Используйте HTTPS или loopback HTTP без встроенных учётных данных и фрагмента. Issuer не должен содержать query.",
    "oauth.error.scope": "Используйте допустимые OAuth scopes через пробел.",
    "oauth.error.metadata":
      "Некорректные метаданные либо неподдерживаемые возможности публичного клиента/S256.",
    "oauth.error.issuer":
      "Issuer ответа не совпадает точно с настроенным либо отсутствует обязательный iss.",
    "oauth.error.crypto":
      "Для S256 PKCE нужны безопасная криптография браузера и допустимый верификатор.",
    "oauth.error.callback":
      "Некорректный callback URI или параметры. Поддерживается только authorization code в query.",
    "oauth.error.state":
      "State отсутствует, не совпадает или уже использован. При необходимости начните новую авторизацию.",
    "oauth.error.expired":
      "Срок авторизации, гранта устройства или токена доступа истёк.",
    "oauth.error.token":
      "Некорректный ответ с токеном, сроком действия или полями учётных данных.",
    "oauth.error.token-type":
      "Поддерживается только Bearer; sender-constrained токены требуют другого клиента.",
    "oauth.error.device":
      "Некорректный или отсутствующий грант устройства. Запросите новую авторизацию.",
    "oauth.error.busy": "Другой запрос OAuth уже выполняется.",
    "oauth.error.cancelled": "Операция OAuth отменена.",
    "oauth.error.timeout": "Истёк тайм-аут OAuth HTTP или опроса.",
    "oauth.error.network":
      "Ошибка запроса OAuth. Проверьте CORS, подключение и доступ к серверу.",
    "oauth.error.http": "Сервер авторизации вернул неуспешный HTTP-ответ.",
    "oauth.error.json":
      "Ожидался JSON-объект UTF-8 в пределах допустимого размера.",
    "oauth.error.limit":
      "Превышен размер ответа, формы, проекта или настроенное ограничение OAuth.",
    "oauth.error.oauth-error":
      "Сервер авторизации отклонил или отложил запрос.",
    "oauth.error.unavailable":
      "Пригодный реальный токен или возможность обновления/отзыва недоступны.",
    "oauth.remote.invalid_request": "Сервер: invalid_request",
    "oauth.remote.invalid_client": "Сервер: invalid_client",
    "oauth.remote.invalid_grant": "Сервер: invalid_grant",
    "oauth.remote.unauthorized_client": "Сервер: unauthorized_client",
    "oauth.remote.unsupported_grant_type": "Сервер: unsupported_grant_type",
    "oauth.remote.invalid_scope": "Сервер: invalid_scope",
    "oauth.remote.access_denied": "Сервер: access_denied",
    "oauth.remote.authorization_pending": "Сервер: authorization_pending",
    "oauth.remote.slow_down": "Сервер: slow_down",
    "oauth.remote.expired_token": "Сервер: expired_token",
    "oauth.remote.server_error": "Сервер: server_error",
    "oauth.remote.temporarily_unavailable": "Сервер: temporarily_unavailable",
    "oauth.remote.unsupported_token_type": "Сервер: unsupported_token_type",
  },
} as const;
