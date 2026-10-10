import type {
  TripPlan,
  BookingPass,
  ItineraryStop,
  CityWeatherForecast,
  StopWeather,
  HeatmapNode,
  HeatTelemetryEvent,
} from "../types";
import type {
  RecommendationResponse,
  DiscoverParams,
} from "../recommendationTypes";
import { SAMPLE_WEATHER } from "../../backend/weather";

export interface ProviderStatus {
  configured: boolean;
  status: string;
  description: string;
  model?: string;
  provider?: string;
  mode?: string;
  inputModel?: string;
  voice?: string;
}
export interface ServerConfig {
  requiresAiSignIn?: boolean;
  defaultMapboxToken: string;
  hasGeminiKey: boolean;
  hasVoiceKey?: boolean;
  googleMapsBrowserKey?: string;
  hasGooglePlacesKey?: boolean;
  appName?: string;
  defaultAiMode?: "demo" | "live";
  geminiModel?: string;
  demoCities?: string[];
  providers?: Record<string, ProviderStatus>;
}
export interface PlanParams {
  selectionReceipt?: string;
  destination: string;
  vibe?: string;
  durationDays: number;
  pacing: string;
  travelerNote?: string;
  prompt?: string;
  startDate?: string;
  forceDemo?: boolean;
  preferredPlaceIds?: string[];
}
export interface ChatParams {
  message: string;
  currentItinerary?: TripPlan;
  city?: string;
  activeStop?: ItineraryStop;
  userLocation?: [number, number];
  conversationHistory?: { sender: string; text: string }[];
  forceDemo?: boolean;
}
export interface ChatResponse extends RecommendationResponse {}

async function requestJson<T>(
  url: string,
  body?: unknown,
  timeoutMs = 28000,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: body === undefined ? "GET" : "POST",
      ...(body === undefined
        ? {}
        : {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }),
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.success === false)
      throw new Error(
        data.error || "This request could not be completed. Try again.",
      );
    return data as T;
  } catch (error: any) {
    if (error?.name === "AbortError")
      throw new Error(
        url.startsWith("/api/voice")
          ? "Gemini voice is taking longer than expected. Try a shorter message."
          : "This is taking longer than expected. Try again or switch to Demo.",
      );
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchServerConfig(): Promise<ServerConfig> {
  try {
    return await requestJson("/api/config");
  } catch {
    return {
      defaultMapboxToken: "",
      hasGeminiKey: false,
      defaultAiMode: "demo",
      providers: {},
    };
  }
}
export const fetchIntegrationStatus = fetchServerConfig;

export async function fetchWeatherForecast(
  lat = 40.7338,
  lng = -73.9941,
): Promise<CityWeatherForecast> {
  try {
    return await requestJson(
      `/api/weather?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`,
    );
  } catch {
    return { ...SAMPLE_WEATHER } as CityWeatherForecast;
  }
}

export function parseTimeToHour24(timeStr?: string): number {
  const match = timeStr?.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!match) return 12;
  let hour = Number(match[1]);
  const meridiem = match[3]?.toUpperCase();
  if (meridiem === "PM" && hour < 12) hour += 12;
  if (meridiem === "AM" && hour === 12) hour = 0;
  return Math.min(Math.max(hour, 0), 23);
}

export function computeStopWeather(
  stop: ItineraryStop,
  forecast: CityWeatherForecast,
): StopWeather {
  const hour = parseTimeToHour24(stop.time);
  const closest = forecast.hourly.reduce<
    (typeof forecast.hourly)[number] | undefined
  >(
    (best, entry) =>
      !best ||
      Math.abs(Number(entry.time.slice(0, 2)) - hour) <
        Math.abs(Number(best.time.slice(0, 2)) - hour)
        ? entry
        : best,
    undefined,
  );
  const tempC = closest?.tempC ?? forecast.current.tempC;
  const tempF = closest?.tempF ?? forecast.current.tempF;
  const condition = closest?.condition ?? forecast.current.condition;
  const icon = closest?.icon ?? forecast.current.icon;
  const precipProb = closest?.precipProb ?? 0;
  const text =
    `${stop.title} ${stop.categoryLabel} ${stop.description}`.toLowerCase();
  const isOutdoor =
    stop.category === "nature" ||
    /garden|park|walk|terrace|courtyard|shrine|canal/.test(text);
  const sample =
    (forecast as CityWeatherForecast & { source?: string }).source === "demo";
  let activityTip = sample
    ? "Sample weather only. Check a live forecast before visiting."
    : closest?.tip || forecast.current.advice;
  let clothingTip = "Comfortable shoes and layers";
  if (!sample && isOutdoor && precipProb > 40) {
    activityTip = `Rain probability ${precipProb}%. Consider a covered alternative and watch for slippery paths.`;
    clothingTip = "Waterproof shoes and an umbrella";
  } else if (!sample && tempC >= 26) {
    clothingTip = "Light layers, water, and sun protection";
  } else if (!sample && tempC < 12) {
    clothingTip = "A warm layer for the walk";
  }
  return {
    tempC,
    tempF,
    apparentTempC: forecast.current.apparentTempC,
    condition,
    icon,
    precipProb,
    humidity: forecast.current.humidity,
    windSpeedKmH: forecast.current.windSpeedKmH,
    activityTip,
    clothingTip,
    isOutdoor,
  };
}

