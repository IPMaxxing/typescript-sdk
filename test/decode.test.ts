import assert from "node:assert/strict";
import { test } from "node:test";
import { ApiError, type IPMax, type PtrIntelligence } from "../src/index.ts";
import { client, fixture, fixtureNames, fixtureServer, sequence, withBody } from "./helpers.ts";

const ipv6 = "240e:390:a1:3cd0:be24:11ff:fe46:aca3";

const calls: Record<string, (ipmax: IPMax) => Promise<unknown>> = {
  catalog: (ipmax) => ipmax.catalog(),
  account: (ipmax) => ipmax.account(),
  "error-unauthorized": (ipmax) => ipmax.account(),
  "error-invalid-request": (ipmax) => ipmax.geoip("not-an-ip"),
  "error-not-found": (ipmax) => ipmax.intelligence("192.0.2.1"),
  "geoip-8-8-8-8": (ipmax) => ipmax.geoip("8.8.8.8"),
  "geoip-10-1-2-3": (ipmax) => ipmax.geoip("10.1.2.3"),
  [`geoip-${ipv6.replaceAll(":", "-")}`]: (ipmax) => ipmax.geoip(ipv6),
  "intelligence-8-8-8-8": (ipmax) => ipmax.intelligence("8.8.8.8"),
  "intelligence-10-1-2-3": (ipmax) => ipmax.intelligence("10.1.2.3"),
  [`intelligence-${ipv6.replaceAll(":", "-")}`]: (ipmax) => ipmax.intelligence(ipv6),
  "intelligence-rich": (ipmax) => ipmax.intelligence("8.8.8.8"),
};

test("every fixture has a replay", () => {
  assert.deepEqual(fixtureNames.toSorted(), Object.keys(calls).toSorted());
});

for (const name of fixtureNames) {
  test(`replays fixture ${name}`, async (t) => {
    const reply = fixture(name);
    const { ipmax, requests } = await client(t, sequence(reply));
    const call = calls[name]?.(ipmax) ?? Promise.reject(new Error(`no replay for ${name}`));
    if (reply.status === 200) {
      assert.deepEqual(await call, (reply.body as { data: unknown }).data);
    } else {
      await assert.rejects(
        call,
        (error) => error instanceof ApiError && error.status === reply.status,
      );
    }
    assert.equal(requests.length, 1);
  });
}

test("catalog keeps fractional unit prices", async (t) => {
  const { ipmax } = await client(t, fixtureServer);
  const catalog = await ipmax.catalog();
  assert.equal(catalog.currency, "CNY");
  assert.equal(catalog.available, true);
  assert.deepEqual(
    catalog.prices.map((price) => [price.product, price.unitMicros]),
    [
      ["geoip", 437.5],
      ["intelligence", 1920],
    ],
  );
});

test("account decodes wallets and fractional ledger micros", async (t) => {
  const reply = withBody(fixture("account"), (body) => {
    const data = body.data as { wallets: unknown[]; entries: unknown[] };
    data.wallets = [{ product: "geoip", balanceMicros: 999_562.5 }];
    data.entries = [
      {
        id: "entry-1",
        product: "geoip",
        kind: "charge",
        amountMicros: 437.5,
        balanceMicros: 999_562.5,
        reference: "receipt-1",
        createdAt: "2026-09-29T08:30:00.000Z",
      },
    ];
  });
  const { ipmax } = await client(t, sequence(reply));
  const account = await ipmax.account();
  assert.equal(account.keyPrefix, "ipmax_test");
  assert.equal(account.wallets[0]?.balanceMicros, 999_562.5);
  assert.equal(account.entries[0]?.amountMicros, 437.5);
  assert.equal(account.entries[0]?.kind, "charge");
});

test("geoip 8.8.8.8 exposes currency and time zone", async (t) => {
  const { ipmax } = await client(t, fixtureServer);
  const geo = await ipmax.geoip("8.8.8.8");
  assert.equal(geo.as.asn, "AS15169");
  assert.equal(geo.geo.country_code, "US");
  assert.equal(geo.geo.radius, 25);
  assert.equal(geo.prefix_length, 24);
  assert.equal(geo.currency?.code, "USD");
  assert.equal(geo.time_zone?.abbr, "PDT");
  assert.equal(geo.time_zone?.is_dst, true);
  assert.equal(geo.calling_code, "1");
});

