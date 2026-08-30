"use client";

import type {
  ChangeEvent,
  DragEvent as ReactDragEvent,
  FormEvent,
  KeyboardEvent as ReactKeyboardEvent,
  SyntheticEvent,
} from "react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { EndpointCard } from "@/components/endpoint-card";
import { useI18n } from "@/components/i18n-provider";
import { RequestAuthManager } from "@/components/request-auth-manager";
import { RequestEnvironmentManager } from "@/components/request-environment-manager";
import { RequestExecutionModeControl } from "@/components/request-execution-mode-control";
import { SchemaAuditPanel } from "@/components/schema-audit-panel";
import { SchemaChangePanel } from "@/components/schema-change-panel";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useClientAuthState } from "@/lib/client-auth";
import { writeTextToClipboard } from "@/lib/clipboard";
import {
  DEFAULT_EDITOR_FONT_SIZE,
  DEFAULT_EDITOR_INDENT_SIZE,
  readEditorFontSizePreference,
  readEditorIndentSizePreference,
  readEditorSearchMatchCasePreference,
  readEditorSearchWholeWordPreference,
  readEditorWordWrapPreference,
  saveEditorFontSizePreference,
  saveEditorIndentSizePreference,
  saveEditorSearchMatchCasePreference,
  saveEditorSearchWholeWordPreference,
  saveEditorWordWrapPreference,
} from "@/lib/editor-preferences";
import type {
  EditorFontSize,
  EditorIndentSize,
} from "@/lib/editor-preferences";
import {
  getSchemaSearchNavigationDirection,
  isCancelRequestShortcut,
  isDownloadSchemaShortcut,
  isEditableShortcutTarget,
  isEndpointSearchShortcut,
  isFindInSchemaShortcut,
  isFormatSchemaShortcut,
  isGoToLineShortcut,
  isImportSchemaShortcut,
  isSaveSchemaShortcut,
  isToggleWordWrapShortcut,
} from "@/lib/keyboard-shortcut";
import { filterEndpointsByResponse } from "@/lib/endpoint-response-filter";
import type { EndpointResponseFilter } from "@/lib/endpoint-response-filter";
import {
  readEndpointSortPreference,
  saveEndpointSortPreference,
  sortEndpoints,
} from "@/lib/endpoint-sort";
import type { EndpointSort } from "@/lib/endpoint-sort";
import { filterEndpointsByTrait } from "@/lib/endpoint-trait-filter";
import type { EndpointTraitFilter } from "@/lib/endpoint-trait-filter";
import {
  getEndpointFavoriteKey,
  readEndpointFavorites,
  saveEndpointFavorites,
  toggleEndpointFavorite,
} from "@/lib/endpoint-favorites";
import { getEndpointAnchor } from "@/lib/endpoint-link";
import {
  DEFAULT_OPENAPI_SCHEMA,
  createEndpointStats,
  formatOpenApiSchema,
  parseOpenApiSchema,
  SchemaFormat,
} from "@/lib/openapi";
import type { EndpointSummary } from "@/lib/openapi";
import {
  clearSchemaDraft,
  readSchemaDraft,
  saveSchemaDraft,
} from "@/lib/schema-draft";
import { createSchemaAuditReport } from "@/lib/schema-audit";
import { createSchemaChangeReport } from "@/lib/schema-change";
import {
  clearSchemaComparisonBaseline,
  createSchemaComparisonBaseline,
  readSchemaComparisonBaseline,
  saveSchemaComparisonBaseline,
} from "@/lib/schema-comparison-baseline";
import type { SchemaComparisonBaseline } from "@/lib/schema-comparison-baseline";
import {
  createEmptyRequestEnvironmentSettings,
  getActiveRequestEnvironment,
  getEnabledRequestEnvironmentHeaders,
  readRequestEnvironmentSettings,
  saveRequestEnvironmentSettings,
  type RequestEnvironmentSettings,
} from "@/lib/request-environments";
import {
  readRequestPresets,
  removeRequestPreset,
  saveRequestPresets,
  upsertRequestPreset,
  type RequestPreset,
} from "@/lib/request-presets";
import type { RequestAuthValues } from "@/lib/request-auth";
import {
  DEFAULT_REQUEST_EXECUTION_MODE,
  readRequestExecutionMode,
  saveRequestExecutionMode,
  type RequestExecutionMode,
} from "@/lib/request-execution-mode";
import { downloadSchemaFile } from "@/lib/schema-download";
import {
  getSchemaImportDetails,
  importSchemaFromUrl,
  RemoteSchemaImportError,
  shouldConfirmSchemaImport,
  type RemoteSchemaImportErrorCode,
} from "@/lib/schema-import";
import { isPublicHttpServerUrl } from "@/lib/server-url";
import {
  readSavedSchema,
  readServerSavedSchemas,
  saveSchema,
  saveServerSchemaRecord,
  SavedSchemaRecord,
  takeStagedSavedSchemaForEditor,
} from "@/lib/schema-storage";
import { changeTextIndentation } from "@/lib/text-indentation";
import {
  detectTextLineEnding,
  normalizeTextLineEndings,
} from "@/lib/text-line-endings";
import type { NormalizedLineEnding } from "@/lib/text-line-endings";
import { getTextOffset, getTextPosition } from "@/lib/text-position";
import {
  findTextMatches,
  getNextTextMatchIndex,
  getSearchQueryFromSelection,
} from "@/lib/text-search";
import type { TextSearchDirection } from "@/lib/text-search";
import { getSelectedCharacterCount, getTextStats } from "@/lib/text-stats";
import type { TranslationKey } from "@/lib/translations";

const schemaErrorKeys: Record<string, TranslationKey> = {
  "Schema info.title is required.": "workspace.errors.infoTitleRequired",
  "Schema must be an object.": "workspace.errors.schemaObject",
  "Schema must include an openapi or swagger version.":
    "workspace.errors.versionRequired",
  "Schema paths object is required.": "workspace.errors.pathsRequired",
};

const remoteSchemaImportErrorKeys: Record<
  RemoteSchemaImportErrorCode,
  TranslationKey
> = {
  "empty-schema": "workspace.remoteImportEmpty",
  "fetch-failed": "workspace.remoteImportFetchFailed",
  "http-error": "workspace.remoteImportHttpError",
  "invalid-response": "workspace.remoteImportInvalidResponse",
  "invalid-url": "workspace.remoteImportInvalidUrl",
  "too-large": "workspace.remoteImportTooLarge",
};

// Parsing (YAML/JSON + endpoint extraction) is real work for larger
// documents, so it's debounced off the raw keystroke: typing itself stays
// instant since the textarea always renders the undebounced schemaText.
const SCHEMA_PARSE_DEBOUNCE_MS = 200;
const EMPTY_ENDPOINTS: EndpointSummary[] = [];
const EDITOR_FONT_SIZE_CLASSES: Record<EditorFontSize, string> = {
  large: "text-base leading-8",
  medium: "text-sm leading-7",
  small: "text-xs leading-6",
};

type SwaggerWorkspaceProps = {
  initialIsAuthenticated?: boolean;
};

type DraftStatus = "failed" | "idle" | "pending" | "saved";