export async function generateTripPlanResponse(params: PlanParams): Promise<{
  success: boolean;
  data: TripPlan;
  source: string;
  notice?: string;
}> {
  return requestJson("/api/gemini/plan", params);
}
export async function generateTripPlan(params: PlanParams): Promise<TripPlan> {
  return (await generateTripPlanResponse(params)).data;
}
export async function discoverPlaces(
  params: DiscoverParams,
): Promise<RecommendationResponse> {
  return requestJson("/api/discover", params, 36000);
}
export async function askConciergeResponse(
  params: ChatParams,
): Promise<ChatResponse> {
  return requestJson("/api/gemini/chat", params, 36000);
}
export async function askConcierge(params: ChatParams): Promise<string> {
  return (await askConciergeResponse(params)).reply;
}
export async function bookVenueTicket(params: {
  stopTitle: string;
  city: string;
  slotTime: string;
  partySize?: number;
}): Promise<BookingPass> {
  return (
    await requestJson<{ booking: BookingPass }>("/api/gemini/book", params)
  ).booking;
}
export async function replanSchedule(params: {
  currentStops: ItineraryStop[];
  delayMinutes: number;
  reason?: string;
}): Promise<{
  adjustmentSummary: string;
  stops: ItineraryStop[];
  conflicts?: string[];
}> {
  return (
    await requestJson<{
      data: {
        adjustmentSummary: string;
        stops: ItineraryStop[];
        conflicts?: string[];
      };
    }>("/api/gemini/replan", params)
  ).data;
}

export interface VoiceTranscript {
  success: boolean;
  source: "gemini";
  model: string;
  transcript: string;
}
export interface VoiceSpeech {
  success: boolean;
  source: "gemini";
  model: string;
  voiceName: string;
  audioBase64: string;
  mimeType: "audio/wav";
  format: "audio/wav";
}
export async function transcribeRecordedAudio(params: {
  audioBase64: string;
  mimeType: string;
  durationSeconds?: number;
}): Promise<VoiceTranscript> {
  return requestJson("/api/voice/transcribe", params, 40000);
}
export async function generateVoiceSpeech(params: {
  text: string;
  voiceName?: string;
}): Promise<VoiceSpeech> {
  return requestJson("/api/voice/speak", params, 40000);
}
export async function synthesizeSpeech(
  text: string,
  voiceName = "Kore",
): Promise<string | null> {
  return (await generateVoiceSpeech({ text, voiceName })).audioBase64;
}
export function audioBlobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result =
        typeof reader.result === "string" ? reader.result.split(",")[1] : "";
      result
        ? resolve(result)
        : reject(new Error("Could not read the microphone recording."));
    };
    reader.onerror = () =>
      reject(new Error("Could not read the microphone recording."));
    reader.readAsDataURL(blob);
  });
}

export interface GooglePlaceDetails {
  id?: string;
  name: string;
  address?: string;
  coordinates?: [number, number];
  rating?: number;
  reviewCount?: number;
  openingHours?: {
    weekdayDescriptions?: string[];
    openNow?: boolean;
    nextOpenTime?: string;
    nextCloseTime?: string;
  };
  googleMapsUri?: string;
  websiteUri?: string;
  attributions: { provider: string; providerUri?: string }[];
  source: "google-places";
  attribution: "Google Maps";
  fetchedAt: string;
}
export async function fetchGooglePlaceDetails(params: {
  name: string;
  city: string;
}): Promise<GooglePlaceDetails> {
  return (
    await requestJson<{ place: GooglePlaceDetails }>(
      "/api/places/details",
      params,
      14000,
    )
  ).place;
}

export async function fetchHeatmapTelemetry(city = "New York"): Promise<{
  nodes: HeatmapNode[];
  events: HeatTelemetryEvent[];
  source?: string;
  notice?: string;
}> {
  try {
    return await requestJson(
      `/api/telemetry/heatmap?city=${encodeURIComponent(city)}`,
    );
  } catch {
    return { nodes: [], events: [], source: "unavailable" };
  }
}
export async function recordSearchTelemetry(
  query: string,
  city = "New York",
  stopTitle?: string,
): Promise<{
  updatedNode?: HeatmapNode;
  newEvent?: HeatTelemetryEvent;
  allNodes?: HeatmapNode[];
}> {
  try {
    return await requestJson("/api/telemetry/record-search", {
      query,
      city,
      stopTitle,
    });
  } catch {
    return {};
  }
}
