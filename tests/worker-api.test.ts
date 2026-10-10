import { test } from "node:test";
import assert from "node:assert/strict";
import { createApiApp } from "../backend/api";
import fetchExpress from "../hosting/express-fetch";
import { createRecommendationReceipts } from "../backend/recommendationReceipts";
import type { Recommendation } from "../src/recommendationTypes";

const offline: typeof fetch = async () => {
  throw new Error("Offline fixture");
};
const secret = "test-signing-secret-for-cross-instance-selections-2026";
function hosted(
  env: Record<string, string | undefined> = {},
  fetcher = offline,
  requireAiSignIn = false,
) {
  return createApiApp({
    env,
    fetcher,
    routerFactory: fetchExpress as any,
    requireAiSignIn,
  }) as unknown as ReturnType<typeof fetchExpress>;
}
async function call(
  app: ReturnType<typeof hosted>,
  path: string,
  body?: unknown,
) {
  const response = await app.fetch(
    new Request(`https://turnside.example${path}`, {
      ...(body === undefined
        ? {}
        : {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }),
    }),
  );
  return {
    status: response.status,
    data: (await response.json()) as any,
    headers: response.headers,
  };
}
test("Hosted Fetch API preserves demo discovery/planning, honest route/booking and secret isolation", async () => {
  const app = hosted({ RECOMMENDATION_SIGNING_SECRET: secret });
  assert.equal((await call(app, "/api/health")).data.app, "Turnside");
  const config = await call(app, "/api/config");
  assert.equal(config.data.hasGeminiKey, false);
  assert.ok(!JSON.stringify(config.data).includes(secret));
  const discover = await call(app, "/api/discover", {
    query: "Coffee and art in New York",
    forceDemo: true,
  });
  assert.equal(discover.data.source, "demo");
  assert.ok(discover.data.recommendations.length > 0);
  const plan = await call(hosted(), "/api/gemini/plan", {
    destination: "New York",
    preferredPlaceIds: discover.data.recommendations
      .slice(0, 2)
      .map((p: any) => p.id),
  });
  assert.equal(plan.status, 200);
  assert.equal(plan.data.data.days[0].stops.length, 2);
  assert.equal(
    (
      await call(app, "/api/route", {
        coordinates: [
          [-74, 40.7],
          [-73.99, 40.72],
        ],
      })
    ).data.source,
    "preview",
  );
  const booking = await call(app, "/api/gemini/book", {
    stopTitle: "Whitney Museum",
    city: "New York",
    slotTime: "03:00 PM",
  });
  assert.equal(booking.data.booking.reservationCode, "NOT BOOKED");
  assert.equal((await call(app, "/api/missing")).status, 404);
  assert.equal(
    (
      await call(app, "/api/places/details", {
        name: "Whitney",
        city: "New York",
      })
    ).status,
    503,
  );
});

test("Hosted parser bounds streamed JSON, handles malformed requests, and retains the larger voice limit", async () => {
  const app = hosted();
  const invalid = await app.fetch(
    new Request("https://turnside.example/api/discover", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{broken",
    }),
  );
  assert.equal(invalid.status, 400);
  assert.match(((await invalid.json()) as any).error, /Invalid or oversized/);
  const large = { query: "x".repeat(270000) };
  assert.equal((await call(app, "/api/discover", large)).status, 400);
  // This valid audio request is over the general 256 KB limit, but under the 6 MB voice limit.
  const voice = await call(app, "/api/voice/transcribe", {
    audioBase64: "YWFh".repeat(70000),
    mimeType: "audio/webm",
    durationSeconds: 3,
  });
  assert.equal(voice.status, 503);
  assert.match(voice.data.error, /Connect a Gemini API key/);
  assert.equal(
    (await call(app, "/api/weather?lat=40&lat=41&lng=-74")).status,
    400,
  );
  const hugeVoice = await call(app, "/api/voice/transcribe", {
    audioBase64: "a".repeat(6 * 1024 * 1024),
  });
  assert.equal(hugeVoice.status, 400);
});

