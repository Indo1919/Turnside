import type { ReactNode } from "react";
import {
  ArrowRight,
  Check,
  ChevronRight,
  ExternalLink,
  Flame,
  Info,
  MapPin,
  RefreshCw,
  SlidersHorizontal,
  Utensils,
  X,
} from "lucide-react";
import { SourceLogo } from "./SourceLogo";
import type {
  AreaHeatmapResponse,
  HeatmapArea,
  HeatmapCategory,
} from "../heatmapTypes";
const labels: Record<HeatmapCategory, string> = {
  all: "All places",
  food: "Food scene",
  culture: "Culture",
  outdoors: "Outdoors",
};
const plural = (n: number) => n.toLocaleString();
export function HeatControls({
  visible,
  onToggle,
  category,
  onCategory,
  data,
  loading,
  onShow,
}: {
  visible: boolean;
  onToggle: () => void;
  category: HeatmapCategory;
  onCategory: (c: HeatmapCategory) => void;
  data: AreaHeatmapResponse | null;
  loading: boolean;
  onShow: () => void;
}) {
  return (
    <div className="heat-controls glass">
      <div className="heat-control-top">
        <button
          className={visible ? "heat-switch active" : "heat-switch"}
          onClick={onToggle}
          aria-pressed={visible}
        >
          <Flame size={16} />
          <span>Hot areas</span>
          <span className="toggle-track">
            <span />
          </span>
        </button>
        <button
          className="heat-info-button"
          onClick={onShow}
          aria-label="How hot areas work"
        >
          <Info size={15} />
        </button>
      </div>
      {visible && (
        <>
          <div className="heat-control-filters">
            {(Object.keys(labels) as HeatmapCategory[]).map((c) => (
              <button
                key={c}
                className={c === category ? "active" : ""}
                onClick={() => onCategory(c)}
                disabled={!!data && !data.supportedCategories.includes(c)}
              >
                {c === "all" ? "All" : labels[c]}
              </button>
            ))}
          </div>
          <div className="heat-control-caption">
            <span
              className={`status-dot ${data?.source === "public-data" || data?.source === "mixed" ? "live" : ""}`}
            />
            {loading
              ? "Connecting public data…"
              : data?.source === "public-data"
                ? "Public data · place density"
                : data?.source === "mixed"
                  ? "Public data + editorial sample"
                  : "Editorial sample · place density"}
          </div>
        </>
      )}
    </div>
  );
}
export function HeatPanel({
  data,
  category,
  onCategory,
  selectedId,
  onSelect,
  loading,
  onRefresh,
}: {
  data: AreaHeatmapResponse | null;
  category: HeatmapCategory;
  onCategory: (c: HeatmapCategory) => void;
  selectedId: string | null;
  onSelect: (area: HeatmapArea) => void;
  loading: boolean;
  onRefresh: () => void;
}) {
  const areas = [...(data?.areas || [])].sort(
    (a, b) => b.scores[category] - a.scores[category],
  );
  return (
    <>
      <div className="panel-section-heading">
        <div className="eyebrow coral-text">FOLLOW THE LOCAL SCENE</div>
        <h2>Find your kind of area.</h2>
        <p>See where places cluster. Then choose a turn that feels like you.</p>
      </div>
      <div className="area-filters">
        {(Object.keys(labels) as HeatmapCategory[]).map((c) => (
          <button
            key={c}
            className={c === category ? "active" : ""}
            onClick={() => onCategory(c)}
            disabled={!!data && !data.supportedCategories.includes(c)}
          >
            {labels[c]}
          </button>
        ))}
      </div>
      <div className="heat-trust-strip">
        <SourceLogo provider="nyc-open-data" small />
        <div>
          <strong>
            {loading
              ? "Checking public datasets…"
              : data?.source === "public-data"
                ? "Built with NYC public data"
                : data?.source === "mixed"
                  ? "Public data & editorial samples"
                  : "Editorial demo signal"}
          </strong>
          <span>Tap any area to see what’s behind the glow.</span>
        </div>
        <button
          className="mini-icon"
          onClick={onRefresh}
          aria-label="Refresh area data"
          disabled={loading}
        >
          <RefreshCw size={14} className={loading ? "spinning" : ""} />
        </button>
      </div>
      {!areas.length && (
        <div className="empty-state">
          <MapPin size={26} />
          <h3>
            {loading
              ? "Finding the local scene…"
              : "No area data for this city yet"}
          </h3>
          <p>
            {loading
              ? "Connecting to public place datasets."
              : "The New York demo includes neighborhood activity windows. Try New York to explore them."}
          </p>
        </div>
      )}
      <div className="area-list">
        {areas.map((area, i) => (
          <button
            key={area.id}
            className={`area-card ${selectedId === area.id ? "selected" : ""}`}
            onClick={() => onSelect(area)}
          >
            <div className="area-card-top">
              <span className="area-index">0{i + 1}</span>
              <span
                className={`area-signal ${area.scores[category] >= 70 ? "strong" : ""}`}
              >
                <span />
                {area.scores[category] >= 70
                  ? "More to explore"
                  : area.scores[category] > 0
                    ? "Worth a wander"
                    : "No mapped signal"}
              </span>
              <ChevronRight size={16} />
            </div>
            <h3>{area.name}</h3>
            <p>{area.summary}</p>
            <div className="area-density-track">
              <span style={{ width: `${area.scores[category]}%` }} />
            </div>
            <div className="area-card-bottom">
              <span>
                <MapPin size={11} />
                {plural(area.counts[category])}{" "}
                {category === "food"
                  ? "food places"
                  : category === "culture"
                    ? "cultural places"
                    : category === "outdoors"
                      ? "outdoor places"
                      : "mapped places"}
              </span>
              <span>
                {area.sourceKind === "public"
                  ? "Public data"
                  : area.sourceKind === "sample"
                    ? "Sample"
                    : area.sourceKind === "mixed"
                      ? "Public + sample"
                      : "Unavailable"}
              </span>
            </div>
          </button>
        ))}
      </div>
      <div className="density-note">
        <Info size={14} />
        <p>
          Color compares place density across the areas shown. It doesn’t
          measure live crowds or popularity. Windows are approximate and may
          overlap.
        </p>
      </div>
    </>
  );
}
export function HeatDetail({
  area,
  data,
  category,
  onClose,
  onGoogle,
  children,
}: {
  area: HeatmapArea;
  data: AreaHeatmapResponse;
  category: HeatmapCategory;
  onClose: () => void;
  onGoogle: () => void;
  children?: ReactNode;
}) {
  const sources = data.sources.filter(
    (s) =>
      area.sourceIds.includes(s.id) &&
      (category === "all" || s.category === category),
  );
  return (
    <article
      className="area-detail glass"
      aria-label={`Area details: ${area.name}`}
    >
      <div className="area-detail-hero">
        <div className="area-hero-contour contour-one" />
        <div className="area-hero-contour contour-two" />
        <div className="area-hero-contour contour-three" />
        <span className="area-hero-label">
          <Flame size={13} />
          NEIGHBORHOOD SIGNAL
        </span>
        <button
          className="detail-dismiss"
          aria-label="Close area details"
          onClick={onClose}
        >
          <X size={16} />
        </button>
        <div className="area-hero-title">
          <h2>{area.name}</h2>
          <span>
            {labels[category]} ·{" "}
            {area.sourceKind === "public"
              ? "public dataset"
              : area.sourceKind === "sample"
                ? "editorial sample"
                : area.sourceKind === "mixed"
                  ? "public + sample"
                  : "unavailable"}
          </span>
        </div>
      </div>
      <div className="area-detail-body">
        {children}
        <p>{area.summary}</p>
        <div className="area-metrics">
          <div>
            <strong>{plural(area.counts[category])}</strong>
            <span>
              {category === "food" ? "food places" : "places in this window"}
            </span>
          </div>
          <div>
            <strong>
              {Math.round(area.densities[category]).toLocaleString()}
              <small>/km²</small>
            </strong>
            <span>place density</span>
          </div>
        </div>
        <div className="source-section-title">
          <span>WHAT’S BEHIND THE GLOW</span>
          <Info size={13} />
        </div>
        <p className="area-retrieved">
          Retrieved{" "}
          {new Date(data.fetchedAt).toLocaleString("en-US", {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })}{" "}
          · inventory dates in method
        </p>
        <details className="area-source-disclosure">
          <summary>
            <SourceLogo provider="nyc-open-data" small />
            Area density sources
            <ChevronRight size={13} />
          </summary>
          <div className="area-source-list">
            {sources.map((source) => (
              <a
                key={source.id}
                href={source.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="area-source-row"
              >
                <SourceLogo provider={source.logoKey} />
                <div>
                  <strong>{source.provider}</strong>
                  <span>
                    {(area.sourceCounts[source.id] || 0).toLocaleString()}{" "}
                    records · {source.metricLabel} ·{" "}
                    {source.kind === "public"
                      ? "Public dataset"
                      : source.kind === "sample"
                        ? "Editorial sample"
                        : "Unavailable"}
                  </span>
                </div>
                <ExternalLink size={13} />
              </a>
            ))}
          </div>
        </details>
        <details className="source-method">
          <summary>
            How this signal is calculated
            <ChevronRight size={13} />
          </summary>
          <p>{data.explanation}</p>
          {sources.map((s) => (
            <p key={s.id}>
              <strong>{s.name}</strong>
              <br />
              {s.explanation}
              <br />
              {s.kind === "public" ? "Retrieved" : "Sample prepared"}{" "}
              {new Date(s.fetchedAt).toLocaleString("en-US", {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
              .{" "}
              {s.datasetUpdatedAt
                ? `Dataset updated ${new Date(s.datasetUpdatedAt).toLocaleDateString()}.`
                : ""}
            </p>
          ))}
        </details>
        <button
          className="button secondary google-area-button"
          onClick={onGoogle}
        >
          <SourceLogo provider="google" small />
          Explore on Google Maps
          <ArrowRight size={15} />
        </button>
        <p className="area-detail-disclaimer">
          Place counts indicate choice, not live busyness. Google Maps is a
          separate map view.
        </p>
      </div>
    </article>
  );
}
