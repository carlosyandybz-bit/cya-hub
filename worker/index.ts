/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  NEXT_PUBLIC_SUPABASE_URL?: string;
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Browser bundles are built before Sites attaches production environment
    // variables. Expose only Supabase's browser-safe public configuration at
    // request time so a deployment never bakes empty values into the login.
    if (url.pathname === "/api/runtime-config") {
      if (request.method !== "GET") {
        return new Response(null, {
          status: 405,
          headers: { allow: "GET" },
        });
      }

      const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
      const supabasePublishableKey =
        env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ?? "";
      const configured = Boolean(supabaseUrl && supabasePublishableKey);

      return Response.json(
        configured
          ? { configured, supabaseUrl, supabasePublishableKey }
          : { configured },
        {
          status: configured ? 200 : 503,
          headers: {
            "cache-control": "no-store, max-age=0",
            "x-content-type-options": "nosniff",
          },
        },
      );
    }

    // Sites dispatches every request through this Worker. Serve Vinext's
    // browser bundles and public files from the static-assets binding before
    // handing application routes to the App Router; otherwise these requests
    // reach the router and correctly end in a 404.
    if (
      url.pathname.startsWith("/assets/") ||
      url.pathname.startsWith("/_next/static/") ||
      url.pathname === "/favicon.svg" ||
      url.pathname === "/file.svg" ||
      url.pathname === "/globe.svg" ||
      url.pathname === "/window.svg"
    ) {
      return env.ASSETS.fetch(request);
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    const response = await handler.fetch(request, env, ctx);

    // The HTML shell references content-hashed browser bundles. Never let an
    // open Safari tab reuse an older shell after a deployment, because those
    // hashes no longer exist in the new immutable asset set.
    if (response.headers.get("content-type")?.toLowerCase().startsWith("text/html")) {
      const headers = new Headers(response.headers);
      headers.set("cache-control", "no-store, max-age=0, must-revalidate");
      headers.set("pragma", "no-cache");
      headers.set("x-content-type-options", "nosniff");
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    }

    return response;
  },
};

export default worker;
