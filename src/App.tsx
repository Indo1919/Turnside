import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  Bookmark,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  Clock3,
  Coffee,
  Compass,
  ExternalLink,
  Footprints,
  Flame,
  Globe2,
  MapPin,
  Mic,
  MoreHorizontal,
  Navigation,
  Plus,
  Search,
  Send,
  Settings2,
  Sparkles,
  Sun,
  Ticket,
  Trash2,
  Undo2,
  Volume2,
  X,
} from "lucide-react";
import { useLiveConversation } from "./live/useLiveConversation";
const MapView = lazy(() =>
  import("./components/MapView").then((m) => ({ default: m.MapView })),
);
const GoogleMapView = lazy(() =>
  import("./components/GoogleMapView").then((m) => ({
    default: m.GoogleMapView,
  })),
);
import {
  HeatControls,
  HeatPanel,
  HeatDetail,
} from "./components/HeatExperience";
import { SourceLogo } from "./components/SourceLogo";
import { ConversationView } from "./components/ConversationView";
import { AreaPlaceCards } from "./components/AreaPlaceCards";
import type {
  Recommendation,
  RecommendationSource,
  RecommendationResponse,
} from "./recommendationTypes";
import type { DiscoveryCard } from "./discoveryTypes";
import type {
  AreaHeatmapResponse,
  HeatmapArea,
  HeatmapCategory,
} from "./heatmapTypes";
import {
  INITIAL_TRIP,
  CATEGORY_LABELS,
  VENUE_URLS,
  placeImage,
} from "./demoData";
import {
  askConciergeResponse,
  bookVenueTicket,
  fetchServerConfig,
  fetchWeatherForecast,
  generateTripPlanResponse,
  replanSchedule,
  transcribeRecordedAudio,
  generateVoiceSpeech,
  audioBlobToBase64,
  fetchGooglePlaceDetails,
} from "./services/api";
import type { ServerConfig } from "./services/api";
import {
  createEventPayloadFromStop,
  downloadIcsCalendar,
  getGoogleCalendarWebUrl,
  itineraryTimezone,
} from "./services/calendarService";
import { generateShareableSummary } from "./services/shareService";
import type {
  BookingPass,
  CategoryType,
  CityWeatherForecast,
  ItineraryStop,
  TrendyHotspot,
  TripPlan,
} from "./types";

type Section = "conversation" | "plan" | "hot" | "discover" | "saved";
type ModalType =
  "trip" | "integrations" | "share" | "calendar" | "booking" | "google" | null;
