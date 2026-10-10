import { test } from "node:test";
import assert from "node:assert/strict";
import { createApiApp } from "../server";
import { buildDemoTrip, parseMinutes } from "../backend/demoData";
import {
  createEventPayloadFromStop,
  generateIcsCalendar,
  getGoogleCalendarWebUrl,
} from "../src/services/calendarService";
import { generateShareableSummary } from "../src/services/shareService";
import { replanStops } from "../backend/integrations";
import { INITIAL_TRIP } from "../src/demoData";
import { itineraryTimezone } from "../src/services/calendarService";
import { decodePolyline } from "../backend/routes";
import {
  buildSelectedTrip,
  demoRecommendations,
  resolveRecommendationDestination,
  groundedRecommendations,
} from "../backend/recommendations";
import { generateLivePlan } from "../backend/integrations";
import type { Recommendation } from "../src/recommendationTypes";

async function api(
  options: Parameters<typeof createApiApp>[0],
  run: (
    request: (
      path: string,
      body?: any,
    ) => Promise<{ status: number; data: any }>,
  ) => Promise<void>,
) {
  if (process.env.TEST_HTTP !== "1") {
    const app = createApiApp(options);
    await run(async (path, body) => {
      const url = new URL(path, "http://localhost");
      const method = body === undefined ? "get" : "post";
      const layer = (app as any)._router.stack.find(
        (entry: any) =>
          entry.route?.path === url.pathname && entry.route.methods[method],
      );
      if (!layer) throw new Error(`Missing API route: ${path}`);
      let status = 200;
      let data: any;
      const response = {
        status(code: number) {
          status = code;
          return this;
        },
        json(value: any) {
          data = value;
          return this;
        },
        setHeader(_name: string, _value: string) {
          return this;
        },
      };
      await layer.route.stack[0].handle(
        { body: body || {}, query: Object.fromEntries(url.searchParams) },
        response,
      );
      return { status, data };
    });
    return;
  }
  const server = createApiApp(options).listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address() as { port: number };
  const request = async (path: string, body?: any) => {
    const response = await fetch(`http://127.0.0.1:${address.port}${path}`, {
      ...(body === undefined
        ? {}
        : {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }),
    });
    return { status: response.status, data: await response.json() };
  };
  try {
    await run(request);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

const offline: typeof fetch = async () => {
  throw new Error("Offline fixture");
};

test("Current destination requests override old city and GPS, while stylistic city mentions do not", () => {
  const switched = resolveRecommendationDestination({
    query: "Find coffee in Tokyo",
    city: "New York",
    userLocation: [-74, 40.7],
  });
  assert.equal(switched.city, "Tokyo, Japan");
  assert.deepEqual(switched.center, [139.6995, 35.6624]);
  assert.equal(switched.destination.timeZone, "Asia/Tokyo");
  assert.equal(switched.switched, true);
  const styles = [
    "Paris-style coffee shops",
    "Find Tokyo-inspired coffee in New York",
    "Coffee in a Paris-style café",
    "A café with Paris inspired decor",
  ];
  for (const query of styles)
    assert.equal(
      resolveRecommendationDestination({ query, city: "New York" }).city,
      "New York",
      query,
    );
  const unsupported = demoRecommendations({
    query: "Find coffee in London",
    city: "New York",
    userLocation: [-74, 40.7],
  });
  assert.equal(unsupported.destination?.city, "London");
  assert.equal(unsupported.destination?.center, undefined);
  assert.equal(unsupported.destination?.timeZone, undefined);
  assert.deepEqual(unsupported.recommendations, []);
  assert.match(unsupported.reply, /does not cover London/);
  assert.equal(
    demoRecommendations({ query: "Find coffee", city: "Lisbon" })
      .recommendations.length,
    0,
  );
  assert.equal(
    demoRecommendations({ query: "Coffee in Paris", city: "New York" })
      .destination?.timeZone,
    "Europe/Paris",
  );
});

test("Grounded destination override biases Maps to the requested city rather than stale GPS", async () => {
  let tool: any;
  const provider: typeof fetch = async (_input, init) => {
    tool = JSON.parse(String(init?.body)).tools[0];
    return new Response(
      JSON.stringify({
        steps: [
          {
            type: "model_output",
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  reply: "What kind of coffee do you like?",
                  recommendations: [],
                }),
              },
            ],
          },
        ],
      }),
    );
  };
  const result = await groundedRecommendations(
    {
      query: "Find coffee in Tokyo",
      city: "New York",
      userLocation: [-74, 40.7],
    },
    provider,
    { GEMINI_API_KEY: "private-fixture" },
    "gemini-3.8-flash",
  );
  assert.equal(result.destination?.city, "Tokyo, Japan");
  assert.equal(tool.latitude, 35.6624);
  assert.equal(tool.longitude, 139.6995);
});

