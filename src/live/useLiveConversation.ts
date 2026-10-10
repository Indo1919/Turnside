import { useCallback, useEffect, useRef, useState } from "react";
import type { LiveConnectConfig, LiveServerMessage } from "@google/genai";
import type { RecommendationResponse } from "../recommendationTypes";
import type { TripPlan } from "../types";
import { LiveAudioOutput, startLiveRecorder, type LiveRecorder } from "./audio";
import { openLiveConnection, type LiveConnection } from "./connection";

export type LiveConversationStatus =
  "idle" | "connecting" | "live" | "reconnecting" | "error";
export interface LiveCaption {
  who: "agent" | "user";
  text: string;
  final: boolean;
}
export interface LivePlanResponse {
  success: boolean;
  data: TripPlan;
  source: string;
  notice?: string;
}
export interface LiveToolState {
  name: string;
  status: "running" | "complete" | "error" | "cancelled";
}
export interface LiveConversationOptions {
  city: string;
  contextSummary?: string;
  onDiscovery?: (response: RecommendationResponse) => void;
  onPlan?: (plan: TripPlan, response: LivePlanResponse) => void;
  onTranscript?: (caption: LiveCaption) => void;
  onToolState?: (tool: LiveToolState) => void;
}
interface LiveSessionResponse {
  success: boolean;
  token: string;
  model: string;
  apiVersion: string;
  expiresAt?: string;
  newSessionExpiresAt?: string;
  liveConfig: LiveConnectConfig;
}

async function post<T>(
  url: string,
  body: unknown,
  signal: AbortSignal,
  timeout = 45000,
): Promise<T> {
  signal.throwIfAborted();
  const request = new AbortController();
  const cancel = () => request.abort(signal.reason);
  signal.addEventListener("abort", cancel, { once: true });
  const timer = window.setTimeout(
    () =>
      request.abort(
        new Error("The connection is taking longer than expected. Try again."),
      ),
    timeout,
  );
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: request.signal,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.success === false)
      throw new Error(
        data.error || "The travel service could not complete this request.",
      );
    return data as T;
  } catch (error) {
    if (
      request.signal.aborted &&
      !signal.aborted &&
      request.signal.reason instanceof Error
    )
      throw request.signal.reason;
    throw error;
  } finally {
    window.clearTimeout(timer);
    signal.removeEventListener("abort", cancel);
  }
}

function readableError(error: unknown): string {
  if (error instanceof DOMException && error.name === "NotAllowedError")
    return "Microphone access is off. Allow it in your browser settings, then try again.";
  if (error instanceof DOMException && error.name === "NotFoundError")
    return "No microphone was found. Connect one and try again.";
  return error instanceof Error
    ? error.message
    : "Voice could not connect. Try again.";
}

/**
 * A real Gemini Live conversation, started only by an explicit user gesture.
 * The browser receives a short-lived auth_tokens token; provider keys stay on the server.
 */
