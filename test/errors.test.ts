import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ApiError,
  AuthenticationError,
  ConflictError,
  ConnectionError,
  ErrorCode,
  InsufficientBalanceError,
  InvalidRequestError,
  IPMax,
  IPMaxError,
  NotFoundError,
  RateLimitError,
  ServerError,
} from "../src/index.ts";
import { client, fixture, sequence } from "./helpers.ts";

test("error-invalid-request maps to InvalidRequestError", async (t) => {
  const { ipmax } = await client(t, sequence(fixture("error-invalid-request")));
  const error = await ipmax.geoip("not-an-ip").catch((caught: unknown) => caught);
  assert.ok(error instanceof InvalidRequestError);
  assert.ok(error instanceof ApiError);
  assert.ok(error instanceof IPMaxError);
  assert.equal(error.name, "InvalidRequestError");
  assert.equal(error.status, 400);
  assert.equal(error.code, ErrorCode.InvalidRequest);
  assert.equal(error.message, "A valid IP and 16-120 character Idempotency-Key are required");
  assert.equal(error.requestId, "ENT-9b178079-212d-4052-ae72-8edf564be6e1");
  assert.equal(error.retryable, false);
  assert.equal(error.retryAfter, undefined);
});

test("error-not-found maps to NotFoundError", async (t) => {
  const { ipmax } = await client(t, sequence(fixture("error-not-found")));
  const error = await ipmax.intelligence("192.0.2.1").catch((caught: unknown) => caught);
  assert.ok(error instanceof NotFoundError);
  assert.equal(error.status, 404);
  assert.equal(error.code, ErrorCode.IpNotFound);
  assert.equal(error.requestId, "ENT-f1b619f1-4da9-48c6-bb41-8ac819ea863a");
});

test("error-unauthorized maps to AuthenticationError", async (t) => {
  const { ipmax } = await client(t, sequence(fixture("error-unauthorized")));
  const error = await ipmax.account().catch((caught: unknown) => caught);
  assert.ok(error instanceof AuthenticationError);
  assert.equal(error.status, 401);
  assert.equal(error.code, ErrorCode.InvalidApiKey);
  assert.equal(error.message, "Invalid API key");
});

const statusClasses: [number, typeof ApiError][] = [
  [400, InvalidRequestError],
  [401, AuthenticationError],
  [402, InsufficientBalanceError],
  [403, ApiError],
  [404, NotFoundError],
  [409, ConflictError],
  [413, InvalidRequestError],
  [415, InvalidRequestError],
  [429, RateLimitError],
  [500, ServerError],
  [503, ServerError],
];

for (const [status, errorClass] of statusClasses) {
  test(`HTTP ${status} maps to ${errorClass.name}`, async (t) => {
    const { ipmax } = await client(
      t,
      sequence({
        status,
        headers: { "retry-after": "7" },
        body: {
          status: false,
          data: null,
          error: { code: 1999, message: "boom", request_id: "req-1", retryable: true },
        },
      }),
      { maxRetries: 0 },
    );
    const error = await ipmax.geoip("8.8.8.8").catch((caught: unknown) => caught);
    assert.equal((error as Error).constructor, errorClass);
    assert.ok(error instanceof ApiError);
    assert.equal(error.status, status);
    assert.equal(error.code, 1999);
    assert.equal(error.retryable, true);
    assert.equal(error.retryAfter, 7);
  });
}

test("a non-JSON error body still yields an ApiError with the HTTP status", async (t) => {
  const { ipmax } = await client(
    t,
    sequence({
      status: 502,
      headers: { "x-request-id": "edge-42" },
      body: "<html>bad gateway</html>",
    }),
    { maxRetries: 0 },
  );
  const error = await ipmax.catalog().catch((caught: unknown) => caught);
  assert.ok(error instanceof ServerError);
  assert.equal(error.status, 502);
  assert.equal(error.code, undefined);
  assert.equal(error.requestId, "edge-42");
  assert.equal(error.retryable, true);
  assert.equal(error.message, "Unexpected 502 response");
});

test("a 200 without the success envelope is an ApiError", async (t) => {
  const { ipmax } = await client(t, sequence({ status: 200, body: { ok: 1 } }));
  const error = await ipmax.catalog().catch((caught: unknown) => caught);
  assert.ok(error instanceof ApiError);
  assert.equal(error.status, 200);
});

test("an unreachable server raises ConnectionError", async () => {
  const ipmax = new IPMax({
    apiKey: "ipmax_test_key",
    baseURL: "http://127.0.0.1:9",
    maxRetries: 0,
  });
  const error = await ipmax.catalog().catch((caught: unknown) => caught);
  assert.ok(error instanceof ConnectionError);
  assert.ok(error instanceof IPMaxError);
  assert.ok(!(error instanceof ApiError));
  assert.ok(error.cause);
});
