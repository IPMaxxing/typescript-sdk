import { LruCache } from "./cache.ts";
import { ApiError, apiErrorFor, ConnectionError, TimeoutError } from "./errors.ts";
import type { Account, Catalog, GeoIpData, IntelligenceData, Product } from "./types.ts";

const VERSION = "0.1.0";
const RETRY_BASE_MS = 500;
const RETRY_CAP_MS = 8_000;

export interface ClientOptions {
  apiKey?: string | undefined;
  baseURL?: string;
  timeout?: number;
  maxRetries?: number;
  cacheSize?: number;
  cacheTTL?: number;
  fetch?: typeof fetch;
}

export interface RequestOptions {
  signal?: AbortSignal;
}

export interface LookupOptions extends RequestOptions {
  idempotencyKey?: string;
}

interface Call {
  method: "GET" | "POST";
  path: string;
  body: string | null;
  idempotencyKey: string | null;
  signal: AbortSignal | undefined;
}

export class IPMax {
  readonly #apiKey: string | undefined;
  readonly #baseURL: string;
  readonly #timeout: number;
  readonly #maxRetries: number;
  readonly #fetch: typeof fetch;
  readonly #cache: LruCache<unknown>;

  constructor(options: ClientOptions = {}) {
    this.#apiKey = options.apiKey ?? environmentApiKey();
    this.#baseURL = (options.baseURL ?? "https://api.ipm.ax").replace(/\/+$/, "");
    this.#timeout = options.timeout ?? 10_000;
    this.#maxRetries = options.maxRetries ?? 2;
    this.#fetch = options.fetch ?? ((input, init) => fetch(input, init));
    this.#cache = new LruCache(options.cacheSize ?? 1024, options.cacheTTL ?? 300_000);
  }

  catalog(options: RequestOptions = {}): Promise<Catalog> {
    return this.#send(this.#get("/api/v1/catalog", options));
  }

  account(options: RequestOptions = {}): Promise<Account> {
    return this.#send(this.#get("/api/v1/account", options));
  }

  geoip(ip: string, options: LookupOptions = {}): Promise<GeoIpData> {
    return this.#lookup("geoip", ip, options);
  }

  intelligence(ip: string, options: LookupOptions = {}): Promise<IntelligenceData> {
    return this.#lookup("intelligence", ip, options);
  }

  #get(path: string, options: RequestOptions): Call {
    return { method: "GET", path, body: null, idempotencyKey: null, signal: options.signal };
  }

  async #lookup<T>(product: Product, ip: string, options: LookupOptions): Promise<T> {
    const address = ip.trim();
    const key = `${product}:${address}`;
    if (options.idempotencyKey === undefined) {
      const cached = this.#cache.get(key);
      if (cached !== undefined) return cached as T;
    }
    const data = await this.#send<T>({
      method: "POST",
      path: `/api/v1/${product}`,
      body: JSON.stringify({ ip: address }),
      idempotencyKey: options.idempotencyKey ?? crypto.randomUUID(),
      signal: options.signal,
    });
    this.#cache.set(key, data);
    return data;
  }

  async #send<T>(call: Call): Promise<T> {
    const headers = new Headers({
      Accept: "application/json",
      "User-Agent": `ipmax-typescript/${VERSION}`,
    });
    if (this.#apiKey) headers.set("Authorization", `Bearer ${this.#apiKey}`);
    if (call.body !== null) headers.set("Content-Type", "application/json");
    if (call.idempotencyKey !== null) headers.set("Idempotency-Key", call.idempotencyKey);

    for (let attempt = 0; ; attempt += 1) {
      try {
        return await this.#attempt<T>(call, headers);
      } catch (error) {
        if (call.signal?.aborted || attempt >= this.#maxRetries || !isRetryable(error)) {
          throw error;
        }
        await sleep(retryDelay(error, attempt), call.signal);
      }
    }
  }

  async #attempt<T>(call: Call, headers: Headers): Promise<T> {
    const deadline = AbortSignal.timeout(this.#timeout);
    const signal = call.signal ? AbortSignal.any([call.signal, deadline]) : deadline;
    let response: Response;
    let text: string;
    try {
      response = await this.#fetch(`${this.#baseURL}${call.path}`, {
        method: call.method,
        headers,
        body: call.body,
        signal,
      });
      text = await response.text();
    } catch (error) {
      if (call.signal?.aborted) throw call.signal.reason;
      if (deadline.aborted) {
        throw new TimeoutError(`Request timed out after ${this.#timeout} ms`, { cause: error });
      }
      throw new ConnectionError("Could not reach the IP-Max API", { cause: error });
    }
    const payload = parseJson(text);
    if (response.ok && isRecord(payload) && payload.status === true) {
      return payload.data as T;
    }
    throw toApiError(response, payload);
  }
}

function environmentApiKey(): string | undefined {
  return typeof process === "undefined" ? undefined : process.env.IPMAX_API_KEY;
}

function toApiError(response: Response, payload: unknown): ApiError {
  const error = isRecord(payload) && isRecord(payload.error) ? payload.error : {};
  const { code, message, request_id: requestId, retryable } = error;
  return apiErrorFor({
    status: response.status,
    code: typeof code === "number" ? code : undefined,
    message: typeof message === "string" ? message : `Unexpected ${response.status} response`,
    requestId:
      typeof requestId === "string"
        ? requestId
        : (response.headers.get("x-request-id") ?? undefined),
    retryable: typeof retryable === "boolean" ? retryable : isRetryableStatus(response.status),
    retryAfter: parseRetryAfter(response.headers.get("retry-after")),
  });
}

function isRetryable(error: unknown): boolean {
  if (error instanceof ConnectionError || error instanceof TimeoutError) return true;
  return error instanceof ApiError && isRetryableStatus(error.status);
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function retryDelay(error: unknown, attempt: number): number {
  if (error instanceof ApiError && error.retryAfter !== undefined) return error.retryAfter * 1000;
  return Math.random() * Math.min(RETRY_CAP_MS, RETRY_BASE_MS * 2 ** attempt);
}

function parseRetryAfter(header: string | null): number | undefined {
  if (header === null || header.trim() === "") return undefined;
  const seconds = Number(header);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : undefined;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function sleep(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
