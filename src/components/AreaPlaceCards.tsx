import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  Coffee,
  ExternalLink,
  MapPin,
  Plus,
  RefreshCw,
  Search,
  Star,
} from "lucide-react";
import type { AreaDiscoveryResponse, DiscoveryCard } from "../discoveryTypes";
import type { HeatmapArea, HeatmapCategory } from "../heatmapTypes";
import { fetchGooglePlaceDetails } from "../services/api";
import { applyGoogleDiscoveryEvidence } from "../discoveryEvidence";
export { applyGoogleDiscoveryEvidence } from "../discoveryEvidence";
import { SourceLogo } from "./SourceLogo";
import "./discovery.css";

const kindLabels = {
  coffee: "Coffee",
  shop: "Shops & design",
  food: "Food",
  culture: "Culture",
  outdoors: "Outdoors",
};
const dateLabel = (value: string) =>
  new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

function PlacePhoto({
  card,
  onOpen,
}: {
  card: DiscoveryCard;
  onOpen: (card: DiscoveryCard) => void;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <button
      className={`discovery-photo ${failed ? "photo-unavailable" : ""}`}
      onClick={() => onOpen(card)}
      aria-label={`Show ${card.name} on the map`}
    >
      {!failed ? (
        <img
          src={card.image.url}
          alt={card.image.alt}
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="photo-fallback">
          <Coffee size={24} />
          <span>Preview unavailable</span>
        </span>
      )}
      <span className="discovery-photo-kind">{kindLabels[card.kind]}</span>
      {!failed && (
        <span className="discovery-photo-credit">{card.image.label}</span>
      )}
      <span className="discovery-photo-arrow">
        <ArrowUpRight size={16} />
      </span>
    </button>
  );
}