test("geoip for a bogon keeps nullable enrichment as null", async (t) => {
  const { ipmax } = await client(t, fixtureServer);
  const geo = await ipmax.geoip("10.1.2.3");
  assert.equal(geo.is_bogon, true);
  assert.equal(geo.currency, null);
  assert.equal(geo.time_zone, null);
  assert.equal(geo.calling_code, null);
  assert.equal(geo.geo.country_zh, undefined);
});

test("geoip for IPv6 decodes optional localized names", async (t) => {
  const { ipmax } = await client(t, fixtureServer);
  const geo = await ipmax.geoip("240e:390:a1:3cd0:be24:11ff:fe46:aca3");
  assert.equal(geo.geo.country_zh, "中国");
  assert.equal(geo.currency?.code, "CNY");
  assert.equal(geo.time_zone?.abbr, "GMT+8");
});

test("intelligence 8.8.8.8 exposes connectivity and RPKI", async (t) => {
  const { ipmax } = await client(t, fixtureServer);
  const intel = await ipmax.intelligence("8.8.8.8");
  assert.equal(intel.as.connectivity?.exchanges.length, 30);
  assert.equal(intel.as.connectivity?.estimated_capacity.lower_gbps, 3000);
  assert.equal(intel.as.connectivity?.estimated_capacity.upper_gbps, undefined);
  assert.equal(intel.rpki?.status, "valid");
  assert.equal(intel.rpki?.rtr?.source, "Cloudflare");
  assert.equal(intel.threat?.scores.trust_score, 70);
  assert.equal(intel.network_class.evidence.length, 3);
  assert.deepEqual(intel.intelligence.revoked_tags, [
    "business_broadband",
    "home_isp",
    "mobile_isp",
  ]);
});

test("intelligence for a bogon keeps null threat flags", async (t) => {
  const { ipmax } = await client(t, fixtureServer);
  const intel = await ipmax.intelligence("10.1.2.3");
  assert.equal(intel.threat?.is_tor, null);
  assert.equal(intel.threat?.scores.vpn_score, null);
  assert.equal(intel.network, undefined);
  assert.equal(intel.intelligence.usage_type, null);
  assert.deepEqual(intel.intelligence.ptr, []);
});

test("intelligence-rich decodes every PTR variant and live observation", async (t) => {
  const { ipmax } = await client(t, sequence(fixture("intelligence-rich")));
  const intel = await ipmax.intelligence("8.8.8.8");
  const [located, mismatch, unmatched] = intel.intelligence.ptr as [
    PtrIntelligence,
    PtrIntelligence,
    PtrIntelligence,
  ];
  assert.equal(located.status, "located");
  if (located.status === "located") {
    assert.equal(located.location.city, "Tokyo");
    assert.equal(located.location.region_code, "13");
    assert.equal(located.hint.kind, "clli");
    assert.equal(located.confidence.score, 0.92);
    assert.equal(located.evidence.sources[0]?.dataset, "geonames");
  }
  assert.equal(mismatch.status, "asn_mismatch");
  if (mismatch.status === "asn_mismatch") assert.equal(mismatch.observed_asn, "AS64501");
  assert.equal(unmatched.hostname, "dns.google");
  assert.equal(intel.intelligence.transfers?.[0]?.source_holder, "Level 3");
  assert.equal(intel.intelligence.transfers?.[0]?.recipient_holder, "Google LLC");
  assert.deepEqual(intel.intelligence.segment_probe?.ports, [53, 443]);
  assert.equal(intel.intelligence.abuse?.categories[0]?.count, 20);
  assert.equal(intel.intelligence.cpes[0]?.version, "1.25.3");
});

test("unknown enum values and unknown fields decode without error", async (t) => {
  const reply = withBody(fixture("intelligence-rich"), (body) => {
    const data = body.data as Record<string, Record<string, unknown>>;
    body.trace = "x";
    data.future_field = { nested: true };
    data.network_class = { ...data.network_class, primary: "orbital", source: "telepathy" };
    data.rpki = { ...data.rpki, status: "pending" };
    data.intelligence = {
      ...data.intelligence,
      tags: ["quantum_relay"],
      ptr: [{ hostname: "edge.example", status: "triangulated" }],
    };
  });
  const { ipmax } = await client(t, sequence(reply));
  const intel = await ipmax.intelligence("8.8.8.8");
  assert.equal(intel.network_class.primary, "orbital");
  assert.equal(intel.network_class.source, "telepathy");
  assert.equal(intel.rpki?.status, "pending");
  assert.deepEqual(intel.intelligence.tags, ["quantum_relay"]);
  assert.equal(intel.intelligence.ptr[0]?.hostname, "edge.example");
});
