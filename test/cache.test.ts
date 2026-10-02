import assert from "node:assert/strict";
import { test } from "node:test";
import { NotFoundError } from "../src/index.ts";
import { client, delay, fixture, fixtureServer, sequence } from "./helpers.ts";

test("a repeated lookup is served from the cache", async (t) => {
  const { ipmax, requests } = await client(t, fixtureServer);
  const first = await ipmax.geoip("8.8.8.8");
  const second = await ipmax.geoip(" 8.8.8.8 ");
  assert.deepEqual(second, first);
  assert.equal(requests.length, 1);
});

test("products are cached separately", async (t) => {
  const { ipmax, requests } = await client(t, fixtureServer);
  await ipmax.geoip("8.8.8.8");
  await ipmax.intelligence("8.8.8.8");
  await ipmax.intelligence("8.8.8.8");
  assert.deepEqual(
    requests.map((request) => request.path),
    ["/api/v1/geoip", "/api/v1/intelligence"],
  );
});

test("entries expire after the TTL", async (t) => {
  const { ipmax, requests } = await client(t, fixtureServer, { cacheTTL: 100 });
  await ipmax.geoip("8.8.8.8");
  await ipmax.geoip("8.8.8.8");
  await delay(150);
  await ipmax.geoip("8.8.8.8");
  assert.equal(requests.length, 2);
});

test("the least recently used entry is evicted", async (t) => {
  const { ipmax, requests } = await client(t, fixtureServer, { cacheSize: 2 });
  await ipmax.geoip("8.8.8.8");
  await ipmax.geoip("10.1.2.3");
  await ipmax.geoip("8.8.8.8");
  await ipmax.geoip("240e:390:a1:3cd0:be24:11ff:fe46:aca3");
  await ipmax.geoip("8.8.8.8");
  await ipmax.geoip("10.1.2.3");
  assert.deepEqual(
    requests.map((request) => JSON.parse(request.body).ip),
    ["8.8.8.8", "10.1.2.3", "240e:390:a1:3cd0:be24:11ff:fe46:aca3", "10.1.2.3"],
  );
});

test("cacheSize 0 disables the cache", async (t) => {
  const { ipmax, requests } = await client(t, fixtureServer, { cacheSize: 0 });
  await ipmax.geoip("8.8.8.8");
  await ipmax.geoip("8.8.8.8");
  assert.equal(requests.length, 2);
});

test("errors are not cached", async (t) => {
  const { ipmax, requests } = await client(
    t,
    sequence(fixture("error-not-found"), fixture("geoip-8-8-8-8")),
  );
  await assert.rejects(ipmax.geoip("8.8.8.8"), NotFoundError);
  const geo = await ipmax.geoip("8.8.8.8");
  assert.equal(geo.ip, "8.8.8.8");
  assert.equal(requests.length, 2);
});

test("an explicit idempotency key bypasses the cache read but stores the result", async (t) => {
  const { ipmax, requests } = await client(t, fixtureServer);
  await ipmax.geoip("8.8.8.8");
  await ipmax.geoip("8.8.8.8", { idempotencyKey: "order-2026-0001-geoip" });
  assert.equal(requests.length, 2);
  await ipmax.intelligence("8.8.8.8", { idempotencyKey: "order-2026-0001-intel" });
  await ipmax.intelligence("8.8.8.8");
  assert.equal(requests.length, 3);
});

test("catalog and account are never cached", async (t) => {
  const { ipmax, requests } = await client(t, fixtureServer);
  await ipmax.catalog();
  await ipmax.catalog();
  await ipmax.account();
  await ipmax.account();
  assert.equal(requests.length, 4);
});
