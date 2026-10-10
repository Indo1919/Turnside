import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = await readFile(resolve(root, "dist/server/index.js"), "utf8");
const manifest = JSON.parse(
  await readFile(resolve(root, "dist/.openai/hosting.json"), "utf8"),
);
assert.equal(
  typeof manifest.project_id,
  "string",
  "The hosted artifact needs a Site project ID.",
);
assert.ok(manifest.project_id.trim());
assert.equal(
  Object.hasOwn(manifest, "static"),
  false,
  "A Worker build cannot declare static hosting.",
);
assert.doesNotMatch(
  source,
  /(?:from|import)\s*["'](?:node:|cloudflare:|dotenv|express)[^"']*["']/,
  "The Worker must contain a portable bundled API, with no server-only imports.",
);

const privateNames = [
  "GEMINI_API_KEY",
  "GOOGLE_PLACES_API_KEY",
  "GOOGLE_MAPS_SERVER_KEY",
  "GOOGLE_MAPS_API_KEY",
  "GOOGLE_ROUTES_API_KEY",
  "MAPBOX_SECRET_TOKEN",
  "RECOMMENDATION_SIGNING_SECRET",
];
const configured = { ...process.env };
for (const filename of [".env", ".env.local"]) {
  try {
    const contents = await readFile(resolve(root, filename), "utf8");
    for (const line of contents.split(/\r?\n/)) {
      const match = line.match(
        /^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*?)\s*$/,
      );
      if (!match || !privateNames.includes(match[1])) continue;
      let value = match[2];
      if (/^["']/.test(value))
        value = value.slice(1, value.lastIndexOf(value[0]));
      else value = value.replace(/\s+#.*$/, "");
      configured[match[1]] = value;
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}
for (const name of privateNames) {
  const value = configured[name];
  if (
    value?.length > 12 &&
    !/^(?:your|replace|placeholder|demo|not.configured)/i.test(value)
  )
    assert.equal(
      source.includes(value),
      false,
      `A private ${name} value was embedded in the artifact.`,
    );
}

const worker = (
  await import(
    `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
  )
).default;
assert.equal(
  typeof worker?.fetch,
  "function",
  "The artifact must export default.fetch.",
);
async function request(path, body, options = {}) {
  return worker.fetch(
    new Request(`https://turnside.example${path}`, {
      ...options,
      ...(body === undefined
        ? {}
        : {
            method: "POST",
            headers: { "Content-Type": "application/json", ...options.headers },
            body: JSON.stringify(body),
          }),
    }),
    {},
  );
}
const home = await request("/");
assert.equal(home.status, 200);
assert.match(home.headers.get("Content-Type"), /^text\/html/);
const html = await home.text();
assert.match(html, /Turnside/);
const script = html.match(/<script[^>]+src="([^"]+)"/)?.[1];
assert.ok(script, "The frontend needs its real JavaScript bundle.");
const client = await request(script);
assert.equal(client.status, 200);
assert.match(client.headers.get("Content-Type"), /javascript/);
assert.ok((await client.text()).length > 1000);
const cachedAsset = await request(script, undefined, {
  headers: { "If-None-Match": client.headers.get("ETag") },
});
assert.equal(cachedAsset.status, 304);
const head = await request(script, undefined, { method: "HEAD" });
assert.equal(head.status, 200);
assert.equal(await head.text(), "");
assert.equal(
  (
    await request("/assets/missing.js", undefined, {
      headers: { Accept: "text/html" },
    })
  ).status,
  404,
);
assert.equal((await request("/missing.css")).status, 404);
assert.equal(
  (await request("/plan", undefined, { headers: { Accept: "text/html" } }))
    .status,
  200,
);
const unknownApi = await request("/api/missing", undefined, {
  headers: { Accept: "text/html" },
});
assert.equal(unknownApi.status, 404);
assert.match(unknownApi.headers.get("Content-Type"), /json/);

const config = await request("/api/config");
assert.equal(config.status, 200);
const setup = await config.json();
assert.equal(setup.appName, "Turnside");
assert.equal(setup.hasGeminiKey, false);
assert.equal(setup.hasGooglePlacesKey, false);
assert.equal(setup.googleMapsBrowserKey, "");
const protectedBindings = {
  GEMINI_API_KEY: "hosted-validation-fixture-key",
  AI_MODE: "live",
};
const anonymousConfig = await worker.fetch(
  new Request("https://turnside.example/api/config"),
  protectedBindings,
);
assert.equal((await anonymousConfig.json()).requiresAiSignIn, true);
const blocked = await worker.fetch(
  new Request("https://turnside.example/api/discover", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: "Coffee in New York", forceDemo: false }),
  }),
  protectedBindings,
);
assert.equal(blocked.status, 401);
assert.equal(
  (await blocked.json()).signInUrl,
  "/signin-with-chatgpt?returnTo=%2F",
);
const authenticatedConfig = await worker.fetch(
  new Request("https://turnside.example/api/config", {
    headers: { "oai-authenticated-user-id": "hosting-validation-user" },
  }),
  protectedBindings,
);
assert.equal((await authenticatedConfig.json()).requiresAiSignIn, false);
const anonymousDemo = await worker.fetch(
  new Request("https://turnside.example/api/discover", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: "Coffee in New York", forceDemo: true }),
  }),
  protectedBindings,
);
assert.equal(anonymousDemo.status, 200);
const discovery = await request("/api/discover", {
  query: "coffee in New York",
  city: "New York",
  forceDemo: true,
});
assert.equal(discovery.status, 200);
const recommended = await discovery.json();
assert.equal(recommended.source, "demo");
assert.ok(recommended.recommendations.length > 0);
const picked = recommended.recommendations[0];
const plan = await request("/api/gemini/plan", {
  destination: "New York",
  durationDays: 1,
  startDate: "2026-10-10",
  forceDemo: true,
  preferredPlaceIds: [picked.id],
  ...(recommended.selectionReceipt
    ? { selectionReceipt: recommended.selectionReceipt }
    : {}),
});
assert.equal(plan.status, 200);
const itinerary = await plan.json();
assert.equal(itinerary.success, true);
assert.equal(itinerary.data.days[0].stops[0].id, picked.id);
assert.equal(itinerary.data.days[0].stops[0].title, picked.title);
assert.equal(itinerary.data.timeZone, "America/New_York");
const invalid = await request("/api/gemini/plan", {
  destination: "New York",
  durationDays: 99,
  forceDemo: true,
});
assert.equal(invalid.status, 400);
console.info(
  "Hosted artifact passed frontend, caching, portable API, selected demo planning, validation and private-key checks.",
);
