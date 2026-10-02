import assert from "node:assert/strict";
import { test } from "node:test";
import { NotFoundError, ServerError } from "../src/index.ts";
import { client, fixture, type Reply, sequence } from "./helpers.ts";

const unavailable = (retryAfter: string): Reply => ({
  status: 503,
  headers: { "retry-after": retryAfter },
  body: {
    status: false,
    data: null,
    error: { code: 1400, message: "Service unavailable", request_id: "req-503", retryable: true },
  },
});

test("a 503 then 200 succeeds and both attempts share the idempotency key", async (t) => {
  const { ipmax, requests } = await client(t, sequence(unavailable("0"), fixture("geoip-8-8-8-8")));
  const geo = await ipmax.geoip("8.8.8.8");
  assert.equal(geo.ip, "8.8.8.8");
  assert.equal(requests.length, 2);
  const [first, second] = requests;
  assert.ok(first?.headers["idempotency-key"]);
  assert.equal(first?.headers["idempotency-key"], second?.headers["idempotency-key"]);
});

test("Retry-After is honoured between attempts", async (t) => {
  const { ipmax } = await client(t, sequence(unavailable("0.15"), fixture("catalog")));
  const started = performance.now();
  await ipmax.catalog();
  assert.ok(performance.now() - started >= 140);
});

test("retries stop after maxRetries", async (t) => {
  const { ipmax, requests } = await client(t, sequence(unavailable("0")), { maxRetries: 2 });
  await assert.rejects(ipmax.geoip("8.8.8.8"), ServerError);
  assert.equal(requests.length, 3);
  const keys = new Set(requests.map((request) => request.headers["idempotency-key"]));
  assert.equal(keys.size, 1);
});

test("maxRetries 0 makes a single attempt", async (t) => {
  const { ipmax, requests } = await client(t, sequence(unavailable("0")), { maxRetries: 0 });
  await assert.rejects(ipmax.catalog(), ServerError);
  assert.equal(requests.length, 1);
});

for (const status of [408, 429, 500]) {
  test(`HTTP ${status} is retried`, async (t) => {
    const { ipmax, requests } = await client(
      t,
      sequence({ ...unavailable("0"), status }, fixture("catalog")),
    );
    await ipmax.catalog();
    assert.equal(requests.length, 2);
  });
}

test("client errors are not retried", async (t) => {
  const { ipmax, requests } = await client(t, sequence(fixture("error-not-found")));
  await assert.rejects(ipmax.geoip("192.0.2.1"), NotFoundError);
  assert.equal(requests.length, 1);
});

test("a dropped connection is retried with the same idempotency key", async (t) => {
  const { ipmax, requests } = await client(t, sequence("drop", fixture("geoip-8-8-8-8")), {
    maxRetries: 1,
  });
  const geo = await ipmax.geoip("8.8.8.8");
  assert.equal(geo.currency?.code, "USD");
  assert.equal(requests.length, 2);
  assert.equal(requests[0]?.headers["idempotency-key"], requests[1]?.headers["idempotency-key"]);
});
