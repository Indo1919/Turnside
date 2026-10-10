import type {
  LiveConnectConfig,
  LiveServerMessage,
  Session,
} from "@google/genai";

export type LiveConnection = Pick<
  Session,
  "sendClientContent" | "sendRealtimeInput" | "sendToolResponse" | "close"
>;
interface ConnectionOptions {
  token: string;
  model: string;
  apiVersion: string;
  config: LiveConnectConfig;
  signal: AbortSignal;
  onMessage(message: LiveServerMessage): void;
  onUnexpectedClose(): void;
}

/** Official Live WebSocket protocol: https://ai.google.dev/api/live */
export function openLiveConnection(
  options: ConnectionOptions,
): Promise<LiveConnection> {
  options.signal.throwIfAborted();
  if (!options.token.startsWith("auth_tokens/"))
    throw new Error("A temporary voice token is required.");
  const version = options.apiVersion === "v1alpha" ? "v1alpha" : "v1beta";
  const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.${version}.GenerativeService.BidiGenerateContentConstrained?access_token=${encodeURIComponent(options.token)}`;
  const socket = new WebSocket(url);
  let ready = false;
  let intentionalClose = false;
  let closed = false;
  let queue = Promise.resolve();
  let rejectSetup: (reason: Error) => void = () => {};
  let resolveSetup: (connection: LiveConnection) => void = () => {};
  const pending = new Promise<LiveConnection>((resolve, reject) => {
    resolveSetup = resolve;
    rejectSetup = reject;
  });
  const timer = window.setTimeout(() => {
    rejectSetup(
      new Error(
        "Voice could not connect in time. Check your connection and try again.",
      ),
    );
    close();
  }, 20000);

  function close() {
    if (closed) return;
    intentionalClose = true;
    closed = true;
    window.clearTimeout(timer);
    options.signal.removeEventListener("abort", abort);
    if (!ready) rejectSetup(new Error("Voice connection was stopped."));
    socket.onmessage = null;
    socket.onopen = null;
    try {
      socket.close(1000, "Conversation ended");
    } catch {
      /* Already closed. */
    }
  }
  function abort() {
    close();
  }
  options.signal.addEventListener("abort", abort, { once: true });
  function send(message: unknown) {
    if (!ready || closed || socket.readyState !== WebSocket.OPEN)
      throw new Error("Voice is reconnecting.");
    socket.send(JSON.stringify(message));
  }
  const connection: LiveConnection = {
    close,
    sendClientContent: (params) =>
      send({
        clientContent: { ...params, turnComplete: params.turnComplete ?? true },
      }),
    sendRealtimeInput: (params) => send({ realtimeInput: params }),
    sendToolResponse: (params) => send({ toolResponse: params }),
  };
  socket.onopen = () => {
    if (closed || options.signal.aborted) return close();
    const config = options.config;
    const systemInstruction =
      typeof config.systemInstruction === "string"
        ? { parts: [{ text: config.systemInstruction }] }
        : config.systemInstruction;
    // This shape matches the setup fields locked into the server-issued token.
    socket.send(
      JSON.stringify({
        setup: {
          model: options.model.startsWith("models/")
            ? options.model
            : `models/${options.model}`,
          generationConfig: {
            responseModalities: config.responseModalities || ["AUDIO"],
          },
          systemInstruction,
          tools: config.tools,
          sessionResumption: config.sessionResumption || {},
          contextWindowCompression: config.contextWindowCompression,
          inputAudioTranscription: config.inputAudioTranscription,
          outputAudioTranscription: config.outputAudioTranscription,
          ...(config.realtimeInputConfig
            ? { realtimeInputConfig: config.realtimeInputConfig }
            : {}),
        },
      }),
    );
  };
  socket.onmessage = (event) => {
    // Blob decoding remains ordered so captions, audio, and tool calls stay in sequence.
    queue = queue
      .then(async () => {
        if (closed) return;
        const text =
          typeof event.data === "string"
            ? event.data
            : event.data instanceof Blob
              ? await event.data.text()
              : "";
        if (closed || !text || text.length > 10_000_000) return;
        const message = JSON.parse(text) as LiveServerMessage & {
          error?: { message?: string };
        };
        if (message.error) {
          if (!ready)
            rejectSetup(
              new Error(
                "Gemini rejected the voice session. Check the model access and connection settings.",
              ),
            );
          socket.close();
          return;
        }
        if (message.setupComplete && !ready) {
          ready = true;
          window.clearTimeout(timer);
          resolveSetup(connection);
        }
        if (ready) options.onMessage(message);
      })
      .catch(() => {
        if (!ready)
          rejectSetup(
            new Error(
              "Voice received an invalid connection response. Try again.",
            ),
          );
        if (!closed) socket.close();
      });
  };
  socket.onerror = () => {
    if (!ready)
      rejectSetup(
        new Error(
          "Voice could not reach Gemini. Check your connection and try again.",
        ),
      );
    if (!closed) socket.close();
  };
  socket.onclose = () => {
    window.clearTimeout(timer);
    options.signal.removeEventListener("abort", abort);
    closed = true;
    if (!ready)
      rejectSetup(
        new Error(
          "Voice could not establish a session. Check model access and try again.",
        ),
      );
    if (ready && !intentionalClose) options.onUnexpectedClose();
    socket.onmessage = null;
    socket.onopen = null;
    socket.onerror = null;
    socket.onclose = null;
  };
  return pending;
}
