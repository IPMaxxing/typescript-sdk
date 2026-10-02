import assert from "node:assert/strict";
import { test } from "node:test";
import { IPMax, TimeoutError } from "../src/index.ts";
import { client, delay, fixture, fixtureServer, serve } from "./helpers.ts";

const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test("lookups POST the trimmed IP with auth, JSON and idempotency headers", async (t) => {
  const { ipmax, requests } = await client(t, fixtureServer);
  await ipmax.geoip("  8.8.8.8 ");
  await ipmax.intelligence("8.8.8.8");

  const [geoip, intelligence] = requests;
  assert.equal(geoip?.method, "POST");
  assert.equal(geoip?.path, "/api/v1/geoip");
  assert.equal(intelligence?.path, "/api/v1/intelligence");
  for (const request of requests) {
    assert.equal(request.body, '{"ip":"8.8.8.8"}');
    assert.equal(request.headers.authorization, "Bearer ipmax_test_key");
    assert.equal(request.headers["content-type"], "application/json");
    assert.equal(request.headers.accept, "application/json");
    assert.equal(request.headers["user-agent"], "ipmax-typescript/0.1.0");
    assert.match(request.headers["idempotency-key"] as string, uuidV4);
  }
  assert.notEqual(geoip?.headers["idempotency-key"], intelligence?.headers["idempotency-key"]);
});

test("an explicit idempotency key is sent as given", async (t) => {
  const { ipmax, requests } = await client(t, fixtureServer);
  await ipmax.geoip("8.8.8.8", { idempotencyKey: "order-2026-0001-geoip" });
  assert.equal(requests[0]?.headers["idempotency-key"], "order-2026-0001-geoip");
});

test("catalog is a plain GET and works without an API key", async (t) => {
  const { ipmax, requests } = await client(t, fixtureServer, { apiKey: "" });
  await ipmax.catalog();
  const [request] = requests;
  assert.equal(request?.method, "GET");
  assert.equal(request?.path, "/api/v1/catalog");
  assert.equal(request?.body, "");
  assert.equal(request?.headers.authorization, undefined);
  assert.equal(request?.headers["content-type"], undefined);
  assert.equal(request?.headers["idempotency-key"], undefined);
});

test("account sends the bearer key", async (t) => {
  const { ipmax, requests } = await client(t, fixtureServer);
  await ipmax.account();
  assert.equal(requests[0]?.method, "GET");
  assert.equal(requests[0]?.path, "/api/v1/account");
  assert.equal(requests[0]?.headers.authorization, "Bearer ipmax_test_key");
});

test("the API key falls back to IPMAX_API_KEY", async (t) => {
  const previous = process.env.IPMAX_API_KEY;
  process.env.IPMAX_API_KEY = "ipmax_from_env";
  t.after(() => {
    if (previous === undefined) delete process.env.IPMAX_API_KEY;
    else process.env.IPMAX_API_KEY = previous;
  });
  const { ipmax, requests } = await client(t, fixtureServer, { apiKey: undefined });
  await ipmax.account();
  assert.equal(requests[0]?.headers.authorization, "Bearer ipmax_from_env");
});

test("a trailing slash on the base URL is ignored", async (t) => {
  const { baseURL, requests } = await serve(t, fixtureServer);
  await new IPMax({ apiKey: "ipmax_test_key", baseURL: `${baseURL}/` }).catalog();
  assert.equal(requests[0]?.path, "/api/v1/catalog");
});

test("an injected fetch replaces the network", async () => {
  const seen: Request[] = [];
  const ipmax = new IPMax({
    apiKey: "ipmax_test_key",
    fetch: async (input, init) => {
      seen.push(new Request(input, init));
      const { status, headers = {}, body } = fixture("geoip-8-8-8-8");
      return new Response(JSON.stringify(body), { status, headers });
    },
  });
  const geo = await ipmax.geoip("8.8.8.8");
  assert.equal(geo.ip, "8.8.8.8");
  assert.equal(seen[0]?.url, "https://api.ipm.ax/api/v1/geoip");
  assert.equal(seen[0]?.headers.get("authorization"), "Bearer ipmax_test_key");
});

test("an aborted signal rejects with its reason and is not retried", async (t) => {
  const { ipmax, requests } = await client(t, async () => {
    await delay(200);
    return fixture("catalog");
  });
  const controller = new AbortController();
  const pending = ipmax.catalog({ signal: controller.signal });
  setTimeout(() => controller.abort(new Error("caller gave up")), 20);
  await assert.rejects(pending, { message: "caller gave up" });
  assert.equal(requests.length, 1);
});

test("each attempt is bounded by the timeout", async (t) => {
  const { ipmax, requests } = await client(
    t,
    async () => {
      await delay(1000);
      return fixture("catalog");
    },
    { timeout: 100, maxRetries: 1 },
  );
  await assert.rejects(ipmax.catalog(), TimeoutError);
  assert.equal(requests.length, 2);
});

test("a slow first attempt is retried after its timeout", async (t) => {
  let calls = 0;
  const { ipmax } = await client(
    t,
    async () => {
      calls += 1;
      if (calls === 1) await delay(1000);
      return fixture("catalog");
    },
    { timeout: 150, maxRetries: 1 },
  );
  const catalog = await ipmax.catalog();
  assert.equal(catalog.currency, "CNY");
  assert.equal(calls, 2);
});
