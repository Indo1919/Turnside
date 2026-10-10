import { validCoordinates } from "./integrations";

/** Google's encoded-polyline format with strict truncation and size checks. */
export function decodePolyline(encoded: string): [number, number][] {
  if (!encoded || encoded.length > 500000)
    throw new Error("Invalid route geometry.");
  let index = 0,
    lat = 0,
    lng = 0;
  const result: [number, number][] = [];
  const number = () => {
    let value = 0,
      shift = 0,
      byte = 0;
    do {
      if (index >= encoded.length || shift > 30)
        throw new Error("Truncated route geometry.");
      byte = encoded.charCodeAt(index++) - 63;
      if (byte < 0 || byte > 63) throw new Error("Invalid route encoding.");
      value |= (byte & 31) << shift;
      shift += 5;
    } while (byte >= 32);
    return value & 1 ? ~(value >> 1) : value >> 1;
  };
  while (index < encoded.length) {
    lat += number();
    lng += number();
    const point: [number, number] = [lng / 1e5, lat / 1e5];
    if (!validCoordinates(point)) throw new Error("Invalid route coordinates.");
    result.push(point);
  }
  if (result.length < 2) throw new Error("Route geometry is missing.");
  return result;
}
export async function googleRoute(
  points: [number, number][],
  mode: string,
  key: string,
  fetcher: typeof fetch,
) {
  const waypoint = (p: [number, number]) => ({
    location: { latLng: { latitude: p[1], longitude: p[0] } },
  });
  const response = await fetcher(
    "https://routes.googleapis.com/directions/v2:computeRoutes",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask":
          "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline",
      },
      signal: AbortSignal.timeout(8500),
      body: JSON.stringify({
        origin: waypoint(points[0]),
        destination: waypoint(points[points.length - 1]),
        intermediates: points.slice(1, -1).map(waypoint),
        travelMode: { walking: "WALK", cycling: "BICYCLE", driving: "DRIVE" }[
          mode
        ],
        computeAlternativeRoutes: false,
        ...(mode === "driving" ? { routingPreference: "TRAFFIC_UNAWARE" } : {}),
      }),
    },
  );
  if (!response.ok) throw new Error("Google Routes is unavailable.");
  const data = await response.json(),
    route = data.routes?.[0],
    duration = route?.duration?.match(/^([\d.]+)s$/);
  if (
    !route ||
    !duration ||
    !Number.isFinite(route.distanceMeters) ||
    route.distanceMeters < 0
  )
    throw new Error("Invalid route response.");
  return {
    coordinates: decodePolyline(route.polyline?.encodedPolyline),
    distanceMeters: Math.round(route.distanceMeters),
    durationMinutes: Math.round(Number(duration[1]) / 60),
    source: "google-routes",
    attribution: "Google Maps",
    notice: `Google Maps street route (${mode}). Display route geometry only on a Google map.`,
  };
}
