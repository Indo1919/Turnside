import { createApiApp } from "../backend/api";
// @ts-expect-error The hosting build supplies this module without a generated source file.
import clientAssets from "turnside:assets";

interface EmbeddedAsset {
  body: string;
  mime: string;
  etag: string;
  size: number;
}
interface FetchApi {
  fetch(request: Request): Promise<Response>;
}
type Bindings = Record<string, unknown>;
const assets = clientAssets as Record<string, EmbeddedAsset>;
let cached: { fingerprint: string; api: FetchApi } | undefined;

function apiFor(bindings: Bindings): FetchApi {
  const env = Object.fromEntries(
    Object.entries(bindings)
      .filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      )
      .sort(([a], [b]) => a.localeCompare(b)),
  );
  // The fingerprint stays in isolate memory. Secret values are never emitted.
  const fingerprint = JSON.stringify(env);
  if (cached?.fingerprint !== fingerprint) {
    const api = createApiApp({
      env,
      fetcher: fetch,
      requireAiSignIn: true,
    }) as unknown as FetchApi;
    if (typeof api.fetch !== "function")
      throw new Error("The hosted API adapter is unavailable.");
    cached = { fingerprint, api };
  }
  return cached.api;
}

function jsonError(status: number, error: string): Response {
  return Response.json(
    { success: false, error },
    {
      status,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

function assetResponse(
  request: Request,
  path: string,
  asset: EmbeddedAsset,
): Response {
  const headers = new Headers({
    "Content-Type": asset.mime,
    "X-Content-Type-Options": "nosniff",
    ETag: asset.etag,
    "Cache-Control": path.startsWith("/assets/")
      ? "public, max-age=31536000, immutable"
      : asset.mime.startsWith("text/html")
        ? "no-cache"
        : "public, max-age=3600",
  });
  if (
    request.headers
      .get("If-None-Match")
      ?.split(/\s*,\s*/)
      .includes(asset.etag)
  )
    return new Response(null, { status: 304, headers });
  headers.set("Content-Length", String(asset.size));
  if (request.method === "HEAD") return new Response(null, { headers });
  const decoded = atob(asset.body);
  const bytes = Uint8Array.from(decoded, (char) => char.charCodeAt(0));
  return new Response(bytes, { headers });
}

export default {
  async fetch(request: Request, bindings: Bindings = {}): Promise<Response> {
    let path: string;
    try {
      path = decodeURIComponent(new URL(request.url).pathname);
    } catch {
      return jsonError(400, "Invalid request path.");
    }
    if (path === "/api" || path.startsWith("/api/")) {
      try {
        return await apiFor(bindings).fetch(request);
      } catch {
        return jsonError(
          500,
          "This request could not be completed. Try again.",
        );
      }
    }
    if (!["GET", "HEAD"].includes(request.method))
      return new Response("Method not allowed.", {
        status: 405,
        headers: { Allow: "GET, HEAD" },
      });
    const assetPath = path === "/" ? "/index.html" : path;
    if (Object.hasOwn(assets, assetPath))
      return assetResponse(request, assetPath, assets[assetPath]);
    const navigation =
      request.headers.get("Accept")?.includes("text/html") &&
      !path.startsWith("/assets/") &&
      !path.split("/").at(-1)?.includes(".");
    if (navigation)
      return assetResponse(request, "/index.html", assets["/index.html"]);
    return new Response("Not found.", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  },
};