function selectedCard(overrides: Partial<Recommendation> = {}): Recommendation {
  return {
    id: "selected-place",
    title: "Selected venue",
    city: "New York",
    category: "niche",
    categoryLabel: "Shop",
    description: "Visit",
    reason: "Chosen by traveler",
    durationMinutes: 60,
    coordinates: [-74, 40.7],
    source: "google-places",
    sourceLabel: "Google Maps",
    verified: true,
    attributions: [],
    ...overrides,
  };
}
test("Selected days reject midnight overflow and accept a visit ending exactly at midnight without a final buffer", () => {
  const params = {
    destination: "New York",
    durationDays: 1,
    pacing: "relaxed",
    startDate: "2026-10-10",
  };
  assert.throws(
    () =>
      buildSelectedTrip(
        params,
        Array.from({ length: 6 }, (_, i) =>
          selectedCard({ id: "long-" + i, durationMinutes: 240 }),
        ),
      ),
    /past midnight/,
  );
  const boundary = buildSelectedTrip(params, [
    selectedCard({
      category: "nightlife",
      suggestedTime: "11:00 PM",
      durationMinutes: 60,
      openingHours: { weekdayDescriptions: ["Monday: 6PM–midnight"] },
      websiteUri: "https://example.org/venue",
      fetchedAt: "2026-10-10T12:00:00Z",
    }),
  ]);
  const stop = boundary.days[0].stops[0];
  assert.equal(stop.time, "11:00 PM");
  assert.deepEqual(stop.openingHours?.weekdayDescriptions, [
    "Monday: 6PM–midnight",
  ]);
  assert.equal(stop.websiteUri, "https://example.org/venue");
  assert.equal(stop.fetchedAt, "2026-10-10T12:00:00Z");
  assert.throws(
    () =>
      buildSelectedTrip(params, [
        selectedCard({ suggestedTime: "11:30 PM", durationMinutes: 60 }),
      ]),
    /past midnight/,
  );
  const custom = buildSelectedTrip({ ...params, destination: "Lisbon" }, [
    selectedCard({ city: "Lisbon", coordinates: [-9.14, 38.72] }),
  ]);
  assert.equal(custom.timeZone, undefined);
  assert.equal(custom.timezone, undefined);
  assert.equal(boundary.timeZone, "America/New_York");
});

test("Paris, Texas remains a custom destination rather than borrowing the France catalog", () => {
  for (const params of [
    { query: "Find coffee in Paris, Texas", city: "New York" },
    { query: "Find coffee", city: "Paris, Texas" },
  ]) {
    const result = demoRecommendations(params);
    assert.equal(result.destination?.city, "Paris, Texas");
    assert.equal(result.destination?.center, undefined);
    assert.equal(result.destination?.timeZone, undefined);
    assert.deepEqual(result.recommendations, []);
  }
  const plan = buildSelectedTrip(
    {
      destination: "Paris, Texas",
      durationDays: 1,
      pacing: "relaxed",
      startDate: "2026-10-10",
    },
    [selectedCard({ city: "Paris, Texas", coordinates: [-95.5555, 33.6609] })],
  );
  assert.equal(plan.city, "Paris, Texas");
  assert.deepEqual(plan.center, [-95.5555, 33.6609]);
  assert.equal(plan.timeZone, undefined);
  assert.equal(
    demoRecommendations({
      query: "Find coffee in Paris, France",
      city: "New York",
    }).destination?.timeZone,
    "Europe/Paris",
  );
});

test("Invalid legacy custom-city timezone is omitted instead of silently changed to UTC", async () => {
  const plan = await generateLivePlan(
    {
      destination: "Lisbon",
      durationDays: 1,
      pacing: "relaxed",
      startDate: "2026-10-10",
    },
    async () =>
      JSON.stringify({
        city: "Lisbon",
        center: [-9.14, 38.72],
        timezone: "Invalid/Zone",
        summary: "Visit",
        vibe: "Calm",
        days: [
          {
            title: "Day",
            stops: [
              {
                id: "cafe",
                title: "Example cafe",
                time: "11:00 AM",
                durationMinutes: 45,
                category: "cafe",
                categoryLabel: "Coffee",
                coordinates: [-9.14, 38.72],
                address: "Lisbon",
                description: "A suggested cafe",
                ticketRequired: false,
              },
            ],
          },
        ],
      }),
  );
  assert.equal(plan.timeZone, undefined);
  assert.equal(plan.timezone, undefined);
});