export function useLiveConversation(options: LiveConversationOptions) {
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const mounted = useRef(true);
  const [status, setStatus] = useState<LiveConversationStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [level, setLevel] = useState(0);
  const [caption, setCaption] = useState<LiveCaption | null>(null);
  const captionRef = useRef<LiveCaption | null>(null);
  const transcriptBuffers = useRef<
    Partial<Record<LiveCaption["who"], LiveCaption>>
  >({});
  const active = useRef(false);
  const generation = useRef(0);
  const connectionEpoch = useRef(0);
  const session = useRef<LiveConnection | null>(null);
  const recorder = useRef<LiveRecorder | null>(null);
  const output = useRef<LiveAudioOutput | null>(null);
  const lifetime = useRef<AbortController | null>(null);
  const resumeHandle = useRef<string | null>(null);
  const mutedRef = useRef(false);
  const reconnectCount = useRef(0);
  const reconnectPromise = useRef<Promise<void> | null>(null);
  const reconnectTimer = useRef<number | null>(null);
  const reconnectWake = useRef<(() => void) | null>(null);
  const toolQueue = useRef<Promise<void>>(Promise.resolve());
  const toolRequests = useRef(new Map<string, AbortController>());
  const cancelledCalls = useRef(new Set<string>());
  const reconnectRef = useRef<() => Promise<void>>(async () => {});

  const alive = (run: number) =>
    active.current && generation.current === run && mounted.current;

  const teardown = useCallback(() => {
    active.current = false;
    generation.current++;
    connectionEpoch.current++;
    lifetime.current?.abort();
    lifetime.current = null;
    for (const request of toolRequests.current.values()) request.abort();
    toolRequests.current.clear();
    cancelledCalls.current.clear();
    if (reconnectTimer.current !== null)
      window.clearTimeout(reconnectTimer.current);
    reconnectTimer.current = null;
    reconnectWake.current?.();
    reconnectWake.current = null;
    reconnectPromise.current = null;
    const previous = session.current;
    session.current = null;
    try {
      previous?.close();
    } catch {
      /* The socket may already be closed. */
    }
    recorder.current?.stop();
    recorder.current = null;
    output.current?.close();
    output.current = null;
    resumeHandle.current = null;
    if (mounted.current) {
      setSpeaking(false);
      setLevel(0);
    }
  }, []);

  const fail = (reason: unknown) => {
    teardown();
    if (mounted.current) {
      setError(readableError(reason));
      setStatus("error");
    }
  };

  const showTranscript = (
    who: LiveCaption["who"],
    text: string,
    final = false,
  ) => {
    const previous = transcriptBuffers.current[who];
    const next = {
      who,
      text: (previous?.who === who && !previous.final
        ? previous.text + text
        : text.trimStart()
      ).slice(-4000),
      final,
    };
    captionRef.current = next;
    transcriptBuffers.current[who] = next;
    setCaption(next);
    optionsRef.current.onTranscript?.(next);
  };

  const runTools = (message: LiveServerMessage, run: number, epoch: number) => {
    for (const call of message.toolCall?.functionCalls || []) {
      const id = call.id || crypto.randomUUID();
      const name = call.name || "";
      toolQueue.current = toolQueue.current
        .catch(() => {})
        .then(async () => {
          if (
            !alive(run) ||
            connectionEpoch.current !== epoch ||
            cancelledCalls.current.has(id)
          )
            return;
          const controller = new AbortController();
          const cancel = () => controller.abort();
          const signal = lifetime.current!.signal;
          signal.addEventListener("abort", cancel, { once: true });
          toolRequests.current.set(id, controller);
          optionsRef.current.onToolState?.({ name, status: "running" });
          let modelResult: Record<string, unknown>;
          const args = call.args || {};
          try {
            if (name === "discover_places") {
              if (typeof args.query !== "string" || !args.query.trim())
                throw new Error("A place search needs a query.");
              const result = await post<RecommendationResponse>(
                "/api/discover",
                {
                  query: args.query.slice(0, 2000),
                  city:
                    typeof args.city === "string"
                      ? args.city
                      : optionsRef.current.city,
                  forceDemo: false,
                },
                controller.signal,
              );
              if (
                controller.signal.aborted ||
                !alive(run) ||
                connectionEpoch.current !== epoch
              )
                return;
              optionsRef.current.onDiscovery?.(result);
              // Preserve provider identity, citations and fallback notices in the model result.
              modelResult = {
                ...result,
                searchSuggestionsHtml: undefined,
                mapsWidgetContextToken: undefined,
              };
            } else if (name === "create_plan") {
              if (
                !Array.isArray(args.preferredPlaceIds) ||
                !args.preferredPlaceIds.length
              ) {
                throw new Error(
                  "Ask the traveler to select recommended places before creating their itinerary.",
                );
              }
              const result = await post<LivePlanResponse>(
                "/api/gemini/plan",
                {
                  destination:
                    typeof args.destination === "string"
                      ? args.destination
                      : optionsRef.current.city,
                  durationDays: Math.min(
                    3,
                    Math.max(1, Math.floor(Number(args.durationDays) || 1)),
                  ),
                  pacing: ["relaxed", "balanced", "fast"].includes(
                    String(args.pacing),
                  )
                    ? args.pacing
                    : "balanced",
                  preferredPlaceIds: Array.isArray(args.preferredPlaceIds)
                    ? args.preferredPlaceIds
                        .filter((id) => typeof id === "string")
                        .slice(0, 24)
                    : undefined,
                  startDate:
                    typeof args.startDate === "string" &&
                    /^\d{4}-\d{2}-\d{2}$/.test(args.startDate)
                      ? args.startDate
                      : undefined,
                  travelerNote: optionsRef.current.contextSummary?.slice(
                    0,
                    3000,
                  ),
                  forceDemo: false,
                },
                controller.signal,
              );
              if (!result.data)
                throw new Error("The planning service returned no itinerary.");
              if (
                controller.signal.aborted ||
                !alive(run) ||
                connectionEpoch.current !== epoch
              )
                return;
              optionsRef.current.onPlan?.(result.data, result);
              modelResult = { ...result };
            } else {
              throw new Error(
                `The ${name || "requested"} action is not supported.`,
              );
            }
            optionsRef.current.onToolState?.({ name, status: "complete" });
          } catch (reason) {
            if (
              controller.signal.aborted ||
              !alive(run) ||
              connectionEpoch.current !== epoch
            ) {
              if (alive(run))
                optionsRef.current.onToolState?.({ name, status: "cancelled" });
              return;
            }
            optionsRef.current.onToolState?.({ name, status: "error" });
            modelResult = {
              success: false,
              error: readableError(reason),
              instruction:
                "Explain this failure to the user. Do not claim that a plan, search or booking succeeded.",
            };
          } finally {
            signal.removeEventListener("abort", cancel);
            toolRequests.current.delete(id);
          }
          if (
            alive(run) &&
            connectionEpoch.current === epoch &&
            !cancelledCalls.current.has(id)
          ) {
            try {
              session.current?.sendToolResponse({
                functionResponses: [{ id, name, response: modelResult }],
              });
            } catch {
              void reconnectRef.current();
            }
          }
        });
    }
  };

  const handleMessage = (
    message: LiveServerMessage,
    run: number,
    epoch: number,
  ) => {
    if (!alive(run) || connectionEpoch.current !== epoch) return;
    const content = message.serverContent;
    if (content?.interrupted) output.current?.interrupt();
    for (const part of content?.modelTurn?.parts || []) {
      if (
        part.inlineData?.data &&
        part.inlineData.mimeType?.startsWith("audio/")
      ) {
        const rate =
          Number(part.inlineData.mimeType.match(/rate=(\d+)/)?.[1]) || 24000;
        if (rate >= 8000 && rate <= 96000) {
          try {
            output.current?.play(part.inlineData.data, rate);
          } catch {
            /* Ignore a malformed audio packet. */
          }
        }
      }
    }
    if (
      content?.inputTranscription?.text ||
      content?.inputTranscription?.finished
    )
      showTranscript(
        "user",
        content.inputTranscription.text || "",
        !!content.inputTranscription.finished,
      );
    if (
      content?.outputTranscription?.text ||
      content?.outputTranscription?.finished
    )
      showTranscript(
        "agent",
        content.outputTranscription.text || "",
        !!content.outputTranscription.finished,
      );
    if (content?.turnComplete) {
      for (const who of ["user", "agent"] as const) {
        const pending = transcriptBuffers.current[who];
        if (pending && !pending.final) {
          const complete = { ...pending, final: true };
          transcriptBuffers.current[who] = complete;
          optionsRef.current.onTranscript?.(complete);
          if (captionRef.current?.who === who) {
            captionRef.current = complete;
            setCaption(complete);
          }
        }
      }
    }
    for (const id of message.toolCallCancellation?.ids || []) {
      cancelledCalls.current.add(id);
      toolRequests.current.get(id)?.abort();
    }
    if (message.toolCall) runTools(message, run, epoch);
    if (
      message.sessionResumptionUpdate?.resumable &&
      message.sessionResumptionUpdate.newHandle
    ) {
      resumeHandle.current = message.sessionResumptionUpdate.newHandle;
    }
    if (message.goAway) void reconnectRef.current();
  };

  const mintSession = (signal: AbortSignal) =>
    post<LiveSessionResponse>(
      "/api/live/session",
      {
        city: optionsRef.current.city,
        contextSummary: optionsRef.current.contextSummary || "",
      },
      signal,
      20000,
    );

  const connect = async (
    setup: LiveSessionResponse,
    handle: string | null,
    run: number,
  ) => {
    if (
      !setup.token?.startsWith("auth_tokens/") ||
      !setup.model ||
      !setup.liveConfig
    ) {
      throw new Error(
        "The voice service did not provide a valid temporary session.",
      );
    }
    if (!alive(run)) return;
    const epoch = ++connectionEpoch.current;
    let connected: LiveConnection | null = null;
    let closedBeforeReady = false;
    connected = await openLiveConnection({
      token: setup.token,
      model: setup.model,
      apiVersion: setup.apiVersion || "v1beta",
      signal: lifetime.current!.signal,
      config: {
        ...setup.liveConfig,
        ...(handle ? { sessionResumption: { handle } } : {}),
      },
      onMessage: (message) => handleMessage(message, run, epoch),
      onUnexpectedClose: () => {
        if (!connected) closedBeforeReady = true;
        else if (
          session.current === connected &&
          alive(run) &&
          connectionEpoch.current === epoch
        )
          void reconnectRef.current();
      },
    });
    if (!alive(run) || epoch !== connectionEpoch.current) {
      connected.close();
      return;
    }
    if (closedBeforeReady) {
      connected.close();
      throw new Error("Voice could not establish a connection. Try again.");
    }
    session.current = connected;
    if (!handle)
      connected.sendClientContent({
        turns: [
          {
            role: "user",
            parts: [
              {
                text: `Begin our travel planning conversation for ${optionsRef.current.city}. Briefly greet me and ask one useful question about what I want to do. Current context: ${optionsRef.current.contextSummary || "No itinerary yet."}`,
              },
            ],
          },
        ],
        turnComplete: true,
      });
    recorder.current?.setMuted(mutedRef.current);
    setError(null);
    setStatus("live");
  };

  reconnectRef.current = () => {
    if (!active.current || reconnectPromise.current)
      return reconnectPromise.current || Promise.resolve();
    const run = generation.current;
    const work = (async () => {
      if (!alive(run)) return;
      setStatus("reconnecting");
      output.current?.interrupt();
      const previous = session.current;
      session.current = null;
      connectionEpoch.current++;
      for (const request of toolRequests.current.values()) request.abort();
      try {
        previous?.close();
      } catch {
        /* Already closed. */
      }
      while (alive(run) && reconnectCount.current < 3) {
        const attempt = ++reconnectCount.current;
        await new Promise<void>((resolve) => {
          reconnectWake.current = resolve;
          reconnectTimer.current = window.setTimeout(() => {
            reconnectTimer.current = null;
            reconnectWake.current = null;
            resolve();
          }, attempt * 700);
        });
        if (!alive(run)) return;
        try {
          const setup = await mintSession(lifetime.current!.signal);
          try {
            await connect(setup, resumeHandle.current, run);
          } catch (reason) {
            if (!resumeHandle.current || !alive(run)) throw reason;
            resumeHandle.current = null;
            await connect(
              await mintSession(lifetime.current!.signal),
              null,
              run,
            );
          }
          return;
        } catch {
          /* Try the next bounded reconnection if the call is still active. */
        }
      }
      if (alive(run))
        fail(
          new Error(
            "Voice lost its connection. Start a new conversation to reconnect.",
          ),
        );
    })();
    reconnectPromise.current = work;
    void work.finally(() => {
      if (reconnectPromise.current === work) reconnectPromise.current = null;
    });
    return work;
  };

  const start = useCallback(async () => {
    if (active.current) return;
    active.current = true;
    const run = ++generation.current;
    lifetime.current = new AbortController();
    reconnectCount.current = 0;
    resumeHandle.current = null;
    cancelledCalls.current.clear();
    toolQueue.current = Promise.resolve();
    captionRef.current = null;
    transcriptBuffers.current = {};
    setCaption(null);
    setError(null);
    setStatus("connecting");
    mutedRef.current = false;
    setMuted(false);
    try {
      const audio = new LiveAudioOutput((value) => {
        if (alive(run)) setSpeaking(value);
      });
      output.current = audio;
      // Resume on the same Start gesture before waiting for the server or microphone prompt.
      await audio.resume();
      if (!alive(run)) return;
      let setup = await mintSession(lifetime.current!.signal);
      if (!alive(run)) return;
      const microphone = await startLiveRecorder(
        audio.context,
        lifetime.current!.signal,
        (data) => {
          if (!alive(run) || !session.current) return;
          try {
            session.current.sendRealtimeInput({
              audio: { data, mimeType: "audio/pcm;rate=16000" },
            });
          } catch {
            void reconnectRef.current();
          }
        },
        (value) => {
          if (alive(run)) setLevel(value);
        },
      );
      if (!alive(run)) {
        microphone.stop();
        return;
      }
      recorder.current = microphone;
      // Permission prompts can outlive the 60-second ephemeral connection window.
      if (
        setup.newSessionExpiresAt &&
        Date.parse(setup.newSessionExpiresAt) < Date.now() + 15000
      ) {
        setup = await mintSession(lifetime.current!.signal);
      }
      await connect(setup, null, run);
    } catch (reason) {
      if (alive(run)) fail(reason);
    }
  }, []);

  const stop = useCallback(() => {
    teardown();
    captionRef.current = null;
    transcriptBuffers.current = {};
    if (mounted.current) {
      setStatus("idle");
      setError(null);
      setCaption(null);
    }
  }, [teardown]);

  const toggleMute = useCallback(() => {
    const value = !mutedRef.current;
    mutedRef.current = value;
    recorder.current?.setMuted(value);
    if (value) {
      try {
        session.current?.sendRealtimeInput({ audioStreamEnd: true });
      } catch {
        /* Socket is reconnecting. */
      }
    }
    setMuted(value);
  }, []);

  const interrupt = useCallback(() => {
    output.current?.interrupt();
    // A client-content update interrupts model generation as well as local playback.
    try {
      session.current?.sendClientContent({ turnComplete: false });
    } catch {
      /* Socket is reconnecting. */
    }
  }, []);
  const sendText = useCallback((text: string): boolean => {
    if (!session.current || !text.trim()) return false;
    try {
      session.current.sendClientContent({
        turns: [
          { role: "user", parts: [{ text: text.trim().slice(0, 4000) }] },
        ],
        turnComplete: true,
      });
      return true;
    } catch {
      void reconnectRef.current();
      return false;
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      teardown();
    };
  }, [teardown]);

  return {
    status,
    error,
    muted,
    speaking,
    level,
    caption,
    start,
    stop,
    toggleMute,
    interrupt,
    sendText,
  };
}
