import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";
import { transformSync } from "esbuild";

// Browser-independent checks exercise the real client modules with simulated
// WebSockets and audio hardware. They do not assert a live Gemini connection.
const liveDirectory = new URL("../src/live/", import.meta.url);
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));
function load(
  file: string,
  extra: Record<string, unknown> = {},
  dependencies: Record<string, unknown> = {},
) {
  const module = { exports: {} as any };
  const context = {
    module,
    exports: module.exports,
    require: (id: string) => dependencies[id],
    window: { setTimeout, clearTimeout },
    AbortController,
    DOMException,
    crypto: globalThis.crypto,
    Blob,
    ...extra,
  };
  vm.runInNewContext(
    transformSync(fs.readFileSync(new URL(file, liveDirectory), "utf8"), {
      loader: "ts",
      format: "cjs",
      target: "es2022",
    }).code,
    context,
  );
  return module.exports;
}
class FakeSocket {
  static OPEN = 1;
  static created: FakeSocket[] = [];
  readyState = 0;
  sent: any[] = [];
  onopen?: () => void;
  onmessage?: (event: { data: string }) => void;
  onclose?: () => void;
  constructor(readonly url: string) {
    FakeSocket.created.push(this);
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  message(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  close() {
    this.readyState = 3;
    queueMicrotask(() => this.onclose?.());
  }
}
const liveConfig = {
  responseModalities: ["AUDIO"],
  systemInstruction: "Grounded travel assistant",
  tools: [{ functionDeclarations: [] }],
  sessionResumption: { handle: "saved" },
  inputAudioTranscription: {},
  outputAudioTranscription: {},
  contextWindowCompression: { slidingWindow: {} },
};
const setup = {
  success: true,
  token: "auth_tokens/test",
  model: "gemini-3.8-live",
  apiVersion: "v1beta",
  liveConfig,
};
const response = (data: unknown) =>
  Promise.resolve({ ok: true, json: async () => data });

test("Live transport uses a temporary token, locked setup fields, and matching tool IDs", async () => {
  const { openLiveConnection } = load("connection.ts", {
    WebSocket: FakeSocket,
  });
  const controller = new AbortController();
  let closes = 0;
  const pending = openLiveConnection({
    ...setup,
    config: liveConfig,
    signal: controller.signal,
    onMessage() {},
    onUnexpectedClose: () => closes++,
  });
  const socket = FakeSocket.created.at(-1)!;
  socket.open();
  assert(
    socket.url.includes(
      "BidiGenerateContentConstrained?access_token=auth_tokens%2Ftest",
    ),
  );
  assert.equal(socket.sent[0].setup.model, "models/gemini-3.8-live");
  assert.equal(socket.sent[0].setup.sessionResumption.handle, "saved");
  assert.equal(
    socket.sent[0].setup.systemInstruction.parts[0].text,
    liveConfig.systemInstruction,
  );
  socket.message({ setupComplete: {} });
  const connection = await pending;
  connection.sendRealtimeInput({
    audio: { data: "AAA=", mimeType: "audio/pcm;rate=16000" },
  });
  connection.sendToolResponse({
    functionResponses: [
      { id: "call1", name: "discover_places", response: { success: true } },
    ],
  });
  assert.equal(
    socket.sent[1].realtimeInput.audio.mimeType,
    "audio/pcm;rate=16000",
  );
  assert.equal(socket.sent[2].toolResponse.functionResponses[0].id, "call1");
  controller.abort();
  await settle();
  assert.equal(socket.readyState, 3);
  assert.equal(closes, 0);
});

test("Stopping a pending Live connection rejects immediately and closes its socket", async () => {
  const { openLiveConnection } = load("connection.ts", {
    WebSocket: FakeSocket,
  });
  const controller = new AbortController();
  let closes = 0;
  const pending = openLiveConnection({
    ...setup,
    config: liveConfig,
    signal: controller.signal,
    onMessage() {},
    onUnexpectedClose: () => closes++,
  });
  controller.abort();
  await assert.rejects(pending, /stopped/);
  assert.equal(FakeSocket.created.at(-1)!.readyState, 3);
  assert.equal(closes, 0);
});

test("A setup timeout closes the transport instead of leaving voice connecting forever", async () => {
  let timeout: (() => void) | undefined;
  const { openLiveConnection } = load("connection.ts", {
    WebSocket: FakeSocket,
    window: {
      setTimeout: (fn: () => void) => {
        timeout = fn;
        return 1;
      },
      clearTimeout() {},
    },
  });
  const pending = openLiveConnection({
    ...setup,
    config: liveConfig,
    signal: new AbortController().signal,
    onMessage() {},
    onUnexpectedClose() {},
  });
  timeout!();
  await assert.rejects(pending, /connect in time/);
  assert.equal(FakeSocket.created.at(-1)!.readyState, 3);
});

test("Unexpected disconnection requests one reconnect after setup succeeds", async () => {
  const { openLiveConnection } = load("connection.ts", {
    WebSocket: FakeSocket,
  });
  let closes = 0;
  const pending = openLiveConnection({
    ...setup,
    config: liveConfig,
    signal: new AbortController().signal,
    onMessage() {},
    onUnexpectedClose: () => closes++,
  });
  const socket = FakeSocket.created.at(-1)!;
  socket.open();
  socket.message({ setupComplete: {} });
  await pending;
  socket.close();
  await settle();
  assert.equal(closes, 1);
});

for (const rate of [44100, 48000]) {
  test(`Microphone worklet downsamples ${rate} Hz into 100 ms little-endian PCM16 chunks`, () => {
    let Processor: any;
    const chunks: { bytes: Uint8Array; level: number }[] = [];
    class Base {
      port = {
        postMessage: (packet: { pcm: ArrayBuffer; level: number }) =>
          chunks.push({
            bytes: new Uint8Array(packet.pcm),
            level: packet.level,
          }),
      };
    }
    vm.runInNewContext(
      fs.readFileSync(
        new URL("pcm-recorder.worklet.js", liveDirectory),
        "utf8",
      ),
      {
        AudioWorkletProcessor: Base,
        sampleRate: rate,
        ArrayBuffer,
        DataView,
        Math,
        registerProcessor: (_name: string, type: unknown) => {
          Processor = type;
        },
      },
    );
    const recorder = new Processor();
    for (let offset = 0; offset < rate; offset += 128)
      recorder.process([
        [new Float32Array(Math.min(128, rate - offset)).fill(0.5)],
      ]);
    assert(chunks.length >= 9 && chunks.length <= 10);
    for (const chunk of chunks) {
      assert.equal(chunk.bytes.length, 3200);
      assert.equal(new DataView(chunk.bytes.buffer).getInt16(0, true), 16384);
      assert.equal(chunk.level, 1);
    }
  });
}

function hookHarness(fetcher: (...args: any[]) => any) {
  const states: any[] = [],
    callbacks: any[] = [],
    effects: unknown[] = [];
  let audioClosed = 0,
    recorderStarted = 0,
    recorderStopped = 0;
  const toolResponses: any[] = [],
    transcripts: any[] = [],
    discoveries: any[] = [],
    plans: any[] = [];
  class Output {
    context = {};
    resume() {
      return Promise.resolve();
    }
    close() {
      audioClosed++;
    }
    interrupt() {}
    play() {}
  }
  const react = {
    useRef: (current: unknown) => ({ current }),
    useCallback: (fn: unknown) => fn,
    useEffect: (fn: () => unknown) => effects.push(fn()),
    useState: (value: unknown) => {
      const index = states.length;
      states.push(value);
      return [
        value,
        (next: any) => {
          states[index] =
            typeof next === "function" ? next(states[index]) : next;
        },
      ];
    },
  };
  const audio = {
    LiveAudioOutput: Output,
    startLiveRecorder: async () => {
      recorderStarted++;
      return {
        setMuted() {},
        stop() {
          recorderStopped++;
        },
      };
    },
  };
  const connection = {
    openLiveConnection: async (options: unknown) => {
      callbacks.push(options);
      return {
        close() {},
        sendClientContent() {},
        sendRealtimeInput() {},
        sendToolResponse: (result: unknown) => toolResponses.push(result),
      };
    },
  };
  const { useLiveConversation } = load(
    "useLiveConversation.ts",
    { fetch: fetcher },
    { react, "./audio": audio, "./connection": connection },
  );
  const hook = useLiveConversation({
    city: "New York",
    onTranscript: (value: unknown) => transcripts.push(value),
    onDiscovery: (value: unknown) => discoveries.push(value),
    onPlan: (plan: unknown, result: unknown) => plans.push({ plan, result }),
  });
  return {
    hook,
    states,
    callbacks,
    toolResponses,
    transcripts,
    discoveries,
    plans,
    stats: () => ({ audioClosed, recorderStarted, recorderStopped }),
  };
}

test("Missing Gemini configuration never requests the microphone", async () => {
  const unavailable = hookHarness(() =>
    Promise.resolve({
      ok: false,
      json: async () => ({
        success: false,
        error: "Connect a Gemini API key.",
      }),
    }),
  );
  await unavailable.hook.start();
  assert.equal(unavailable.states[0], "error");
  assert.equal(unavailable.stats().recorderStarted, 0);
  assert.equal(unavailable.stats().audioClosed, 1);
});

test("Stopping while a temporary token is pending prevents late microphone startup", async () => {
  let resolveToken: (value: unknown) => void = () => {};
  const waiting = hookHarness(
    () =>
      new Promise((resolve) => {
        resolveToken = resolve;
      }),
  );
  const pending = waiting.hook.start();
  await settle();
  waiting.hook.stop();
  resolveToken(await response(setup));
  await pending;
  assert.equal(waiting.states[0], "idle");
  assert.equal(waiting.stats().recorderStarted, 0);
});

test("Live transcripts stay independent and cancelled tools never change the itinerary", async () => {
  let toolCancelled = false;
  const live = hookHarness((url, options) =>
    url === "/api/live/session"
      ? response(setup)
      : new Promise((_resolve, reject) =>
          options.signal.addEventListener("abort", () => {
            toolCancelled = true;
            reject(new DOMException("Stopped", "AbortError"));
          }),
        ),
  );
  await live.hook.start();
  assert.equal(live.states[0], "live");
  const message = live.callbacks[0].onMessage;
  message({
    serverContent: {
      inputTranscription: { text: "Find a cafe" },
      outputTranscription: { text: "I can help" },
    },
  });
  message({
    serverContent: {
      inputTranscription: { text: " near here" },
      outputTranscription: { text: " with that" },
      turnComplete: true,
    },
  });
  assert(
    live.transcripts.some(
      (c) => c.who === "user" && c.final && c.text === "Find a cafe near here",
    ),
  );
  assert(
    live.transcripts.some(
      (c) => c.who === "agent" && c.final && c.text === "I can help with that",
    ),
  );
  message({
    toolCall: {
      functionCalls: [
        { id: "cancel-me", name: "discover_places", args: { query: "coffee" } },
      ],
    },
  });
  await settle();
  message({ toolCallCancellation: { ids: ["cancel-me"] } });
  await settle();
  assert(toolCancelled);
  assert.equal(live.discoveries.length, 0);
  assert.equal(live.toolResponses.length, 0);
  live.hook.stop();
  assert.equal(live.stats().recorderStopped, 1);
  assert.equal(live.states[0], "idle");
});

test("Live planning uses selected place IDs and preserves provider notices in the UI and tool response", async () => {
  const requests: { url: string; body: any }[] = [];
  const planned = {
    success: true,
    data: { city: "New York", days: [] },
    source: "gemini",
    notice: "Review opening hours before visiting.",
  };
  const live = hookHarness((url, options) => {
    requests.push({ url, body: JSON.parse(options.body) });
    return response(url === "/api/live/session" ? setup : planned);
  });
  await live.hook.start();
  live.callbacks[0].onMessage({
    toolCall: {
      functionCalls: [
        {
          id: "make-plan",
          name: "create_plan",
          args: {
            destination: "New York",
            preferredPlaceIds: ["place-1"],
            durationDays: 2,
            pacing: "relaxed",
          },
        },
      ],
    },
  });
  await settle();
  await settle();
  assert.equal(requests[1].url, "/api/gemini/plan");
  assert.equal(requests[1].body.forceDemo, false);
  assert.deepEqual(requests[1].body.preferredPlaceIds, ["place-1"]);
  assert.equal(live.plans[0].result.notice, planned.notice);
  assert.equal(
    live.toolResponses[0].functionResponses[0].response.source,
    "gemini",
  );
  live.hook.stop();
});