type SavedEntry = { trip: TripPlan };
type Message = {
  sender: "user" | "concierge";
  text: string;
  source?: "demo" | "gemini";
};
const STORAGE = "turnside.prototype.v2";
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
function containsGooglePlaces(plan: TripPlan) {
  return (
    plan.source?.startsWith("google-") ||
    plan.days.some((day) =>
      day.stops.some((stop) => stop.source?.startsWith("google-")),
    )
  );
}
function initialSession(): {
  trip: TripPlan;
  saved: string[];
  links: BookingPass[];
  savedLibrary: Record<string, SavedEntry>;
} {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE) || "null");
    if (
      data?.trip?.days?.length &&
      !containsGooglePlaces(data.trip) &&
      data.trip.days.every(
        (day: any) => Array.isArray(day.stops) && day.stops.length,
      )
    )
      return {
        trip: data.trip,
        saved: data.saved || [],
        links: data.links || [],
        savedLibrary:
          data.savedLibrary ||
          Object.fromEntries(
            (data.saved || []).map((id: string) => [id, { trip: data.trip }]),
          ),
      };
  } catch {}
  return { trip: clone(INITIAL_TRIP), saved: [], links: [], savedLibrary: {} };
}
function dateLabel(
  date: string,
  options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" },
) {
  return new Date(`${date}T12:00:00`).toLocaleDateString("en-US", options);
}
function minutes(time: string) {
  const match = time.match(/(\d+):(\d+)\s*(AM|PM)?/i);
  if (!match) return 600;
  let h = +match[1];
  if (match[3]) h = (h % 12) + (match[3].toUpperCase() === "PM" ? 12 : 0);
  return h * 60 + +match[2];
}
function timeLabel(value: number) {
  const h = Math.floor(value / 60) % 24;
  return `${String(h % 12 || 12).padStart(2, "0")}:${String(value % 60).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}
function openLink(url?: string) {
  if (url && /^https:\/\//.test(url))
    window.open(url, "_blank", "noopener,noreferrer");
}
function Modal({
  children,
  title,
  onClose,
  wide = false,
}: {
  children: ReactNode;
  title: string;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prior = document.activeElement as HTMLElement;
    const focusable = () =>
      Array.from(
        ref.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), a[href], input, select, textarea, [tabindex="0"]',
        ) || [],
      );
    focusable()[0]?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const items = focusable(),
          first = items[0],
          last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      prior?.focus();
    };
  }, []);
  return (
    <div
      className="modal-shade"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`modal ${wide ? "modal-wide" : ""}`}
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <button
          className="icon-button modal-close"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={20} />
        </button>
        {children}
      </div>
    </div>
  );
}
function Photo({
  place,
  className = "",
}: {
  place: { title?: string; name?: string; category?: string };
  className?: string;
}) {
  return (
    <div className={`place-photo ${className}`}>
      <img
        src={placeImage(place)}
        alt={`${place.category || "Travel"} mood photograph, not a verified photo of this venue`}
        loading="lazy"
        onError={(e) => {
          e.currentTarget.style.display = "none";
        }}
      />
      <span className="photo-caption">Mood photo</span>
    </div>
  );
}

export default function App() {
  const [session] = useState(initialSession);
  const [trip, setTrip] = useState<TripPlan>(session.trip);
  const [saved, setSaved] = useState<string[]>(session.saved);
  const [savedLibrary, setSavedLibrary] = useState<Record<string, SavedEntry>>(
    session.savedLibrary,
  );
  const [links, setLinks] = useState<BookingPass[]>(session.links);
  const [dayIndex, setDayIndex] = useState(0);
  const [section, setSection] = useState<Section>("conversation");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hotspotId, setHotspotId] = useState<string | null>(null);
  const [weather, setWeather] = useState<CityWeatherForecast | null>(null);
  const [celsius, setCelsius] = useState(false);
  const [config, setConfig] = useState<ServerConfig>({
    hasGeminiKey: false,
    defaultMapboxToken: "",
  });
  const [mapToken, setMapToken] = useState(
    () => localStorage.getItem("turnside.mapbox") || "",
  );
  const [tokenDraft, setTokenDraft] = useState(mapToken);
  const [demo, setDemo] = useState(true);
  const [modal, setModal] = useState<ModalType>(null);
  const [toast, setToast] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [undoTrip, setUndoTrip] = useState<TripPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [pickedRecommendations, setPickedRecommendations] = useState<string[]>(
    [],
  );
  const [conversationPlace, setConversationPlace] =
    useState<TrendyHotspot | null>(null);
  const [searchSuggestionsHtml, setSearchSuggestionsHtml] = useState("");
  const [recommendationSources, setRecommendationSources] = useState<
    RecommendationSource[]
  >([]);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(
    null,
  );
  const [input, setInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const micStream = useRef<MediaStream | null>(null);
  const recordingTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [voiceUrl, setVoiceUrl] = useState<string | null>(null);
  const audioPlayer = useRef<HTMLAudioElement>(null);
  const [heatData, setHeatData] = useState<AreaHeatmapResponse | null>(null);
  const [heatLoading, setHeatLoading] = useState(true);
  const [heatVisible, setHeatVisible] = useState(false);
  const [heatCategory, setHeatCategory] = useState<HeatmapCategory>("all");
  const [selectedAreaId, setSelectedAreaId] = useState<string | null>(null);
  const [heatRevision, setHeatRevision] = useState(0);
  const [googleQuery, setGoogleQuery] = useState("New York City");
  const [googleDetails, setGoogleDetails] = useState<any>(null);
  const [googleDetailsLoading, setGoogleDetailsLoading] = useState(false);
  const chatEnd = useRef<HTMLDivElement>(null);
  const [destination, setDestination] = useState("New York");
  const [startDate, setStartDate] = useState("2026-10-10");
  const [duration, setDuration] = useState(3);
  const [pace, setPace] = useState("balanced");
  const [notes, setNotes] = useState(
    "Great coffee, independent bookshops, art, and room to wander.",
  );
  const [partySize, setPartySize] = useState(2);
  const [handoff, setHandoff] = useState<BookingPass | null>(null);
  const [formError, setFormError] = useState("");
  const [shareText, setShareText] = useState("");
  const [liveToolBusy, setLiveToolBusy] = useState(false);
  function applyRecommendations(result: RecommendationResponse) {
    setRecommendations(result.recommendations || []);
    setPickedRecommendations(
      (result.recommendations || [])
        .filter((p) => !!p.coordinates)
        .slice(0, 4)
        .map((p) => p.id),
    );
    setSearchSuggestionsHtml(result.searchSuggestionsHtml || "");
    setRecommendationSources(result.sources || []);
    setConversationPlace(null);
    if (result.notice) notify(result.notice);
  }
  const live = useLiveConversation({
    city: trip.city,
    contextSummary: JSON.stringify({
      date: trip.days[0].date,
      preferences: notes,
      selectedPlaceIds: pickedRecommendations,
    }),
    onDiscovery: applyRecommendations,
    onPlan: (plan, result) => {
      setUndoTrip(clone(trip));
      setTrip({ ...plan, source: result.source, notice: result.notice });
      setDayIndex(0);
      setSection("plan");
      setHeatVisible(false);
      setSelectedId(null);
      setHotspotId(null);
      notify("Your day is ready. There’s room for a detour.");
    },
    onTranscript: (caption) => {
      if (caption.final && caption.text.trim())
        setMessages((m) => [
          ...m,
          {
            sender: caption.who === "user" ? "user" : "concierge",
            text: caption.text,
            source: "gemini",
          },
        ]);
    },
    onToolState: (tool) => setLiveToolBusy(tool.status === "running"),
  });
  useEffect(() => {
    if (section !== "conversation") {
      live.stop();
      setLiveToolBusy(false);
    }
  }, [section]);
  useEffect(() => {
    live.stop();
    setLiveToolBusy(false);
  }, [trip.city]);
  const googleDerivedTrip = containsGooglePlaces(trip);
  const day = trip.days[Math.min(dayIndex, trip.days.length - 1)];
  const stops = day.stops.filter((s) => s.status !== "skipped");
  const selected = stops.find((s) => s.id === selectedId);
  const hotspot =
    section === "conversation"
      ? conversationPlace
      : trip.trendyHotspots.find((s) => s.id === hotspotId);
  const detail = selectedAreaId
    ? null
    : section === "conversation"
      ? conversationPlace
      : hotspot || selected;
  const selectedArea = heatData?.areas.find(
    (area) => area.id === selectedAreaId,
  );
  const allStops = trip.days.flatMap((d) => d.stops);
  const picks = trip.trendyHotspots.filter(
    (p) =>
      category === "all" ||
      p.category === category ||
      (category === "culture" && p.category === "niche"),
  );
  const searchResults = [
    ...stops.map((s) => ({
      id: s.id,
      name: s.title,
      category: s.categoryLabel,
      stop: s,
    })),
    ...trip.trendyHotspots.map((s) => ({
      id: s.id,
      name: s.name,
      category: s.badge,
      spot: s,
    })),
  ]
    .filter(
      (p) =>
        query.length > 0 &&
        `${p.name} ${p.category}`.toLowerCase().includes(query.toLowerCase()),
    )
    .slice(0, 6);

  useEffect(() => {
    const controller = new AbortController();
    setHeatLoading(true);
    setHeatData(null);
    setSelectedAreaId(null);
    fetch(`/api/heatmap?city=${encodeURIComponent(trip.city)}`, {
      signal: controller.signal,
    })
      .then((r) => {
        if (!r.ok) throw new Error("Area data unavailable");
        return r.json();
      })
      .then((data) => {
        setHeatData(data);
        if (!data.supportedCategories.includes(heatCategory))
          setHeatCategory("all");
      })
      .catch((error) => {
        if (error.name !== "AbortError") setHeatData(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setHeatLoading(false);
      });
    return () => controller.abort();
  }, [trip.city, heatRevision]);
  useEffect(() => {
    if (modal !== "google") return;
    let cancelled = false;
    setGoogleDetails(null);
    if (!config.hasGooglePlacesKey) return;
    setGoogleDetailsLoading(true);
    fetchGooglePlaceDetails({ name: googleQuery, city: trip.city })
      .then((place) => {
        if (!cancelled) setGoogleDetails(place);
      })
      .catch((error) => {
        if (!cancelled) notify(error.message);
      })
      .finally(() => {
        if (!cancelled) setGoogleDetailsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [modal, googleQuery, config.hasGooglePlacesKey]);
  useEffect(() => {
    fetchServerConfig().then((c) => {
      setConfig(c);
      setDemo(!c.hasGeminiKey);
      if (c.defaultMapboxToken && !mapToken) {
        setMapToken(c.defaultMapboxToken);
        setTokenDraft(c.defaultMapboxToken);
      }
    });
  }, []);
  useEffect(() => {
    try {
      // Google-derived venue content remains in this session. Persist only the
      // editorial itinerary and local choices that do not contain provider data.
      if (containsGooglePlaces(trip)) return;
      const editorialLibrary = Object.fromEntries(
        Object.entries(savedLibrary).filter(
          ([, value]) => !containsGooglePlaces(value.trip),
        ),
      );
      localStorage.setItem(
        STORAGE,
        JSON.stringify({ trip, saved, links, savedLibrary: editorialLibrary }),
      );
    } catch {}
  }, [trip, saved, links, savedLibrary]);
  useEffect(() => {
    let cancelled = false;
    setWeather(null);
    fetchWeatherForecast(trip.center[1], trip.center[0]).then((w) => {
      if (!cancelled) setWeather(w);
    });
    return () => {
      cancelled = true;
    };
  }, [trip.center[0], trip.center[1]]);
  useEffect(() => {
    chatEnd.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, chatBusy, chatOpen]);
  useEffect(
    () => () => {
      clearTimeout(toastTimer.current);
      if (recorder.current?.state === "recording") recorder.current.stop();
      clearTimeout(recordingTimer.current);
      micStream.current?.getTracks().forEach((track) => track.stop());
    },
    [],
  );
  function notify(text: string) {
    setToast(text);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 5000);
  }
  function closeModal() {
    setModal(null);
    setFormError("");
  }
  function selectStop(stop: ItineraryStop) {
    setSelectedAreaId(null);
    const idx = trip.days.findIndex((d) =>
      d.stops.some((s) => s.id === stop.id),
    );
    if (idx >= 0) setDayIndex(idx);
    setSelectedId(stop.id);
    setHotspotId(null);
    setQuery("");
  }
  function selectHotspot(spot: TrendyHotspot) {
    setSelectedAreaId(null);
    setHotspotId(spot.id);
    setSelectedId(null);
    setQuery("");
  }
  function switchDay(index: number) {
    setSection("plan");
    setHeatVisible(false);
    setSelectedAreaId(null);
    setDayIndex(index);
    const next = trip.days[index];
    setSelectedId(
      next.stops.find((s) => s.status === "current")?.id ||
        next.stops[0]?.id ||
        null,
    );
    setHotspotId(null);
    setQuery("");
  }
  function toggleSave(id: string) {
    const removing = saved.includes(id);
    setSaved((values) =>
      removing ? values.filter((v) => v !== id) : [...values, id],
    );
    setSavedLibrary((values) => {
      const next = { ...values };
      if (removing) delete next[id];
      else next[id] = { trip: clone(trip) };
      return next;
    });
    notify(
      removing
        ? "Removed from your saved places"
        : "Saved for another good day",
    );
  }
  function viewSaved(id: string) {
    const source = savedLibrary[id]?.trip || trip;
    const stop = source.days.flatMap((d) => d.stops).find((s) => s.id === id);
    const spot = source.trendyHotspots.find((s) => s.id === id);
    if (
      source.city !== trip.city ||
      (!allStops.some((s) => s.id === id) &&
        !trip.trendyHotspots.some((p) => p.id === id))
    ) {
      setUndoTrip(clone(trip));
      setTrip(clone(source));
    }
    if (stop) {
      setDayIndex(
        source.days.findIndex((d) => d.stops.some((s) => s.id === id)),
      );
      setSelectedId(id);
      setHotspotId(null);
    } else if (spot) {
      setDayIndex(0);
      setHotspotId(id);
      setSelectedId(null);
    }
  }
  function updateStops(next: ItineraryStop[]) {
    setUndoTrip(clone(trip));
    setTrip((t) => ({
      ...t,
      days: t.days.map((d, i) => (i === dayIndex ? { ...d, stops: next } : d)),
    }));
  }
  function markDone(stop: ItineraryStop) {
    let next = stops.map((s) =>
      s.id === stop.id ? { ...s, status: "completed" as const } : s,
    );
    const upcoming = next.find((s) => s.status === "upcoming");
    if (!next.some((s) => s.status === "current") && upcoming)
      next = next.map((s) =>
        s.id === upcoming.id ? { ...s, status: "current" as const } : s,
      );
    updateStops(next);
    setSelectedId(next.find((s) => s.status === "current")?.id || stop.id);
    notify(`${stop.title} marked as visited`);
  }
  function removeStop(stop: ItineraryStop) {
    if (stops.length === 1)
      return notify("Keep at least one place in your day");
    const next = stops.filter((s) => s.id !== stop.id);
    updateStops(next);
    setSelectedId(next[0].id);
    notify(`${stop.title} removed from this day`);
  }
  function addDiscovery(spot: TrendyHotspot) {
    const existing = allStops.find((s) => s.title === spot.name);
    if (existing) {
      selectStop(existing);
      const message = `${spot.name} is already in your trip. I’ve selected it for you.`;
      notify(message);
      return message;
    }
    const activeIndex = stops.findIndex((s) => s.status === "current");
    const insertAt = activeIndex < 0 ? stops.length : activeIndex + 1;
    const start = stops[insertAt]
      ? minutes(stops[insertAt].time)
      : minutes(stops[stops.length - 1].time) +
        stops[stops.length - 1].durationMinutes +
        15;
    const added: ItineraryStop = {
      id: `${spot.id}-${Date.now()}`,
      title: spot.name,
      time: timeLabel(start),
      durationMinutes: spot.durationMinutes || 45,
      category: (Object.keys(CATEGORY_LABELS).includes(spot.category)
        ? spot.category
        : "niche") as CategoryType,
      categoryLabel: spot.badge,
      coordinates: spot.coordinates,
      address: spot.address || `${spot.name}, ${trip.city}`,
      sourceUrl: spot.sourceUrl || VENUE_URLS[spot.name],
      source: "editorial-demo",
      sourceLabel: spot.sourceLabel || "Editorial pick · venue source",
      bookingUrl: spot.bookingUrl,
      description: spot.story,
      insiderSecret: `Editorial demo tip: ${spot.insiderTip || "Check current venue hours before visiting."}`,
      localSecretScore: 0,
      touristTrapRisk: 0,
      ticketRequired: Boolean(spot.ticketRequired),
      ticketCost: spot.ticketCost,
      estimatedCost: spot.estimatedCost || "Check venue details",
      status: "upcoming",
    };
    const next = [...stops];
    next.splice(insertAt, 0, added);
    let cursor = start;
    for (let i = insertAt; i < next.length; i++) {
      cursor = Math.max(cursor, minutes(next[i].time));
      if (cursor + next[i].durationMinutes > 24 * 60) {
        const message =
          "Your day is full. Remove a stop before adding this one.";
        notify(message);
        return message;
      }
      next[i] = {
        ...next[i],
        time: timeLabel(cursor),
        ...(next[i].bookingSlot ? { bookingSlot: timeLabel(cursor) } : {}),
      };
      cursor += next[i].durationMinutes + 15;
    }
    updateStops(next);
    setSection("plan");
    setHotspotId(null);
    setSelectedId(added.id);
    const message = `I added ${spot.name} to Day ${dayIndex + 1}${insertAt < stops.length ? " and moved later stops to make room" : " after your existing stops"}. Check the venue’s hours before visiting.`;
    notify(
      `${spot.name} added${insertAt < stops.length ? ". Later stops have moved to make room." : " to the end of your day."}`,
    );
    return message;
  }
  async function shiftSchedule(delay = 30) {
    setBusy(true);
    try {
      const result = await replanSchedule({
        currentStops: stops,
        delayMinutes: delay,
        reason: "Running late",
      });
      updateStops(result.stops);
      notify(result.adjustmentSummary);
      return result.adjustmentSummary;
    } catch (error: any) {
      notify(error.message);
      throw error;
    } finally {
      setBusy(false);
    }
  }
  async function generate(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setFormError("");
    try {
      const result = await generateTripPlanResponse({
        destination,
        startDate,
        durationDays: duration,
        pacing: pace,
        travelerNote: notes,
        vibe: notes,
        forceDemo: demo,
      });
      setUndoTrip(clone(trip));
      setTrip({ ...result.data, source: result.source, notice: result.notice });
      setDayIndex(0);
      live.stop();
      setSection("conversation");
      setHeatVisible(false);
      setSelectedId(null);
      setHotspotId(null);
      setMessages([]);
      setRecommendations([]);
      setPickedRecommendations([]);
      setRecommendationSources([]);
      setSearchSuggestionsHtml("");
      setInput(notes);
      closeModal();
      notify(`Ready to explore ${result.data.city}. Tell us what sounds good.`);
    } catch (error: any) {
      setFormError(error.message);
    } finally {
      setBusy(false);
    }
  }
  async function sendChat(
    text = input,
    location = userLocation,
    discoverOnly = false,
  ) {
    if (!text.trim() || chatBusy) return;
    if (live.status === "live") {
      if (live.sendText(text)) {
        setInput("");
        setMessages((m) => [...m, { sender: "user", text, source: "gemini" }]);
      } else notify("Voice is reconnecting. Try sending again in a moment.");
      return;
    }
    setInput("");
    setMessages((m) => [...m, { sender: "user", text }]);
    setChatBusy(true);
    try {
      let reply: string;
      let replySource: "demo" | "gemini" = "demo";
      if (section === "conversation" || discoverOnly) {
        const response = await fetch("/api/discover", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: text,
            city: trip.city,
            conversationHistory: messages.slice(-10),
            forceDemo: demo,
            ...(location ? { userLocation: location } : {}),
          }),
          signal: AbortSignal.timeout(40000),
        });
        const result = await response.json();
        if (!response.ok || result.success === false)
          throw new Error(
            result.error || "We couldn’t find those places. Try again.",
          );
        reply = result.reply;
        replySource = result.source === "gemini" ? "gemini" : "demo";
        setRecommendations(result.recommendations || []);
        setPickedRecommendations(
          (result.recommendations || [])
            .filter((p: Recommendation) => !!p.coordinates)
            .slice(0, 4)
            .map((p: Recommendation) => p.id),
        );
        setSearchSuggestionsHtml(result.searchSuggestionsHtml || "");
        setRecommendationSources(result.sources || []);
        setNotes(text);
        setConversationPlace(null);
        if (/popular|trending|hot|spontaneous|nearby/i.test(text))
          setHeatVisible(true);
        if (result.notice) notify(result.notice);
      } else if (/late|delay|behind/i.test(text)) {
        const number = text.match(/(\d+)\s*(min|minute)/i);
        reply = await shiftSchedule(
          Math.min(180, Math.max(1, number ? +number[1] : 30)),
        );
      } else if (/^(add|include|make room)/i.test(text)) {
        const intent = /book|shop/i.test(text)
          ? "niche"
          : /coffee|café|cafe/i.test(text)
            ? "cafe"
            : /art|museum|gallery/i.test(text)
              ? "culture"
              : /park|outdoor|walk/i.test(text)
                ? "nature"
                : null;
        const spot =
          trip.trendyHotspots.find((s) =>
            text.toLowerCase().includes(s.name.toLowerCase()),
          ) ||
          trip.trendyHotspots.find(
            (s) =>
              (!intent || s.category === intent) &&
              !allStops.some((p) => p.title === s.name),
          );
        if (!spot)
          reply =
            "The discovery picks are already in your trip. Choose a place in Discover to see its details.";
        else {
          reply = addDiscovery(spot);
        }
      } else {
        const result = await askConciergeResponse({
          message: text,
          currentItinerary: trip,
          activeStop: selected || stops.find((s) => s.status === "current"),
          conversationHistory: messages.slice(-10),
          forceDemo: demo,
        });
        reply = result.reply;
        replySource = result.source === "gemini" ? "gemini" : "demo";
        if (result.notice) notify(result.notice);
      }
      setMessages((m) => [
        ...m,
        { sender: "concierge", text: reply, source: replySource },
      ]);
    } catch (error: any) {
      setMessages((m) => [
        ...m,
        {
          sender: "concierge",
          text: error.message || "I couldn’t complete that change. Try again.",
        },
      ]);
    } finally {
      setChatBusy(false);
    }
  }
  function closeChat() {
    if (recorder.current?.state === "recording") recorder.current.stop();
    audioPlayer.current?.pause();
    setChatOpen(false);
  }
  async function startVoice() {
    if (
      live.status === "live" ||
      live.status === "connecting" ||
      live.status === "reconnecting"
    )
      live.stop();
    if (listening) {
      recorder.current?.stop();
      return;
    }
    if (!config.hasVoiceKey) {
      setModal("integrations");
      notify(
        "Connect Gemini to use the required 3.8 voice input and spoken replies.",
      );
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      notify(
        "Audio recording is not available in this browser. Try Chrome or Safari on localhost or HTTPS.",
      );
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStream.current = stream;
      const mime = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4",
        "audio/ogg;codecs=opus",
      ].find((type) => MediaRecorder.isTypeSupported(type));
      const rec = new MediaRecorder(
        stream,
        mime ? { mimeType: mime } : undefined,
      );
      recorder.current = rec;
      const chunks: BlobPart[] = [];
      const started = Date.now();
      rec.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      rec.onstop = async () => {
        clearTimeout(recordingTimer.current);
        stream.getTracks().forEach((track) => track.stop());
        setListening(false);
        setVoiceBusy(true);
        try {
          const blob = new Blob(chunks, { type: rec.mimeType });
          if (blob.size < 100)
            throw new Error("That recording was empty. Try again.");
          const result = await transcribeRecordedAudio({
            audioBase64: await audioBlobToBase64(blob),
            mimeType: blob.type.split(";")[0],
            durationSeconds: Math.max(
              1,
              Math.min(60, Math.round((Date.now() - started) / 1000)),
            ),
          });
          setInput(result.transcript);
          notify(
            "Transcribed with Gemini 3.8. Review your message, then send it.",
          );
        } catch (error: any) {
          notify(error.message);
        } finally {
          setVoiceBusy(false);
        }
      };
      rec.onerror = () => {
        stream.getTracks().forEach((track) => track.stop());
        setListening(false);
        notify("Recording stopped. Check microphone access and try again.");
      };
      rec.start();
      setListening(true);
      recordingTimer.current = setTimeout(() => {
        if (rec.state === "recording") rec.stop();
      }, 59000);
    } catch (error: any) {
      setListening(false);
      notify(
        error.name === "NotAllowedError"
          ? "Microphone access wasn’t granted. You can enable it and try again."
          : error.message,
      );
    }
  }
  async function readAloud(text: string) {
    if (!config.hasVoiceKey) {
      setModal("integrations");
      notify("Connect Gemini to hear the required Gemini 3.8 TTS voice.");
      return;
    }
    setVoiceBusy(true);
    try {
      const result = await generateVoiceSpeech({
        text: text.slice(0, 3000),
        voiceName: "Kore",
      });
      setVoiceUrl(`data:${result.mimeType};base64,${result.audioBase64}`);
      notify("Gemini 3.8 voice is ready. Tap play to listen.");
    } catch (error: any) {
      notify(error.message);
    } finally {
      setVoiceBusy(false);
    }
  }
  function selectArea(area: HeatmapArea) {
    setHeatVisible(true);
    setSelectedAreaId(area.id);
    setSelectedId(null);
    setHotspotId(null);
    setQuery("");
  }
  function navigateSection(next: Section) {
    setSection(next);
    setHeatVisible(next === "hot");
    setConversationPlace(null);
    if (next === "conversation") {
      setSelectedId(null);
      setHotspotId(null);
    }
    if (next === "hot") {
      setHeatVisible(true);
      setSelectedAreaId(null);
      setSelectedId(null);
      setHotspotId(null);
    }
  }
  function showGoogle(query: string) {
    setGoogleQuery(query);
    setModal("google");
  }
  function recommendationPin(p: Recommendation): TrendyHotspot {
    return {
      id: p.id,
      name: p.title,
      coordinates: p.coordinates!,
      category: p.category,
      secrecyScore: 0,
      touristTrapScore: 0,
      discoveredBy: p.sourceLabel,
      sourceLabel: p.sourceLabel,
      story: p.description,
      badge: p.categoryLabel,
      address: p.address,
      durationMinutes: p.durationMinutes,
      sourceUrl: p.websiteUri || p.sourceUrl,
      bookingUrl: p.bookingUrl,
      ticketRequired: p.ticketRequired,
      insiderTip: p.reason,
    };
  }
  function discoveryPin(p: DiscoveryCard): TrendyHotspot {
    return {
      id: p.id,
      name: p.name,
      coordinates: p.coordinates,
      category:
        p.kind === "coffee"
          ? "cafe"
          : p.kind === "shop"
            ? "niche"
            : p.kind === "outdoors"
              ? "nature"
              : p.kind === "food"
                ? "dining"
                : "culture",
      secrecyScore: 0,
      touristTrapScore: 0,
      discoveredBy: "Turnside editorial pick · venue source",
      sourceLabel: "Editorial pick · first-party venue source",
      story: p.description,
      badge:
        p.kind === "coffee"
          ? "Independent coffee"
          : p.kind === "shop"
            ? "Shops & design"
            : p.kind === "outdoors"
              ? "Outdoors"
              : "A good detour",
      address: p.address,
      durationMinutes: 45,
      sourceUrl: p.links.official,
      insiderTip: p.reason,
    };
  }
  function findNearMe() {
    if (!config.hasGeminiKey) {
      setModal("integrations");
      notify(
        "Connect Gemini for recommendations around your location. The sample explores New York.",
      );
      return;
    }
    if (!navigator.geolocation) {
      notify("Location is unavailable. Tell us a neighborhood instead.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const point: [number, number] = [
          position.coords.longitude,
          position.coords.latitude,
        ];
        if (
          trip.city === "New York" &&
          (point[0] < -74.3 ||
            point[0] > -73.65 ||
            point[1] < 40.47 ||
            point[1] > 40.95)
        ) {
          notify(
            "You’re outside the New York map. Choose your destination first, then find places nearby.",
          );
          setModal("trip");
          return;
        }
        setUserLocation(point);
        setTrip((t) => ({ ...t, center: point }));
        navigateSection("conversation");
        sendChat(
          "Find independent coffee, interesting small shops, and a spontaneous detour near my location. Explain the sources behind each recommendation.",
          point,
        );
      },
      () =>
        notify(
          "Location wasn’t available. You can tell us a neighborhood instead.",
        ),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    );
  }
  function addAreaPlace(p: DiscoveryCard) {
    setHeatVisible(false);
    setSelectedAreaId(null);
    addDiscovery(discoveryPin(p));
  }
  function previewRecommendation(p: Recommendation) {
    if (p.source !== "editorial-demo")
      return showGoogle(`${p.title}, ${p.city}`);
    if (!p.coordinates) return showGoogle(`${p.title}, ${p.city}`);
    setConversationPlace(recommendationPin(p));
    setHotspotId(p.id);
    setSelectedId(null);
    setSelectedAreaId(null);
  }
  async function makeConversationPlan() {
    if (busy || !pickedRecommendations.length) return;
    setBusy(true);
    try {
      const response = await fetch("/api/gemini/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          destination: trip.city,
          durationDays: 1,
          pacing: "relaxed",
          travelerNote: notes,
          vibe: notes,
          prompt: notes,
          startDate: trip.days[0].date,
          preferredPlaceIds: pickedRecommendations,
          forceDemo: demo,
        }),
        signal: AbortSignal.timeout(40000),
      });
      const result = await response.json();
      if (!response.ok || result.success === false)
        throw new Error(
          result.error || "Your itinerary couldn’t be created. Try again.",
        );
      setUndoTrip(clone(trip));
      setTrip({ ...result.data, source: result.source, notice: result.notice });
      setDayIndex(0);
      setSection("plan");
      setHeatVisible(false);
      setSelectedId(null);
      setHotspotId(null);
      setConversationPlace(null);
      setMessages((m) => [
        ...m,
        {
          sender: "concierge",
          text: "Your day is ready. Open Hot areas whenever you feel like taking an unexpected turn.",
        },
      ]);
      notify("Your day is ready. There’s room for a detour.");
    } catch (error: any) {
      notify(error.message);
    } finally {
      setBusy(false);
    }
  }
  function calendarStop(stop: ItineraryStop) {
    const idx = trip.days.findIndex((d) =>
      d.stops.some((s) => s.id === stop.id),
    );
    try {
      openLink(
        getGoogleCalendarWebUrl(
          createEventPayloadFromStop(
            stop,
            trip.days[idx].date,
            idx,
            itineraryTimezone(trip),
          ),
        ),
      );
    } catch (e: any) {
      notify(e.message);
    }
  }
  function exportCalendar() {
    try {
      downloadIcsCalendar(trip);
      notify(
        "Calendar file downloaded. Import it into Apple or Google Calendar.",
      );
    } catch (e: any) {
      notify(e.message);
    }
  }
  function showBooking(stop: ItineraryStop) {
    selectStop(stop);
    setHandoff(links.find((l) => l.venue === stop.title) || null);
    setPartySize(2);
    setModal("booking");
    setFormError("");
  }
  async function prepareBooking() {
    if (!selected) return;
    setBusy(true);
    setFormError("");
    try {
      const pass = await bookVenueTicket({
        stopTitle: selected.title,
        city: trip.city,
        slotTime: `${day.date} ${selected.time}`,
        partySize,
      });
      setHandoff(pass);
      setLinks((values) => [
        ...values.filter((l) => l.venue !== pass.venue),
        pass,
      ]);
    } catch (e: any) {
      setFormError(e.message);
    } finally {
      setBusy(false);
    }
  }
  function resetDemo() {
    const value = clone(INITIAL_TRIP);
    setTrip(value);
    setSaved([]);
    setSavedLibrary({});
    setLinks([]);
    setDayIndex(0);
    setSelectedId("nyc-mcnally");
    setHotspotId(null);
    setSection("plan");
    setMessages([]);
    setDemo(true);
    setUndoTrip(null);
    closeModal();
    notify("Fresh New York demo. Ready for your next walkthrough.");
  }
  const firstDetour = trip.trendyHotspots.find(
    (p) => !allStops.some((s) => s.title === p.name),
  );
  const weatherLive = weather?.source === "open-meteo";
  const selectedTitle =
    conversationPlace?.name || hotspot?.name || selected?.title;
  const recommendationPins = recommendations
    .filter(
      (p) =>
        p.coordinates &&
        (p.source === "editorial-demo" || config.googleMapsBrowserKey),
    )
    .map(recommendationPin);

  return (
    <div className={`app-shell section-${section}`}>
      <header className="app-header">
        <button
          className="wordmark"
          onClick={() => navigateSection("conversation")}
          aria-label="Turnside home"
        >
          <span className="brand-icon">
            <img src="/turnside.svg" alt="" />
          </span>
          <span>
            turnside<span className="brand-dot">.</span>
          </span>
        </button>
        <nav className="main-nav" aria-label="Main navigation">
          {(
            [
              ["conversation", "Plan with AI", Sparkles],
              ["plan", "My itinerary", CalendarDays],
              ["hot", "Hot areas", Flame],
              ["discover", "Discover", Compass],
              ["saved", "Saved", Bookmark],
            ] as const
          ).map(([id, label, Icon]) => (
            <button
              key={id}
              className={section === id ? "active" : ""}
              aria-current={section === id ? "page" : undefined}
              onClick={() => navigateSection(id)}
            >
              <Icon size={17} />
              {label}
              {id === "saved" && saved.length > 0 && (
                <span className="nav-count">{saved.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="header-actions">
          <button
            className="icon-button"
            aria-label="Integrations and settings"
            onClick={() => {
              setTokenDraft(mapToken);
              setModal("integrations");
            }}
          >
            <Settings2 size={20} />
          </button>
          <button
            className="button primary new-trip"
            onClick={() => {
              setFormError("");
              live.stop();
              setMessages([]);
              setRecommendationSources([]);
              setSearchSuggestionsHtml("");
              setRecommendations([]);
              setPickedRecommendations([]);
              setInput("");
              navigateSection("conversation");
            }}
          >
            <Plus size={17} />
            New trip
          </button>
          <span className="avatar" aria-label="Demo profile">
            M
          </span>
        </div>
      </header>
      <main className="workspace">
        <aside className="trip-panel" aria-label="Trip itinerary">
          {section === "conversation" && (
            <ConversationView
              city={trip.city}
              connected={!demo && config.hasGeminiKey}
              messages={messages}
              input={input}
              onInput={setInput}
              onSend={sendChat}
              busy={chatBusy || liveToolBusy}
              recommendations={recommendations}
              selected={pickedRecommendations}
              onSelect={(id) =>
                setPickedRecommendations((p) =>
                  p.includes(id) ? p.filter((x) => x !== id) : [...p, id],
                )
              }
              onPreview={previewRecommendation}
              onPlan={makeConversationPlan}
              planning={busy}
              listening={listening}
              voiceBusy={voiceBusy}
              onVoice={startVoice}
              onListen={readAloud}
              voiceUrl={voiceUrl}
              onConnect={() => setModal("integrations")}
              onExplore={() => navigateSection("hot")}
              onLocation={findNearMe}
              onCity={() => setModal("trip")}
              searchSuggestionsHtml={searchSuggestionsHtml}
              sources={recommendationSources}
              live={live}
              onStartLive={() => {
                if (!config.hasGeminiKey) {
                  setModal("integrations");
                  notify("Connect Gemini to start a live voice conversation.");
                  return;
                }
                if (recorder.current?.state === "recording")
                  recorder.current.stop();
                setVoiceUrl(null);
                void live.start();
              }}
            />
          )}
          <div className="trip-heading">
            <div className="breadcrumb">
              My trips
              <ChevronRight size={12} />
              {trip.city}
            </div>
            <div className="title-row">
              <h1>{trip.city}</h1>
              <button
                className="icon-button"
                aria-label="Share itinerary"
                onClick={() => {
                  setShareText(generateShareableSummary(trip));
                  setModal("share");
                }}
              >
                <MoreHorizontal size={22} />
              </button>
            </div>
            <p className="trip-subtitle">
              A good plan. A few unexpected turns.
            </p>
            <div className="trip-meta">
              <CalendarDays size={14} />
              <span>
                {dateLabel(trip.days[0].date)} –{" "}
                {dateLabel(trip.days[trip.days.length - 1].date)}
              </span>
              <span className="tag demo-tag">
                {trip.source === "gemini" ? "AI itinerary" : "Demo trip"}
              </span>
            </div>
          </div>
          <div className="day-switcher" role="group" aria-label="Choose day">
            {trip.days.map((d, i) => (
              <button
                key={d.dayNumber}
                className={dayIndex === i ? "active" : ""}
                onClick={() => switchDay(i)}
                aria-pressed={dayIndex === i}
              >
                <strong>Day {i + 1}</strong>
                <span>
                  {dateLabel(d.date, { weekday: "short", day: "numeric" })}
                </span>
              </button>
            ))}
          </div>
          <div className="panel-scroll">
            {section === "plan" && (
              <>
                <div className="panel-section-heading">
                  <div className="eyebrow">YOUR DAY, AT A GLANCE</div>
                  <h2>{day.title}</h2>
                </div>
                <div className="weather-strip">
                  <span className="weather-icon">
                    <Sun size={22} />
                  </span>
                  <div>
                    <strong>
                      {weather
                        ? `${Math.round(celsius ? weather.current.tempC : weather.current.tempF)}° · ${weather.current.condition}`
                        : "Checking the weather…"}
                    </strong>
                    <span>
                      {weather
                        ? weatherLive
                          ? "Current weather · Open-Meteo"
                          : "Sample weather · offline preview"
                        : "Weather updates automatically"}
                    </span>
                  </div>
                  <button
                    className="temperature"
                    aria-label="Switch temperature units"
                    onClick={() => setCelsius((v) => !v)}
                  >
                    {celsius ? "°C" : "°F"}
                    <ChevronDown size={12} />
                  </button>
                </div>
                <div className="day-stats">
                  <span>
                    <MapPin size={14} />
                    {stops.length} places
                  </span>
                  <span>
                    <Footprints size={14} />
                    Walk & explore
                  </span>
                  <span>
                    <CheckCheck size={14} />
                    {stops.filter((s) => s.status === "completed").length}{" "}
                    visited
                  </span>
                </div>
                <div className="timeline">
                  {stops.map((s, i) => (
                    <div
                      key={s.id}
                      className={`timeline-item ${s.status === "completed" ? "completed" : ""} ${selectedId === s.id ? "selected" : ""}`}
                    >
                      <div className="timeline-spine">
                        <button
                          onClick={() => selectStop(s)}
                          aria-label={`Select stop ${i + 1}: ${s.title}`}
                        >
                          {s.status === "completed" ? (
                            <Check size={15} />
                          ) : (
                            i + 1
                          )}
                        </button>
                      </div>
                      <div className="timeline-content">
                        <button
                          className="stop-row"
                          onClick={() => selectStop(s)}
                        >
                          <div className="stop-time">
                            {s.time.replace(/^0/, "")}
                            {s.status === "current" && (
                              <span className="up-next">Up next</span>
                            )}
                            {s.status === "completed" && (
                              <span className="visited-label">Visited</span>
                            )}
                          </div>
                          <h3>{s.title}</h3>
                          <p>
                            {s.categoryLabel}
                            <span>·</span>
                            {s.durationMinutes} min
                          </p>
                        </button>
                        {selectedId === s.id && (
                          <div className="stop-expanded">
                            <p>{s.description}</p>
                            <div className="stop-tools">
                              {s.ticketRequired && (
                                <button
                                  className="ticket-link"
                                  onClick={() => showBooking(s)}
                                >
                                  <Ticket size={13} />
                                  Find tickets
                                  <ExternalLink size={11} />
                                </button>
                              )}
                              <button
                                className="subtle-link"
                                onClick={() =>
                                  openLink(s.sourceUrl || VENUE_URLS[s.title])
                                }
                                disabled={!(s.sourceUrl || VENUE_URLS[s.title])}
                              >
                                Venue details
                                <ArrowRight size={12} />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  className="delay-button"
                  disabled={busy}
                  onClick={() => {
                    shiftSchedule().catch(() => {});
                  }}
                >
                  <Clock3 size={16} />
                  <span>Running a little late?</span>
                  <strong>{busy ? "Adjusting…" : "+30 min"}</strong>
                </button>
                <p className="sample-note">
                  A suggested schedule. Check opening hours and availability
                  with each venue.
                </p>
              </>
            )}
            {section === "hot" && (
              <HeatPanel
                data={heatData}
                category={heatCategory}
                onCategory={setHeatCategory}
                selectedId={selectedAreaId}
                onSelect={selectArea}
                loading={heatLoading}
                onRefresh={() => setHeatRevision((v) => v + 1)}
              />
            )}
            {section === "discover" && (
              <>
                <div className="panel-section-heading">
                  <div className="eyebrow coral-text">
                    TAKE AN UNEXPECTED TURN
                  </div>
                  <h2>A little beyond the usual.</h2>
                  <p>Places worth making room for.</p>
                </div>
                <div className="filter-chips">
                  {[
                    ["all", "All"],
                    ["cafe", "Coffee"],
                    ["culture", "Culture"],
                    ["nature", "Outdoors"],
                  ].map(([id, name]) => (
                    <button
                      key={id}
                      className={category === id ? "active" : ""}
                      onClick={() => setCategory(id)}
                    >
                      {name}
                    </button>
                  ))}
                </div>
                <div className="editorial-note">
                  <Sparkles size={14} />
                  <span>
                    Editorial demo picks. Live trend feeds aren’t connected.
                  </span>
                </div>
                <div className="discovery-list">
                  {picks.map((p) => (
                    <article key={p.id} className="discovery-card">
                      <button
                        className="discovery-photo-button"
                        onClick={() => selectHotspot(p)}
                        aria-label={`Explore ${p.name}`}
                      >
                        <Photo place={p} />
                        <span className="discovery-badge">{p.badge}</span>
                      </button>
                      <button
                        className={`save-float ${saved.includes(p.id) ? "saved" : ""}`}
                        onClick={() => toggleSave(p.id)}
                        aria-label={`${saved.includes(p.id) ? "Unsave" : "Save"} ${p.name}`}
                      >
                        <Bookmark
                          size={17}
                          fill={saved.includes(p.id) ? "currentColor" : "none"}
                        />
                      </button>
                      <div className="discovery-body">
                        <button
                          className="plain-title"
                          onClick={() => selectHotspot(p)}
                        >
                          {p.name}
                          <ArrowRight size={17} />
                        </button>
                        <p>{p.story}</p>
                        <button
                          className="discovery-add"
                          onClick={() => addDiscovery(p)}
                        >
                          <Plus size={14} />
                          {allStops.some((s) => s.title === p.name)
                            ? "Already in your trip"
                            : "Make room in my day"}
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </>
            )}
            {section === "saved" && (
              <>
                <div className="panel-section-heading">
                  <div className="eyebrow">GOOD FINDS, KEPT CLOSE</div>
                  <h2>Your saved places.</h2>
                  <p>A little inspiration for the next turn.</p>
                </div>
                {saved.length === 0 ? (
                  <div className="empty-state">
                    <Bookmark size={30} />
                    <h3>Something catch your eye?</h3>
                    <p>
                      Save a place from your map or Discover. It’ll be waiting
                      here.
                    </p>
                    <button
                      className="button secondary"
                      onClick={() => setSection("discover")}
                    >
                      Find a good detour
                      <ArrowRight size={15} />
                    </button>
                  </div>
                ) : (
                  <div className="saved-list">
                    {saved.map((id) => {
                      const source = savedLibrary[id]?.trip || trip;
                      const s = source.days
                        .flatMap((d) => d.stops)
                        .find((v) => v.id === id);
                      const p = source.trendyHotspots.find((v) => v.id === id);
                      if (!s && !p) return null;
                      const item = (s || p)!;
                      return (
                        <div className="saved-row" key={id}>
                          <img
                            src={placeImage(item)}
                            alt="Sample mood photograph"
                          />
                          <button onClick={() => viewSaved(id)}>
                            <strong>{s?.title || p?.name}</strong>
                            <span>
                              {source.city} · {s?.categoryLabel || p?.badge}
                            </span>
                          </button>
                          <button
                            className="icon-button"
                            aria-label="Remove saved place"
                            onClick={() => toggleSave(id)}
                          >
                            <Bookmark size={17} fill="currentColor" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
                {links.length > 0 && (
                  <div className="booking-links">
                    <h3>Your booking links</h3>
                    <p>Finish on the provider’s site to confirm.</p>
                    {links.map((l) => (
                      <button
                        className="booking-link-row"
                        key={l.venue}
                        onClick={() => openLink(l.bookingUrl)}
                      >
                        <Ticket size={18} />
                        <span>
                          <strong>{l.venue}</strong>
                          <small>Not booked · {l.providerName}</small>
                        </span>
                        <ExternalLink size={15} />
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
          <div className="panel-bottom">
            <button className="ask-button" onClick={() => setChatOpen(true)}>
              <span className="ask-spark">
                <Sparkles size={19} />
              </span>
              <span>Ask Turnside</span>
              <span className="ask-hint">Make the day yours</span>
              <ArrowRight size={17} />
            </button>
            <button
              className="calendar-footer"
              onClick={() => setModal("calendar")}
            >
              <CalendarDays size={15} />
              Add trip to calendar
              <ArrowUpRightIcon />
            </button>
          </div>
        </aside>
        <section className="map-stage" aria-label="Interactive trip map">
          <Suspense
            fallback={
              <div className="map-initializing">
                <img src="/turnside.svg" alt="" />
                <span>Finding your bearings…</span>
              </div>
            }
          >
            {googleDerivedTrip &&
            !config.googleMapsBrowserKey &&
            (section === "plan" || section === "saved") &&
            !heatVisible ? (
              <iframe
                className="google-main-map"
                title="Your selected places on Google Maps"
                src={`https://maps.google.com/maps?q=${encodeURIComponent(selected?.title ? `${selected.title}, ${trip.city}` : trip.city)}&z=14&output=embed`}
                referrerPolicy="no-referrer-when-downgrade"
                allowFullScreen
              />
            ) : config.googleMapsBrowserKey ? (
              <GoogleMapView
                googleMapsKey={config.googleMapsBrowserKey}
                stops={
                  section === "hot" || section === "conversation" ? [] : stops
                }
                hotspots={
                  section === "conversation"
                    ? recommendationPins
                    : section === "hot"
                      ? []
                      : trip.trendyHotspots
                }
                selectedId={hotspotId || selectedId}
                onSelect={selectStop}
                onSelectHotspot={
                  section === "conversation"
                    ? (p) => {
                        const r = recommendations.find((r) => r.id === p.id);
                        if (r) previewRecommendation(r);
                      }
                    : selectHotspot
                }
                center={trip.center}
                mapboxToken={mapToken}
                heatAreas={heatData?.areas || []}
                heatVisible={heatVisible}
                heatFilter={heatCategory}
                selectedAreaId={selectedAreaId}
                onSelectArea={selectArea}
              />
            ) : (
              <MapView
                stops={
                  section === "hot" || section === "conversation" ? [] : stops
                }
                hotspots={
                  section === "conversation"
                    ? recommendationPins
                    : section === "hot"
                      ? []
                      : trip.trendyHotspots
                }
                selectedId={hotspotId || selectedId}
                onSelect={selectStop}
                onSelectHotspot={
                  section === "conversation"
                    ? (p) => {
                        const r = recommendations.find((r) => r.id === p.id);
                        if (r) previewRecommendation(r);
                      }
                    : selectHotspot
                }
                center={trip.center}
                mapboxToken={mapToken}
                heatAreas={heatData?.areas || []}
                heatVisible={heatVisible}
                heatFilter={heatCategory}
                selectedAreaId={selectedAreaId}
                onSelectArea={selectArea}
              />
            )}
          </Suspense>
          <HeatControls
            visible={heatVisible}
            onToggle={() => navigateSection(heatVisible ? "plan" : "hot")}
            category={heatCategory}
            onCategory={setHeatCategory}
            data={heatData}
            loading={heatLoading}
            onShow={() => navigateSection("hot")}
          />
          <button
            className="google-map-shortcut glass"
            onClick={() =>
              showGoogle(
                selectedTitle ? `${selectedTitle}, ${trip.city}` : trip.city,
              )
            }
          >
            <SourceLogo provider="google" small />
            <span>Google Maps</span>
            <ExternalLink size={12} />
          </button>
          {heatVisible && (
            <div className="heat-legend glass">
              <div>
                <Flame size={14} />
                <strong>More places. More possibilities.</strong>
              </div>
              <span className="heat-gradient" />
              <div className="legend-labels">
                <span>Fewer places</span>
                <span>Higher density</span>
              </div>
              <p>
                {heatData?.source === "public-data"
                  ? "NYC public place data"
                  : heatData?.source === "mixed"
                    ? "Public data + labeled sample sources"
                    : "Editorial preview"}{" "}
                · tap an area for sources
              </p>
            </div>
          )}
          {selectedArea && heatData && (
            <HeatDetail
              area={selectedArea}
              data={heatData}
              category={heatCategory}
              onClose={() => setSelectedAreaId(null)}
              onGoogle={() => showGoogle(`${selectedArea.name}, ${trip.city}`)}
            >
              <button
                className="ask-area-button"
                onClick={() => {
                  const text = `Find interesting coffee spots and independent brands around ${selectedArea.name}, ${trip.city} that people are discussing. Use current dated sources where available, explain why each is worth a detour, and distinguish editorial picks from measured popularity.`;
                  navigateSection("conversation");
                  void sendChat(text, userLocation, true);
                }}
              >
                <SourceLogo
                  provider={
                    !demo && config.hasGeminiKey ? "gemini" : "turnside"
                  }
                  small
                />
                <span>What’s worth a detour here?</span>
                <ArrowRight size={15} />
              </button>
              <AreaPlaceCards
                area={selectedArea}
                category={heatCategory}
                onAdd={addAreaPlace}
                onOpen={(p) => showGoogle(`${p.name}, ${p.address}`)}
              />
            </HeatDetail>
          )}
          <div className="map-search glass">
            <Search size={19} />
            <input
              aria-label="Search this trip"
              placeholder={`Search places in ${trip.city}`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query ? (
              <button
                className="mini-icon"
                aria-label="Clear search"
                onClick={() => setQuery("")}
              >
                <X size={15} />
              </button>
            ) : (
              <span className="search-shortcut">⌕</span>
            )}
            {query && (
              <div className="search-results">
                {searchResults.length ? (
                  searchResults.map((r) => (
                    <button
                      key={r.id}
                      onClick={() =>
                        "stop" in r
                          ? selectStop(r.stop!)
                          : selectHotspot(r.spot!)
                      }
                    >
                      <MapPin size={16} />
                      <span>
                        <strong>{r.name}</strong>
                        <small>{r.category}</small>
                      </span>
                      <ChevronRight size={15} />
                    </button>
                  ))
                ) : (
                  <div className="search-empty">
                    <strong>No match in this trip</strong>
                    <span>Try a place or category, or start a new trip.</span>
                    <button
                      onClick={() => {
                        setDestination(query);
                        setModal("trip");
                        setQuery("");
                      }}
                    >
                      Plan somewhere new
                      <ArrowRight size={14} />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
          <button
            className="mode-chip glass"
            onClick={() => setModal("integrations")}
          >
            <span className={`status-dot ${demo ? "" : "live"}`} />
            {demo ? "Demo experience" : "Live AI mode"}
            <ChevronDown size={12} />
          </button>
          {section !== "conversation" && (
            <button
              className="spontaneous-button glass"
              onClick={() => {
                navigateSection("conversation");
                setInput(
                  `Find a good spontaneous detour around ${selectedArea?.name || selected?.title || trip.city}. I have 45 minutes.`,
                );
              }}
            >
              <Sparkles size={16} />
              <span>Find a good detour</span>
              <ArrowRight size={14} />
            </button>
          )}
          <div
            className={`map-neighborhood glass ${heatVisible ? "with-heat" : ""}`}
          >
            <MapPin size={14} />
            <span>{day.title}</span>
            <span className="map-place-count">{stops.length} stops</span>
          </div>
          {detail && (
            <article
              className="place-detail glass"
              aria-label={`Place details: ${selectedTitle}`}
            >
              <div className="detail-photo">
                <Photo place={detail} />
                <span className="detail-category">
                  {hotspot ? hotspot.badge : selected?.categoryLabel}
                </span>
                <button
                  className={`save-float ${saved.includes(detail.id) ? "saved" : ""}`}
                  onClick={() => toggleSave(detail.id)}
                  aria-label={`${saved.includes(detail.id) ? "Unsave" : "Save"} ${selectedTitle}`}
                >
                  <Bookmark
                    size={18}
                    fill={saved.includes(detail.id) ? "currentColor" : "none"}
                  />
                </button>
                <button
                  className="detail-dismiss"
                  aria-label="Close place details"
                  onClick={() => {
                    setSelectedId(null);
                    setHotspotId(null);
                  }}
                >
                  <X size={16} />
                </button>
              </div>
              <div className="detail-body">
                <div className="detail-title">
                  <h2>{selectedTitle}</h2>
                  {hotspot ? (
                    <Sparkles size={18} className="coral-text" />
                  ) : (
                    <span className="detail-stop-number">
                      {stops.findIndex((s) => s.id === selectedId) + 1}
                    </span>
                  )}
                </div>
                <div className="detail-meta">
                  {hotspot ? (
                    <>
                      <span className="coral-text">Editorial discovery</span>
                      <span>·</span>
                      <span>Make a detour</span>
                    </>
                  ) : (
                    <>
                      <Clock3 size={13} />
                      <span>{selected?.time.replace(/^0/, "")}</span>
                      <span>·</span>
                      <span>{selected?.durationMinutes} min</span>
                      {selected?.status === "completed" && (
                        <span className="detail-visited">
                          <Check size={12} />
                          Visited
                        </span>
                      )}
                    </>
                  )}
                </div>
                {selected?.sourceLabel && (
                  <div className="stop-source-card">
                    <SourceLogo
                      provider={
                        selected.source?.startsWith("google-")
                          ? "google"
                          : "turnside"
                      }
                      small
                    />
                    <span>{selected.sourceLabel}</span>
                    <a
                      href={
                        selected.sourceUrl ||
                        `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selected.title + ", " + trip.city)}`
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`View ${selected.title} source`}
                    >
                      <ExternalLink size={13} />
                    </a>
                  </div>
                )}
                {!!selected?.attributions?.length && (
                  <div className="stop-attributions">
                    {selected.attributions.map((a, i) =>
                      a.providerUri ? (
                        <a
                          key={i}
                          href={a.providerUri}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {a.provider}
                        </a>
                      ) : (
                        <span key={i}>{a.provider}</span>
                      ),
                    )}
                  </div>
                )}
                <p className="detail-description">
                  {hotspot?.story || selected?.description}
                </p>
                <div className="local-tip">
                  <span>
                    <Compass size={15} />A little heads-up
                  </span>
                  <p>
                    {(
                      hotspot?.insiderTip ||
                      selected?.insiderSecret ||
                      ""
                    ).replace(/^Editorial demo tip:\s*/i, "")}
                  </p>
                </div>
                <div className="detail-actions">
                  {hotspot ? (
                    <>
                      <button
                        className="button primary"
                        onClick={() => addDiscovery(hotspot)}
                      >
                        <Plus size={16} />
                        Add to my day
                      </button>
                      <button
                        className="icon-button outlined"
                        aria-label="Open venue website"
                        onClick={() =>
                          openLink(
                            hotspot.sourceUrl || VENUE_URLS[hotspot.name],
                          )
                        }
                        disabled={
                          !(hotspot.sourceUrl || VENUE_URLS[hotspot.name])
                        }
                      >
                        <ExternalLink size={17} />
                      </button>
                    </>
                  ) : (
                    selected && (
                      <>
                        <button
                          className="button primary"
                          onClick={() =>
                            openLink(
                              `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(selected.title + ", " + selected.address)}&travelmode=walking`,
                            )
                          }
                        >
                          <Navigation size={15} />
                          Directions
                        </button>
                        <button
                          className="button secondary"
                          onClick={() =>
                            selected.ticketRequired
                              ? showBooking(selected)
                              : calendarStop(selected)
                          }
                        >
                          {selected.ticketRequired ? (
                            <Ticket size={15} />
                          ) : (
                            <CalendarDays size={15} />
                          )}
                          {selected.ticketRequired ? "Tickets" : "Calendar"}
                        </button>
                        <button
                          className="icon-button outlined"
                          aria-label={
                            selected.status === "completed"
                              ? "Remove this stop"
                              : "Mark as visited"
                          }
                          onClick={() =>
                            selected.status === "completed"
                              ? removeStop(selected)
                              : markDone(selected)
                          }
                        >
                          {selected.status === "completed" ? (
                            <Trash2 size={16} />
                          ) : (
                            <Check size={18} />
                          )}
                        </button>
                      </>
                    )
                  )}
                </div>
              </div>
            </article>
          )}
          {firstDetour && !heatVisible && (
            <button
              className="detour-card glass"
              onClick={() => {
                setSection("discover");
                selectHotspot(firstDetour);
              }}
            >
              <span className="detour-icon">
                <Compass size={21} />
              </span>
              <span>
                <small>A LITTLE OFF YOUR ROUTE</small>
                <strong>Room for a detour?</strong>
                <span>{firstDetour.name}</span>
              </span>
              <ArrowRight size={18} />
            </button>
          )}
          {undoTrip && (
            <button
              className="undo-button glass"
              onClick={() => {
                const value = undoTrip;
                setTrip(value);
                setDayIndex(Math.min(dayIndex, value.days.length - 1));
                setSelectedId(
                  value.days[Math.min(dayIndex, value.days.length - 1)].stops[0]
                    ?.id || null,
                );
                setHotspotId(null);
                setUndoTrip(null);
                notify("Last itinerary change undone");
              }}
            >
              <Undo2 size={15} />
              Undo last change
            </button>
          )}
        </section>
      </main>
      {toast && (
        <div className="toast" role="status">
          <Check size={16} />
          <span>{toast}</span>
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={14} />
          </button>
        </div>
      )}
      {chatOpen && (
        <>
          <div className="chat-scrim" onClick={closeChat} />
          <section className="chat-panel" aria-label="Ask Turnside">
            <div className="chat-header">
              <span className="chat-logo">
                <SourceLogo provider="gemini" />
              </span>
              <div>
                <h2>Ask Turnside</h2>
                <p>
                  {config.hasVoiceKey
                    ? "Gemini 3.8 voice · connected"
                    : demo
                      ? "Demo planner · connect Gemini for voice"
                      : "Gemini planning · voice connection needed"}
                </p>
              </div>
              <button
                className="icon-button"
                aria-label="Close chat"
                onClick={closeChat}
              >
                <X size={20} />
              </button>
            </div>
            <div className="chat-stream">
              {messages.length === 0 && (
                <div className="chat-intro">
                  <span className="chat-intro-icon">
                    <Navigation size={30} />
                  </span>
                  <h3>
                    A little more you.
                    <br />A little less planning.
                  </h3>
                  <p>
                    Find the next place, make room for a detour, or give your
                    day some breathing room.
                  </p>
                  <div className="chat-suggestions">
                    {[
                      "What’s next in my day?",
                      "I’m running 30 minutes late",
                      "Add a bookshop detour",
                    ].map((q) => (
                      <button key={q} onClick={() => sendChat(q)}>
                        {q}
                        <ArrowRight size={15} />
                      </button>
                    ))}
                  </div>
                  <small>
                    {demo
                      ? "Demo replies use the itinerary and curated places. Switch to live AI in Connections."
                      : "Check hours, prices, and bookings with the provider."}
                  </small>
                </div>
              )}
              {messages.map((m, i) => (
                <div key={i} className={`chat-message ${m.sender}`}>
                  <div>{m.text}</div>
                  {m.sender === "concierge" && (
                    <button
                      className="read-message"
                      aria-label="Read response aloud"
                      onClick={() => readAloud(m.text)}
                      disabled={voiceBusy}
                    >
                      <Volume2 size={13} />
                      {voiceBusy ? "Preparing voice…" : "Gemini 3.8 · Listen"}
                    </button>
                  )}
                </div>
              ))}
              {chatBusy && (
                <div className="typing">
                  <span />
                  <span />
                  <span />
                </div>
              )}
              <div ref={chatEnd} />
            </div>
            {listening && (
              <div className="voice-recording">
                <div className="voice-wave">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                    <span key={n} style={{ animationDelay: `${n * 0.11}s` }} />
                  ))}
                </div>
                <span>Listening to your next turn…</span>
                <button onClick={startVoice}>
                  Finish recording
                  <Check size={14} />
                </button>
              </div>
            )}
            {voiceUrl && (
              <div className="voice-playback">
                <SourceLogo provider="gemini" small />
                <div>
                  <span>Gemini 3.8 Flash TTS</span>
                  <audio ref={audioPlayer} controls src={voiceUrl} />
                </div>
                <button
                  className="mini-icon"
                  aria-label="Dismiss voice reply"
                  onClick={() => setVoiceUrl(null)}
                >
                  <X size={13} />
                </button>
              </div>
            )}
            <form
              className="chat-composer"
              onSubmit={(e) => {
                e.preventDefault();
                sendChat();
              }}
            >
              <div>
                <textarea
                  aria-label="Your message to Turnside"
                  placeholder="Make a little room for…"
                  rows={2}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      sendChat();
                    }
                  }}
                />
                <div className="composer-tools">
                  <button
                    type="button"
                    className={`icon-button ${listening ? "recording" : ""}`}
                    aria-label={
                      listening ? "Stop voice input" : "Use voice input"
                    }
                    onClick={startVoice}
                    disabled={voiceBusy}
                  >
                    <Mic size={18} />
                  </button>
                  <span>
                    {listening
                      ? "Recording · tap to finish"
                      : voiceBusy
                        ? "Gemini is processing audio…"
                        : "Voice by Gemini 3.8"}
                  </span>
                  <button
                    className="send-button"
                    aria-label="Send message"
                    disabled={!input.trim() || chatBusy}
                  >
                    <Send size={16} />
                  </button>
                </div>
              </div>
              <p>Bookings are confirmed on the provider’s website.</p>
            </form>
          </section>
        </>
      )}
      {modal === "google" && (
        <Modal title="Google Maps" onClose={closeModal} wide>
          <div className="google-modal-header">
            <SourceLogo provider="google" />
            <div>
              <h2>{googleQuery}</h2>
              <p>Google Maps · separate map view</p>
            </div>
          </div>
          <iframe
            className="google-embed"
            title={`Google Maps: ${googleQuery}`}
            src={`https://maps.google.com/maps?q=${encodeURIComponent(googleQuery)}&z=14&output=embed`}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            allowFullScreen
          />
          <div className="google-details">
            <div className="source-section-title">
              <span>GOOGLE PLACE INFORMATION</span>
              <SourceLogo provider="google" small />
            </div>
            {googleDetailsLoading ? (
              <p>Checking Google Places…</p>
            ) : googleDetails ? (
              <>
                <h3>{googleDetails.name}</h3>
                {googleDetails.address && <p>{googleDetails.address}</p>}
                <div className="google-rating">
                  {googleDetails.rating !== undefined && (
                    <strong>{googleDetails.rating} ★</strong>
                  )}
                  {googleDetails.reviewCount !== undefined && (
                    <span>
                      {googleDetails.reviewCount.toLocaleString()} reviews
                    </span>
                  )}
                  {googleDetails.openingHours?.openNow !== undefined && (
                    <span>
                      {googleDetails.openingHours.openNow
                        ? "Open now"
                        : "Closed now"}
                    </span>
                  )}
                </div>
                {googleDetails.openingHours?.weekdayDescriptions && (
                  <details className="source-method">
                    <summary>
                      Opening hours
                      <ChevronDown size={14} />
                    </summary>
                    {googleDetails.openingHours.weekdayDescriptions.map(
                      (text: string) => (
                        <p key={text}>{text}</p>
                      ),
                    )}
                  </details>
                )}
                <small>
                  Retrieved from Google Places{" "}
                  {new Date(googleDetails.fetchedAt).toLocaleTimeString([], {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                  .{" "}
                  {googleDetails.attributions
                    ?.map((a: any) => a.provider)
                    .join(", ")}
                </small>
              </>
            ) : (
              <p>
                This map opens without an app account. Ratings and hours appear
                here when Google Places is connected.
              </p>
            )}
            <a
              className="button secondary full-button"
              href={
                googleDetails?.googleMapsUri ||
                `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(googleQuery)}`
              }
              target="_blank"
              rel="noopener noreferrer"
            >
              Open full Google Maps
              <ExternalLink size={15} />
            </a>
          </div>
        </Modal>
      )}
      {modal === "trip" && (
        <Modal title="Plan a new trip" onClose={closeModal}>
          <div className="modal-heading">
            <span className="modal-symbol">
              <Globe2 size={25} />
            </span>
            <div className="eyebrow">LET’S TAKE A TURN</div>
            <h2>Where are we heading?</h2>
            <p>A thoughtful plan, with room for the unexpected.</p>
          </div>
          <form onSubmit={generate}>
            <label className="field-label">Destination</label>
            <div className="destination-options">
              {[
                ["New York", "NYC", "The city, your way"],
                ["Tokyo", "TYO", "A different rhythm"],
                ["Paris", "PAR", "Room to wander"],
              ].map(([city, code, caption]) => (
                <button
                  type="button"
                  key={city}
                  className={destination === city ? "selected" : ""}
                  onClick={() => setDestination(city)}
                >
                  <span>{code}</span>
                  <strong>{city}</strong>
                  <small>{caption}</small>
                </button>
              ))}
            </div>
            {!demo && (
              <label className="form-field">
                Or another city
                <input
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  placeholder="City, country"
                  required
                />
              </label>
            )}
            <div className="form-grid">
              <label className="form-field">
                First day
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  required
                />
              </label>
              <label className="form-field">
                Time to explore
                <select
                  value={duration}
                  onChange={(e) => setDuration(+e.target.value)}
                >
                  {[1, 2, 3].map((n) => (
                    <option key={n} value={n}>
                      {n} {n === 1 ? "day" : "days"}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="field-label">Your pace</label>
            <div className="pace-options">
              {[
                ["relaxed", "Easygoing"],
                ["balanced", "A bit of both"],
                ["fast", "See a little more"],
              ].map(([id, label]) => (
                <button
                  type="button"
                  className={pace === id ? "selected" : ""}
                  key={id}
                  onClick={() => setPace(id)}
                >
                  {label}
                </button>
              ))}
            </div>
            <label className="form-field">
              What makes it your kind of day?
              <textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Coffee, galleries, a quiet park…"
              />
            </label>
            <p className="form-note">
              <Sparkles size={14} />
              {demo
                ? "Demo uses curated city plans. No AI credits. Personalization opens with live AI."
                : "Live AI uses your connected Gemini account. Recommendations need verification."}
            </p>
            {formError && (
              <p className="form-error" role="alert">
                {formError}
              </p>
            )}
            <button
              className="button primary full-button"
              disabled={
                busy ||
                (demo && !["New York", "Tokyo", "Paris"].includes(destination))
              }
            >
              {busy ? "Getting your city ready…" : "Start exploring"}
              <ArrowRight size={17} />
            </button>
          </form>
        </Modal>
      )}
      {modal === "integrations" && (
        <Modal title="Connections" onClose={closeModal} wide>
          <div className="modal-heading">
            <span className="modal-symbol">
              <Settings2 size={25} />
            </span>
            <div className="eyebrow">EVERYTHING IN ITS PLACE</div>
            <h2>Connections</h2>
            <p>Know what’s live, and what’s part of the demo.</p>
          </div>
          <div className="mode-toggle">
            <button
              className={demo ? "active" : ""}
              onClick={() => setDemo(true)}
            >
              <strong>Demo</strong>
              <span>No AI credits</span>
            </button>
            <button
              className={!demo ? "active" : ""}
              disabled={!config.hasGeminiKey}
              onClick={() => setDemo(false)}
            >
              <strong>Live AI</strong>
              <span>
                {config.hasGeminiKey
                  ? "Use connected Gemini"
                  : "Connect Gemini to enable"}
              </span>
            </button>
          </div>
          <div className="connection-list">
            {[
              {
                icon: MapPin,
                title: "Maps & directions",
                text: config.googleMapsBrowserKey
                  ? "Google Maps configured · interactive area layers"
                  : mapToken
                    ? "Mapbox configured · Google Maps viewing and directions"
                    : "Free open map · Google Maps viewing and directions",
                ready: true,
              },
              {
                icon: Sun,
                title: "Weather",
                text: weatherLive
                  ? "Open-Meteo · current local conditions"
                  : "Open-Meteo · sample fallback when unavailable",
                ready: weatherLive,
              },
              {
                icon: Sparkles,
                title: "Conversation & planning",
                text: config.hasGeminiKey
                  ? `Gemini configured · ${demo ? "demo mode selected" : "live mode selected"}`
                  : "Curated demo · Gemini can be connected on the server",
                ready: config.hasGeminiKey,
              },
              {
                icon: Mic,
                title: "Voice & spoken replies",
                text: config.hasVoiceKey
                  ? "Gemini Live · Gemini 3.8 Flash TTS configured"
                  : "Gemini Live and 3.8 Flash TTS · connection needed",
                ready: Boolean(config.hasVoiceKey),
              },
              {
                icon: CalendarDays,
                title: "Your calendar",
                text: "Google Calendar drafts · Apple-compatible .ics export",
                ready: true,
              },
              {
                icon: Ticket,
                title: "Tickets & reservations",
                text: "Official provider handoff · confirm and pay on their site",
                ready: true,
              },
              {
                icon: Compass,
                title: "Local discoveries",
                text:
                  heatData?.source === "public-data"
                    ? "NYC Open Data · neighborhood place density"
                    : heatData?.source === "mixed"
                      ? "NYC public data + labeled editorial samples"
                      : "Editorial picks · no live popularity provider",
                ready: false,
              },
            ].map(({ icon: Icon, title, text, ready }) => (
              <div className="connection-row" key={title}>
                <span className="connection-icon">
                  <Icon size={19} />
                </span>
                <div>
                  <strong>{title}</strong>
                  <p>{text}</p>
                </div>
                <span className={`connection-state ${ready ? "ready" : ""}`}>
                  {ready ? <Check size={15} /> : <span />}
                </span>
              </div>
            ))}
          </div>
          {!config.hasGeminiKey && (
            <div className="connection-setup">
              <SourceLogo provider="gemini" />
              <div>
                <strong>Ready for Gemini</strong>
                <p>
                  The interactive sample is available now. Connect a private
                  Gemini account to enable live search and voice.
                </p>
                <a href="/setup.html" target="_blank" rel="noopener noreferrer">
                  Open connection guide <ExternalLink size={12} />
                </a>
              </div>
            </div>
          )}
          <details className="token-settings">
            <summary>
              Use your own Mapbox map
              <ChevronDown size={15} />
            </summary>
            <p>
              A public access token enables Mapbox maps and walking routes. Keep
              secret tokens on your server.
            </p>
            <label className="form-field">
              Public token
              <input
                type="password"
                autoComplete="off"
                value={tokenDraft}
                onChange={(e) => setTokenDraft(e.target.value)}
                placeholder="pk.…"
              />
            </label>
            <button
              className="button secondary"
              onClick={() => {
                if (tokenDraft && !tokenDraft.startsWith("pk."))
                  return notify("Use a public Mapbox token beginning with pk.");
                localStorage.setItem("turnside.mapbox", tokenDraft.trim());
                setMapToken(tokenDraft.trim());
                notify(
                  tokenDraft
                    ? "Mapbox token saved. The map will reconnect."
                    : "Using the default map.",
                );
              }}
            >
              Save map connection
            </button>
          </details>
          <div className="connections-footer">
            <span>
              {googleDerivedTrip
                ? "Google venue details stay in this session."
                : "Your itinerary is saved in this browser."}
            </span>
            <button onClick={() => openLink("/brand-kit/index.html")}>
              Brand kit
            </button>
            <button onClick={resetDemo}>Reset demo</button>
          </div>
        </Modal>
      )}
      {modal === "calendar" && (
        <Modal title="Add trip to your calendar" onClose={closeModal}>
          <div className="modal-heading">
            <span className="modal-symbol">
              <CalendarDays size={25} />
            </span>
            <div className="eyebrow">KEEP YOUR DAY IN VIEW</div>
            <h2>Meet you there.</h2>
            <p>Bring your itinerary into the calendar you already use.</p>
          </div>
          <button className="calendar-option" onClick={exportCalendar}>
            <span className="connection-icon">
              <ArrowDownToLine size={22} />
            </span>
            <div>
              <strong>Export the whole trip</strong>
              <p>Apple Calendar, Google Calendar, Outlook · .ics file</p>
            </div>
            <ArrowRight size={18} />
          </button>
          <h3 className="small-heading">Or add one stop to Google Calendar</h3>
          <div className="calendar-stop-list">
            {stops.map((s) => (
              <button key={s.id} onClick={() => calendarStop(s)}>
                <span>{s.time.replace(/^0/, "")}</span>
                <strong>{s.title}</strong>
                <ExternalLink size={14} />
              </button>
            ))}
          </div>
          <p className="form-note">
            Times use the destination’s time zone. Calendar reminders don’t
            include admission or confirmed reservations.
          </p>
        </Modal>
      )}
      {modal === "share" && (
        <Modal title="Share itinerary" onClose={closeModal}>
          <div className="modal-heading">
            <span className="modal-symbol">
              <MapPin size={25} />
            </span>
            <div className="eyebrow">A DAY WORTH SHARING</div>
            <h2>Bring someone along.</h2>
            <p>Copy the itinerary to share with your travel crew.</p>
          </div>
          <textarea
            className="share-preview"
            aria-label="Shareable itinerary"
            value={shareText}
            onChange={(e) => setShareText(e.target.value)}
            rows={12}
          />
          <button
            className="button primary full-button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(shareText);
                notify("Itinerary copied. Ready to share.");
              } catch {
                notify("Select the itinerary text to copy it.");
              }
            }}
          >
            <Check size={17} />
            Copy itinerary
          </button>
        </Modal>
      )}
      {modal === "booking" && selected && (
        <Modal title="Find tickets" onClose={closeModal}>
          <div className="modal-heading">
            <span className="modal-symbol">
              <Ticket size={25} />
            </span>
            <div className="eyebrow">MAKE IT PART OF YOUR DAY</div>
            <h2>
              {handoff
                ? "Your next step is ready."
                : "Let’s find your tickets."}
            </h2>
            <p>Book directly with the venue, with the details close by.</p>
          </div>
          <div className="booking-summary">
            <Photo place={selected} />
            <div>
              <h3>{selected.title}</h3>
              <p>
                {dateLabel(day.date, {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                })}{" "}
                · {selected.time}
              </p>
              <span>
                {selected.ticketCost ||
                  selected.estimatedCost ||
                  "Check provider pricing"}
              </span>
            </div>
          </div>
          {handoff ? (
            <div className="handoff-ready">
              <div className="handoff-state">
                <ExternalLink size={19} />
                <strong>Ready to continue · not booked</strong>
              </div>
              <p>
                {handoff.notes ||
                  "The provider will confirm available times, price, and payment. Nothing has been purchased."}
              </p>
              <a
                className="button primary full-button"
                href={handoff.bookingUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Continue with {handoff.providerName || "the venue"}
                <ExternalLink size={16} />
              </a>
              <p className="form-note">
                Saved under your booking links. A confirmation comes from the
                provider after checkout.
              </p>
            </div>
          ) : (
            <>
              <label className="form-field">
                People
                <select
                  value={partySize}
                  onChange={(e) => setPartySize(+e.target.value)}
                >
                  {[1, 2, 3, 4, 5, 6].map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
              </label>
              <div className="booking-explainer">
                <Ticket size={19} />
                <p>
                  We’ll open the official booking page. Choose an available time
                  and confirm the total with the provider.
                </p>
              </div>
              {formError && (
                <p className="form-error" role="alert">
                  {formError}
                </p>
              )}
              <button
                className="button primary full-button"
                disabled={busy}
                onClick={prepareBooking}
              >
                {busy ? "Finding the official link…" : "Prepare booking link"}
                <ArrowRight size={17} />
              </button>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}
function ArrowUpRightIcon() {
  return <ExternalLink size={12} />;
}
