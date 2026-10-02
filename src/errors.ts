import type { ErrorCode } from "./types.ts";

export class IPMaxError extends Error {
  override name = "IPMaxError";
}

export class ConnectionError extends IPMaxError {
  override name = "ConnectionError";
}

export class TimeoutError extends IPMaxError {
  override name = "TimeoutError";
}

export interface ApiErrorDetails {
  status: number;
  code: ErrorCode | undefined;
  message: string;
  requestId: string | undefined;
  retryable: boolean;
  retryAfter: number | undefined;
}

export class ApiError extends IPMaxError {
  override name = "ApiError";
  readonly status: number;
  readonly code: ErrorCode | undefined;
  readonly requestId: string | undefined;
  readonly retryable: boolean;
  readonly retryAfter: number | undefined;

  constructor(details: ApiErrorDetails) {
    super(details.message);
    this.status = details.status;
    this.code = details.code;
    this.requestId = details.requestId;
    this.retryable = details.retryable;
    this.retryAfter = details.retryAfter;
  }
}

export class InvalidRequestError extends ApiError {
  override name = "InvalidRequestError";
}

export class AuthenticationError extends ApiError {
  override name = "AuthenticationError";
}

export class InsufficientBalanceError extends ApiError {
  override name = "InsufficientBalanceError";
}

export class NotFoundError extends ApiError {
  override name = "NotFoundError";
}

export class ConflictError extends ApiError {
  override name = "ConflictError";
}

export class RateLimitError extends ApiError {
  override name = "RateLimitError";
}

export class ServerError extends ApiError {
  override name = "ServerError";
}

export function apiErrorFor(details: ApiErrorDetails): ApiError {
  switch (details.status) {
    case 400:
    case 413:
    case 415:
      return new InvalidRequestError(details);
    case 401:
      return new AuthenticationError(details);
    case 402:
      return new InsufficientBalanceError(details);
    case 404:
      return new NotFoundError(details);
    case 409:
      return new ConflictError(details);
    case 429:
      return new RateLimitError(details);
    default:
      return details.status >= 500 ? new ServerError(details) : new ApiError(details);
  }
}