function place(): Recommendation {
  return {
    id: "google-real-test",
    title: "Provider Coffee",
    city: "Lisbon",
    category: "cafe",
    categoryLabel: "Coffee",
    description: "Real provider fixture",
    reason: "Traveler preference",
    durationMinutes: 45,
    coordinates: [-9.14, 38.72],
    source: "google-places",
    sourceLabel: "Google Places",
    sourceUrl: "https://maps.google.com/?cid=123",
    verified: true,
    attributions: [],
    fetchedAt: "2026-10-10T12:00:00Z",
  };
}
test("Signed selections survive different API instances and reject tampering, expiry, wrong cities and unknown IDs", async () => {
  const receipts = createRecommendationReceipts(secret),
    p = place();
  const receipt = await receipts.issue(p.city, [p]);
  assert.ok(receipt);
  const first = hosted({ RECOMMENDATION_SIGNING_SECRET: secret });
  const second = hosted({ RECOMMENDATION_SIGNING_SECRET: secret });
  const body = {
    destination: "Lisbon",
    preferredPlaceIds: [p.id],
    selectionReceipt: receipt,
  };
  const plan = await call(second, "/api/gemini/plan", body);
  assert.equal(plan.status, 200);
  assert.deepEqual(plan.data.data.days[0].stops[0].coordinates, p.coordinates);
  assert.equal(plan.headers.get("Cache-Control"), "no-store");
  assert.equal(
    (await call(first, "/api/gemini/plan", { ...body, destination: "Paris" }))
      .status,
    409,
  );
  assert.equal(
    (
      await call(first, "/api/gemini/plan", {
        ...body,
        preferredPlaceIds: ["forged"],
      })
    ).status,
    409,
  );
  const [payload, signature] = receipt!.split(".");
  const tampered = `${payload}.${signature[0] === "a" ? "b" : "a"}${signature.slice(1)}`;
  assert.equal(
    (
      await call(second, "/api/gemini/plan", {
        ...body,
        selectionReceipt: tampered,
      })
    ).status,
    409,
  );
  // A supplied invalid receipt must not fall back to an otherwise approved catalog ID.
  const demo = await call(first, "/api/discover", { query: "Coffee in NYC" });
  assert.equal(
    (
      await call(first, "/api/gemini/plan", {
        destination: "New York",
        preferredPlaceIds: [demo.data.recommendations[0].id],
        selectionReceipt: "invalid",
      })
    ).status,
    409,
  );
  const expired = await createRecommendationReceipts(
    secret,
    () => Date.now() - 21 * 60000,
  ).issue("Lisbon", [p]);
  assert.equal(
    (
      await call(second, "/api/gemini/plan", {
        ...body,
        selectionReceipt: expired,
      })
    ).status,
    409,
  );
  assert.equal((await call(hosted(), "/api/gemini/plan", body)).status, 409);
});

test("Live hosted discovery issues an authenticated receipt and another instance builds the selected provider venue", async () => {
  const provider: typeof fetch = async (input) => {
    if (String(input).endsWith("/interactions"))
      return Response.json({
        steps: [
          {
            type: "model_output",
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  reply: "A coffee stop in Lisbon",
                  recommendations: [
                    {
                      title: "Provider Coffee",
                      placeId: "real-test",
                      category: "cafe",
                      description: "Coffee",
                      reason: "Your preference",
                      durationMinutes: 45,
                    },
                  ],
                }),
                annotations: [
                  {
                    type: "place_citation",
                    name: "Provider Coffee",
                    place_id: "places/real-test",
                    url: "https://maps.google.com/?cid=123",
                  },
                ],
              },
            ],
          },
        ],
      });
    return Response.json({
      id: "real-test",
      displayName: { text: "Provider Coffee" },
      location: { longitude: -9.14, latitude: 38.72 },
      googleMapsUri: "https://maps.google.com/?cid=123",
    });
  };
  const env = {
    GEMINI_API_KEY: "gemini-fixture-key",
    GOOGLE_PLACES_API_KEY: "places-fixture-key",
    RECOMMENDATION_SIGNING_SECRET: secret,
  };
  const discovery = await call(hosted(env, provider), "/api/discover", {
    query: "Coffee in Lisbon",
    forceDemo: false,
  });
  assert.equal(discovery.data.source, "gemini");
  assert.equal(discovery.data.recommendations.length, 1);
  assert.equal(typeof discovery.data.selectionReceipt, "string");
  const plan = await call(hosted(env), "/api/gemini/plan", {
    destination: "Lisbon",
    preferredPlaceIds: [discovery.data.recommendations[0].id],
    selectionReceipt: discovery.data.selectionReceipt,
  });
  assert.equal(plan.status, 200);
  assert.equal(plan.data.data.days[0].stops[0].title, "Provider Coffee");
});

