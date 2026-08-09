import assert from "node:assert/strict";
import test from "node:test";

const developmentPreviewMeta =
  /<meta(?=[^>]*\bname=["']codex-preview["'])(?=[^>]*\bcontent=["']development["'])[^>]*>/i;

test("renders development preview metadata", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  const response = await worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );

  assert.equal(response.status, 200);
  assert.match(
    response.headers.get("content-type") ?? "",
    /^text\/html\b/i,
  );
  assert.equal(
    response.headers.get("cache-control"),
    "no-store, max-age=0, must-revalidate",
  );
  assert.equal(response.headers.get("pragma"), "no-cache");
  assert.match(await response.text(), developmentPreviewMeta);
});

test("serves browser bundles from the static-assets binding", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("asset-test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const requestedAssetUrls = [];

  const response = await worker.fetch(
    new Request("http://localhost/assets/cya-app-test.js"),
    {
      ASSETS: {
        fetch: async (request) => {
          requestedAssetUrls.push(request.url);
          return new Response("asset-ok", {
            status: 200,
            headers: { "content-type": "text/javascript" },
          });
        },
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );

  assert.equal(response.status, 200);
  assert.equal(await response.text(), "asset-ok");
  assert.deepEqual(requestedAssetUrls, [
    "http://localhost/assets/cya-app-test.js",
  ]);
});

test("serves Supabase public configuration from the runtime environment", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("runtime-config-test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  const response = await worker.fetch(
    new Request("http://localhost/api/runtime-config"),
    {
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_runtime_test",
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store, max-age=0");
  assert.deepEqual(await response.json(), {
    configured: true,
    supabaseUrl: "https://example.supabase.co",
    supabasePublishableKey: "sb_publishable_runtime_test",
  });
});

test("fails closed when Supabase runtime configuration is absent", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("missing-runtime-config-test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  const response = await worker.fetch(
    new Request("http://localhost/api/runtime-config"),
    {},
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { configured: false });
});
