import { fetchAreaHeatmap, NYC_HEAT_WINDOWS } from "./backend/heatmap";
import express from "express";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildDemoTrip, CATALOGS, cityKeyFor } from "./backend/demoData";
import {
  bookingHandoff,
  generateLivePlan,
  hasRealKey,
  previewRoute,
  replanStops,
  textInput,
  validCoordinates,
  validateStop,
} from "./backend/integrations";
import { normalizeWeather, SAMPLE_WEATHER } from "./backend/weather";
import { installVoiceRoutes } from "./backend/voice";
import { installLiveRoutes } from "./backend/live";
import { buildAreaDiscovery } from "./backend/discovery";
import { installPlacesRoutes, googleServerKey } from "./backend/places";
import { googleRoute } from "./backend/routes";
import {
  demoRecommendations,
  groundedRecommendations,
  createRecommendationStore,
  buildSelectedTrip,
} from "./backend/recommendations";

dotenv.config({ path: [".env.local", ".env"], quiet: true });
const __dirname = path.dirname(fileURLToPath(import.meta.url));

type Options = {
  fetcher?: typeof fetch;
  env?: Record<string, string | undefined>;
};
export function createApiApp({
  fetcher = fetch,
  env = process.env,
}: Options = {}) {
  const app = express();
  app.get("/api/heatmap", async (req, res) => {
    try {
      const city =
        typeof req.query.city === "string"
          ? req.query.city.slice(0, 180)
          : "New York";
      res.json(await fetchAreaHeatmap(city, { fetcher }));
    } catch {
      res.status(503).json({
        success: false,
        error: "Area data is temporarily unavailable. Try again.",
      });
    }
  });
  app.disable("x-powered-by");
  app.use("/api/voice", express.json({ limit: "6mb" }));
  app.use(express.json({ limit: "256kb" }));
  const model = textInput(env.GEMINI_MODEL, 80) || "gemini-3.8-flash";
  const hasGeminiKey = hasRealKey(env.GEMINI_API_KEY);
  const getVoiceStatus = installVoiceRoutes(app, fetcher, env);
  const getLiveStatus = installLiveRoutes(app, fetcher, env);
  const getPlacesStatus = installPlacesRoutes(app, fetcher, env);
  // This separate env field explicitly designates a browser-visible key.
  // Server Places/legacy Maps keys are never returned to the client.
  const googleMapsBrowserKey = hasRealKey(env.GOOGLE_MAPS_BROWSER_KEY)
    ? env.GOOGLE_MAPS_BROWSER_KEY!.trim()
    : "";
  const hasGooglePlacesKey = Boolean(googleServerKey(env));
  const googleRoutesKey = googleServerKey(env, "routes");
  const recommendationStore = createRecommendationStore();
  let googleRouteStatus = googleRoutesKey ? "configured" : "needs-key";
  const serverToken =
    hasRealKey(env.MAPBOX_ACCESS_TOKEN) &&
    env.MAPBOX_ACCESS_TOKEN?.startsWith("pk.")
      ? env.MAPBOX_ACCESS_TOKEN
      : "";
  const aiDefault = env.AI_MODE === "live" ? "live" : "demo";
  const useLive = (body: any) =>
    hasGeminiKey &&
    (body.forceDemo === false ||
      (aiDefault === "live" && body.forceDemo !== true));
  const weatherCache = new Map<string, { data: any; fetchedAt: number }>();
  const searchCounts = new Map<string, Record<string, number>>();
  let aiStatus = hasGeminiKey ? "configured" : "demo";
  let weatherStatus = "available";
  let routeStatus = serverToken ? "configured" : "preview";

  const generate = async (prompt: string, json = false): Promise<string> => {
    const response = await fetcher(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": env.GEMINI_API_KEY!,
        },
        signal: AbortSignal.timeout(24000),
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: json ? 6000 : 1600,
            ...(json ? { responseMimeType: "application/json" } : {}),
          },
        }),
      },
    );
    if (!response.ok) {
      aiStatus = "unavailable";
      throw new Error(
        response.status === 429
          ? "AI rate limit reached."
          : "AI provider is unavailable.",
      );
    }
    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts
      ?.map((part: any) => part.text || "")
      .join("")
      .trim();
    if (!text) {
      aiStatus = "unavailable";
      throw new Error("AI returned no text.");
    }
    aiStatus = "connected";
    return text;
  };

  app.get("/api/health", (_req, res) =>
    res.json({ success: true, app: "Turnside", status: "ok" }),
  );
  const config = () => ({
    defaultMapboxToken: serverToken,
    hasGeminiKey,
    hasVoiceKey: getVoiceStatus().configured,
    googleMapsBrowserKey,
    hasGooglePlacesKey,
    appName: "Turnside",
    defaultAiMode: aiDefault,
    geminiModel: model,
    demoCities: ["New York", "Tokyo", "Paris"],
    providers: {
      voice: getVoiceStatus(),
      liveVoice: getLiveStatus(),
      googleMaps: {
        configured: Boolean(googleMapsBrowserKey),
        status: googleMapsBrowserKey ? "configured" : "needs-key",
        description:
          "Google Maps JavaScript API uses the explicitly public browser key. Restrict this key to your app origin and enabled browser APIs.",
      },
      googlePlaces: getPlacesStatus(),
      googleRoutes: {
        configured: Boolean(googleRoutesKey),
        status: googleRouteStatus,
        provider: "Google Maps Routes API",
        description:
          "Private server key for street-following routes displayed on a Google map.",
      },
      gemini: {
        configured: hasGeminiKey,
        status: aiStatus,
        model,
        mode: aiDefault,
        description:
          "Credit-free demo by default; Live AI calls your configured Gemini account.",
      },
      mapbox: {
        configured: Boolean(serverToken),
        status: routeStatus,
        description:
          "Optional public Mapbox token for vector maps and street-following walking routes.",
      },
      weather: {
        configured: true,
        status: weatherStatus,
        provider: "Open-Meteo",
        description: "Live forecast with a clearly labeled sample fallback.",
      },
      bookings: {
        configured: true,
        status: "handoff",
        description:
          "Official venue handoff only. No payment or reservation is made in this prototype.",
      },
      calendar: {
        configured: true,
        status: "ready",
        description:
          ".ics export and Google Calendar event links. No account access required.",
      },
      discovery: {
        configured: true,
        status: hasGeminiKey ? "configured" : "editorial-demo",
        description:
          "Live Gemini Google Maps + Search grounding when selected; otherwise labeled editorial samples. No live social-media popularity or footfall feed.",
      },
    },
  });
  app.get("/api/config", (_req, res) => res.json(config()));
  app.get("/api/integrations", (_req, res) =>
    res.json({ success: true, ...config() }),
  );

  app.post("/api/gemini/plan", async (req, res) => {
    const body = req.body || {};
    const prompt = textInput(body.prompt, 1800);
    const destination =
      textInput(body.destination, 180) ||
      (cityKeyFor(prompt)
        ? CATALOGS[cityKeyFor(prompt)!].city
        : prompt
          ? ""
          : "New York");
    if (!destination)
      return res.status(400).json({
        success: false,
        error: "Choose a destination such as New York, Tokyo, or Paris.",
      });
    const durationDays =
      body.durationDays === undefined ? 1 : Number(body.durationDays);
    if (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 3)
      return res
        .status(400)
        .json({ success: false, error: "Choose 1, 2, or 3 days." });
    if (body.startDate !== undefined && !isValidDate(body.startDate))
      return res.status(400).json({
        success: false,
        error: "Start date must be a valid YYYY-MM-DD date.",
      });
    const pacing = ["relaxed", "balanced", "fast"].includes(body.pacing)
      ? body.pacing
      : /relax|slow|easy/i.test(prompt)
        ? "relaxed"
        : "balanced";
    const params = {
      destination,
      prompt,
      durationDays,
      pacing,
      vibe:
        textInput(body.vibe, 300) ||
        prompt ||
        "Coffee, culture & small discoveries",
      travelerNote: textInput(body.travelerNote, 1200),
      startDate: body.startDate,
    };
    if (
      body.preferredPlaceIds !== undefined &&
      (!Array.isArray(body.preferredPlaceIds) ||
        !body.preferredPlaceIds.length ||
        body.preferredPlaceIds.length > 18 ||
        !body.preferredPlaceIds.every(
          (id: unknown) => typeof id === "string" && id.length <= 210,
        ) ||
        new Set(body.preferredPlaceIds).size !== body.preferredPlaceIds.length)
    )
      return res
        .status(400)
        .json({
          success: false,
          error: "Select valid, distinct recommended places.",
        });
    if (body.preferredPlaceIds?.length) {
      try {
        const selected = recommendationStore.resolve(
          body.preferredPlaceIds,
          destination,
        );
        const data = buildSelectedTrip(params, selected);
        res.setHeader("Cache-Control", "no-store");
        return res.json({
          success: true,
          data,
          source: data.source,
          notice: data.notice,
        });
      } catch (error: any) {
        return res.status(409).json({ success: false, error: error.message });
      }
    }
    try {
      if (useLive(body)) {
        const data = await generateLivePlan(params, generate);
        return res.json({
          success: true,
          data,
          source: "gemini",
          notice: data.notice,
        });
      }
      const data = buildDemoTrip(params);
      return res.json({
        success: true,
        data,
        source: "demo",
        notice: data.notice,
      });
    } catch {
      if (!cityKeyFor(destination))
        return res.status(useLive(body) ? 503 : 422).json({
          success: false,
          error: useLive(body)
            ? "Live planning is unavailable for this destination. Try a demo city or reconnect Gemini."
            : "The credit-free demo supports New York, Tokyo, and Paris. Choose Live AI to plan other cities with a connected Gemini key.",
        });
      const data = buildDemoTrip(params);
      const notice =
        "Live AI is unavailable. Loaded the credit-free editorial demo itinerary instead.";
      return res.json({
        success: true,
        data: { ...data, notice },
        source: "demo",
        fallback: true,
        notice,
      });
    }
  });

  app.post("/api/gemini/chat", async (req, res) => {
    const body = req.body || {};
    const message = textInput(body.message, 3000);
    if (!message)
      return res
        .status(400)
        .json({ success: false, error: "Enter a message." });
    if (
      body.currentItinerary &&
      (!Array.isArray(body.currentItinerary.days) ||
        !body.currentItinerary.days.every(
          (d: any) =>
            d && Array.isArray(d.stops) && d.stops.every(validateStop),
        ))
    )
      return res
        .status(400)
        .json({ success: false, error: "Provide a valid itinerary context." });
    if (body.activeStop && !validateStop(body.activeStop))
      return res
        .status(400)
        .json({ success: false, error: "Provide a valid selected stop." });
    return replyRecommendations(
      {
        ...body,
        query: message,
        city: textInput(body.city, 180) || body.currentItinerary?.city,
      },
      res,
    );
  });

  async function replyRecommendations(body: any, res: any) {
    res.setHeader("Cache-Control", "no-store");
    const query = textInput(body.query, 3000);
    if (!query)
      return res
        .status(400)
        .json({
          success: false,
          error: "Tell us what you would like to discover.",
        });
    if (body.userLocation !== undefined && !validCoordinates(body.userLocation))
      return res
        .status(400)
        .json({ success: false, error: "Provide valid location coordinates." });
    if (
      body.conversationHistory !== undefined &&
      (!Array.isArray(body.conversationHistory) ||
        body.conversationHistory.length > 50)
    )
      return res
        .status(400)
        .json({
          success: false,
          error: "Provide a valid conversation history.",
        });
    const params = {
      query,
      city: textInput(body.city, 180) || undefined,
      areaId: textInput(body.areaId, 100),
      category: textInput(body.category, 80),
      userLocation: body.userLocation,
      conversationHistory: Array.isArray(body.conversationHistory)
        ? body.conversationHistory
            .slice(-8)
            .filter((m: any) => m && typeof m.text === "string")
            .map((m: any) => ({
              sender: m.sender,
              text: textInput(m.text, 1000),
            }))
        : [],
    };
    const demo = demoRecommendations(params);
    if (!useLive(body)) {
      recommendationStore.remember(demo.recommendations);
      return res.json(demo);
    }
    try {
      const result = await groundedRecommendations(params, fetcher, env, model);
      aiStatus = "connected";
      recommendationStore.remember(result.recommendations);
      return res.json(result);
    } catch {
      aiStatus = "unavailable";
      recommendationStore.remember(demo.recommendations);
      return res.json({
        ...demo,
        fallback: true,
        notice:
          "Live Gemini discovery is unavailable. These are clearly labeled editorial samples; no live search was performed.",
      });
    }
  }
  app.post("/api/discover", async (req, res) =>
    replyRecommendations(req.body || {}, res),
  );
  app.get("/api/discover/area", async (req, res) => {
    try {
      const areaId = textInput(req.query.areaId, 100) || "soho";
      const category = textInput(req.query.category, 80) || "all";
      if (
        !NYC_HEAT_WINDOWS.some((a) => a.id === areaId) ||
        !["all", "food", "culture", "outdoors"].includes(category)
      )
        return res
          .status(400)
          .json({
            success: false,
            error: "Choose a supported New York area and category.",
          });
      const heatmap = await fetchAreaHeatmap("New York", { fetcher });
      return res.json(buildAreaDiscovery(areaId, category as any, heatmap));
    } catch {
      return res
        .status(400)
        .json({
          success: false,
          error: "Choose a supported New York area and category.",
        });
    }
  });

  app.post("/api/gemini/book", (req, res) => {
    const body = req.body || {};
    const title = textInput(body.stopTitle, 200);
    const city = textInput(body.city, 180);
    const slot = textInput(body.slotTime, 80);
    const partySize = body.partySize === undefined ? 2 : Number(body.partySize);
    if (
      !title ||
      !city ||
      !Number.isInteger(partySize) ||
      partySize < 1 ||
      partySize > 20
    )
      return res.status(400).json({
        success: false,
        error: "Choose a venue, city, and party size from 1 to 20.",
      });
    return res.json({
      success: true,
      source: "handoff",
      booking: bookingHandoff(
        title,
        city,
        slot || "Choose with provider",
        partySize,
      ),
    });
  });

  app.post("/api/gemini/replan", (req, res) => {
    const stops = req.body?.currentStops;
    const delay = Number(req.body?.delayMinutes ?? 30);
    if (
      !Array.isArray(stops) ||
      stops.length > 30 ||
      !stops.every(validateStop) ||
      !Number.isInteger(delay) ||
      delay < 0 ||
      delay > 180
    )
      return res.status(400).json({
        success: false,
        error: "Provide valid stops and a delay from 0 to 180 minutes.",
      });
    try {
      return res.json({
        success: true,
        source: "schedule-engine",
        data: replanStops(stops, delay),
      });
    } catch {
      return res.status(400).json({
        success: false,
        error: "A stop has an invalid scheduled time.",
      });
    }
  });

  app.get("/api/weather", async (req, res) => {
    const lat = Number(req.query.lat ?? 40.7338);
    const lng = Number(req.query.lng ?? -73.9941);
    if (
      !validCoordinates([lng, lat]) ||
      typeof req.query.lat === "object" ||
      typeof req.query.lng === "object"
    )
      return res.status(400).json({
        success: false,
        error: "Provide valid latitude and longitude.",
      });
    const cacheKey = `${lat.toFixed(3)},${lng.toFixed(3)}`;
    const cached = weatherCache.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt < 10 * 60 * 1000)
      return res.json({ ...cached.data, cached: true });
    try {
      const url = new URL("https://api.open-meteo.com/v1/forecast");
      url.search = new URLSearchParams({
        latitude: String(lat),
        longitude: String(lng),
        current:
          "temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m",
        hourly: "temperature_2m,precipitation_probability,weather_code",
        daily: "temperature_2m_max,temperature_2m_min",
        timezone: "auto",
        forecast_days: "3",
      }).toString();
      const response = await fetcher(url, {
        signal: AbortSignal.timeout(6500),
      });
      if (!response.ok) throw new Error("Weather provider unavailable.");
      const data = normalizeWeather(await response.json());
      weatherStatus = "connected";
      weatherCache.set(cacheKey, { data, fetchedAt: Date.now() });
      return res.json(data);
    } catch {
      weatherStatus = "sample-fallback";
      return res.json({ ...SAMPLE_WEATHER });
    }
  });

  app.post("/api/route", async (req, res) => {
    const points = req.body?.coordinates;
    if (
      !Array.isArray(points) ||
      points.length < 2 ||
      points.length > 25 ||
      !points.every(validCoordinates)
    )
      return res.status(400).json({
        success: false,
        error: "A route needs 2 to 25 valid [longitude, latitude] coordinates.",
      });
    const mode = req.body?.mode || "walking";
    if (!["walking", "cycling", "driving"].includes(mode))
      return res.status(400).json({
        success: false,
        error: "Choose walking, cycling, or driving.",
      });
    const suppliedToken = textInput(req.body?.mapboxToken, 1000);
    const token = suppliedToken.startsWith("pk.") ? suppliedToken : serverToken;
    // Google geometry is licensed for Google maps; OSM/Mapbox clients explicitly decline it.
    if (googleRoutesKey && req.body?.mapProvider === "google") {
      try {
        const route = await googleRoute(points, mode, googleRoutesKey, fetcher);
        googleRouteStatus = "connected";
        res.setHeader("Cache-Control", "no-store");
        return res.json({ success: true, ...route });
      } catch {
        googleRouteStatus = "unavailable";
      }
    }
    if (!token) return res.json({ success: true, ...previewRoute(points) });
    try {
      const url = new URL(
        `https://api.mapbox.com/directions/v5/mapbox/${mode}/${points.map((p: number[]) => p.join(",")).join(";")}`,
      );
      url.search = new URLSearchParams({
        geometries: "geojson",
        overview: "full",
        access_token: token,
      }).toString();
      const response = await fetcher(url, {
        signal: AbortSignal.timeout(6500),
      });
      if (!response.ok) throw new Error("Directions unavailable.");
      const data = await response.json();
      const route = data.routes?.[0];
      if (
        !route ||
        !Array.isArray(route.geometry?.coordinates) ||
        !route.geometry.coordinates.every(validCoordinates) ||
        !Number.isFinite(route.distance) ||
        !Number.isFinite(route.duration)
      )
        throw new Error("Invalid directions.");
      routeStatus = "connected";
      return res.json({
        success: true,
        coordinates: route.geometry.coordinates,
        distanceMeters: Math.round(route.distance),
        durationMinutes: Math.round(route.duration / 60),
        source: "mapbox",
        notice: `Route from Mapbox Directions (${mode}).`,
      });
    } catch {
      routeStatus = "preview";
      return res.json({ success: true, ...previewRoute(points) });
    }
  });

  function telemetry(city: string) {
    const key = cityKeyFor(city);
    if (!key) return undefined;
    const counts = searchCounts.get(key) || {};
    const catalog = CATALOGS[key];
    const nodes = catalog.places.map((place, index) => ({
      id: `editorial-${place.id}`,
      name: place.title,
      coordinates: place.coordinates,
      category: place.categoryLabel,
      heatScore: 65 + (index % 4) * 6,
      baseHeat: 65 + (index % 4) * 6,
      searchVelocityScore: counts[place.id] || 0,
      footTrafficIndex: 0,
      reservationVelocity: 0,
      microclimateScore: 0,
      trendDirection: "stable",
      trendPercent: 0,
      primaryDriver: "Editorial sample selection; no live trend measurement",
      radiusMeters: 300,
      lastRefreshed: new Date().toISOString(),
      sources: [
        {
          name: "Editorial demo catalog",
          category: "editorial",
          reliabilityScore: 0,
          sampleLatency: "Static sample",
          metricLabel: "Session searches",
          metricValue: String(counts[place.id] || 0),
          verified: false,
          provider: "Turnside demo; venue information linked separately",
        },
      ],
    }));
    return {
      success: true,
      source: "editorial-demo",
      city: catalog.city,
      nodes,
      events: [],
      verifiedSourcesCount: 0,
      notice:
        "Illustrative discovery map, not live crowd, popularity, booking, or Google Trends data.",
    };
  }
  app.get("/api/telemetry/heatmap", (req, res) => {
    const data = telemetry(textInput(req.query.city, 180) || "New York");
    return data
      ? res.json(data)
      : res.status(422).json({
          success: false,
          nodes: [],
          events: [],
          error: "Discovery demo supports New York, Tokyo, and Paris.",
        });
  });
  app.post("/api/telemetry/record-search", (req, res) => {
    const city = textInput(req.body?.city, 180) || "New York";
    const key = cityKeyFor(city);
    const query = textInput(req.body?.query, 300);
    const title = textInput(req.body?.stopTitle, 200);
    if (!key)
      return res.json({ success: true, source: "session", allNodes: [] });
    const candidate = CATALOGS[key].places.find(
      (p) =>
        (title && p.title === title) ||
        (query && query.toLowerCase().includes(p.title.toLowerCase())),
    );
    if (candidate) {
      const counts = searchCounts.get(key) || {};
      counts[candidate.id] = (counts[candidate.id] || 0) + 1;
      searchCounts.set(key, counts);
    }
    const data = telemetry(city)!;
    return res.json({
      success: true,
      source: "session",
      allNodes: data.nodes,
      updatedNode: candidate
        ? data.nodes.find((n) => n.id === `editorial-${candidate.id}`)
        : undefined,
      notice:
        "Only this prototype session interaction is counted. No external trends are inferred.",
    });
  });

  app.use("/api", (_req, res) =>
    res.status(404).json({ success: false, error: "Unknown API endpoint." }),
  );
  app.use((error: any, _req: any, res: any, next: any) => {
    if (error instanceof SyntaxError || error?.type === "entity.too.large")
      return res
        .status(400)
        .json({ success: false, error: "Invalid or oversized request." });
    next(error);
  });
  return app;
}

function isValidDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const date = new Date(`${value}T12:00:00Z`);
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

async function startServer() {
  const app = createApiApp();
  const port = Number(process.env.PORT) || 3000;
  if (process.env.NODE_ENV === "production") {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (_req, res) =>
      res.sendFile(path.join(__dirname, "dist", "index.html")),
    );
  } else {
    const { createServer } = await import("vite");
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }
  app.listen(port, process.env.HOST || "127.0.0.1", () =>
    console.log(`Turnside is ready at http://localhost:${port}`),
  );
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  startServer().catch(() => {
    console.error(
      "Turnside could not start. Check dependencies and the configured port.",
    );
    process.exitCode = 1;
  });