export function AreaPlaceCards({
  area,
  category,
  onAdd,
  onOpen,
}: {
  area: HeatmapArea;
  category: HeatmapCategory;
  onAdd: (card: DiscoveryCard) => void;
  onOpen: (card: DiscoveryCard) => void;
}) {
  const [data, setData] = useState<AreaDiscoveryResponse | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [reload, setReload] = useState(0);
  const [lookup, setLookup] = useState<Record<string, "loading" | "done">>({});
  const [lookupErrors, setLookupErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setStatus("loading");
    setLookup({});
    setLookupErrors({});
    fetch(
      `/api/discover/area?areaId=${encodeURIComponent(area.id)}&category=${encodeURIComponent(category)}`,
      { signal: controller.signal },
    )
      .then(async (response) => {
        if (!response.ok)
          throw new Error("Neighborhood picks are unavailable.");
        const result = await response.json();
        if (
          !result.success ||
          result.areaId !== area.id ||
          !Array.isArray(result.cards)
        )
          throw new Error("Neighborhood picks are unavailable.");
        if (!controller.signal.aborted) {
          setData(result);
          setStatus("ready");
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus("error");
      });
    return () => controller.abort();
  }, [area.id, category, reload]);

  async function loadReviewSignal(card: DiscoveryCard) {
    setLookup((previous) => ({ ...previous, [card.id]: "loading" }));
    setLookupErrors((previous) => ({ ...previous, [card.id]: "" }));
    try {
      const place = await fetchGooglePlaceDetails({
        name: card.name + ", " + card.address,
        city: "New York",
      });
      const enriched = applyGoogleDiscoveryEvidence(card, place);
      setData((previous) =>
        previous?.areaId === card.areaId
          ? {
              ...previous,
              cards: previous.cards.map((candidate) =>
                candidate.id === card.id ? enriched : candidate,
              ),
            }
          : previous,
      );
      setLookup((previous) => ({ ...previous, [card.id]: "done" }));
    } catch (error: any) {
      const message =
        typeof error?.message === "string" &&
        error.message.includes("different name")
          ? error.message
          : "Google review data is unavailable here. Open Google Maps to check the venue.";
      setLookupErrors((previous) => ({ ...previous, [card.id]: message }));
      setLookup((previous) => ({ ...previous, [card.id]: "done" }));
    }
  }

  return (
    <section
      className="area-place-cards"
      aria-label={`Places to try in ${area.name}`}
    >
      <div className="discovery-section-heading">
        <div>
          <span className="discovery-eyebrow">MAKE IT YOUR KIND OF DAY</span>
          <h3>A few good detours</h3>
        </div>
        <span className="discovery-editorial-tag">Curated</span>
      </div>
      {status === "loading" && (
        <div className="discovery-loading" aria-live="polite">
          <div />
          <div />
          <span>Finding neighborhood picks…</span>
        </div>
      )}
      {status === "error" && (
        <div className="discovery-empty">
          <p>These neighborhood picks could not load.</p>
          <button onClick={() => setReload((value) => value + 1)}>
            <RefreshCw size={14} />
            Try again
          </button>
        </div>
      )}
      {status === "ready" && data && (
        <>
          <p className="discovery-intro">
            Coffee, smaller brands and places worth a pause. Venue sources
            checked {dateLabel(data.checkedAt)}.
          </p>
          {!data.cards.length && (
            <div className="discovery-empty">
              <p>No curated picks in this category yet.</p>
              <span>Try another category to explore this neighborhood.</span>
            </div>
          )}
          <div className="discovery-card-stack">
            {data.cards.map((card) => (
              <article className="discovery-place-card" key={card.id}>
                <PlacePhoto card={card} onOpen={onOpen} />
                <div className="discovery-card-content">
                  <div className="discovery-title-row">
                    <button
                      className="discovery-name"
                      onClick={() => onOpen(card)}
                    >
                      {card.name}
                    </button>
                    <span
                      className="discovery-verified"
                      title="Name and address checked against a venue source"
                    >
                      <Check size={11} />
                      Venue source
                    </span>
                  </div>
                  <p className="discovery-description">{card.description}</p>
                  <span className="discovery-address">
                    <MapPin size={12} />
                    {card.address.replace(
                      /, (New York|Brooklyn), NY \d{5}/,
                      "",
                    )}
                  </span>
                  <div className="discovery-tag-list">
                    {card.tags.map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))}
                  </div>
                  {card.popularity.status === "google-review-signal" && (
                    <div className="discovery-google-signal">
                      <SourceLogo provider="google" small />
                      <span>Google Maps</span>
                      <span>
                        {typeof card.popularity.rating === "number" && (
                          <>
                            <Star size={12} fill="currentColor" />{" "}
                            <strong>{card.popularity.rating.toFixed(1)}</strong>
                          </>
                        )}
                        {typeof card.popularity.reviewCount === "number" && (
                          <span>
                            {" "}
                            {typeof card.popularity.rating === "number"
                              ? "· "
                              : ""}
                            {card.popularity.reviewCount.toLocaleString()}{" "}
                            reviews
                          </span>
                        )}
                      </span>
                      <small>
                        {card.popularity.fetchedAt
                          ? `Retrieved ${dateLabel(card.popularity.fetchedAt)}`
                          : ""}
                      </small>
                    </div>
                  )}
                  <div className="discovery-actions">
                    <button
                      className="discovery-add"
                      onClick={() => onAdd(card)}
                    >
                      <Plus size={15} />
                      Add to day
                    </button>
                    <a
                      href={card.links.googleMaps}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="discovery-map-link"
                    >
                      <SourceLogo provider="google" small />
                      Maps
                      <ArrowUpRight size={13} />
                    </a>
                  </div>
                  <details className="discovery-evidence">
                    <summary>
                      <span>Why this pick & sources</span>
                      <ChevronDown size={13} />
                    </summary>
                    <div className="discovery-evidence-body">
                      <p>{card.reason}</p>
                      <div className="discovery-source-links">
                        <a
                          href={card.links.official}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Venue website
                          <ExternalLink size={12} />
                        </a>
                        <a
                          href={card.links.tiktokSearch}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          TikTok search
                          <ArrowUpRight size={12} />
                        </a>
                      </div>
                      {card.evidence.map((evidence) => (
                        <div
                          className="discovery-evidence-row"
                          key={evidence.id}
                        >
                          <div>
                            <strong>
                              {evidence.provider === "google" && (
                                <SourceLogo provider="google" small />
                              )}
                              {evidence.label}
                            </strong>
                            <span
                              className={`evidence-status ${evidence.status}`}
                            >
                              {evidence.status === "live"
                                ? "Retrieved"
                                : evidence.status === "verified-link"
                                  ? "Source checked"
                                  : "External link"}
                            </span>
                          </div>
                          <p>{evidence.detail}</p>
                          <a
                            href={evidence.url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            View source · {dateLabel(evidence.checkedAt)}
                            <ArrowUpRight size={11} />
                          </a>
                        </div>
                      ))}
                      <p className="discovery-signal-note">
                        {card.popularity.explanation}
                      </p>
                      <p className="discovery-image-note">
                        {card.image.attribution}
                      </p>
                      {card.popularity.status !== "google-review-signal" && (
                        <button
                          className="discovery-review-lookup"
                          onClick={() => loadReviewSignal(card)}
                          disabled={lookup[card.id] === "loading"}
                        >
                          <Search size={13} />
                          {lookup[card.id] === "loading"
                            ? "Checking Google Maps…"
                            : "Check Google review signal"}
                        </button>
                      )}
                      {lookupErrors[card.id] && (
                        <p className="discovery-lookup-error" role="status">
                          {lookupErrors[card.id]}
                        </p>
                      )}
                    </div>
                  </details>
                </div>
              </article>
            ))}
          </div>
          <p className="discovery-catalog-note">{data.notice}</p>
        </>
      )}
    </section>
  );
}
