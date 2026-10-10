import type { Express } from "express";
import { hasRealKey, textInput, validCoordinates } from "./integrations";

export function webUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? value : undefined;
  } catch {
    return undefined;
  }
}

export function installPlacesRoutes(
  app: Express,
  fetcher: typeof fetch,
  env: Record<string, string | undefined>,
) {
  const apiKey = googleServerKey(env, "places");
  const configured = Boolean(apiKey);
  let status = configured ? "configured" : "needs-key";
  const getStatus = () => ({
    configured,
    status,
    provider: "Google Maps Places API (New)",
    description:
      "On-demand Google Maps venue search, ratings, review counts, and opening hours. No persistent cache, admission inventory, live footfall, or Popular Times data.",
  });
  app.post("/api/places/details", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const name = textInput(req.body?.name, 200);
    const city = textInput(req.body?.city, 180);
    if (!name || !city)
      return res
        .status(400)
        .json({ success: false, error: "Choose a venue name and city." });
    if (!configured)
      return res.status(503).json({
        success: false,
        source: "google-places",
        error:
          "Connect a server Google Places API key to load live Google Maps venue details.",
      });
    try {
      const response = await fetcher(
        "https://places.googleapis.com/v1/places:searchText",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": apiKey,
            "X-Goog-FieldMask":
              "places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.regularOpeningHours,places.currentOpeningHours,places.googleMapsUri,places.websiteUri,places.attributions",
          },
          signal: AbortSignal.timeout(10000),
          body: JSON.stringify({
            textQuery: `${name}, ${city}`,
            pageSize: 1,
            languageCode: "en",
          }),
        },
      );
      if (!response.ok) {
        status = "unavailable";
        return res.status(response.status === 429 ? 429 : 502).json({
          success: false,
          source: "google-places",
          error:
            response.status === 429
              ? "Google Places quota or rate limit reached. Try again later."
              : response.status === 401 || response.status === 403
                ? "Google Places rejected the configured key. Check API access and billing in Google Cloud."
                : "Google Places could not complete the venue lookup. Try again.",
        });
      }
      const data = await response.json();
      const result = data.places?.[0];
      if (!result || typeof result.displayName?.text !== "string")
        return res.status(404).json({
          success: false,
          source: "google-places",
          error:
            "Google Maps did not find a venue for this name and city. Check the name or open its official website.",
        });
      const place = normalizeGooglePlace(result);
      status = "connected";
      return res.json({
        success: true,
        place,
        notice:
          "Google Maps search match. Check that the returned venue and address are the place you intend to visit. Display this data with Google Maps attribution; no live crowd or ticket availability is implied.",
      });
    } catch (error: any) {
      status = "unavailable";
      const timedOut =
        error?.name === "AbortError" || error?.name === "TimeoutError";
      return res.status(timedOut ? 504 : 502).json({
        success: false,
        source: "google-places",
        error: timedOut
          ? "Google Places timed out. Try again."
          : "Cannot reach Google Places. Try again when connected.",
      });
    }
  });
  return getStatus;
}

export function googleServerKey(
  env: Record<string, string | undefined>,
  service: "places" | "routes" = "places",
): string {
  const candidates =
    service === "places"
      ? [
          env.GOOGLE_PLACES_API_KEY,
          env.GOOGLE_MAPS_SERVER_KEY,
          env.GOOGLE_MAPS_API_KEY,
        ]
      : [
          env.GOOGLE_ROUTES_API_KEY,
          env.GOOGLE_MAPS_SERVER_KEY,
          env.GOOGLE_MAPS_API_KEY,
        ];
  return candidates.find(hasRealKey)?.trim() || "";
}

export function normalizeGooglePlace(result: any) {
  const hours = result.currentOpeningHours || result.regularOpeningHours;
  const openingHours =
    hours && typeof hours === "object"
      ? {
          ...(Array.isArray(hours.weekdayDescriptions)
            ? {
                weekdayDescriptions: hours.weekdayDescriptions.filter(
                  (value: unknown) => typeof value === "string",
                ),
              }
            : {}),
          ...(typeof hours.openNow === "boolean"
            ? { openNow: hours.openNow }
            : {}),
          ...(typeof hours.nextOpenTime === "string"
            ? { nextOpenTime: hours.nextOpenTime }
            : {}),
          ...(typeof hours.nextCloseTime === "string"
            ? { nextCloseTime: hours.nextCloseTime }
            : {}),
        }
      : undefined;
  const coordinates: [number, number] = [
    result.location?.longitude,
    result.location?.latitude,
  ];
  const attributions = Array.isArray(result.attributions)
    ? result.attributions
        .filter((entry: any) => typeof entry?.provider === "string")
        .map((entry: any) => ({
          provider: entry.provider,
          providerUri: webUrl(entry.providerUri),
        }))
    : [];
  return {
    id: typeof result.id === "string" ? result.id : undefined,
    name: result.displayName.text,
    address:
      typeof result.formattedAddress === "string"
        ? result.formattedAddress
        : undefined,
    coordinates: validCoordinates(coordinates) ? coordinates : undefined,
    rating:
      typeof result.rating === "number" &&
      result.rating >= 0 &&
      result.rating <= 5
        ? result.rating
        : undefined,
    reviewCount:
      Number.isInteger(result.userRatingCount) && result.userRatingCount >= 0
        ? result.userRatingCount
        : undefined,
    openingHours,
    googleMapsUri: webUrl(result.googleMapsUri),
    websiteUri: webUrl(result.websiteUri),
    attributions,
    source: "google-places",
    attribution: "Google Maps",
    fetchedAt: new Date().toISOString(),
  };
}
