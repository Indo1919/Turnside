import {
  ArrowRight,
  Check,
  Coffee,
  Compass,
  ChevronDown,
  MapPin,
  Mic,
  MicOff,
  Square,
  AudioLines,
  Plus,
  Send,
  ShoppingBag,
  Sparkles,
  TreePine,
  Volume2,
} from "lucide-react";
import type {
  Recommendation,
  RecommendationSource,
} from "../recommendationTypes";
import { SourceLogo } from "./SourceLogo";
import { placeImage } from "../demoData";
import type { useLiveConversation } from "../live/useLiveConversation";

export function ConversationView({
  city,
  connected,
  signInRequired,
  messages,
  input,
  onInput,
  onSend,
  busy,
  recommendations,
  selected,
  onSelect,
  onPreview,
  onPlan,
  planning,
  listening,
  voiceBusy,
  onVoice,
  onListen,
  voiceUrl,
  onConnect,
  onExplore,
  searchSuggestionsHtml,
  sources,
  onLocation,
  onCity,
  live,
  onStartLive,
}: {
  city: string;
  connected: boolean;
  signInRequired?: boolean;
  messages: { sender: string; text: string; source?: string }[];
  input: string;
  onInput: (s: string) => void;
  onSend: (s?: string) => void;
  busy: boolean;
  recommendations: Recommendation[];
  selected: string[];
  onSelect: (id: string) => void;
  onPreview: (p: Recommendation) => void;
  onPlan: () => void;
  planning: boolean;
  listening: boolean;
  voiceBusy: boolean;
  onVoice: () => void;
  onListen: (s: string) => void;
  voiceUrl: string | null;
  onConnect: () => void;
  onExplore: () => void;
  searchSuggestionsHtml?: string;
  sources?: RecommendationSource[];
  onLocation: () => void;
  onCity: () => void;
  live: ReturnType<typeof useLiveConversation>;
  onStartLive: () => void;
}) {
  const started = messages.length > 0;
  const inNewYork = /new york|nyc/i.test(city);
  const lastReply = [...messages]
    .reverse()
    .find((m) => m.sender === "concierge");
  return (
    <div className={`conversation-view ${started ? "has-conversation" : ""}`}>
      <div className="conversation-context">
        <button
          className="conversation-city"
          onClick={onCity}
          aria-label="Choose destination"
        >
          <MapPin size={13} />
          {city}
          <ChevronDown size={12} />
        </button>
        <button
          onClick={onLocation}
          title="Use your location for Gemini nearby recommendations"
        >
          <Compass size={13} />
          Near me
        </button>
      </div>
      {!started ? (
        <>
          <div className="conversation-hero">
            <span className="intro-pill">
              <Sparkles size={13} />A little less planning. A little more
              living.
            </span>
            <h1>
              A good day,
              <br />
              <span>your way.</span>
            </h1>
            <p>
              Tell us what you're in the mood for.
              <br />
              We’ll find the places and put it all together.
            </p>
          </div>
          <div className="starter-prompts">
            <button
              onClick={() =>
                onSend(
                  `Find independent coffee shops and a bookstore around ${inNewYork ? "Greenwich Village, New York" : city}. I have a relaxed afternoon.`,
                )
              }
            >
              <span className="prompt-icon coffee">
                <Coffee size={19} />
              </span>
              <span>
                <strong>Coffee & quiet corners</strong>
                <small>Small spots. Good stories.</small>
              </span>
              <ArrowRight size={16} />
            </button>
            <button
              onClick={() =>
                onSend(
                  `Show me interesting shops and brands in ${inNewYork ? "SoHo, New York" : city}, with source evidence for your recommendations.`,
                )
              }
            >
              <span className="prompt-icon shops">
                <ShoppingBag size={19} />
              </span>
              <span>
                <strong>A little off the usual route</strong>
                <small>Shops, finds, and a good detour.</small>
              </span>
              <ArrowRight size={16} />
            </button>
            <button
              onClick={() =>
                onSend(
                  `Plan a spontaneous afternoon in ${city} with a park, a cultural stop, and something good to eat.`,
                )
              }
            >
              <span className="prompt-icon outdoors">
                <TreePine size={19} />
              </span>
              <span>
                <strong>Let the afternoon unfold</strong>
                <small>Fresh air. Room to wander.</small>
              </span>
              <ArrowRight size={16} />
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="conversation-results-heading">
            <span className="eyebrow">LET’S MAKE IT YOUR DAY</span>
            <h1>A few good turns.</h1>
          </div>
          <div className="inline-conversation" aria-live="polite">
            {messages.slice(-4).map((m, i) => (
              <div className={`inline-message ${m.sender}`} key={i}>
                {m.sender === "concierge" && (
                  <span className="reply-avatar">
                    <SourceLogo
                      provider={m.source === "gemini" ? "gemini" : "turnside"}
                      small
                    />
                  </span>
                )}
                <p>{m.text}</p>
              </div>
            ))}
            {busy && (
              <div className="inline-thinking">
                <span />
                <span />
                <span />
                Finding your kind of places…
              </div>
            )}
          </div>
          {!!sources?.length && (
            <div className="conversation-sources">
              {sources.slice(0, 6).map((s, i) => (
                <a
                  key={i}
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <SourceLogo
                    provider={
                      s.provider.startsWith("Google") ? "google" : "turnside"
                    }
                    small
                  />
                  <span>
                    {s.name}
                    <small>{s.provider}</small>
                  </span>
                  <ArrowRight size={12} />
                </a>
              ))}
            </div>
          )}
          {recommendations.length > 0 && (
            <>
              <div className="recommendation-heading">
                <strong>Picked for your day</strong>
                <span>{recommendations.length} places</span>
              </div>
              <div className="conversation-recommendations">
                {recommendations.map((p) => {
                  const google = p.source !== "editorial-demo";
                  const canAdd = !!p.coordinates;
                  const icon =
                    p.category === "cafe"
                      ? Coffee
                      : p.category === "nature"
                        ? TreePine
                        : p.category === "niche"
                          ? ShoppingBag
                          : Compass;
                  const Icon = icon;
                  return (
                    <article
                      className={`conversation-place ${selected.includes(p.id) ? "chosen" : ""}`}
                      key={p.id}
                    >
                      <button
                        className="conversation-place-photo"
                        onClick={() => onPreview(p)}
                        aria-label={`Preview ${p.title}`}
                      >
                        <img
                          src={placeImage(p)}
                          alt={`${p.categoryLabel} mood photo`}
                          loading="lazy"
                        />
                        <span>Mood photo</span>
                      </button>
                      <div className="conversation-place-body">
                        <div className="conversation-place-label">
                          <Icon size={12} />
                          {p.categoryLabel}
                          <span>· {p.durationMinutes} min</span>
                        </div>
                        <button
                          className="conversation-place-title"
                          onClick={() => onPreview(p)}
                        >
                          {p.title}
                          <ArrowRight size={14} />
                        </button>
                        <p>{p.reason || p.description}</p>
                        <div className="conversation-place-bottom">
                          <a
                            href={
                              p.googleMapsUri || p.sourceUrl || p.websiteUri
                            }
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <SourceLogo
                              provider={google ? "google" : "turnside"}
                              small
                            />
                            {p.sourceLabel || "Editorial pick"}
                          </a>
                          <button
                            onClick={() => onSelect(p.id)}
                            disabled={!canAdd}
                            aria-pressed={selected.includes(p.id)}
                            aria-label={`${selected.includes(p.id) ? "Remove" : "Choose"} ${p.title}`}
                          >
                            {selected.includes(p.id) ? (
                              <Check size={16} />
                            ) : (
                              <Plus size={16} />
                            )}
                          </button>
                        </div>
                        {!canAdd && (
                          <small className="location-needed">
                            Explore on Google Maps · location confirmation
                            needed to add.
                          </small>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
              <button
                className="button primary conversation-build"
                onClick={onPlan}
                disabled={planning || selected.length === 0}
              >
                {planning ? "Putting your day together…" : "Make this my day"}
                <span>{selected.length} selected</span>
                <ArrowRight size={17} />
              </button>
              <p className="plan-footnote">
                You can move, swap, or add a detour anytime.
              </p>
            </>
          )}
          {searchSuggestionsHtml && (
            <iframe
              className="search-grounding"
              title="Google Search source suggestions"
              srcDoc={searchSuggestionsHtml}
              sandbox="allow-popups allow-popups-to-escape-sandbox"
            />
          )}
        </>
      )}
      <div className="conversation-composer-wrap">
        <div className={`live-conversation ${live.status}`}>
          {live.status === "live" ||
          live.status === "connecting" ||
          live.status === "reconnecting" ? (
            <>
              <div className="live-state">
                <span
                  className="voice-level"
                  style={{ transform: `scale(${1 + live.level * 1.2})` }}
                />
                <span>
                  <strong>
                    {live.status === "connecting"
                      ? "Connecting Gemini…"
                      : live.status === "reconnecting"
                        ? "Reconnecting…"
                        : live.speaking
                          ? "Gemini is speaking"
                          : live.muted
                            ? "Microphone paused"
                            : "Listening to you"}
                  </strong>
                  <small>Live conversation</small>
                </span>
              </div>
              <div className="live-actions">
                {live.speaking && (
                  <button
                    onClick={live.interrupt}
                    aria-label="Interrupt Gemini"
                  >
                    <AudioLines size={16} />
                  </button>
                )}
                <button
                  onClick={live.toggleMute}
                  aria-label={
                    live.muted ? "Unmute microphone" : "Mute microphone"
                  }
                >
                  {live.muted ? <MicOff size={16} /> : <Mic size={16} />}
                </button>
                <button onClick={live.stop} aria-label="End voice conversation">
                  <Square size={14} />
                </button>
              </div>
              {live.caption && (
                <p className="live-caption" aria-live="polite">
                  {live.caption.text}
                </p>
              )}
            </>
          ) : signInRequired ? (
            <a
              className="start-live"
              href="/signin-with-chatgpt?returnTo=%2F"
              target="_top"
            >
              <AudioLines size={18} />
              <span>Sign in to use Gemini</span>
              <ArrowRight size={16} />
            </a>
          ) : (
            <button className="start-live" onClick={onStartLive}>
              <AudioLines size={18} />
              <span>Talk with Gemini</span>
              <span className="live-label">Live voice</span>
            </button>
          )}
          {live.error && (
            <p className="live-error" role="alert">
              {live.error}
            </p>
          )}
        </div>
        <form
          className={`conversation-composer ${listening ? "is-recording" : ""}`}
          onSubmit={(e) => {
            e.preventDefault();
            onSend();
          }}
        >
          <textarea
            rows={2}
            value={input}
            onChange={(e) => onInput(e.target.value)}
            placeholder={
              listening
                ? "Listening… tap the microphone to finish."
                : "Coffee, culture, or something unexpected…"
            }
            aria-label="Tell Turnside what you want to do"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSend();
              }
            }}
          />
          <div className="composer-controls">
            <span className="composer-provider">
              <SourceLogo provider={connected ? "gemini" : "turnside"} small />
              {connected ? "Gemini 3.8" : "Sample conversation"}
            </span>
            <button
              type="button"
              className={`composer-mic ${listening ? "recording" : ""}`}
              aria-label={
                listening ? "Stop recording" : "Use Gemini voice input"
              }
              onClick={onVoice}
              disabled={voiceBusy}
            >
              <Mic size={18} />
            </button>
            <button
              className="composer-send"
              disabled={!input.trim() || busy}
              aria-label="Send request"
            >
              <Send size={17} />
            </button>
          </div>
        </form>
        <div className="composer-caption">
          {connected ? (
            "Find places. Make a plan. Leave room for a detour."
          ) : (
            <>
              <span>Live conversation & voice use Gemini.</span>
              <button onClick={onConnect}>
                Connect Gemini
                <ArrowRight size={11} />
              </button>
            </>
          )}
        </div>
        {lastReply && (
          <button
            className="conversation-listen"
            onClick={() => onListen(lastReply.text)}
            disabled={voiceBusy}
          >
            <Volume2 size={13} />
            {voiceBusy
              ? "Preparing Gemini voice…"
              : "Listen to your recommendations"}
          </button>
        )}
        {voiceUrl && (
          <audio className="conversation-audio" controls src={voiceUrl} />
        )}
      </div>
    </div>
  );
}
