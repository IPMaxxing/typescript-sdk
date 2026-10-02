# ipmax

TypeScript client for the [IP-Max](https://ipm.ax) GeoIP and IP intelligence API. Zero dependencies; runs on Node.js 22+, Deno, Bun and modern browsers.

## Install

```sh
npm install ipmax
```

## Quickstart

```ts
import { IPMax } from "ipmax";

const ipmax = new IPMax({ apiKey: process.env.IPMAX_API_KEY });

const geo = await ipmax.geoip("8.8.8.8");
console.log(geo.geo.city, geo.time_zone?.name);

const intel = await ipmax.intelligence("8.8.8.8");
console.log(intel.network_class.primary, intel.threat?.is_vpn);

const catalog = await ipmax.catalog();
const account = await ipmax.account();
```

Every method accepts an `AbortSignal`, and lookups accept your own idempotency key:

```ts
await ipmax.geoip("8.8.8.8", {
  idempotencyKey: "order-1042-geoip",
  signal: AbortSignal.timeout(2_000),
});
```

## Configuration

| Option       | Default              | Description                                                                 |
| ------------ | -------------------- | --------------------------------------------------------------------------- |
| `apiKey`     | `IPMAX_API_KEY` env  | API key sent as a bearer token. `catalog()` works without one.              |
| `baseURL`    | `https://api.ipm.ax` | API origin.                                                                 |
| `timeout`    | `10000`              | Per-attempt timeout in milliseconds.                                        |
| `maxRetries` | `2`                  | Retries on network errors, 408, 429 and 5xx, honouring `Retry-After`.       |
| `cacheSize`  | `1024`               | Successful lookups kept in memory; `0` disables the cache.                  |
| `cacheTTL`   | `300000`             | Cache lifetime in milliseconds.                                             |
| `fetch`      | global `fetch`       | Custom `fetch` implementation for proxies or tests.                         |

Each lookup carries a fresh UUID v4 `Idempotency-Key` that is reused on every retry, so a retried request is never billed twice. Cached lookups make no request and cost nothing; passing an explicit `idempotencyKey` skips the cache read.

## Error handling

```ts
import { ApiError, InsufficientBalanceError, NotFoundError, RateLimitError } from "ipmax";

try {
  await ipmax.geoip("192.0.2.1");
} catch (error) {
  if (error instanceof NotFoundError) {
    console.log("not in the database");
  } else if (error instanceof InsufficientBalanceError) {
    console.log("top up the geoip wallet");
  } else if (error instanceof RateLimitError) {
    console.log(`retry in ${error.retryAfter} s`);
  } else if (error instanceof ApiError) {
    console.log(error.status, error.code, error.message, error.requestId);
  } else {
    throw error;
  }
}
```

| Class                      | When                                   |
| -------------------------- | -------------------------------------- |
| `IPMaxError`               | Base class of every error below        |
| `ApiError`                 | Any non-2xx response                   |
| `InvalidRequestError`      | 400, 413, 415                          |
| `AuthenticationError`      | 401                                    |
| `InsufficientBalanceError` | 402                                    |
| `NotFoundError`            | 404                                    |
| `ConflictError`            | 409                                    |
| `RateLimitError`           | 429                                    |
| `ServerError`              | 5xx                                    |
| `ConnectionError`          | The request never got a response       |
| `TimeoutError`             | An attempt exceeded `timeout`          |

`ApiError` exposes `status`, `code` (see `ErrorCode`), `message`, `requestId`, `retryable` and `retryAfter` (seconds, when the server sent `Retry-After`).

## License

[Apache-2.0](LICENSE)
