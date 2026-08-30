import type { EndpointResponseFilter } from "./endpoint-response-filter";
import type { EndpointSort } from "./endpoint-sort";
import type { EndpointTraitFilter } from "./endpoint-trait-filter";

export type EndpointFilterView = {
  favoritesOnly: boolean;
  method: string;
  response: EndpointResponseFilter;
  search: string;
  sort: EndpointSort;
  tag: string;
  trait: EndpointTraitFilter;
};

export type RestoredEndpointFilterView = Partial<EndpointFilterView>;

const PARAMS = {
  favoritesOnly: "endpoint-favorites",
  method: "endpoint-method",
  response: "endpoint-response",
  search: "endpoint-search",
  sort: "endpoint-sort",
  tag: "endpoint-tag",
  trait: "endpoint-trait",
} as const;

const ENDPOINT_SORTS = ["method", "path", "schema"] as const;
const ENDPOINT_TRAITS = [
  "all",
  "deprecated",
  "secured",
  "unsecured",
  "with-request-body",
  "without-request-body",
] as const;
const ENDPOINT_RESPONSES = [
  "all",
  "client-error",
  "missing-error",
  "server-error",
  "success",
] as const;
const MAX_SEARCH_LENGTH = 500;
const MAX_TAG_LENGTH = 200;

function readEnum<T extends string>(
  value: string | null,
  supportedValues: readonly T[],
) {
  return value && supportedValues.includes(value as T)
    ? (value as T)
    : undefined;
}

function readBoundedText(value: string | null, maxLength: number) {
  const normalizedValue = value?.trim() || "";

  return normalizedValue.length > 0 && normalizedValue.length <= maxLength
    ? normalizedValue
    : undefined;
}

function readMethod(value: string | null) {
  const normalizedMethod = value?.trim().toUpperCase() || "";

  return /^[A-Z]+$/.test(normalizedMethod) && normalizedMethod.length <= 32
    ? normalizedMethod
    : undefined;
}

export function readEndpointFilterView(
  currentUrl: string,
): RestoredEndpointFilterView {
  let url: URL;

  try {
    url = new URL(currentUrl);
  } catch {
    return {};
  }

  const restoredView: RestoredEndpointFilterView = {};
  const search = readBoundedText(
    url.searchParams.get(PARAMS.search),
    MAX_SEARCH_LENGTH,
  );
  const method = readMethod(url.searchParams.get(PARAMS.method));
  const tag = readBoundedText(url.searchParams.get(PARAMS.tag), MAX_TAG_LENGTH);
  const trait = readEnum(url.searchParams.get(PARAMS.trait), ENDPOINT_TRAITS);
  const response = readEnum(
    url.searchParams.get(PARAMS.response),
    ENDPOINT_RESPONSES,
  );
  const sort = readEnum(url.searchParams.get(PARAMS.sort), ENDPOINT_SORTS);
  const favoritesOnly = url.searchParams.get(PARAMS.favoritesOnly);

  if (search) restoredView.search = search;
  if (method) restoredView.method = method;
  if (tag) restoredView.tag = tag;
  if (trait) restoredView.trait = trait;
  if (response) restoredView.response = response;
  if (sort) restoredView.sort = sort;
  if (favoritesOnly === "1" || favoritesOnly === "0") {
    restoredView.favoritesOnly = favoritesOnly === "1";
  }

  return restoredView;
}

export function createEndpointFilterViewLink(
  currentUrl: string,
  view: EndpointFilterView,
) {
  let url: URL;

  try {
    url = new URL(currentUrl);
  } catch {
    return currentUrl;
  }

  Object.values(PARAMS).forEach((parameter) => {
    url.searchParams.delete(parameter);
  });

  const search = readBoundedText(view.search, MAX_SEARCH_LENGTH);
  const method = view.method === "all" ? undefined : readMethod(view.method);
  const tag =
    view.tag === "all" ? undefined : readBoundedText(view.tag, MAX_TAG_LENGTH);

  if (search) url.searchParams.set(PARAMS.search, search);
  if (method) url.searchParams.set(PARAMS.method, method);
  if (tag) url.searchParams.set(PARAMS.tag, tag);
  if (view.trait !== "all") {
    url.searchParams.set(PARAMS.trait, view.trait);
  }
  if (view.response !== "all") {
    url.searchParams.set(PARAMS.response, view.response);
  }
  if (view.sort !== "schema") {
    url.searchParams.set(PARAMS.sort, view.sort);
  }
  if (view.favoritesOnly) {
    url.searchParams.set(PARAMS.favoritesOnly, "1");
  }

  url.hash = "";

  return url.toString();
}