test("Fetch facade awaits async handlers and never leaks unexpected exception details", async () => {
  const app = fetchExpress();
  app.get("/async", async (_req, res) => {
    await Promise.resolve();
    res.status(201).json({ okay: true });
  });
  app.get("/fail", () => {
    throw new Error("private-provider-key");
  });
  assert.equal(
    (await app.fetch(new Request("https://example.org/async"))).status,
    201,
  );
  const failure = await app.fetch(new Request("https://example.org/fail"));
  assert.equal(failure.status, 500);
  assert.ok(!(await failure.text()).includes("private-provider-key"));
});

test("Public hosted demo works anonymously while paid Gemini routes require the Sites identity", async () => {
  let providerCalls = 0;
  const provider: typeof fetch = async () => {
    providerCalls++;
    throw new Error("Offline fixture");
  };
  const app = hosted(
    { GEMINI_API_KEY: "gemini-fixture-key", AI_MODE: "live" },
    provider,
    true,
  );
  const config = await call(app, "/api/config");
  assert.equal(config.data.hasGeminiKey, true);
  assert.equal(config.data.requiresAiSignIn, true);
  assert.equal(config.headers.get("Cache-Control"), "no-store");
  const requests = [
    ["/api/discover", { query: "Coffee in NYC" }],
    ["/api/gemini/chat", { message: "Coffee in NYC" }],
    ["/api/gemini/plan", { destination: "New York" }],
    ["/api/voice/transcribe", { audioBase64: "YWFh", mimeType: "audio/webm" }],
    ["/api/voice/speak", { text: "Good morning" }],
    ["/api/gemini/tts", { text: "Good morning" }],
    ["/api/live/session", { city: "New York" }],
  ] as const;
  for (const [path, body] of requests) {
    const result = await call(app, path, body);
    assert.equal(result.status, 401, path);
    assert.equal(result.data.signInUrl, "/signin-with-chatgpt?returnTo=%2F");
    assert.equal(result.headers.get("Cache-Control"), "no-store");
  }
  assert.equal(
    providerCalls,
    0,
    "Unauthorized requests must never invoke a provider.",
  );
  const demo = await call(app, "/api/discover", {
    query: "Coffee in NYC",
    forceDemo: true,
  });
  assert.equal(demo.status, 200);
  assert.equal(demo.data.source, "demo");
  const selected = await call(app, "/api/gemini/plan", {
    destination: "New York",
    preferredPlaceIds: [demo.data.recommendations[0].id],
    forceDemo: false,
  });
  assert.equal(
    selected.status,
    200,
    "Arranging selected places incurs no paid AI call.",
  );
  const booking = await call(app, "/api/gemini/book", {
    stopTitle: "Whitney",
    city: "New York",
  });
  assert.equal(booking.status, 200);
  assert.equal(providerCalls, 0);
  const signedInConfig = await app.fetch(
    new Request("https://turnside.example/api/config", {
      headers: { "oai-authenticated-user-id": "site-owned-visitor-id" },
    }),
  );
  assert.equal(((await signedInConfig.json()) as any).requiresAiSignIn, false);
  const signedIn = await app.fetch(
    new Request("https://turnside.example/api/live/session", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "oai-authenticated-user-id": "site-owned-visitor-id",
      },
      body: JSON.stringify({ city: "New York" }),
    }),
  );
  assert.equal(signedIn.status, 502);
  assert.equal(
    providerCalls,
    1,
    "Sites identity allows the real provider path.",
  );
});

test("Hosted Gemini gate follows explicit demo overrides and does not block a keyless demo", async () => {
  const keyless = hosted({}, offline, true);
  assert.equal(
    (await call(keyless, "/api/config")).data.requiresAiSignIn,
    false,
  );
  assert.equal(
    (
      await call(keyless, "/api/discover", {
        query: "Coffee in NYC",
        forceDemo: false,
      })
    ).status,
    200,
  );
  const demoDefault = hosted(
    { GEMINI_API_KEY: "gemini-fixture-key" },
    offline,
    true,
  );
  assert.equal(
    (await call(demoDefault, "/api/discover", { query: "Coffee in NYC" }))
      .status,
    200,
  );
  assert.equal(
    (
      await call(demoDefault, "/api/discover", {
        query: "Coffee in NYC",
        forceDemo: false,
      })
    ).status,
    401,
  );
  const local = hosted({ GEMINI_API_KEY: "gemini-fixture-key" });
  assert.equal((await call(local, "/api/config")).data.requiresAiSignIn, false);
  assert.notEqual(
    (
      await call(local, "/api/discover", {
        query: "Coffee in NYC",
        forceDemo: false,
      })
    ).status,
    401,
  );
});
