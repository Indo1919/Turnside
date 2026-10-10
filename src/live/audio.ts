import recorderUrl from "./pcm-recorder.worklet.js?url";

export interface LiveRecorder {
  setMuted(muted: boolean): void;
  stop(): void;
}

function encodePcm(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 8192) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
  }
  return btoa(binary);
}

/** The caller creates and resumes this shared audio context on the Start gesture. */
export async function startLiveRecorder(
  context: AudioContext,
  signal: AbortSignal,
  onChunk: (base64: string) => void,
  onLevel: (level: number) => void,
): Promise<LiveRecorder> {
  if (!navigator.mediaDevices?.getUserMedia || !context.audioWorklet) {
    throw new Error(
      "Voice requires a browser with microphone support on HTTPS or localhost.",
    );
  }
  signal.throwIfAborted();
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });
  let source: MediaStreamAudioSourceNode | undefined;
  let node: AudioWorkletNode | undefined;
  let silence: GainNode | undefined;
  let muted = false;
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    signal.removeEventListener("abort", stop);
    if (node) {
      node.port.onmessage = null;
      node.disconnect();
      node.port.close();
    }
    source?.disconnect();
    silence?.disconnect();
    stream.getTracks().forEach((track) => track.stop());
    onLevel(0);
  };
  signal.addEventListener("abort", stop, { once: true });
  try {
    signal.throwIfAborted();
    await context.audioWorklet.addModule(recorderUrl);
    signal.throwIfAborted();
    source = context.createMediaStreamSource(stream);
    node = new AudioWorkletNode(context, "turnside-pcm-recorder");
    silence = context.createGain();
    silence.gain.value = 0;
    node.port.onmessage = (
      event: MessageEvent<{ pcm: ArrayBuffer; level: number }>,
    ) => {
      if (stopped) return;
      onLevel(muted ? 0 : event.data.level);
      if (!muted) onChunk(encodePcm(event.data.pcm));
    };
    // A silent output keeps the worklet processing without microphone feedback.
    source.connect(node);
    node.connect(silence).connect(context.destination);
    return {
      setMuted: (value) => {
        muted = value;
        if (value) onLevel(0);
      },
      stop,
    };
  } catch (error) {
    stop();
    throw error;
  }
}

/** Gapless Gemini audio playback. Raw Live audio is PCM16 at 24 kHz. */
export class LiveAudioOutput {
  readonly context = new AudioContext();
  private playhead = 0;
  private sources = new Set<AudioBufferSourceNode>();
  private closed = false;

  constructor(private onSpeaking: (value: boolean) => void) {}

  async resume(): Promise<void> {
    if (this.context.state !== "running") await this.context.resume();
  }

  play(base64: string, sampleRate = 24000): void {
    if (this.closed) return;
    const binary = atob(base64);
    if (binary.length < 2 || binary.length > 8_000_000) return;
    const bytes = Uint8Array.from(binary, (character) =>
      character.charCodeAt(0),
    );
    const view = new DataView(bytes.buffer);
    const buffer = this.context.createBuffer(
      1,
      Math.floor(bytes.length / 2),
      sampleRate,
    );
    const channel = buffer.getChannelData(0);
    for (let index = 0; index < channel.length; index++)
      channel[index] = view.getInt16(index * 2, true) / 32768;
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.context.destination);
    this.playhead = Math.max(this.playhead, this.context.currentTime + 0.02);
    source.start(this.playhead);
    this.playhead += buffer.duration;
    this.sources.add(source);
    this.onSpeaking(true);
    source.onended = () => {
      source.disconnect();
      this.sources.delete(source);
      if (!this.sources.size && !this.closed) this.onSpeaking(false);
    };
  }

  interrupt(): void {
    for (const source of this.sources) {
      source.onended = null;
      try {
        source.stop();
      } catch {
        /* Already ended. */
      }
      source.disconnect();
    }
    this.sources.clear();
    this.playhead = 0;
    this.onSpeaking(false);
  }

  close(): void {
    if (this.closed) return;
    this.interrupt();
    this.closed = true;
    void this.context.close().catch(() => {});
  }
}
