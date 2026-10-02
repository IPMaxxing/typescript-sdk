import { readdirSync, readFileSync } from "node:fs";
import { createServer, type IncomingHttpHeaders } from "node:http";
import type { AddressInfo } from "node:net";
import type { TestContext } from "node:test";
import type { ClientOptions } from "../src/index.ts";
import { IPMax } from "../src/index.ts";

export interface Reply {
  status: number;
  headers?: Record<string, string>;
  body: unknown;
}

export interface Recorded {
  method: string;
  path: string;
  headers: IncomingHttpHeaders;
  body: string;
}

export interface Server {
  baseURL: string;
  requests: Recorded[];
}

export type Handler = (request: Recorded) => Reply | "drop" | Promise<Reply | "drop">;

const fixtureDirectory = new URL("fixtures/", import.meta.url);

export const fixtureNames: string[] = readdirSync(fixtureDirectory)
  .filter((file) => file.endsWith(".json"))
  .map((file) => file.slice(0, -".json".length));

export function fixture(name: string): Reply {
  return JSON.parse(readFileSync(new URL(`${name}.json`, fixtureDirectory), "utf8")) as Reply;
}

export function fixtureFor(path: string, body: string): Reply {
  const product = path.split("/").at(-1) ?? "";
  if (path === "/api/v1/catalog" || path === "/api/v1/account") return fixture(product);
  const { ip } = JSON.parse(body) as { ip: string };
  return fixture(`${product}-${ip.replaceAll(/[.:]/g, "-")}`);
}

export const fixtureServer: Handler = (request) => fixtureFor(request.path, request.body);

export function sequence(first: Reply | "drop", ...rest: (Reply | "drop")[]): Handler {
  const replies = [first, ...rest];
  let index = 0;
  return () => {
    const reply = replies[Math.min(index, replies.length - 1)] ?? first;
    index += 1;
    return reply;
  };
}

export async function serve(t: TestContext, handler: Handler): Promise<Server> {
  const requests: Recorded[] = [];
  const server = createServer(async (incoming, outgoing) => {
    const chunks: Buffer[] = [];
    for await (const chunk of incoming) chunks.push(chunk as Buffer);
    const request: Recorded = {
      method: incoming.method ?? "",
      path: incoming.url ?? "",
      headers: incoming.headers,
      body: Buffer.concat(chunks).toString("utf8"),
    };
    requests.push(request);
    const reply = await handler(request);
    if (reply === "drop") {
      incoming.socket.destroy();
      return;
    }
    const raw = typeof reply.body === "string";
    outgoing.writeHead(reply.status, {
      "content-type": raw ? "text/plain" : "application/json",
      ...reply.headers,
    });
    outgoing.end(raw ? reply.body : JSON.stringify(reply.body));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  const { port } = server.address() as AddressInfo;
  return { baseURL: `http://127.0.0.1:${port}`, requests };
}

export async function client(
  t: TestContext,
  handler: Handler,
  options: ClientOptions = {},
): Promise<{ ipmax: IPMax; requests: Recorded[] }> {
  const { baseURL, requests } = await serve(t, handler);
  return { ipmax: new IPMax({ apiKey: "ipmax_test_key", baseURL, ...options }), requests };
}

export function withBody(reply: Reply, change: (body: Record<string, unknown>) => void): Reply {
  const body = structuredClone(reply.body) as Record<string, unknown>;
  change(body);
  return { ...reply, body };
}

export const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));