test("Conversation can begin without an itinerary; sample cards carry exact selected identities into a plan", async () => {
  await api({ fetcher: offline, env: {} }, async (request) => {
    const greeting = (
      await request("/api/gemini/chat", { message: "Hi", forceDemo: true })
    ).data;
    assert.equal(greeting.source, "demo");
    assert.equal(greeting.recommendations.length, 0);
    assert.match(greeting.reply, /What would/);
    const result = (
      await request("/api/discover", {
        query: "coffee and a bookstore around Greenwich Village",
        city: "New York",
        forceDemo: true,
      })
    ).data;
    assert.equal(result.source, "demo");
    assert.equal(result.recommendations.length, 3);
    assert.ok(
      result.recommendations.every(
        (p: any) =>
          p.source === "editorial-demo" &&
          !p.verified &&
          p.sourceUrl &&
          p.coordinates,
      ),
    );
    const chosen = result.recommendations.slice(0, 2).map((p: any) => p.id);
    const plan = (
      await request("/api/gemini/plan", {
        destination: "NYC",
        durationDays: 1,
        forceDemo: true,
        preferredPlaceIds: chosen,
      })
    ).data;
    assert.deepEqual(
      new Set(plan.data.days[0].stops.map((p: any) => p.id)),
      new Set(chosen),
    );
    assert.equal(
      (
        await request("/api/gemini/plan", {
          destination: "New York",
          preferredPlaceIds: ["fake-vip-door"],
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await request("/api/discover", {
          query: "coffee",
          userLocation: [300, 90],
        })
      ).status,
      400,
    );
  });
});

function groundedFixture() {
  return {
    steps: [
      {
        type: "google_maps_result",
        result: [
          {
            places: [
              {
                name: "Test Coffee",
                place_id: "places/ChIJ_real_123",
                url: "https://maps.google.com/?cid=123",
              },
            ],
            widget_context_token: "widget-source-token",
          },
        ],
      },
      {
        type: "google_search_result",
        result: [
          { search_suggestions: "<div>Google Search entry point</div>" },
        ],
      },
      {
        type: "model_output",
        content: [
          {
            type: "text",
            text: JSON.stringify({
              reply: "A small coffee stop fits your afternoon.",
              recommendations: [
                {
                  title: "Test Coffee",
                  placeId: "ChIJ_real_123",
                  category: "cafe",
                  description: "Coffee stop",
                  reason: "For your coffee preference",
                  durationMinutes: 45,
                  rating: 5,
                  coordinates: [0, 0],
                },
                {
                  title: "Imaginary VIP Lounge",
                  placeId: "fake-lounge",
                  category: "nightlife",
                  description: "Secret access",
                  reason: "Invented",
                  durationMinutes: 60,
                },
              ],
            }),
            annotations: [
              {
                type: "place_citation",
                name: "Test Coffee",
                place_id: "places/ChIJ_real_123",
                url: "https://maps.google.com/?cid=123",
              },
              {
                type: "url_citation",
                title: "Official venue story",
                url: "https://example.org/venue",
              },
            ],
          },
        ],
      },
    ],
  };
}
test("Live recommendations use Maps/Search grounding, drop ungrounded inventions, and resolve actual coordinates and metrics", async () => {
  const calls: any[] = [];
  const provider: typeof fetch = async (input, init) => {
    calls.push({
      url: String(input),
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
      headers: init?.headers,
    });
    if (String(input).endsWith("/interactions"))
      return new Response(JSON.stringify(groundedFixture()));
    if (String(input).includes("/places/ChIJ_real_123"))
      return new Response(
        JSON.stringify({
          id: "ChIJ_real_123",
          displayName: { text: "Test Coffee" },
          location: { longitude: -73.99, latitude: 40.72 },
          formattedAddress: "123 Example Street, New York",
          rating: 4.3,
          userRatingCount: 27,
          googleMapsUri: "https://maps.google.com/?cid=123",
          attributions: [
            {
              provider: "Venue contributor",
              providerUri: "https://example.org/credit",
            },
          ],
        }),
      );
    throw new Error("Unexpected provider call");
  };
  await api(
    {
      fetcher: provider,
      env: {
        GEMINI_API_KEY: "private-gemini-fixture",
        GOOGLE_MAPS_SERVER_KEY: "private-maps-fixture",
      },
    },
    async (request) => {
      const result = (
        await request("/api/gemini/chat", {
          message: "Find a coffee place",
          city: "New York",
          forceDemo: false,
        })
      ).data;
      assert.equal(result.source, "gemini");
      assert.equal(result.recommendations.length, 1);
      const place = result.recommendations[0];
      assert.equal(place.id, "google-ChIJ_real_123");
      assert.deepEqual(place.coordinates, [-73.99, 40.72]);
      assert.equal(place.rating, 4.3);
      assert.equal(place.reviewCount, 27);
      assert.equal(place.source, "google-places");
      assert.equal(place.attributions[0].provider, "Venue contributor");
      assert.equal(
        result.searchSuggestionsHtml,
        "<div>Google Search entry point</div>",
      );
      assert.equal(result.sources[0].provider, "Google Maps");
      const body = calls[0].body;
      assert.equal(body.model, "gemini-3.8-flash");
      assert.equal(body.store, false);
      assert.deepEqual(
        body.tools.map((t: any) => t.type),
        ["google_maps", "google_search"],
      );
      assert.equal(body.response_format.mime_type, "application/json");
      const plan = (
        await request("/api/gemini/plan", {
          destination: "New York",
          durationDays: 1,
          preferredPlaceIds: [place.id],
          forceDemo: false,
        })
      ).data;
      assert.equal(plan.source, "gemini");
      assert.equal(plan.data.days[0].stops[0].googlePlaceId, "ChIJ_real_123");
      assert.deepEqual(plan.data.days[0].stops[0].coordinates, [-73.99, 40.72]);
      assert.equal(
        calls.length,
        2,
        "Selected-place scheduling does not spend another Gemini request",
      );
      assert.equal(
        (
          await request("/api/gemini/plan", {
            destination: "Tokyo",
            preferredPlaceIds: [place.id],
            forceDemo: false,
          })
        ).status,
        409,
      );
      const config = JSON.stringify((await request("/api/config")).data);
      assert.ok(
        !config.includes("private-gemini-fixture") &&
          !config.includes("private-maps-fixture"),
      );
    },
  );
});
test("Maps-grounded citations never adopt model-invented coordinates or ratings without Places", async () => {
  const provider: typeof fetch = async () =>
    new Response(JSON.stringify(groundedFixture()));
  await api(
    { fetcher: provider, env: { GEMINI_API_KEY: "private-fixture" } },
    async (request) => {
      const result = (
        await request("/api/discover", {
          query: "coffee",
          city: "New York",
          forceDemo: false,
        })
      ).data;
      const place = result.recommendations[0];
      assert.equal(place.source, "google-maps-grounding");
      assert.equal(place.coordinates, undefined);
      assert.equal(place.rating, undefined);
      assert.match(result.notice, /Connect Places/);
      assert.equal(
        (
          await request("/api/gemini/plan", {
            destination: "New York",
            preferredPlaceIds: [place.id],
            forceDemo: false,
          })
        ).status,
        409,
      );
    },
  );
});
test("Google street routes use private server keys and never leak geometry onto an OSM map", async () => {
  let calls = 0;
  const provider: typeof fetch = async (input, init) => {
    calls++;
    assert.equal(
      String(input),
      "https://routes.googleapis.com/directions/v2:computeRoutes",
    );
    assert.equal(
      (init?.headers as any)["X-Goog-Api-Key"],
      "private-routes-fixture",
    );
    const body = JSON.parse(String(init?.body));
    assert.equal(body.travelMode, "WALK");
    assert.equal(body.intermediates.length, 1);
    return new Response(
      JSON.stringify({
        routes: [
          {
            distanceMeters: 788,
            duration: "600s",
            polyline: { encodedPolyline: "_p~iF~ps|U_ulLnnqC_mqNvxq`@" },
          },
        ],
      }),
    );
  };
  await api(
    {
      fetcher: provider,
      env: { GOOGLE_MAPS_SERVER_KEY: "private-routes-fixture" },
    },
    async (request) => {
      const coordinates = [
        [-120.2, 38.5],
        [-120.95, 40.7],
        [-126.453, 43.252],
      ];
      const preview = (
        await request("/api/route", { coordinates, mapProvider: "osm" })
      ).data;
      assert.equal(preview.source, "preview");
      assert.equal(calls, 0);
      const result = (
        await request("/api/route", { coordinates, mapProvider: "google" })
      ).data;
      assert.equal(result.source, "google-routes");
      assert.equal(result.durationMinutes, 10);
      assert.deepEqual(result.coordinates, coordinates);
      assert.equal(result.attribution, "Google Maps");
      assert.equal(calls, 1);
      assert.equal(
        (await request("/api/config")).data.providers.googleRoutes.status,
        "connected",
      );
    },
  );
  assert.throws(
    () => decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`"),
    /Truncated/,
  );
});
test("Live voice issues only constrained ephemeral tokens with no private key in the browser", async () => {
  let calls = 0;
  const provider: typeof fetch = async (input, init) => {
    calls++;
    assert.equal(
      String(input),
      "https://generativelanguage.googleapis.com/v1beta/auth_tokens",
    );
    const body = JSON.parse(String(init?.body));
    assert.equal(body.uses, 1);
    assert.equal(body.bidiGenerateContentSetup.model, "models/gemini-3.8-live");
    assert.deepEqual(
      body.bidiGenerateContentSetup.generationConfig.responseModalities,
      ["AUDIO"],
    );
    assert.ok(body.fieldMask.includes("tools"));
    assert.ok(!body.fieldMask.includes("sessionResumption"));
    assert.ok(
      Date.parse(body.newSessionExpireTime) < Date.parse(body.expireTime),
    );
    assert.equal(
      body.bidiGenerateContentSetup.tools[0].functionDeclarations[0].name,
      "discover_places",
    );
    return new Response(
      JSON.stringify({ name: "auth_tokens/short-lived-provider-token" }),
    );
  };
  await api({ fetcher: offline, env: {} }, async (request) =>
    assert.equal(
      (await request("/api/live/session", { city: "New York" })).status,
      503,
    ),
  );
  await api(
    { fetcher: provider, env: { GEMINI_API_KEY: "private-server-secret" } },
    async (request) => {
      const result = (
        await request("/api/live/session", {
          city: "New York",
          contextSummary: "Coffee, relaxed walking",
        })
      ).data;
      assert.equal(result.token, "auth_tokens/short-lived-provider-token");
      assert.equal(result.model, "gemini-3.8-live");
      assert.deepEqual(result.liveConfig.sessionResumption, {});
      assert.ok(!JSON.stringify(result).includes("private-server-secret"));
      assert.equal(
        (await request("/api/config")).data.providers.liveVoice.status,
        "token-issued",
      );
      for (let i = 0; i < 5; i++)
        assert.equal(
          (await request("/api/live/session", { city: "New York" })).status,
          200,
        );
      assert.equal(
        (await request("/api/live/session", { city: "New York" })).status,
        429,
      );
      assert.equal(calls, 6);
    },
  );
});

test("Demo planning honors city/date/days and never needs provider credits", async () => {
  await api(
    {
      fetcher: offline,
      env: { GEMINI_API_KEY: "configured-private-test-key" },
    },
    async (request) => {
      const response = await request("/api/gemini/plan", {
        destination: "Manhattan",
        durationDays: 3,
        startDate: "2026-10-10",
        forceDemo: true,
      });
      assert.equal(response.status, 200);
      assert.equal(response.data.source, "demo");
      assert.equal(response.data.data.city, "New York");
      assert.deepEqual(
        response.data.data.days.map((d: any) => d.date),
        ["2026-10-10", "2026-10-11", "2026-10-12"],
      );
      assert.equal(response.data.data.timezone, "America/New_York");
      const stops = response.data.data.days.flatMap((d: any) => d.stops);
      assert.equal(new Set(stops.map((s: any) => s.id)).size, stops.length);
      assert.equal(
        (
          await request("/api/gemini/plan", {
            destination: "Lisbon",
            forceDemo: true,
          })
        ).status,
        422,
      );
      assert.equal(
        (
          await request("/api/gemini/plan", {
            destination: "Tokyo",
            startDate: "2026-02-30",
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await request("/api/gemini/plan", {
            destination: "New York",
            durationDays: 99,
          })
        ).status,
        400,
      );
    },
  );
});

test("Config does not expose secrets or borrowed tutorial tokens; failed providers are labeled", async () => {
  await api(
    {
      fetcher: offline,
      env: {
        GEMINI_API_KEY: "secret-fixture-value",
        MAPBOX_ACCESS_TOKEN: "sk.private-mapbox-key",
      },
    },
    async (request) => {
      const config = (await request("/api/config")).data;
      assert.equal(config.defaultMapboxToken, "");
      assert.equal(config.hasGeminiKey, true);
      assert.ok(!JSON.stringify(config).includes("secret-fixture-value"));
      const forecast = await request("/api/weather?lat=40.7&lng=-74");
      assert.equal(forecast.data.source, "demo");
      assert.match(forecast.data.notice, /Sample/);
      assert.equal((await request("/api/weather?lat=99&lng=-74")).status, 400);
      assert.equal(
        (
          await request("/api/gemini/chat", {
            message: "Hi",
            currentItinerary: { days: "wrong" },
          })
        ).status,
        400,
      );
      const chat = await request("/api/gemini/chat", {
        message: "book a ticket",
        forceDemo: false,
      });
      assert.equal(chat.data.source, "demo");
      assert.equal(chat.data.fallback, true);
      assert.match(chat.data.reply, /No tickets or payments/);
      const plan = await request("/api/gemini/plan", {
        destination: "New York",
        forceDemo: false,
      });
      assert.equal(plan.data.source, "demo");
      assert.equal(plan.data.fallback, true);
    },
  );
});

test("Booking creates a trusted provider handoff, never a fictional confirmation", async () => {
  await api({ fetcher: offline, env: {} }, async (request) => {
    const booking = (
      await request("/api/gemini/book", {
        stopTitle: "Whitney Museum",
        city: "New York",
        slotTime: "03:30 PM",
        partySize: 4,
      })
    ).data.booking;
    assert.equal(booking.status, "handoff");
    assert.equal(booking.reservationCode, "NOT BOOKED");
    assert.equal(booking.bookingUrl, "https://whitney.org/visit");
    assert.equal(booking.partySize, 4);
    assert.ok(!booking.barcodeData);
    assert.ok(!booking.specialPerk);
    assert.equal(
      (
        await request("/api/gemini/book", {
          stopTitle: "Museum",
          city: "Paris",
          partySize: 0,
        })
      ).status,
      400,
    );
    const unknown = (
      await request("/api/gemini/book", {
        stopTitle: "Unknown & safe",
        city: "Lisbon",
      })
    ).data.booking;
    assert.equal(new URL(unknown.bookingUrl).hostname, "www.google.com");
  });
});

test("Route fallback is honest and validation rejects unsafe coordinates", async () => {
  await api({ fetcher: offline, env: {} }, async (request) => {
    const route = await request("/api/route", {
      coordinates: [
        [-74, 40.7],
        [-73.99, 40.71],
      ],
      mode: "walking",
    });
    assert.equal(route.data.source, "preview");
    assert.ok(route.data.distanceMeters > 0);
    assert.match(route.data.notice, /Straight-line/);
    assert.equal(
      (
        await request("/api/route", {
          coordinates: [
            [999, 40],
            [-74, 41],
          ],
        })
      ).status,
      400,
    );
    assert.equal(
      (await request("/api/route", { coordinates: [[-74, 40.7]] })).status,
      400,
    );
  });
});

test("Mocked live weather and Mapbox responses follow official response contracts", async () => {
  const times = ["2026-10-10T00:00", "2026-10-10T10:00", "2026-10-10T11:00"];
  const provider: typeof fetch = async (input) => {
    const url = String(input);
    if (url.startsWith("https://api.open-meteo.com/"))
      return new Response(
        JSON.stringify({
          timezone: "America/New_York",
          current: {
            time: "2026-10-10T10:00",
            temperature_2m: 19,
            weather_code: 95,
          },
          hourly: {
            time: times,
            temperature_2m: [10, 19, 20],
            weather_code: [3, 95, 3],
            precipitation_probability: [0, 70, 40],
          },
          daily: { temperature_2m_max: [20], temperature_2m_min: [10] },
        }),
      );
    if (url.startsWith("https://api.mapbox.com/"))
      return new Response(
        JSON.stringify({
          routes: [
            {
              geometry: {
                coordinates: [
                  [-74, 40.7],
                  [-73.995, 40.707],
                  [-73.99, 40.71],
                ],
              },
              distance: 1700,
              duration: 1200,
            },
          ],
        }),
      );
    throw new Error("Unexpected provider");
  };
  await api(
    { fetcher: provider, env: { MAPBOX_ACCESS_TOKEN: "pk.fixture-token" } },
    async (request) => {
      const forecast = (await request("/api/weather?lat=40.7&lng=-74")).data;
      assert.equal(forecast.source, "open-meteo");
      assert.equal(forecast.current.condition, "Thunderstorm");
      assert.equal(forecast.hourly[0].time, "10:00");
      assert.equal(
        (await request("/api/weather?lat=40.7&lng=-74")).data.cached,
        true,
      );
      const route = (
        await request("/api/route", {
          coordinates: [
            [-74, 40.7],
            [-73.99, 40.71],
          ],
        })
      ).data;
      assert.equal(route.source, "mapbox");
      assert.equal(route.durationMinutes, 20);
      assert.equal(route.coordinates.length, 3);
    },
  );
});

test("Gemini planning uses only approved catalog IDs and rejects hallucinated venues", async () => {
  const provider: typeof fetch = async (_input, init) => {
    const prompt = JSON.parse(String(init?.body)).contents[0].parts[0].text;
    assert.match(prompt, /only the places/);
    return new Response(
      JSON.stringify({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    summary: "A calm morning",
                    days: [
                      {
                        title: "Coffee & art",
                        stops: [
                          {
                            placeId: "tokyo-fuglen",
                            time: "09:00 AM",
                            durationMinutes: 45,
                          },
                          {
                            placeId: "tokyo-nezu",
                            time: "11:00 AM",
                            durationMinutes: 90,
                          },
                        ],
                      },
                    ],
                  }),
                },
              ],
            },
          },
        ],
      }),
    );
  };
  await api(
    { fetcher: provider, env: { GEMINI_API_KEY: "private-fixture-key" } },
    async (request) => {
      const plan = (
        await request("/api/gemini/plan", {
          destination: "Tokyo",
          forceDemo: false,
        })
      ).data;
      assert.equal(plan.source, "gemini");
      assert.equal(plan.data.days[0].stops[0].title, "Fuglen Tokyo");
      assert.equal(plan.data.days[0].stops[0].localSecretScore, 0);
    },
  );
  const hallucinated: typeof fetch = async () =>
    new Response(
      JSON.stringify({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    days: [
                      {
                        stops: [
                          {
                            placeId: "made-up-vip-door",
                            time: "09:00 AM",
                            durationMinutes: 60,
                          },
                        ],
                      },
                    ],
                  }),
                },
              ],
            },
          },
        ],
      }),
    );
  await api(
    { fetcher: hallucinated, env: { GEMINI_API_KEY: "private-fixture-key" } },
    async (request) => {
      const plan = (
        await request("/api/gemini/plan", {
          destination: "Tokyo",
          forceDemo: false,
        })
      ).data;
      assert.equal(plan.source, "demo");
      assert.equal(plan.fallback, true);
    },
  );
});

test("Running late adjusts actual times while preserving completed and fixed bookings", () => {
  const trip = buildDemoTrip({
    destination: "New York",
    startDate: "2026-10-10",
  });
  const stops = trip.days[0].stops;
  stops[0].status = "completed";
  stops[2].bookingPass = {
    reservationCode: "ACTUAL-PROVIDER-REFERENCE",
    guestName: "Guest",
    venue: stops[2].title,
    timeSlot: stops[2].time,
    partySize: 2,
    status: "confirmed",
  };
  const replanned = replanStops(stops, 30);
  assert.equal(replanned.stops[0].time, stops[0].time);
  assert.equal(replanned.stops[2].time, stops[2].time);
  assert.equal(
    parseMinutes(replanned.stops[1].time),
    parseMinutes(stops[1].time)! + 30,
  );
  assert.notDeepEqual(
    replanned.stops.map((s) => s.time),
    stops.map((s) => s.time),
  );
});

test("Calendar respects trip dates and destination timezone, escapes text, and exports reminders", () => {
  const trip = buildDemoTrip({
    destination: "New York",
    startDate: "2026-10-10",
  });
  const stop = trip.days[0].stops[0];
  stop.title = "Coffee, tea; and a café";
  stop.description = "Line one\r\nBEGIN:VEVENT\nUnicode café";
  const event = createEventPayloadFromStop(
    stop,
    "2026-10-10",
    0,
    "America/New_York",
  );
  assert.equal(event.startTime, "2026-10-10T13:00:00.000Z");
  const winter = createEventPayloadFromStop(
    stop,
    "2026-12-10",
    0,
    "America/New_York",
  );
  assert.equal(winter.startTime, "2026-12-10T14:00:00.000Z");
  const url = new URL(getGoogleCalendarWebUrl(event));
  assert.equal(url.searchParams.get("ctz"), "America/New_York");
  assert.match(url.searchParams.get("dates")!, /20261010T130000Z/);
  const ics = generateIcsCalendar(trip);
  assert.match(ics, /Coffee\\, tea\\; and a café/);
  assert.ok(ics.includes("Line one\\nBEGIN:VEVENT\\nUnicode café"));
  assert.ok(!ics.includes("STATUS:CONFIRMED"));
  assert.equal(
    ics.match(/^BEGIN:VEVENT$/gm)?.length,
    trip.days[0].stops.length,
  );
  ics
    .split("\r\n")
    .forEach((line) =>
      assert.ok(
        new TextEncoder().encode(line).length <= 75,
        "ICS lines must be at most 75 octets",
      ),
    );
  assert.ok(!generateShareableSummary(trip).includes("VIP Pass"));
});

test("Demo schedules preserve curated day grouping and times; discovery retains filtering and ticket metadata", () => {
  const ny = buildDemoTrip({
    destination: "New York",
    durationDays: 3,
    startDate: "2026-10-10",
  });
  ny.days.forEach((day, index) =>
    assert.deepEqual(
      day.stops.map((stop) => [stop.title, stop.time]),
      INITIAL_TRIP.days[index].stops.map((stop) => [stop.title, stop.time]),
    ),
  );
  for (const destination of ["New York", "Tokyo", "Paris"]) {
    const trip = buildDemoTrip({ destination, durationDays: 3 });
    trip.days.forEach((day) => {
      let previousEnd = 0;
      day.stops.forEach((stop) => {
        const start = parseMinutes(stop.time)!;
        assert.ok(
          start >= previousEnd,
          `${stop.title} overlaps a preceding stop`,
        );
        previousEnd = start + stop.durationMinutes;
        if (/museum|musée|bnf/i.test(stop.title))
          assert.ok(start >= 600, `${stop.title} should not default to 9am`);
      });
    });
    const short = buildDemoTrip({
      destination,
      durationDays: 1,
      pacing: "relaxed",
    });
    const categories = [
      "cafe",
      "culture",
      "dining",
      "niche",
      "nightlife",
      "nature",
      "transit",
    ];
    short.trendyHotspots.forEach((hotspot) => {
      assert.ok(categories.includes(hotspot.category));
      const metadata = hotspot as any;
      assert.ok(metadata.address);
      assert.ok(metadata.durationMinutes > 0);
      assert.equal(typeof metadata.ticketRequired, "boolean");
      assert.ok(metadata.sourceUrl);
      if (metadata.ticketRequired)
        assert.ok(
          metadata.bookingUrl,
          "Ticketed discovery must retain its booking handoff",
        );
    });
    assert.ok(
      short.trendyHotspots.some((hotspot) => (hotspot as any).ticketRequired),
      "Relaxed plan should expose a ticketed museum as an addable discovery",
    );
  }
});

test("Calendar honors canonical timeZone even when city and coordinates imply another timezone", () => {
  const trip = buildDemoTrip({
    destination: "New York",
    startDate: "2026-10-10",
  });
  trip.timeZone = "Europe/Rome";
  assert.equal(itineraryTimezone(trip), "Europe/Rome");
  const ics = generateIcsCalendar(trip);
  assert.match(ics, /X-WR-TIMEZONE:Europe\/Rome/);
  assert.match(ics, /DTSTART:20261010T070000Z/);
});

test("Voice requires a real provider key and never presents a demo/browser substitute as connected", async () => {
  await api({ fetcher: offline, env: {} }, async (request) => {
    const config = (await request("/api/config")).data;
    assert.equal(config.hasVoiceKey, false);
    assert.equal(config.providers.voice.status, "needs-key");
    assert.equal(config.providers.voice.model, "gemini-3.8-flash-tts");
    const speech = await request("/api/voice/speak", {
      text: "Welcome to New York.",
    });
    assert.equal(speech.status, 503);
    assert.equal(speech.data.success, false);
    assert.ok(!speech.data.audioBase64);
    const transcript = await request("/api/voice/transcribe", {
      audioBase64: Buffer.from("audio fixture").toString("base64"),
      mimeType: "audio/webm",
      durationSeconds: 4,
    });
    assert.equal(transcript.status, 503);
    assert.equal(transcript.data.success, false);
    assert.ok(!transcript.data.transcript);
  });
  await api(
    {
      fetcher: offline,
      env: {
        GEMINI_API_KEY: "private-fixture-key",
        GEMINI_VOICE_ENABLED: "false",
      },
    },
    async (request) => {
      const config = (await request("/api/config")).data;
      assert.equal(config.providers.voice.configured, false);
      assert.equal(config.providers.voice.status, "disabled");
    },
  );
});

test("Voice transcription sends recorded audio to Gemini3.8 Interactions and normalizes browser MIME", async () => {
  let calls = 0;
  const provider: typeof fetch = async (input, init) => {
    calls++;
    assert.equal(
      String(input),
      "https://generativelanguage.googleapis.com/v1beta/interactions",
    );
    const body = JSON.parse(String(init?.body));
    assert.equal(body.model, "gemini-3.8-flash");
    assert.equal(body.store, false);
    assert.equal(body.stream, false);
    assert.equal(body.input[1].type, "audio");
    assert.equal(body.input[1].mime_type, "audio/m4a");
    assert.equal(
      body.input[1].data,
      Buffer.from("recorded sound").toString("base64"),
    );
    assert.match(body.input[0].text, /Transcribe only/);
    return new Response(
      JSON.stringify({
        status: "completed",
        steps: [
          {
            type: "model_output",
            content: [{ type: "text", text: "Find a coffee shop near SoHo." }],
          },
        ],
      }),
    );
  };
  await api(
    {
      fetcher: provider,
      env: { GEMINI_API_KEY: "private-fixture-key", AI_MODE: "demo" },
    },
    async (request) => {
      const result = await request("/api/voice/transcribe", {
        audioBase64: Buffer.from("recorded sound").toString("base64"),
        mimeType: "audio/mp4;codecs=mp4a.40.2",
        durationSeconds: 8,
      });
      assert.equal(result.status, 200);
      assert.equal(result.data.transcript, "Find a coffee shop near SoHo.");
      assert.equal(result.data.source, "gemini");
      assert.equal(calls, 1);
      assert.equal(
        (await request("/api/config")).data.providers.voice.status,
        "connected",
      );
      assert.equal(
        (
          await request("/api/voice/transcribe", {
            audioBase64: "!not-base64!",
            mimeType: "audio/webm",
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await request("/api/voice/transcribe", {
            audioBase64: "YWJjZA==",
            mimeType: "text/plain",
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await request("/api/voice/transcribe", {
            audioBase64: "YWJjZA==",
            mimeType: "audio/webm",
            durationSeconds: 99,
          })
        ).status,
        400,
      );
      assert.equal(calls, 1, "Invalid audio must never spend provider credits");
    },
  );
});

test("Gemini3.8 TTS uses the official speech schema and returns playable WAV for PCM output", async () => {
  const pcm = Buffer.from([0, 0, 1, 0, 255, 255, 0, 0]);
  const provider: typeof fetch = async (input, init) => {
    assert.equal(
      String(input),
      "https://generativelanguage.googleapis.com/v1beta/interactions",
    );
    const body = JSON.parse(String(init?.body));
    assert.equal(body.model, "gemini-3.8-flash-tts");
    assert.equal(body.input[0].type, "user_input");
    assert.equal(body.input[0].content[0].type, "text");
    assert.equal(
      body.input[0].content[0].text,
      "Your next stop is the Whitney.",
    );
    assert.equal(
      body.input[0].content[0].annotations[0].type,
      "speech_metadata",
    );
    assert.deepEqual(body.generation_config.speech_config, [{ voice: "Kore" }]);
    assert.equal(body.response_format.type, "audio");
    assert.equal(body.response_format.mime_type, "audio/wav");
    return new Response(
      JSON.stringify({
        status: "completed",
        steps: [
          {
            type: "model_output",
            content: [
              {
                type: "audio",
                mime_type: "audio/l16;rate=24000",
                data: pcm.toString("base64"),
              },
            ],
          },
        ],
      }),
    );
  };
  await api(
    {
      fetcher: provider,
      env: { GEMINI_API_KEY: "private-fixture-key", AI_MODE: "demo" },
    },
    async (request) => {
      const result = await request("/api/voice/speak", {
        text: "Your next stop is the Whitney.",
      });
      assert.equal(result.status, 200);
      assert.equal(result.data.model, "gemini-3.8-flash-tts");
      assert.equal(result.data.mimeType, "audio/wav");
      const bytes = Buffer.from(result.data.audioBase64, "base64");
      assert.equal(bytes.subarray(0, 4).toString(), "RIFF");
      assert.equal(bytes.subarray(8, 12).toString(), "WAVE");
      assert.equal(bytes.readUInt32LE(24), 24000);
      assert.equal(bytes.readUInt32LE(40), pcm.length);
      assert.deepEqual(bytes.subarray(44), pcm);
      assert.equal(
        (await request("/api/voice/speak", { text: "", voiceName: "Kore" }))
          .status,
        400,
      );
      assert.equal(
        (
          await request("/api/voice/speak", {
            text: "Hello",
            voiceName: "invented-voice",
          })
        ).status,
        400,
      );
    },
  );
});

test("Voice quota errors remain explicit and do not expose private provider data", async () => {
  const provider: typeof fetch = async () =>
    new Response(
      JSON.stringify({
        error: { message: "private-fixture-key secret internal response" },
      }),
      { status: 429 },
    );
  await api(
    { fetcher: provider, env: { GEMINI_API_KEY: "private-fixture-key" } },
    async (request) => {
      const speech = await request("/api/voice/speak", { text: "Hello." });
      assert.equal(speech.status, 429);
      assert.equal(speech.data.success, false);
      assert.match(speech.data.error, /quota or rate limit/);
      assert.ok(!JSON.stringify(speech.data).includes("private-fixture-key"));
      assert.ok(!speech.data.audioBase64);
      assert.equal(
        (await request("/api/config")).data.providers.voice.status,
        "unavailable",
      );
    },
  );
});

test("Only intentionally public Google Maps browser keys appear in client configuration", async () => {
  await api(
    {
      fetcher: offline,
      env: {
        GOOGLE_PLACES_API_KEY: "secret-places-value",
        GOOGLE_MAPS_API_KEY: "secret-legacy-value",
        GOOGLE_MAPS_BROWSER_KEY: "public-browser-fixture-value",
      },
    },
    async (request) => {
      const config = (await request("/api/config")).data;
      assert.equal(config.googleMapsBrowserKey, "public-browser-fixture-value");
      assert.equal(config.hasGooglePlacesKey, true);
      assert.equal(config.providers.googleMaps.configured, true);
      assert.ok(!JSON.stringify(config).includes("secret-places-value"));
      assert.ok(!JSON.stringify(config).includes("secret-legacy-value"));
    },
  );
});

test("Google Places uses official Text Search fields and preserves real provider data and attributions", async () => {
  let calls = 0;
  const provider: typeof fetch = async (input, init) => {
    calls++;
    assert.equal(
      String(input),
      "https://places.googleapis.com/v1/places:searchText",
    );
    const headers = new Headers(init?.headers);
    assert.equal(
      headers.get("X-Goog-Api-Key"),
      "private-google-places-fixture",
    );
    assert.ok(headers.get("X-Goog-FieldMask")!.includes("places.rating"));
    assert.ok(headers.get("X-Goog-FieldMask")!.includes("places.attributions"));
    assert.ok(!headers.get("X-Goog-FieldMask")!.includes("popularTimes"));
    assert.deepEqual(JSON.parse(String(init?.body)), {
      textQuery: "Whitney Museum, New York",
      pageSize: 1,
      languageCode: "en",
    });
    return new Response(
      JSON.stringify({
        places: [
          {
            id: "real-provider-id",
            displayName: { text: "Whitney Museum of American Art" },
            formattedAddress: "99 Gansevoort St, New York, NY",
            location: { latitude: 40.7396, longitude: -74.0089 },
            rating: 4.6,
            userRatingCount: 12450,
            currentOpeningHours: {
              openNow: true,
              weekdayDescriptions: ["Saturday: 10:30 AM – 6:00 PM"],
            },
            googleMapsUri: "https://maps.google.com/?cid=123",
            websiteUri: "https://whitney.org/",
            attributions: [
              {
                provider: "Venue data provider",
                providerUri: "https://example.org/",
              },
            ],
          },
        ],
      }),
    );
  };
  await api(
    {
      fetcher: provider,
      env: { GOOGLE_PLACES_API_KEY: "private-google-places-fixture" },
    },
    async (request) => {
      const details = await request("/api/places/details", {
        name: "Whitney Museum",
        city: "New York",
      });
      assert.equal(details.status, 200);
      const place = details.data.place;
      assert.equal(place.name, "Whitney Museum of American Art");
      assert.equal(place.rating, 4.6);
      assert.equal(place.reviewCount, 12450);
      assert.equal(place.source, "google-places");
      assert.equal(place.attribution, "Google Maps");
      assert.equal(place.openingHours.openNow, true);
      assert.deepEqual(place.coordinates, [-74.0089, 40.7396]);
      assert.deepEqual(place.attributions, [
        {
          provider: "Venue data provider",
          providerUri: "https://example.org/",
        },
      ]);
      assert.ok(place.fetchedAt);
      assert.ok(
        !JSON.stringify(details.data).includes("private-google-places-fixture"),
      );
      await request("/api/places/details", {
        name: "Whitney Museum",
        city: "New York",
      });
      assert.equal(
        calls,
        2,
        "Live Places responses must not be retained in a persistent or server cache",
      );
      assert.equal(
        (await request("/api/config")).data.providers.googlePlaces.status,
        "connected",
      );
    },
  );
});

test("Missing Google Places key or missing Google rating never manufactures venue facts", async () => {
  await api({ fetcher: offline, env: {} }, async (request) => {
    const details = await request("/api/places/details", {
      name: "Whitney Museum",
      city: "New York",
    });
    assert.equal(details.status, 503);
    assert.equal(details.data.success, false);
    assert.ok(!details.data.place);
  });
  const sparse: typeof fetch = async () =>
    new Response(
      JSON.stringify({
        places: [
          {
            displayName: { text: "Provider venue name" },
            googleMapsUri: "https://maps.google.com/?cid=123",
          },
        ],
      }),
    );
  await api(
    {
      fetcher: sparse,
      env: { GOOGLE_PLACES_API_KEY: "private-google-places-fixture" },
    },
    async (request) => {
      const place = (
        await request("/api/places/details", {
          name: "Venue",
          city: "New York",
        })
      ).data.place;
      assert.equal(place.rating, undefined);
      assert.equal(place.reviewCount, undefined);
      assert.equal(place.openingHours, undefined);
      assert.equal(place.address, undefined);
      assert.deepEqual(place.attributions, []);
    },
  );
});
