import type { ParadexClient } from '../common/config';
import type { JsonValue, Network, Signer } from '../common/types';

/** Map de query-string : valeurs `undefined` ignorées. */
export type QueryParams = Record<string, string | number | boolean | undefined>;

/**
 * Réseau d'une **lecture publique**. Sans label on retombe sur **mainnet** (les lectures ne
 * touchent pas au wallet) ; avec un label on tape sur le réseau du signer associé.
 */
export function resolveReadNetwork(client: ParadexClient, label?: string): Network {
  if (label === undefined) {
    return 'mainnet';
  }
  const signer = client.signers[label];
  if (signer === undefined) {
    throw new Error(`Aucun signer enregistré sous "${label}"; ajoute-le dans init({ signers }).`);
  }
  return signer.network;
}

/** Résout un signer par label (obligatoire pour toute action signée / lecture privée). */
export function resolveSigner(
  client: ParadexClient,
  label?: string,
): { label: string; signer: Signer } {
  const key = label ?? Object.keys(client.signers)[0];
  if (key === undefined) {
    throw new Error('Aucun signer disponible; ajoute-en un dans init({ signers }).');
  }
  const signer = client.signers[key];
  if (signer === undefined) {
    throw new Error(`Aucun signer enregistré sous "${key}"; ajoute-le dans init({ signers }).`);
  }
  return { label: key, signer };
}

/** Erreur HTTP Paradex : `status` HTTP + `code` applicatif (si fourni) + message. */
export class ParadexApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string | number | null,
    message: string,
  ) {
    super(message);
    this.name = 'ParadexApiError';
  }
}

export function buildUrl(baseUrl: string, path: string, query?: QueryParams): string {
  const url = new URL(baseUrl + path);
  if (query !== undefined) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
}

/** En-têtes additionnels (auth Bearer, headers PARADEX-* d'onboarding/auth). */
export type Headers = Record<string, string>;

/**
 * Requête HTTP brute. `parse` est défensif : `JSON.parse` gardé, erreur applicative Paradex
 * (`{ error, message }`) remontée en {@link ParadexApiError}. Renvoie le corps parsé.
 */
function request<TData>(
  client: ParadexClient,
  network: Network,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  options: { query?: QueryParams; body?: unknown; headers?: Headers } = {},
): Promise<TData> {
  const url = buildUrl(client.restUrls[network], path, options.query);
  const headers: Headers = { Accept: 'application/json', ...(options.headers ?? {}) };
  const init: RequestInit = { method, headers };
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(options.body);
  }
  return client.fetch(url, init).then((response) => parse<TData>(response));
}

function parse<TData>(response: Response): Promise<TData> {
  return response.text().then((body) => {
    let parsed: JsonValue | null = null;
    if (body !== '') {
      try {
        parsed = JSON.parse(body) as JsonValue;
      } catch {
        parsed = null;
      }
    }
    if (response.ok === false) {
      const obj =
        parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
      const message =
        (obj?.message as string | undefined) ??
        (obj?.error as string | undefined) ??
        (body === '' ? `HTTP ${response.status}` : body);
      const code = (obj?.error as string | undefined) ?? null;
      throw new ParadexApiError(response.status, code, message);
    }
    if (parsed === null) {
      return null as unknown as TData;
    }
    return parsed as TData;
  });
}

/** GET (lecture). `label` optionnel choisit le réseau (défaut mainnet). */
export function httpGet<TData>(
  client: ParadexClient,
  path: string,
  query?: QueryParams,
  label?: string,
  headers?: Headers,
): Promise<TData> {
  return request<TData>(client, resolveReadNetwork(client, label), 'GET', path, { query, headers });
}

/** POST sur un réseau donné (écriture / endpoint signé). */
export function httpPost<TData>(
  client: ParadexClient,
  network: Network,
  path: string,
  body: unknown,
  headers?: Headers,
): Promise<TData> {
  return request<TData>(client, network, 'POST', path, { body, headers });
}

/** PUT sur un réseau donné (modification d'ordre). */
export function httpPut<TData>(
  client: ParadexClient,
  network: Network,
  path: string,
  body: unknown,
  headers?: Headers,
): Promise<TData> {
  return request<TData>(client, network, 'PUT', path, { body, headers });
}

/** DELETE sur un réseau donné (annulation). */
export function httpDelete<TData>(
  client: ParadexClient,
  network: Network,
  path: string,
  query?: QueryParams,
  headers?: Headers,
): Promise<TData> {
  return request<TData>(client, network, 'DELETE', path, { query, headers });
}
