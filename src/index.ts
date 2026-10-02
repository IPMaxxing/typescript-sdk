export type { ClientOptions, LookupOptions, RequestOptions } from "./client.ts";
export { IPMax } from "./client.ts";
export type { ApiErrorDetails } from "./errors.ts";
export {
  ApiError,
  AuthenticationError,
  ConflictError,
  ConnectionError,
  InsufficientBalanceError,
  InvalidRequestError,
  IPMaxError,
  NotFoundError,
  RateLimitError,
  ServerError,
  TimeoutError,
} from "./errors.ts";
export * from "./types.ts";
