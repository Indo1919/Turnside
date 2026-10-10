/** A deliberately small Fetch router for the API's Express surface.
 * The hosted bundle aliases `express` here; the local server still uses Express.
 * This is not a general Express replacement and never opens a socket.
 */
type Next = (error?: unknown) => void;
type Handler = (...args: any[]) => unknown;
type Layer = { path?: string; method?: string; handler: Handler };
const PARSED = Symbol("json-parsed");

function matchesPrefix(path: string, prefix = "/") {
  return prefix === "/" || path === prefix || path.startsWith(`${prefix}/`);
}
function bodyLimit(value: string | number = "100kb"): number {
  if (typeof value === "number" && Number.isFinite(value) && value > 0)
    return Math.floor(value);
  const match = /^(\d+(?:\.\d+)?)\s*(b|kb|mb)?$/i.exec(String(value));
  if (!match) throw new Error("Invalid JSON body limit.");
  return Math.floor(
    Number(match[1]) *
      ({ b: 1, kb: 1024, mb: 1048576 }[match[2]?.toLowerCase() || "b"] || 1),
  );
}
async function readBounded(request: Request, limit: number): Promise<string> {
  const size = request.headers.get("content-length");
  if (size && Number(size) > limit)
    throw Object.assign(new Error("Oversized request."), {
      type: "entity.too.large",
    });
  if (!request.body) return "";
  const reader = request.body.getReader(),
    chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) {
        await reader.cancel();
        throw Object.assign(new Error("Oversized request."), {
          type: "entity.too.large",
        });
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

function json(options: { limit?: string | number } = {}): Handler {
  const limit = bodyLimit(options.limit);
  return async (req: any, _res: any, next: Next) => {
    if (
      req[PARSED] ||
      !/^application\/(?:[\w.-]+\+)?json(?:\s*;|$)/i.test(
        req.get("content-type") || "",
      )
    )
      return next();
    try {
      const text = await readBounded(req.rawRequest, limit);
      req[PARSED] = true;
      if (!text.trim()) req.body = {};
      else {
        if (!/^[\s\uFEFF]*[\[{]/.test(text))
          throw new SyntaxError("Expected JSON object or array.");
        req.body = JSON.parse(text.replace(/^\uFEFF/, ""));
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}

export interface FetchApiApp {
  get(path: string, handler: Handler): FetchApiApp;
  post(path: string, handler: Handler): FetchApiApp;
  use(pathOrHandler: string | Handler, handler?: Handler): FetchApiApp;
  disable(name: string): FetchApiApp;
  fetch(request: Request): Promise<Response>;
}
function express(): FetchApiApp {
  const layers: Layer[] = [];
  const app: FetchApiApp = {
    get(path, handler) {
      layers.push({ method: "GET", path, handler });
      return app;
    },
    post(path, handler) {
      layers.push({ method: "POST", path, handler });
      return app;
    },
    use(pathOrHandler, handler) {
      layers.push(
        typeof pathOrHandler === "string"
          ? { path: pathOrHandler, handler: handler! }
          : { handler: pathOrHandler },
      );
      return app;
    },
    disable(_name) {
      return app;
    },
    async fetch(request) {
      const url = new URL(request.url),
        query: Record<string, string | string[]> = Object.create(null);
      for (const [name, value] of url.searchParams) {
        const previous = query[name];
        query[name] =
          previous === undefined
            ? value
            : Array.isArray(previous)
              ? [...previous, value]
              : [previous, value];
      }
      const headers = Object.fromEntries(request.headers),
        req: any = {
          rawRequest: request,
          method: request.method.toUpperCase(),
          path: url.pathname,
          url: url.pathname + url.search,
          originalUrl: url.pathname + url.search,
          query,
          headers,
          body: undefined,
          // This is an edge-provided header. Do not trust arbitrary forwarded-for chains.
          ip: request.headers.get("cf-connecting-ip") || "local",
          get(name: string) {
            return request.headers.get(name);
          },
          header(name: string) {
            return request.headers.get(name);
          },
        };
      let status = 200,
        response: Response | undefined;
      const responseHeaders = new Headers();
      const res: any = {
        status(code: number) {
          status = code;
          return res;
        },
        setHeader(name: string, value: string) {
          responseHeaders.set(name, String(value));
          return res;
        },
        json(data: unknown) {
          responseHeaders.set(
            "Content-Type",
            "application/json; charset=utf-8",
          );
          response = new Response(JSON.stringify(data), {
            status,
            headers: responseHeaders,
          });
          return res;
        },
        send(data: string | Uint8Array) {
          response = new Response(
            typeof data === "string" ? data : new Uint8Array(data),
            { status, headers: responseHeaders },
          );
          return res;
        },
        end(data?: string) {
          response = new Response(data || null, {
            status,
            headers: responseHeaders,
          });
          return res;
        },
        get headersSent() {
          return Boolean(response);
        },
      };
      async function dispatch(start: number, error?: unknown): Promise<void> {
        for (let index = start; index < layers.length && !response; index++) {
          const layer = layers[index],
            isError = layer.handler.length === 4;
          if (Boolean(error) !== isError) continue;
          if (
            layer.method
              ? layer.method !== req.method || layer.path !== req.path
              : !matchesPrefix(req.path, layer.path)
          )
            continue;
          let nextCalled = false,
            nextError: unknown;
          const next: Next = (value) => {
            nextCalled = true;
            nextError = value;
          };
          try {
            await (isError
              ? layer.handler(error, req, res, next)
              : layer.handler(req, res, next));
          } catch (caught) {
            nextCalled = true;
            nextError = caught;
          }
          if (response) return;
          if (nextCalled) {
            await dispatch(index + 1, nextError);
            return;
          }
          // All API handlers either send a response or explicitly advance.
          response = Response.json(
            { success: false, error: "API handler did not return a response." },
            { status: 500 },
          );
          return;
        }
        if (!response)
          response = Response.json(
            {
              success: false,
              error: error
                ? "The request could not be completed."
                : "Unknown API endpoint.",
            },
            { status: error ? 500 : 404 },
          );
      }
      await dispatch(0);
      return response!;
    },
  };
  return app;
}
express.json = json;
export default express;