export function SwaggerWorkspace({
  initialIsAuthenticated = false,
}: SwaggerWorkspaceProps = {}) {
  const { t } = useI18n();
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const endpointFilterInputRef = useRef<HTMLInputElement>(null);
  const goToLineInputRef = useRef<HTMLInputElement>(null);
  const schemaSearchInputRef = useRef<HTMLInputElement>(null);
  const editorSelectionRef = useRef({ end: 0, start: 0 });
  const pendingEditorSelectionRef = useRef<{
    end: number;
    start: number;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const remoteImportAbortControllerRef = useRef<AbortController | null>(null);
  const schemaImportSequenceRef = useRef(0);
  const [schemaText, setSchemaText] = useState(DEFAULT_OPENAPI_SCHEMA);
  const [editorCursor, setEditorCursor] = useState({ column: 1, line: 1 });
  const [selectedCharacterCount, setSelectedCharacterCount] = useState(0);
  const [isWordWrapEnabled, setIsWordWrapEnabled] = useState(false);
  const [editorFontSize, setEditorFontSize] = useState<EditorFontSize>(
    DEFAULT_EDITOR_FONT_SIZE,
  );
  const [editorIndentSize, setEditorIndentSize] = useState<EditorIndentSize>(
    DEFAULT_EDITOR_INDENT_SIZE,
  );
  const [schemaSearch, setSchemaSearch] = useState("");
  const [isSchemaSearchCaseSensitive, setIsSchemaSearchCaseSensitive] =
    useState(false);
  const [isSchemaSearchWholeWord, setIsSchemaSearchWholeWord] = useState(false);
  const [activeSchemaMatchIndex, setActiveSchemaMatchIndex] = useState(-1);
  const hasEditedSchemaRef = useRef(false);
  const lastSavedSchemaRef = useRef<SavedSchemaRecord | null>(null);
  const { isAuthenticated } = useClientAuthState({
    isAuthenticated: initialIsAuthenticated,
    userName: "User",
  });
  const [saveMessage, setSaveMessage] = useState("");
  const [schemaActionError, setSchemaActionError] = useState("");
  const [copiedSchemaText, setCopiedSchemaText] = useState<string | null>(null);
  const [importError, setImportError] = useState("");
  const [isRemoteImportOpen, setIsRemoteImportOpen] = useState(false);
  const [isRemoteImporting, setIsRemoteImporting] = useState(false);
  const [remoteImportError, setRemoteImportError] = useState("");
  const [remoteImportUrl, setRemoteImportUrl] = useState("");
  const [draftStatus, setDraftStatus] = useState<DraftStatus>("idle");
  const [isDraggingSchemaFile, setIsDraggingSchemaFile] = useState(false);
  const [endpointFilter, setEndpointFilter] = useState("");
  const [endpointSort, setEndpointSort] = useState<EndpointSort>("schema");
  const [endpointTraitFilter, setEndpointTraitFilter] =
    useState<EndpointTraitFilter>("all");
  const [endpointResponseFilter, setEndpointResponseFilter] =
    useState<EndpointResponseFilter>("all");
  const [favoriteEndpointKeys, setFavoriteEndpointKeys] = useState<string[]>(
    [],
  );
  const [showFavoriteEndpointsOnly, setShowFavoriteEndpointsOnly] =
    useState(false);
  const [favoriteSaveError, setFavoriteSaveError] = useState(false);
  const [schemaComparisonBaseline, setSchemaComparisonBaseline] =
    useState<SchemaComparisonBaseline | null>(null);
  const [schemaComparisonStorageError, setSchemaComparisonStorageError] =
    useState(false);
  const [schemaComparisonCaptureError, setSchemaComparisonCaptureError] =
    useState(false);
  const [selectedMethod, setSelectedMethod] = useState("all");
  const [selectedTag, setSelectedTag] = useState("all");
  const [selectedServerUrl, setSelectedServerUrl] = useState("");
  const [serverOverrideInput, setServerOverrideInput] = useState("");
  const [serverUrlOverride, setServerUrlOverride] = useState("");
  const [serverOverrideError, setServerOverrideError] = useState(false);
  const [requestEnvironmentSettings, setRequestEnvironmentSettings] =
    useState<RequestEnvironmentSettings>(() =>
      createEmptyRequestEnvironmentSettings(),
    );
  const [requestEnvironmentStorageError, setRequestEnvironmentStorageError] =
    useState(false);
  const [requestExecutionMode, setRequestExecutionMode] =
    useState<RequestExecutionMode>(DEFAULT_REQUEST_EXECUTION_MODE);
  const [
    requestExecutionModeStorageError,
    setRequestExecutionModeStorageError,
  ] = useState(false);
  const [requestAuthValues, setRequestAuthValues] = useState<RequestAuthValues>(
    {},
  );
  const requestAuthScopeRef = useRef("");
  const [requestPresets, setRequestPresets] = useState<RequestPreset[]>([]);
  const debouncedSchemaText = useDebouncedValue(
    schemaText,
    SCHEMA_PARSE_DEBOUNCE_MS,
  );
  const parseResult = useMemo(
    () => parseOpenApiSchema(debouncedSchemaText),
    [debouncedSchemaText],
  );
  const schemaStats = useMemo(() => getTextStats(schemaText), [schemaText]);
  const detectedLineEnding = useMemo(
    () => detectTextLineEnding(schemaText),
    [schemaText],
  );
  const schemaEditorText = useMemo(
    () => normalizeTextLineEndings(schemaText, "lf"),
    [schemaText],
  );
  const schemaSearchMatches = useMemo(
    () =>
      findTextMatches(
        schemaEditorText,
        schemaSearch,
        isSchemaSearchCaseSensitive,
        isSchemaSearchWholeWord,
      ),
    [
      isSchemaSearchCaseSensitive,
      isSchemaSearchWholeWord,
      schemaEditorText,
      schemaSearch,
    ],
  );
  const activeSchemaMatchNumber =
    activeSchemaMatchIndex >= 0 &&
    activeSchemaMatchIndex < schemaSearchMatches.length
      ? activeSchemaMatchIndex + 1
      : 0;
  const detectedFormat = parseResult.ok
    ? parseResult.value.format
    : parseResult.format;
  const targetFormat: SchemaFormat =
    detectedFormat === "yaml" ? "json" : "yaml";
  const parsedEndpoints = parseResult.ok
    ? parseResult.value.endpoints
    : EMPTY_ENDPOINTS;
  const securitySchemes = parseResult.ok
    ? parseResult.value.securitySchemes
    : [];
  const serverUrls = parseResult.ok ? parseResult.value.serverUrls : [];
  const requestAuthScope = parseResult.ok
    ? `${parseResult.value.title}\u0000${serverUrls.join("\u0000")}`
    : "";
  const declaredServerUrl =
    selectedServerUrl && serverUrls.includes(selectedServerUrl)
      ? selectedServerUrl
      : parseResult.ok
        ? parseResult.value.serverUrl
        : "";
  const activeRequestEnvironment = getActiveRequestEnvironment(
    requestEnvironmentSettings,
  );
  const requestEnvironmentHeaders = useMemo(
    () => getEnabledRequestEnvironmentHeaders(activeRequestEnvironment),
    [activeRequestEnvironment],
  );
  const activeServerUrl =
    serverUrlOverride ||
    activeRequestEnvironment?.serverUrl ||
    declaredServerUrl;
  const endpoints = useMemo(
    () =>
      parsedEndpoints.map((endpoint) =>
        endpoint.serverUrl === activeServerUrl
          ? endpoint
          : { ...endpoint, serverUrl: activeServerUrl },
      ),
    [activeServerUrl, parsedEndpoints],
  );

  useEffect(() => {
    if (!requestAuthScope) {
      return;
    }

    if (!requestAuthScopeRef.current) {
      requestAuthScopeRef.current = requestAuthScope;
      return;
    }

    if (requestAuthScopeRef.current !== requestAuthScope) {
      requestAuthScopeRef.current = requestAuthScope;
      setRequestAuthValues({});
    }
  }, [requestAuthScope]);
  const endpointStats = useMemo(
    () => createEndpointStats(endpoints),
    [endpoints],
  );
  const schemaAuditReport = useMemo(
    () => createSchemaAuditReport(parsedEndpoints),
    [parsedEndpoints],
  );
  const schemaChangeReport = useMemo(
    () =>
      schemaComparisonBaseline
        ? createSchemaChangeReport(
            schemaComparisonBaseline.endpoints,
            parsedEndpoints,
          )
        : null,
    [parsedEndpoints, schemaComparisonBaseline],
  );
  const activeMethod =
    selectedMethod === "all" || endpointStats.methods.includes(selectedMethod)
      ? selectedMethod
      : "all";
  const activeTag =
    selectedTag === "all" || endpointStats.tags.includes(selectedTag)
      ? selectedTag
      : "all";
  const normalizedFilter = endpointFilter.trim().toLowerCase();
  const filteredEndpoints = normalizedFilter
    ? endpoints.filter(
        (endpoint) =>
          endpoint.method.toLowerCase().includes(normalizedFilter) ||
          endpoint.path.toLowerCase().includes(normalizedFilter) ||
          endpoint.summary.toLowerCase().includes(normalizedFilter) ||
          endpoint.operationId.toLowerCase().includes(normalizedFilter) ||
          endpoint.parameters.some(
            (parameter) =>
              parameter.name.toLowerCase().includes(normalizedFilter) ||
              parameter.description.toLowerCase().includes(normalizedFilter),
          ) ||
          endpoint.tags.some((tag) =>
            tag.toLowerCase().includes(normalizedFilter),
          ) ||
          endpoint.securityRequirements.some((requirement) =>
            requirement.toLowerCase().includes(normalizedFilter),
          ),
      )
    : endpoints;
  const methodFilteredEndpoints =
    activeMethod === "all"
      ? filteredEndpoints
      : filteredEndpoints.filter(
          (endpoint) => endpoint.method === activeMethod,
        );
  const tagFilteredEndpoints =
    activeTag === "all"
      ? methodFilteredEndpoints
      : methodFilteredEndpoints.filter((endpoint) =>
          endpoint.tags.includes(activeTag),
        );
  const favoriteEndpointKeySet = new Set(favoriteEndpointKeys);
  const favoriteEndpointCount = endpoints.filter((endpoint) =>
    favoriteEndpointKeySet.has(
      getEndpointFavoriteKey(endpoint.method, endpoint.path),
    ),
  ).length;
  const favoriteFilteredEndpoints = showFavoriteEndpointsOnly
    ? tagFilteredEndpoints.filter((endpoint) =>
        favoriteEndpointKeySet.has(
          getEndpointFavoriteKey(endpoint.method, endpoint.path),
        ),
      )
    : tagFilteredEndpoints;
  const traitFilteredEndpoints = filterEndpointsByTrait(
    favoriteFilteredEndpoints,
    endpointTraitFilter,
  );
  const responseFilteredEndpoints = filterEndpointsByResponse(
    traitFilteredEndpoints,
    endpointResponseFilter,
  );
  const visibleEndpoints = sortEndpoints(
    responseFilteredEndpoints,
    endpointSort,
  );
  const hasActiveEndpointFilters =
    Boolean(endpointFilter) ||
    selectedMethod !== "all" ||
    selectedTag !== "all" ||
    showFavoriteEndpointsOnly ||
    endpointTraitFilter !== "all" ||
    endpointResponseFilter !== "all";
  const isSchemaCopied =
    copiedSchemaText !== null && copiedSchemaText === schemaText;

  useLayoutEffect(() => {
    const editor = editorRef.current;

    if (!editor) {
      return;
    }

    editor.style.height = "auto";
    editor.style.height = `${Math.max(editor.scrollHeight, 430)}px`;

    const pendingSelection = pendingEditorSelectionRef.current;

    if (pendingSelection) {
      editor.setSelectionRange(pendingSelection.start, pendingSelection.end);
      pendingEditorSelectionRef.current = null;
    }

    editorSelectionRef.current = {
      end: editor.selectionEnd,
      start: editor.selectionStart,
    };

    setSelectedCharacterCount(
      getSelectedCharacterCount(
        editor.value,
        editor.selectionStart,
        editor.selectionEnd,
      ),
    );
  }, [editorFontSize, isWordWrapEnabled, schemaText]);

  useEffect(() => {
    const storedWordWrapPreference = readEditorWordWrapPreference();
    const storedFontSizePreference = readEditorFontSizePreference();
    const storedIndentSizePreference = readEditorIndentSizePreference();
    const storedSearchMatchCasePreference =
      readEditorSearchMatchCasePreference();
    const storedSearchWholeWordPreference =
      readEditorSearchWholeWordPreference();
    const storedEndpointSortPreference = readEndpointSortPreference();
    const storedEndpointFavorites = readEndpointFavorites();
    const storedSchemaComparisonBaseline = readSchemaComparisonBaseline();
    const storedRequestEnvironmentSettings = readRequestEnvironmentSettings();
    const storedRequestExecutionMode = readRequestExecutionMode();
    const storedRequestPresets = readRequestPresets();
    let cancelled = false;

    queueMicrotask(() => {
      if (!cancelled) {
        setIsWordWrapEnabled(storedWordWrapPreference);
        setEditorFontSize(storedFontSizePreference);
        setEditorIndentSize(storedIndentSizePreference);
        setIsSchemaSearchCaseSensitive(storedSearchMatchCasePreference);
        setIsSchemaSearchWholeWord(storedSearchWholeWordPreference);
        setEndpointSort(storedEndpointSortPreference);
        setFavoriteEndpointKeys(storedEndpointFavorites);
        setSchemaComparisonBaseline(storedSchemaComparisonBaseline);
        setRequestEnvironmentSettings(storedRequestEnvironmentSettings);
        setRequestExecutionMode(storedRequestExecutionMode);
        setRequestPresets(storedRequestPresets);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(
    () => () => {
      remoteImportAbortControllerRef.current?.abort();
    },
    [],
  );

  useEffect(() => {
    function handleEndpointSearchShortcut(event: KeyboardEvent) {
      const filterInput = endpointFilterInputRef.current;

      if (
        !filterInput ||
        !isEndpointSearchShortcut(event) ||
        isEditableShortcutTarget(event.target)
      ) {
        return;
      }

      event.preventDefault();
      filterInput.focus();
    }

    window.addEventListener("keydown", handleEndpointSearchShortcut);

    return () => {
      window.removeEventListener("keydown", handleEndpointSearchShortcut);
    };
  }, []);

  useEffect(() => {
    if (isAuthenticated || hasEditedSchemaRef.current) {
      return;
    }

    const draft = readSchemaDraft();

    if (!draft) {
      return;
    }

    let cancelled = false;

    queueMicrotask(() => {
      if (!cancelled && !hasEditedSchemaRef.current) {
        setSchemaText(draft);
        setEditorCursor({ column: 1, line: 1 });
        setDraftStatus("saved");
      }
    });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated || !hasEditedSchemaRef.current) {
      return;
    }

    const saved = saveSchemaDraft(debouncedSchemaText);
    let cancelled = false;

    queueMicrotask(() => {
      if (!cancelled) {
        setDraftStatus(saved ? "saved" : "failed");
      }
    });

    return () => {
      cancelled = true;
    };
  }, [debouncedSchemaText, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    hasEditedSchemaRef.current = false;

    const stagedSchema = takeStagedSavedSchemaForEditor();
    let cancelled = false;

    if (stagedSchema) {
      lastSavedSchemaRef.current = stagedSchema;
      queueMicrotask(() => {
        if (!cancelled) {
          setSchemaText(stagedSchema.schemaText);
          setEditorCursor({ column: 1, line: 1 });
        }
      });

      return () => {
        cancelled = true;
      };
    }

    const savedSchema = readSavedSchema();

    if (savedSchema) {
      lastSavedSchemaRef.current = null;
      queueMicrotask(() => {
        if (!cancelled) {
          setSchemaText(savedSchema);
          setEditorCursor({ column: 1, line: 1 });
        }
      });

      return () => {
        cancelled = true;
      };
    }

    // The server round-trip below can take long enough for the user to
    // start typing before it resolves; applying it unconditionally would
    // silently discard whatever they'd already typed in the meantime.
    void readServerSavedSchemas().then((savedSchemas) => {
      if (cancelled || hasEditedSchemaRef.current) {
        return;
      }

      const latestSchema = savedSchemas[0];

      if (latestSchema) {
        lastSavedSchemaRef.current = latestSchema;
        setSchemaText(latestSchema.schemaText);
        setEditorCursor({ column: 1, line: 1 });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  function markSchemaEdited() {
    invalidateActiveSchemaImport();
    hasEditedSchemaRef.current = true;
    setActiveSchemaMatchIndex(-1);

    if (!isAuthenticated) {
      setDraftStatus("pending");
    }
  }

  function applySchemaFormatting(switchFormat: boolean) {
    // Parse the live editor value here instead of the debounced preview value.
    // Otherwise, a quick click after typing could restore an older document.
    const currentParseResult = parseOpenApiSchema(schemaText);

    if (!currentParseResult.ok) {
      return;
    }

    const currentFormat = currentParseResult.value.format;
    const outputFormat: SchemaFormat = switchFormat
      ? currentFormat === "yaml"
        ? "json"
        : "yaml"
      : currentFormat;
    const formattedSchema = formatOpenApiSchema(
      currentParseResult.value.schema,
      outputFormat,
    );

    if (formattedSchema === schemaText) {
      return;
    }

    markSchemaEdited();
    pendingEditorSelectionRef.current = { end: 0, start: 0 };
    setSchemaText(formattedSchema);
    setEditorCursor({ column: 1, line: 1 });
    setCopiedSchemaText(null);
    setSaveMessage("");
    setSchemaActionError("");
    setImportError("");
  }

  function handleFormatSchema() {
    applySchemaFormatting(false);
  }

  function handleFormatSwitch() {
    applySchemaFormatting(true);
  }

  function handleDownloadSchema() {
    const currentParseResult = parseOpenApiSchema(schemaText);
    const downloaded = downloadSchemaFile(
      schemaText,
      currentParseResult.ok ? currentParseResult.value.title : "openapi-schema",
      currentParseResult.ok
        ? currentParseResult.value.format
        : currentParseResult.format,
    );

    setCopiedSchemaText(null);

    if (downloaded) {
      setSchemaActionError("");
      setSaveMessage(t("workspace.schemaDownloadStarted"));
    } else {
      setSaveMessage("");
      setSchemaActionError(t("workspace.schemaDownloadFailed"));
    }
  }

  async function handleCopySchema() {
    setCopiedSchemaText(null);
    setSaveMessage("");
    setSchemaActionError("");
    const schemaToCopy = schemaText;
    const copied = await writeTextToClipboard(schemaToCopy);

    if (editorRef.current?.value !== schemaToCopy) {
      return;
    }

    if (copied) {
      setCopiedSchemaText(schemaToCopy);
    } else {
      setSchemaActionError(t("workspace.schemaCopyFailed"));
    }
  }

  function handleImportClick() {
    fileInputRef.current?.click();
  }

  function cancelRemoteSchemaImport() {
    const abortController = remoteImportAbortControllerRef.current;

    if (abortController) {
      abortController.abort();
      remoteImportAbortControllerRef.current = null;
      setIsRemoteImporting(false);
    }
  }

  function invalidateActiveSchemaImport() {
    schemaImportSequenceRef.current += 1;
    cancelRemoteSchemaImport();
  }

  function applyImportedSchema(
    importedSchemaText: string,
    importDetails: { byteSize: number; fileName: string },
  ) {
    markSchemaEdited();
    // An imported file is a different document, so the next save must
    // create a new record instead of overwriting whatever was last saved.
    lastSavedSchemaRef.current = null;
    pendingEditorSelectionRef.current = { end: 0, start: 0 };
    setSchemaText(importedSchemaText);
    setEditorCursor({ column: 1, line: 1 });
    setCopiedSchemaText(null);
    setSaveMessage(
      t("workspace.schemaImported", {
        file: importDetails.fileName,
        size: String(importDetails.byteSize),
      }),
    );
    setSchemaActionError("");
    setImportError("");
    setRemoteImportError("");
  }

  function readSchemaFile(file: File) {
    cancelRemoteSchemaImport();
    const importSequence = ++schemaImportSequenceRef.current;

    setImportError("");
    setRemoteImportError("");
    setIsRemoteImportOpen(false);

    if (
      shouldConfirmSchemaImport(file.size) &&
      !window.confirm(t("workspace.confirmLargeImport"))
    ) {
      return;
    }

    const importDetails = getSchemaImportDetails(file);
    const reader = new FileReader();

    setSaveMessage("");
    setSchemaActionError("");

    reader.onload = () => {
      if (importSequence !== schemaImportSequenceRef.current) {
        return;
      }

      if (typeof reader.result !== "string") {
        setImportError(t("workspace.errors.fileReadFailed"));
        return;
      }

      applyImportedSchema(reader.result, importDetails);
    };
    reader.onerror = () => {
      if (importSequence === schemaImportSequenceRef.current) {
        setImportError(t("workspace.errors.fileReadFailed"));
      }
    };
    reader.readAsText(file);
  }

  async function handleRemoteSchemaImport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isRemoteImporting) {
      return;
    }

    cancelRemoteSchemaImport();
    const importSequence = ++schemaImportSequenceRef.current;
    const abortController = new AbortController();

    remoteImportAbortControllerRef.current = abortController;
    setIsRemoteImporting(true);
    setRemoteImportError("");
    setImportError("");
    setSaveMessage("");
    setSchemaActionError("");

    try {
      const result = await importSchemaFromUrl(
        remoteImportUrl,
        abortController.signal,
      );

      if (
        importSequence !== schemaImportSequenceRef.current ||
        remoteImportAbortControllerRef.current !== abortController
      ) {
        return;
      }

      applyImportedSchema(result.schemaText, result);
      setRemoteImportUrl(result.sourceUrl);
      setIsRemoteImportOpen(false);
    } catch (error) {
      if (
        abortController.signal.aborted ||
        (typeof error === "object" &&
          error !== null &&
          "name" in error &&
          error.name === "AbortError")
      ) {
        return;
      }

      const remoteError =
        error instanceof RemoteSchemaImportError
          ? error
          : new RemoteSchemaImportError("fetch-failed");

      setRemoteImportError(
        t(remoteSchemaImportErrorKeys[remoteError.code], {
          status:
            remoteError.status === null ? "?" : String(remoteError.status),
        }),
      );
    } finally {
      if (remoteImportAbortControllerRef.current === abortController) {
        remoteImportAbortControllerRef.current = null;
        setIsRemoteImporting(false);
      }
    }
  }

  function handleRemoteImportPanelToggle() {
    if (isRemoteImportOpen) {
      invalidateActiveSchemaImport();
    }

    setIsRemoteImportOpen((isOpen) => !isOpen);
    setRemoteImportError("");
  }

  function handleFileSelected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    event.target.value = "";

    if (file) {
      readSchemaFile(file);
    }
  }

  function handleEditorFileDrag(event: ReactDragEvent<HTMLTextAreaElement>) {
    if (!event.dataTransfer.types.includes("Files")) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setIsDraggingSchemaFile(true);
  }

  function handleEditorFileDragLeave() {
    setIsDraggingSchemaFile(false);
  }

  function handleEditorFileDrop(event: ReactDragEvent<HTMLTextAreaElement>) {
    if (!event.dataTransfer.types.includes("Files")) {
      return;
    }

    event.preventDefault();
    setIsDraggingSchemaFile(false);

    const file = event.dataTransfer.files[0];

    if (file) {
      readSchemaFile(file);
    }
  }

  function handleResetEditor() {
    if (!window.confirm(t("workspace.resetEditorConfirm"))) {
      return;
    }

    invalidateActiveSchemaImport();
    clearSchemaDraft();
    hasEditedSchemaRef.current = false;
    setDraftStatus("idle");
    lastSavedSchemaRef.current = null;
    setSchemaText(DEFAULT_OPENAPI_SCHEMA);
    setEditorCursor({ column: 1, line: 1 });
    setSelectedCharacterCount(0);
    editorRef.current?.setSelectionRange(0, 0);
    editorSelectionRef.current = { end: 0, start: 0 };
    setCopiedSchemaText(null);
    setSaveMessage("");
    setSchemaActionError("");
    setImportError("");
    setIsRemoteImportOpen(false);
    setRemoteImportError("");
    setRemoteImportUrl("");
    setSchemaSearch("");
    setActiveSchemaMatchIndex(-1);
    setEndpointFilter("");
    setEndpointResponseFilter("all");
    setEndpointTraitFilter("all");
    setShowFavoriteEndpointsOnly(false);
    setSelectedMethod("all");
    setSelectedTag("all");
    setSelectedServerUrl("");
    setServerOverrideInput("");
    setServerUrlOverride("");
    setServerOverrideError(false);
    setFavoriteSaveError(false);
    setSchemaComparisonCaptureError(false);
  }

  function handleResetEndpointFilters() {
    setEndpointFilter("");
    setEndpointResponseFilter("all");
    setEndpointTraitFilter("all");
    setShowFavoriteEndpointsOnly(false);
    setSelectedMethod("all");
    setSelectedTag("all");
  }

  function handleToggleEndpointFavorite(endpoint: EndpointSummary) {
    const nextFavorites = toggleEndpointFavorite(
      favoriteEndpointKeys,
      endpoint.method,
      endpoint.path,
    );

    setFavoriteEndpointKeys(nextFavorites);
    setFavoriteSaveError(!saveEndpointFavorites(nextFavorites));
  }

  function handleSetSchemaComparisonBaseline() {
    const currentParseResult = parseOpenApiSchema(schemaText);

    if (!currentParseResult.ok) {
      setSchemaComparisonCaptureError(true);
      return;
    }

    const baseline = createSchemaComparisonBaseline(
      currentParseResult.value.endpoints,
      {
        title: currentParseResult.value.title,
        version: currentParseResult.value.version,
      },
    );

    setSchemaComparisonBaseline(baseline);
    setSchemaComparisonCaptureError(false);
    setSchemaComparisonStorageError(!saveSchemaComparisonBaseline(baseline));
  }

  function handleClearSchemaComparisonBaseline() {
    setSchemaComparisonBaseline(null);
    setSchemaComparisonCaptureError(false);
    setSchemaComparisonStorageError(!clearSchemaComparisonBaseline());
  }

  function handleSelectAuditEndpoint(method: string, path: string) {
    const endpointAnchor = getEndpointAnchor(method, path);

    setEndpointFilter(path);
    setEndpointResponseFilter("all");
    setEndpointTraitFilter("all");
    setShowFavoriteEndpointsOnly(false);
    setSelectedMethod(method);
    setSelectedTag("all");
    window.history.replaceState(null, "", `#${endpointAnchor}`);
    window.setTimeout(() => {
      document
        .getElementById(endpointAnchor)
        ?.scrollIntoView?.({ behavior: "smooth", block: "start" });
    }, 0);
  }

  function handleApplyServerOverride(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const serverUrl = serverOverrideInput.trim();

    if (!isPublicHttpServerUrl(serverUrl)) {
      setServerOverrideError(true);
      return;
    }

    setServerOverrideInput(serverUrl);
    setServerUrlOverride(serverUrl);
    setServerOverrideError(false);
  }

  function handleClearServerOverride() {
    setServerOverrideInput("");
    setServerUrlOverride("");
    setServerOverrideError(false);
  }

  function handleDeclaredServerChange(serverUrl: string) {
    setSelectedServerUrl(serverUrl);
    handleClearServerOverride();
  }

  function handleRequestEnvironmentSettingsChange(
    settings: RequestEnvironmentSettings,
  ) {
    setRequestEnvironmentSettings(settings);
    setRequestEnvironmentStorageError(
      !saveRequestEnvironmentSettings(settings),
    );
  }

  function handleRequestExecutionModeChange(mode: RequestExecutionMode) {
    setRequestExecutionMode(mode);
    setRequestExecutionModeStorageError(!saveRequestExecutionMode(mode));
  }

  function handleSaveRequestPreset(preset: RequestPreset) {
    const nextPresets = upsertRequestPreset(requestPresets, preset);

    setRequestPresets(nextPresets);
    return saveRequestPresets(nextPresets);
  }

  function handleDeleteRequestPreset(presetId: string) {
    const nextPresets = removeRequestPreset(requestPresets, presetId);

    setRequestPresets(nextPresets);
    return saveRequestPresets(nextPresets);
  }

  function handleEditorSelection(event: SyntheticEvent<HTMLTextAreaElement>) {
    const editor = event.currentTarget;

    editorSelectionRef.current = {
      end: editor.selectionEnd,
      start: editor.selectionStart,
    };
    setEditorCursor(getTextPosition(editor.value, editor.selectionStart));
    setSelectedCharacterCount(
      getSelectedCharacterCount(
        editor.value,
        editor.selectionStart,
        editor.selectionEnd,
      ),
    );
  }

  function handleWordWrapChange(event: ChangeEvent<HTMLInputElement>) {
    updateWordWrapPreference(event.currentTarget.checked);
  }

  function handleEditorFontSizeChange(event: ChangeEvent<HTMLSelectElement>) {
    const fontSize = event.currentTarget.value as EditorFontSize;

    setEditorFontSize(fontSize);
    saveEditorFontSizePreference(fontSize);
  }

  function handleEditorIndentSizeChange(event: ChangeEvent<HTMLSelectElement>) {
    const indentSize = Number(event.currentTarget.value) as EditorIndentSize;

    setEditorIndentSize(indentSize);
    saveEditorIndentSizePreference(indentSize);
  }

  function handleLineEndingChange(event: ChangeEvent<HTMLSelectElement>) {
    const lineEnding = event.currentTarget.value;
    const editor = editorRef.current;

    if (!editor || (lineEnding !== "lf" && lineEnding !== "crlf")) {
      return;
    }

    const normalizedLineEnding: NormalizedLineEnding = lineEnding;
    const currentSelection = editorSelectionRef.current;
    const selectionStartPosition = getTextPosition(
      editor.value,
      currentSelection.start,
    );
    const selectionEndPosition = getTextPosition(
      editor.value,
      currentSelection.end,
    );
    const nextSchemaText = normalizeTextLineEndings(
      schemaText,
      normalizedLineEnding,
    );

    if (nextSchemaText === schemaText) {
      return;
    }

    const nextEditorValue = normalizeTextLineEndings(nextSchemaText, "lf");
    const selectionStart = getTextOffset(
      nextEditorValue,
      selectionStartPosition,
    );
    const selectionEnd = getTextOffset(nextEditorValue, selectionEndPosition);

    markSchemaEdited();
    pendingEditorSelectionRef.current = {
      end: selectionEnd,
      start: selectionStart,
    };
    setSchemaText(nextSchemaText);
    setEditorCursor(getTextPosition(nextEditorValue, selectionStart));
    setSelectedCharacterCount(
      getSelectedCharacterCount(nextEditorValue, selectionStart, selectionEnd),
    );
    setCopiedSchemaText(null);
    setSaveMessage("");
    setSchemaActionError("");
    setImportError("");
  }

  function updateWordWrapPreference(enabled: boolean) {
    setIsWordWrapEnabled(enabled);
    saveEditorWordWrapPreference(enabled);
  }

  function focusSchemaSearch(query: string | null = null) {
    const input = schemaSearchInputRef.current;

    if (input) {
      const shouldUpdateQuery = query !== null && query !== schemaSearch;

      if (shouldUpdateQuery) {
        setSchemaSearch(query);
        setActiveSchemaMatchIndex(-1);
      }

      input.focus();
      input.select();

      if (shouldUpdateQuery) {
        queueMicrotask(() => {
          if (schemaSearchInputRef.current === input) {
            input.select();
          }
        });
      }
    }
  }

  function navigateSchemaSearch(direction: TextSearchDirection) {
    const editor = editorRef.current;

    if (!editor) {
      return;
    }

    const currentSelection = editorSelectionRef.current;
    const matchIndex = getNextTextMatchIndex(
      schemaSearchMatches,
      currentSelection.start,
      currentSelection.end,
      direction,
    );
    const match = schemaSearchMatches[matchIndex];

    if (!match) {
      setActiveSchemaMatchIndex(-1);
      return;
    }

    editor.focus();
    editor.setSelectionRange(match.start, match.end);
    editorSelectionRef.current = { end: match.end, start: match.start };
    setEditorCursor(getTextPosition(editor.value, match.start));
    setSelectedCharacterCount(
      getSelectedCharacterCount(editor.value, match.start, match.end),
    );
    setActiveSchemaMatchIndex(matchIndex);
    schemaSearchInputRef.current?.focus();
  }

  function handleSchemaSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    navigateSchemaSearch("next");
  }

  function handleSchemaSearchKeyDown(
    event: ReactKeyboardEvent<HTMLInputElement>,
  ) {
    const navigationDirection = getSchemaSearchNavigationDirection(event);

    if (navigationDirection) {
      event.preventDefault();
      navigateSchemaSearch(navigationDirection);
      return;
    }

    if (!isCancelRequestShortcut(event)) {
      return;
    }

    event.preventDefault();
    setSchemaSearch("");
    setActiveSchemaMatchIndex(-1);

    const editor = editorRef.current;
    const currentSelection = editorSelectionRef.current;

    if (editor) {
      editor.focus();
      editor.setSelectionRange(currentSelection.start, currentSelection.end);
    }
  }

  function handleGoToLine(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const editor = editorRef.current;
    const input = goToLineInputRef.current;

    if (!editor || !input) {
      return;
    }

    const requestedLine = Number(input.value);
    const line = Number.isFinite(requestedLine)
      ? Math.min(Math.max(Math.trunc(requestedLine), 1), schemaStats.lineCount)
      : 1;
    const offset = getTextOffset(schemaEditorText, { column: 1, line });

    input.value = String(line);
    editor.focus();
    editor.setSelectionRange(offset, offset);
    editorSelectionRef.current = { end: offset, start: offset };
    setEditorCursor(getTextPosition(schemaEditorText, offset));
    setSelectedCharacterCount(0);
  }

  function handleEditorKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (isDownloadSchemaShortcut(event)) {
      event.preventDefault();
      handleDownloadSchema();
      return;
    }

    if (isSaveSchemaShortcut(event)) {
      event.preventDefault();

      if (isAuthenticated) {
        handleSaveSchema();
      }

      return;
    }

    if (isFindInSchemaShortcut(event)) {
      event.preventDefault();
      focusSchemaSearch(
        getSearchQueryFromSelection(
          event.currentTarget.value,
          event.currentTarget.selectionStart,
          event.currentTarget.selectionEnd,
        ),
      );
      return;
    }

    if (isImportSchemaShortcut(event)) {
      event.preventDefault();
      handleImportClick();
      return;
    }

    const searchNavigationDirection = getSchemaSearchNavigationDirection(event);

    if (schemaSearch && event.key === "F3" && searchNavigationDirection) {
      event.preventDefault();
      navigateSchemaSearch(searchNavigationDirection);
      return;
    }

    if (isFormatSchemaShortcut(event)) {
      event.preventDefault();
      handleFormatSchema();
      return;
    }

    if (isToggleWordWrapShortcut(event)) {
      event.preventDefault();
      updateWordWrapPreference(!isWordWrapEnabled);
      return;
    }

    if (isGoToLineShortcut(event)) {
      event.preventDefault();

      const input = goToLineInputRef.current;

      if (input) {
        input.value = String(editorCursor.line);
        input.focus();
      }

      return;
    }

    if (event.key !== "Tab") {
      return;
    }

    event.preventDefault();

    const editor = event.currentTarget;
    const result = changeTextIndentation(
      editor.value,
      editor.selectionStart,
      editor.selectionEnd,
      event.shiftKey,
      editorIndentSize,
    );

    setEditorCursor(getTextPosition(result.value, result.selectionStart));
    editorSelectionRef.current = {
      end: result.selectionEnd,
      start: result.selectionStart,
    };
    setSelectedCharacterCount(
      getSelectedCharacterCount(
        result.value,
        result.selectionStart,
        result.selectionEnd,
      ),
    );

    if (result.value === editor.value) {
      editor.setSelectionRange(result.selectionStart, result.selectionEnd);
      return;
    }

    markSchemaEdited();
    pendingEditorSelectionRef.current = {
      end: result.selectionEnd,
      start: result.selectionStart,
    };
    setSchemaText(
      detectedLineEnding === "crlf"
        ? normalizeTextLineEndings(result.value, "crlf")
        : result.value,
    );
    setCopiedSchemaText(null);
    setSaveMessage("");
    setSchemaActionError("");
    setImportError("");
  }

  function handleSaveSchema() {
    if (!isAuthenticated) {
      return;
    }

    // Keep the persisted text and its metadata on the same revision even
    // when save is triggered before the debounced preview has caught up.
    const currentParseResult = parseOpenApiSchema(schemaText);

    if (!currentParseResult.ok) {
      return;
    }

    const savedSchema = saveSchema(schemaText, {
      createdAt: lastSavedSchemaRef.current?.createdAt,
      format: currentParseResult.value.format,
      id: lastSavedSchemaRef.current?.id,
      title: currentParseResult.value.title,
      version: currentParseResult.value.version,
    });

    if (savedSchema) {
      lastSavedSchemaRef.current = savedSchema;
      clearSchemaDraft();
      setDraftStatus("idle");
      void saveServerSchemaRecord(savedSchema);
      setSchemaActionError("");
      setSaveMessage(t("workspace.schemaSaved"));
    } else {
      setSaveMessage("");
      setSchemaActionError(t("workspace.schemaSaveFailed"));
    }

    setCopiedSchemaText(null);
  }

  function handleGoToSchemaError() {
    if (parseResult.ok || !parseResult.errorPosition) {
      return;
    }

    const editor = editorRef.current;

    if (!editor) {
      return;
    }

    const offset = Math.min(
      parseResult.errorPosition.offset,
      schemaText.length,
    );

    editor.focus();
    editor.setSelectionRange(offset, offset);
    editorSelectionRef.current = { end: offset, start: offset };
    setEditorCursor(getTextPosition(schemaText, offset));
    setSelectedCharacterCount(0);
  }

  function getSchemaErrorMessage(error: string) {
    const errorKey = schemaErrorKeys[error];

    return errorKey ? t(errorKey) : error;
  }

  return (
    <section className="swagger-workspace mx-auto grid w-full max-w-[1600px] gap-6">
      <div className="min-h-[560px] overflow-hidden rounded-[28px] border border-[color:var(--color-brand-border)] bg-white shadow-[0_18px_45px_rgba(64,45,137,0.1)]">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[color:var(--color-brand-border)] px-5 py-4">
          <div>
            <p className="text-sm font-extrabold uppercase text-[color:var(--color-brand-purple)]">
              {t("workspace.editor")}
            </p>
            <h1 className="mt-1 text-2xl font-extrabold text-[color:var(--color-brand-navy)]">
              {t("workspace.openApiSchema")}
            </h1>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3">
            <span
              className={`rounded-2xl px-4 py-2 text-sm font-bold ${
                parseResult.ok
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-red-100 text-red-700"
              }`}
            >
              {parseResult.ok ? t("workspace.valid") : t("workspace.invalid")}
            </span>
            <span className="rounded-2xl bg-[color:var(--color-brand-soft)] px-4 py-2 text-sm font-bold uppercase text-[color:var(--color-brand-purple)]">
              {detectedFormat.toUpperCase()}
            </span>
            <input
              ref={fileInputRef}
              className="hidden"
              type="file"
              accept=".yaml,.yml,.json,.txt"
              aria-label="Import OpenAPI schema file"
              onChange={handleFileSelected}
            />
            <button
              className="rounded-2xl border border-[color:var(--color-brand-border)] px-4 py-2 text-sm font-extrabold text-[color:var(--color-brand-muted)] transition hover:border-[color:var(--color-brand-purple)] hover:text-[color:var(--color-brand-purple)]"
              type="button"
              onClick={handleResetEditor}
            >
              {t("workspace.resetEditor")}
            </button>
            <button
              aria-keyshortcuts="Control+O Meta+O"
              className="rounded-2xl border border-[color:var(--color-brand-purple)] px-4 py-2 text-sm font-extrabold text-[color:var(--color-brand-purple)] transition hover:bg-[color:var(--color-brand-soft)]"
              type="button"
              onClick={handleImportClick}
            >
              {t("workspace.import")}
            </button>
            <button
              aria-controls="remote-schema-import"
              aria-expanded={isRemoteImportOpen}
              className="rounded-2xl border border-[color:var(--color-brand-purple)] px-4 py-2 text-sm font-extrabold text-[color:var(--color-brand-purple)] transition hover:bg-[color:var(--color-brand-soft)]"
              type="button"
              onClick={handleRemoteImportPanelToggle}
            >
              {t(
                isRemoteImportOpen
                  ? "workspace.remoteImportClose"
                  : "workspace.remoteImportOpen",
              )}
            </button>
            <button
              className="rounded-2xl border border-[color:var(--color-brand-purple)] px-4 py-2 text-sm font-extrabold text-[color:var(--color-brand-purple)] transition hover:bg-[color:var(--color-brand-soft)]"
              type="button"
              onClick={handleCopySchema}
            >
              {t("workspace.copySchema")}
            </button>
            <button
              aria-keyshortcuts="Control+Shift+S Meta+Shift+S"
              className="rounded-2xl border border-[color:var(--color-brand-purple)] px-4 py-2 text-sm font-extrabold text-[color:var(--color-brand-purple)] transition hover:bg-[color:var(--color-brand-soft)]"
              type="button"
              onClick={handleDownloadSchema}
            >
              {t("workspace.download")}
            </button>
            <button
              aria-keyshortcuts="Control+Shift+F Meta+Shift+F"
              className="rounded-2xl border border-[color:var(--color-brand-purple)] px-4 py-2 text-sm font-extrabold text-[color:var(--color-brand-purple)] transition hover:bg-[color:var(--color-brand-soft)] disabled:cursor-not-allowed disabled:border-[color:var(--color-brand-border)] disabled:text-[color:var(--color-brand-muted)]"
              disabled={!parseResult.ok}
              type="button"
              onClick={handleFormatSchema}
            >
              {t("workspace.formatSchema")}
            </button>
            <button
              className="rounded-2xl border border-[color:var(--color-brand-purple)] px-4 py-2 text-sm font-extrabold text-[color:var(--color-brand-purple)] transition hover:bg-[color:var(--color-brand-soft)] disabled:cursor-not-allowed disabled:border-[color:var(--color-brand-border)] disabled:text-[color:var(--color-brand-muted)]"
              disabled={!parseResult.ok}
              type="button"
              onClick={handleFormatSwitch}
            >
              {t("workspace.convertTo", {
                format: targetFormat.toUpperCase(),
              })}
            </button>
            <button
              aria-keyshortcuts="Control+S Meta+S"
              className="rounded-2xl bg-[linear-gradient(135deg,var(--color-brand-purple),var(--color-brand-purple-dark))] px-4 py-2 text-sm font-extrabold text-white shadow-[0_12px_26px_rgba(90,45,255,0.2)] transition hover:translate-y-[-1px] disabled:cursor-not-allowed disabled:bg-none disabled:bg-[color:var(--color-brand-border)] disabled:text-[color:var(--color-brand-muted)] disabled:shadow-none disabled:hover:translate-y-0"
              disabled={!isAuthenticated || !parseResult.ok}
              type="button"
              onClick={handleSaveSchema}
            >
              {t("workspace.saveSchema")}
            </button>
          </div>
        </div>
        {isRemoteImportOpen ? (
          <div
            className="border-b border-[color:var(--color-brand-border)] bg-[#fbfaff] px-5 py-4"
            id="remote-schema-import"
          >
            <form
              aria-label={t("workspace.remoteImportForm")}
              className="flex flex-wrap items-end gap-2"
              noValidate
              onSubmit={handleRemoteSchemaImport}
            >
              <label className="min-w-0 flex-1 text-xs font-bold text-[color:var(--color-brand-navy)]">
                <span className="mb-1 block">
                  {t("workspace.remoteImportUrl")}
                </span>
                <input
                  aria-invalid={Boolean(remoteImportError)}
                  autoFocus
                  className="h-10 w-full min-w-0 rounded-md border border-[color:var(--color-brand-border)] bg-white px-3 font-mono text-xs text-[color:var(--color-brand-navy)] outline-none focus:border-[color:var(--color-brand-purple)] disabled:cursor-wait disabled:bg-[color:var(--color-brand-soft)]"
                  disabled={isRemoteImporting}
                  placeholder={t("workspace.remoteImportUrlPlaceholder")}
                  type="url"
                  value={remoteImportUrl}
                  onChange={(event) => {
                    setRemoteImportUrl(event.target.value);
                    setRemoteImportError("");
                  }}
                />
              </label>
              <button
                aria-busy={isRemoteImporting}
                className="h-10 rounded-md bg-[color:var(--color-brand-purple)] px-4 text-sm font-extrabold text-white transition hover:bg-[color:var(--color-brand-purple-dark)] disabled:cursor-wait disabled:opacity-70"
                disabled={isRemoteImporting}
                type="submit"
              >
                {t(
                  isRemoteImporting
                    ? "workspace.remoteImportLoading"
                    : "workspace.remoteImportLoad",
                )}
              </button>
              {isRemoteImporting ? (
                <button
                  className="h-10 rounded-md border border-red-300 bg-white px-4 text-sm font-bold text-red-700 transition hover:bg-red-50"
                  type="button"
                  onClick={invalidateActiveSchemaImport}
                >
                  {t("workspace.remoteImportCancel")}
                </button>
              ) : null}
            </form>
            {remoteImportError ? (
              <p
                className="mt-2 text-xs font-semibold text-red-700"
                role="alert"
              >
                {remoteImportError}
              </p>
            ) : null}
          </div>
        ) : null}
        <div className="border-b border-[color:var(--color-brand-border)] bg-white px-5 py-3">
          <form
            className="flex flex-wrap items-center gap-2"
            role="search"
            onSubmit={handleSchemaSearchSubmit}
          >
            <input
              ref={schemaSearchInputRef}
              aria-keyshortcuts="Control+F Meta+F Enter Shift+Enter F3 Shift+F3"
              aria-label={t("workspace.searchSchema")}
              className="min-w-48 flex-1 rounded-md border border-[color:var(--color-brand-border)] bg-[#fbfaff] px-3 py-2 text-sm font-medium text-[color:var(--color-brand-navy)] outline-none focus:border-[color:var(--color-brand-purple)]"
              type="search"
              placeholder={t("workspace.searchSchema")}
              value={schemaSearch}
              onChange={(event) => {
                setSchemaSearch(event.target.value);
                setActiveSchemaMatchIndex(-1);
              }}
              onKeyDown={handleSchemaSearchKeyDown}
            />
            <label className="flex cursor-pointer items-center gap-2 text-xs font-bold text-[color:var(--color-brand-muted)]">
              <input
                className="h-4 w-4 accent-[color:var(--color-brand-purple)]"
                type="checkbox"
                checked={isSchemaSearchCaseSensitive}
                onChange={(event) => {
                  const enabled = event.currentTarget.checked;

                  setIsSchemaSearchCaseSensitive(enabled);
                  saveEditorSearchMatchCasePreference(enabled);
                  setActiveSchemaMatchIndex(-1);
                }}
              />
              <span>{t("workspace.matchCase")}</span>
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-xs font-bold text-[color:var(--color-brand-muted)]">
              <input
                className="h-4 w-4 accent-[color:var(--color-brand-purple)]"
                type="checkbox"
                checked={isSchemaSearchWholeWord}
                onChange={(event) => {
                  const enabled = event.currentTarget.checked;

                  setIsSchemaSearchWholeWord(enabled);
                  saveEditorSearchWholeWordPreference(enabled);
                  setActiveSchemaMatchIndex(-1);
                }}
              />
              <span>{t("workspace.wholeWord")}</span>
            </label>
            <span
              aria-live="polite"
              className="min-w-16 text-center text-xs font-bold text-[color:var(--color-brand-muted)]"
            >
              {t("workspace.schemaSearchSummary", {
                current: String(activeSchemaMatchNumber),
                total: String(schemaSearchMatches.length),
              })}
            </span>
            <button
              className="rounded-md border border-[color:var(--color-brand-border)] bg-white px-3 py-2 text-xs font-extrabold text-[color:var(--color-brand-navy)] transition hover:border-[color:var(--color-brand-purple)] hover:text-[color:var(--color-brand-purple)] disabled:cursor-not-allowed disabled:text-[color:var(--color-brand-muted)]"
              disabled={schemaSearchMatches.length === 0}
              type="button"
              onClick={() => navigateSchemaSearch("previous")}
            >
              {t("workspace.previousMatch")}
            </button>
            <button
              className="rounded-md border border-[color:var(--color-brand-border)] bg-white px-3 py-2 text-xs font-extrabold text-[color:var(--color-brand-navy)] transition hover:border-[color:var(--color-brand-purple)] hover:text-[color:var(--color-brand-purple)] disabled:cursor-not-allowed disabled:text-[color:var(--color-brand-muted)]"
              disabled={schemaSearchMatches.length === 0}
              type="submit"
            >
              {t("workspace.nextMatch")}
            </button>
          </form>
        </div>
        <textarea
          ref={editorRef}
          className={`block min-h-[430px] w-full resize-none overflow-y-hidden bg-[#fbfaff] p-5 font-mono text-[color:var(--color-brand-navy)] outline-none transition-shadow ${
            EDITOR_FONT_SIZE_CLASSES[editorFontSize]
          } ${isWordWrapEnabled ? "overflow-x-hidden" : "overflow-x-auto"} ${
            isDraggingSchemaFile
              ? "ring-2 ring-inset ring-[color:var(--color-brand-purple)]"
              : ""
          }`}
          value={schemaText}
          aria-label="OpenAPI schema editor"
          aria-keyshortcuts="Alt+Z Control+F Meta+F Control+G Meta+G Control+O Meta+O Control+Shift+S Meta+Shift+S F3 Shift+F3"
          spellCheck={false}
          wrap={isWordWrapEnabled ? "soft" : "off"}
          onDragEnter={handleEditorFileDrag}
          onDragLeave={handleEditorFileDragLeave}
          onDragOver={handleEditorFileDrag}
          onDrop={handleEditorFileDrop}
          onKeyDown={handleEditorKeyDown}
          onChange={(event) => {
            const editorValue = event.target.value;

            editorSelectionRef.current = {
              end: event.target.selectionEnd,
              start: event.target.selectionStart,
            };
            markSchemaEdited();
            setSchemaText(
              detectedLineEnding === "crlf"
                ? normalizeTextLineEndings(editorValue, "crlf")
                : editorValue,
            );
            setEditorCursor(
              getTextPosition(editorValue, event.target.selectionStart),
            );
            setSelectedCharacterCount(
              getSelectedCharacterCount(
                editorValue,
                event.target.selectionStart,
                event.target.selectionEnd,
              ),
            );
            setCopiedSchemaText(null);
            setSaveMessage("");
            setSchemaActionError("");
            setImportError("");
            setSchemaComparisonCaptureError(false);
          }}
          onSelect={handleEditorSelection}
        />
        <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-1 border-t border-[color:var(--color-brand-border)] bg-white px-5 py-2 font-mono text-xs font-semibold text-[color:var(--color-brand-muted)]">
          <span aria-label={t("workspace.editorDocumentStatsLabel")}>
            {t("workspace.editorDocumentStats", {
              characters: String(schemaStats.characterCount),
              lines: String(schemaStats.lineCount),
              size: String(schemaStats.byteSize),
            })}
          </span>
          <div className="flex flex-wrap items-center justify-end gap-x-5 gap-y-1">
            <form
              className="flex items-center gap-2"
              noValidate
              onSubmit={handleGoToLine}
            >
              <label className="flex items-center gap-2">
                <span>{t("workspace.goToLine")}</span>
                <input
                  ref={goToLineInputRef}
                  className="w-16 rounded-md border border-[color:var(--color-brand-border)] bg-white px-2 py-1 text-xs font-semibold text-[color:var(--color-brand-navy)] outline-none focus:border-[color:var(--color-brand-purple)]"
                  type="number"
                  defaultValue="1"
                  min="1"
                  max={schemaStats.lineCount}
                />
              </label>
              <button
                className="rounded-md border border-[color:var(--color-brand-border)] bg-white px-2 py-1 text-xs font-bold text-[color:var(--color-brand-navy)] transition hover:border-[color:var(--color-brand-purple)] hover:text-[color:var(--color-brand-purple)]"
                type="submit"
              >
                {t("workspace.goToLineAction")}
              </button>
            </form>
            <label className="flex items-center gap-2">
              <span>{t("workspace.lineEndings")}</span>
              <select
                className="min-w-20 rounded-md border border-[color:var(--color-brand-border)] bg-white px-2 py-1 text-xs font-semibold text-[color:var(--color-brand-navy)] outline-none focus:border-[color:var(--color-brand-purple)] disabled:cursor-not-allowed disabled:bg-[color:var(--color-brand-soft)]"
                disabled={detectedLineEnding === "none"}
                value={detectedLineEnding}
                onChange={handleLineEndingChange}
              >
                {detectedLineEnding === "none" ? (
                  <option disabled value="none">
                    {t("workspace.lineEndingsNone")}
                  </option>
                ) : null}
                {detectedLineEnding === "mixed" ? (
                  <option disabled value="mixed">
                    {t("workspace.lineEndingsMixed")}
                  </option>
                ) : null}
                {detectedLineEnding === "cr" ? (
                  <option disabled value="cr">
                    {t("workspace.lineEndingsCr")}
                  </option>
                ) : null}
                <option value="lf">LF</option>
                <option value="crlf">CRLF</option>
              </select>
            </label>
            <label className="flex items-center gap-2">
              <span>{t("workspace.editorIndentSize")}</span>
              <select
                className="min-w-20 rounded-md border border-[color:var(--color-brand-border)] bg-white px-2 py-1 text-xs font-semibold text-[color:var(--color-brand-navy)] outline-none focus:border-[color:var(--color-brand-purple)]"
                value={editorIndentSize}
                onChange={handleEditorIndentSizeChange}
              >
                <option value="2">
                  {t("workspace.editorIndentSizeTwoSpaces")}
                </option>
                <option value="4">
                  {t("workspace.editorIndentSizeFourSpaces")}
                </option>
              </select>
            </label>
            <label className="flex items-center gap-2">
              <span>{t("workspace.editorFontSize")}</span>
              <select
                className="min-w-20 rounded-md border border-[color:var(--color-brand-border)] bg-white px-2 py-1 text-xs font-semibold text-[color:var(--color-brand-navy)] outline-none focus:border-[color:var(--color-brand-purple)]"
                value={editorFontSize}
                onChange={handleEditorFontSizeChange}
              >
                <option value="small">
                  {t("workspace.editorFontSizeSmall")}
                </option>
                <option value="medium">
                  {t("workspace.editorFontSizeMedium")}
                </option>
                <option value="large">
                  {t("workspace.editorFontSizeLarge")}
                </option>
              </select>
            </label>
            <label className="flex cursor-pointer items-center gap-2">
              <input
                className="h-4 w-4 accent-[color:var(--color-brand-purple)]"
                type="checkbox"
                checked={isWordWrapEnabled}
                onChange={handleWordWrapChange}
              />
              <span>{t("workspace.wordWrap")}</span>
            </label>
            {selectedCharacterCount > 0 ? (
              <span>
                {t("workspace.editorSelectionStats", {
                  count: String(selectedCharacterCount),
                })}
              </span>
            ) : null}
            <span>
              {t("workspace.editorCursorPosition", {
                column: String(editorCursor.column),
                line: String(editorCursor.line),
              })}
            </span>
          </div>
        </div>
        {!isAuthenticated ? (
          <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-1 border-t border-[color:var(--color-brand-border)] bg-[color:var(--color-brand-soft)] px-5 py-3 text-sm font-semibold text-[color:var(--color-brand-muted)]">
            <span>{t("workspace.signInToSave")}</span>
            {draftStatus !== "idle" ? (
              <span
                aria-live="polite"
                className={
                  draftStatus === "failed" ? "text-red-700" : undefined
                }
              >
                {t(
                  draftStatus === "pending"
                    ? "workspace.draftSaving"
                    : draftStatus === "saved"
                      ? "workspace.draftSaved"
                      : "workspace.draftSaveFailed",
                )}
              </span>
            ) : null}
          </div>
        ) : null}
        {isSchemaCopied || saveMessage ? (
          <p
            className="border-t border-emerald-100 bg-emerald-50 px-5 py-3 text-sm font-semibold text-emerald-700"
            role="status"
          >
            {isSchemaCopied ? t("workspace.schemaCopied") : saveMessage}
          </p>
        ) : null}
        {schemaActionError ? (
          <p
            className="border-t border-red-100 bg-red-50 px-5 py-3 text-sm font-semibold text-red-700"
            role="alert"
          >
            {schemaActionError}
          </p>
        ) : null}
        {importError ? (
          <p
            className="border-t border-red-100 bg-red-50 px-5 py-3 text-sm font-semibold text-red-700"
            role="alert"
          >
            {importError}
          </p>
        ) : null}
        {!parseResult.ok ? (
          <div
            className="flex flex-wrap items-center justify-between gap-3 border-t border-red-100 bg-red-50 px-5 py-3 text-sm font-semibold text-red-700"
            role="alert"
          >
            <div>
              <p>{getSchemaErrorMessage(parseResult.error)}</p>
              {parseResult.errorPosition ? (
                <p className="mt-1 text-xs">
                  {t("workspace.errorPosition", {
                    column: String(parseResult.errorPosition.column),
                    line: String(parseResult.errorPosition.line),
                  })}
                </p>
              ) : null}
            </div>
            {parseResult.errorPosition ? (
              <button
                className="border border-red-300 px-3 py-2 text-xs font-extrabold text-red-700 transition hover:bg-red-100"
                type="button"
                onClick={handleGoToSchemaError}
              >
                {t("workspace.goToError")}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      <div
        id="api-viewer"
        className="min-h-[560px] scroll-mt-40 rounded-[28px] border border-[color:var(--color-brand-border)] bg-white p-5 shadow-[0_18px_45px_rgba(64,45,137,0.1)]"
      >
        <div>
          <p className="text-sm font-extrabold uppercase text-[color:var(--color-brand-purple)]">
            {t("workspace.viewer")}
          </p>
          <h2 className="mt-1 text-2xl font-extrabold text-[color:var(--color-brand-navy)]">
            {parseResult.ok ? parseResult.value.title : t("nav.apiReference")}
          </h2>
          {parseResult.ok ? (
            <div className="mt-2 space-y-1 text-sm font-semibold text-[color:var(--color-brand-muted)]">
              <p>
                {t("workspace.version", {
                  version: parseResult.value.version,
                })}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold text-[color:var(--color-brand-navy)]">
                  {t("workspace.server")}:
                </span>
                {serverUrls.length > 1 ? (
                  <select
                    aria-label={t("workspace.serverSelector")}
                    className="h-9 min-w-0 max-w-full rounded-lg border border-[color:var(--color-brand-border)] bg-white px-3 font-mono text-xs text-[color:var(--color-brand-navy)] outline-none focus:border-[color:var(--color-brand-purple)]"
                    value={declaredServerUrl}
                    onChange={(event) =>
                      handleDeclaredServerChange(event.target.value)
                    }
                  >
                    {serverUrls.map((serverUrl) => (
                      <option key={serverUrl} value={serverUrl}>
                        {serverUrl}
                      </option>
                    ))}
                  </select>
                ) : (
                  <code className="break-all">{activeServerUrl}</code>
                )}
              </div>
              <form
                className="flex flex-wrap items-center gap-2"
                noValidate
                onSubmit={handleApplyServerOverride}
              >
                <label
                  className="font-bold text-[color:var(--color-brand-navy)]"
                  htmlFor="custom-server-url"
                >
                  {t("workspace.customServerUrl")}
                </label>
                <input
                  className="h-9 min-w-0 flex-1 rounded-lg border border-[color:var(--color-brand-border)] bg-white px-3 font-mono text-xs text-[color:var(--color-brand-navy)] outline-none focus:border-[color:var(--color-brand-purple)]"
                  id="custom-server-url"
                  placeholder={t("workspace.customServerUrlPlaceholder")}
                  type="url"
                  value={serverOverrideInput}
                  onChange={(event) => {
                    setServerOverrideInput(event.target.value);
                    setServerOverrideError(false);
                  }}
                />
                <button
                  className="h-9 rounded-lg border border-[color:var(--color-brand-purple)] px-3 text-xs font-bold text-[color:var(--color-brand-purple)] transition hover:bg-[color:var(--color-brand-soft)]"
                  type="submit"
                >
                  {t("workspace.applyServerOverride")}
                </button>
                {serverUrlOverride ? (
                  <button
                    className="h-9 rounded-lg border border-[color:var(--color-brand-border)] px-3 text-xs font-bold text-[color:var(--color-brand-muted)] transition hover:border-[color:var(--color-brand-purple)] hover:text-[color:var(--color-brand-purple)]"
                    type="button"
                    onClick={handleClearServerOverride}
                  >
                    {t("workspace.clearServerOverride")}
                  </button>
                ) : null}
              </form>
              {serverOverrideError ? (
                <p className="text-xs font-semibold text-red-700" role="alert">
                  {t("workspace.invalidServerOverride")}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        {parseResult.ok ? (
          <RequestEnvironmentManager
            hasCustomServerOverride={Boolean(serverUrlOverride)}
            settings={requestEnvironmentSettings}
            storageError={requestEnvironmentStorageError}
            onSettingsChange={handleRequestEnvironmentSettingsChange}
          />
        ) : null}

        {parseResult.ok ? (
          <RequestAuthManager
            schemes={securitySchemes}
            values={requestAuthValues}
            onChange={setRequestAuthValues}
          />
        ) : null}

        {parseResult.ok ? (
          <RequestExecutionModeControl
            mode={requestExecutionMode}
            storageError={requestExecutionModeStorageError}
            onChange={handleRequestExecutionModeChange}
          />
        ) : null}

        {parseResult.ok ? (
          <div
            className="mt-5 grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-5"
            aria-label={t("workspace.endpointStats")}
          >
            <div className="rounded-2xl border border-[color:var(--color-brand-border)] bg-[#fbfaff] p-3">
              <p className="font-bold text-[color:var(--color-brand-muted)]">
                {t("workspace.totalEndpoints")}
              </p>
              <p className="mt-1 text-2xl font-extrabold text-[color:var(--color-brand-navy)]">
                {endpointStats.endpointCount}
              </p>
            </div>
            <div className="rounded-2xl border border-[color:var(--color-brand-border)] bg-[#fbfaff] p-3">
              <p className="font-bold text-[color:var(--color-brand-muted)]">
                {t("workspace.methods")}
              </p>
              <p className="mt-1 text-2xl font-extrabold text-[color:var(--color-brand-navy)]">
                {endpointStats.methods.length}
              </p>
            </div>
            <div className="rounded-2xl border border-[color:var(--color-brand-border)] bg-[#fbfaff] p-3">
              <p className="font-bold text-[color:var(--color-brand-muted)]">
                {t("workspace.withRequestBodies")}
              </p>
              <p className="mt-1 text-2xl font-extrabold text-[color:var(--color-brand-navy)]">
                {endpointStats.requestBodyCount}
              </p>
            </div>
            <div className="rounded-2xl border border-[color:var(--color-brand-border)] bg-[#fbfaff] p-3">
              <p className="font-bold text-[color:var(--color-brand-muted)]">
                {t("workspace.deprecated")}
              </p>
              <p className="mt-1 text-2xl font-extrabold text-[color:var(--color-brand-navy)]">
                {endpointStats.deprecatedCount}
              </p>
            </div>
            <div className="rounded-2xl border border-[color:var(--color-brand-border)] bg-[#fbfaff] p-3">
              <p className="font-bold text-[color:var(--color-brand-muted)]">
                {t("workspace.secured")}
              </p>
              <p className="mt-1 text-2xl font-extrabold text-[color:var(--color-brand-navy)]">
                {endpointStats.securedCount}
              </p>
            </div>
          </div>
        ) : null}

        {parseResult.ok ? (
          <SchemaAuditPanel
            onSelectEndpoint={handleSelectAuditEndpoint}
            report={schemaAuditReport}
            schema={{
              title: parseResult.value.title,
              version: parseResult.value.version,
            }}
          />
        ) : null}

        {parseResult.ok ? (
          <SchemaChangePanel
            baseline={schemaComparisonBaseline}
            captureError={schemaComparisonCaptureError}
            current={{
              title: parseResult.value.title,
              version: parseResult.value.version,
            }}
            onClearBaseline={handleClearSchemaComparisonBaseline}
            onSetBaseline={handleSetSchemaComparisonBaseline}
            report={schemaChangeReport}
            storageError={schemaComparisonStorageError}
          />
        ) : null}

        {endpoints.length > 0 ? (
          <div className="mt-5 grid gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <input
                aria-keyshortcuts="/"
                className="min-w-0 flex-1 rounded-2xl border border-[color:var(--color-brand-border)] bg-[#fbfaff] px-4 py-3 text-sm font-medium text-[color:var(--color-brand-navy)] outline-none focus:border-[color:var(--color-brand-purple)]"
                type="search"
                aria-label={t("workspace.filterEndpoints")}
                placeholder={t("workspace.filterEndpoints")}
                ref={endpointFilterInputRef}
                value={endpointFilter}
                onChange={(event) => setEndpointFilter(event.target.value)}
                onKeyDown={(event) => {
                  if (endpointFilter && isCancelRequestShortcut(event)) {
                    event.preventDefault();
                    setEndpointFilter("");
                  }
                }}
              />
              <button
                aria-pressed={showFavoriteEndpointsOnly}
                className={`inline-flex h-11 items-center gap-2 rounded-lg border px-3 text-sm font-extrabold transition ${
                  showFavoriteEndpointsOnly
                    ? "border-amber-300 bg-amber-50 text-amber-700"
                    : "border-[color:var(--color-brand-border)] bg-white text-[color:var(--color-brand-muted)] hover:border-amber-300 hover:text-amber-700"
                }`}
                type="button"
                onClick={() =>
                  setShowFavoriteEndpointsOnly((current) => !current)
                }
              >
                <span aria-hidden="true">★</span>
                {t("workspace.favoriteEndpoints", {
                  count: String(favoriteEndpointCount),
                })}
              </button>
              <select
                aria-label={t("workspace.endpointSortLabel")}
                className="h-11 min-w-40 rounded-lg border border-[color:var(--color-brand-border)] bg-white px-3 text-sm font-bold text-[color:var(--color-brand-navy)] outline-none focus:border-[color:var(--color-brand-purple)]"
                value={endpointSort}
                onChange={(event) => {
                  const sort = event.target.value as EndpointSort;

                  setEndpointSort(sort);
                  saveEndpointSortPreference(sort);
                }}
              >
                <option value="schema">{t("workspace.sortSchemaOrder")}</option>
                <option value="path">{t("workspace.sortByPath")}</option>
                <option value="method">{t("workspace.sortByMethod")}</option>
              </select>
              <select
                aria-label={t("workspace.endpointTraitFilterLabel")}
                className="h-11 min-w-40 rounded-lg border border-[color:var(--color-brand-border)] bg-white px-3 text-sm font-bold text-[color:var(--color-brand-navy)] outline-none focus:border-[color:var(--color-brand-purple)]"
                value={endpointTraitFilter}
                onChange={(event) =>
                  setEndpointTraitFilter(
                    event.target.value as EndpointTraitFilter,
                  )
                }
              >
                <option value="all">{t("workspace.allEndpoints")}</option>
                <option value="secured">{t("workspace.securedOnly")}</option>
                <option value="unsecured">
                  {t("workspace.unsecuredOnly")}
                </option>
                <option value="deprecated">
                  {t("workspace.deprecatedOnly")}
                </option>
                <option value="with-request-body">
                  {t("workspace.withRequestBodyOnly")}
                </option>
                <option value="without-request-body">
                  {t("workspace.withoutRequestBodyOnly")}
                </option>
              </select>
              <select
                aria-label={t("workspace.endpointResponseFilterLabel")}
                className="h-11 min-w-40 rounded-lg border border-[color:var(--color-brand-border)] bg-white px-3 text-sm font-bold text-[color:var(--color-brand-navy)] outline-none focus:border-[color:var(--color-brand-purple)]"
                value={endpointResponseFilter}
                onChange={(event) =>
                  setEndpointResponseFilter(
                    event.target.value as EndpointResponseFilter,
                  )
                }
              >
                <option value="all">{t("workspace.allResponses")}</option>
                <option value="success">
                  {t("workspace.successResponseOnly")}
                </option>
                <option value="client-error">
                  {t("workspace.clientErrorResponseOnly")}
                </option>
                <option value="server-error">
                  {t("workspace.serverErrorResponseOnly")}
                </option>
                <option value="missing-error">
                  {t("workspace.missingErrorResponseOnly")}
                </option>
              </select>
              {endpointFilter ? (
                <button
                  className="h-11 rounded-2xl border border-[color:var(--color-brand-purple)] px-4 text-sm font-extrabold text-[color:var(--color-brand-purple)] transition hover:bg-[color:var(--color-brand-soft)]"
                  type="button"
                  onClick={() => setEndpointFilter("")}
                >
                  {t("workspace.clearEndpointFilter")}
                </button>
              ) : null}
            </div>
            <div
              className="flex flex-wrap gap-2"
              role="group"
              aria-label={t("workspace.methodFilterLabel")}
            >
              {["all", ...endpointStats.methods].map((method) => {
                const active = activeMethod === method;
                const label =
                  method === "all"
                    ? t("workspace.allMethods")
                    : `${method} (${endpointStats.methodCounts[method]})`;

                return (
                  <button
                    aria-pressed={active}
                    className={`endpoint-method-tab h-10 rounded-2xl px-4 text-sm font-extrabold transition ${
                      active
                        ? "bg-[color:var(--color-brand-navy)] text-white"
                        : "border border-[color:var(--color-brand-border)] bg-white text-[color:var(--color-brand-purple)] hover:bg-[color:var(--color-brand-soft)]"
                    }`}
                    key={method}
                    type="button"
                    onClick={() => setSelectedMethod(method)}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            {endpointStats.tags.length > 0 ? (
              <div
                className="flex flex-wrap gap-2"
                role="group"
                aria-label={t("workspace.tagFilterLabel")}
              >
                {["all", ...endpointStats.tags].map((tag) => {
                  const active = activeTag === tag;
                  const label =
                    tag === "all"
                      ? t("workspace.allTags")
                      : t("workspace.tagFilterOption", {
                          count: String(endpointStats.tagCounts[tag]),
                          tag,
                        });

                  return (
                    <button
                      aria-pressed={active}
                      className={`h-9 rounded-lg px-3 text-xs font-bold transition ${
                        active
                          ? "bg-[color:var(--color-brand-purple)] text-white"
                          : "border border-[color:var(--color-brand-border)] bg-white text-[color:var(--color-brand-muted)] hover:border-[color:var(--color-brand-purple)] hover:text-[color:var(--color-brand-purple)]"
                      }`}
                      key={tag}
                      type="button"
                      onClick={() => setSelectedTag(tag)}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            ) : null}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p
                aria-live="polite"
                className="text-sm font-semibold text-[color:var(--color-brand-muted)]"
              >
                {t("workspace.endpointFilterSummary", {
                  total: String(endpoints.length),
                  visible: String(responseFilteredEndpoints.length),
                })}
              </p>
              {hasActiveEndpointFilters ? (
                <button
                  className="h-9 rounded-lg border border-[color:var(--color-brand-border)] bg-white px-3 text-xs font-bold text-[color:var(--color-brand-muted)] transition hover:border-[color:var(--color-brand-purple)] hover:text-[color:var(--color-brand-purple)]"
                  type="button"
                  onClick={handleResetEndpointFilters}
                >
                  {t("workspace.resetEndpointFilters")}
                </button>
              ) : null}
            </div>
            {favoriteSaveError ? (
              <p className="text-sm font-semibold text-red-700" role="alert">
                {t("workspace.favoriteSaveError")}
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="mt-6 flex flex-col gap-4">
          {endpoints.length === 0 ? (
            <div className="rounded-2xl border border-[color:var(--color-brand-border)] p-4 text-sm font-semibold text-[color:var(--color-brand-muted)]">
              {t("workspace.addValidSchema")}
            </div>
          ) : responseFilteredEndpoints.length === 0 ? (
            <div className="rounded-2xl border border-[color:var(--color-brand-border)] p-4 text-sm font-semibold text-[color:var(--color-brand-muted)]">
              {t(
                showFavoriteEndpointsOnly && favoriteEndpointCount === 0
                  ? "workspace.noFavoriteEndpoints"
                  : "workspace.noEndpointsMatch",
              )}
            </div>
          ) : (
            visibleEndpoints.map((endpoint) => (
              <EndpointCard
                authValues={requestAuthValues}
                canSaveHistory={isAuthenticated}
                endpoint={endpoint}
                environmentHeaders={requestEnvironmentHeaders}
                executionMode={requestExecutionMode}
                isFavorite={favoriteEndpointKeySet.has(
                  getEndpointFavoriteKey(endpoint.method, endpoint.path),
                )}
                key={`${endpoint.method}-${endpoint.path}`}
                requestPresets={requestPresets}
                securitySchemes={securitySchemes}
                onDeleteRequestPreset={handleDeleteRequestPreset}
                onSaveRequestPreset={handleSaveRequestPreset}
                onToggleFavorite={() => handleToggleEndpointFavorite(endpoint)}
              />
            ))
          )}
        </div>
      </div>
    </section>
  );
}
