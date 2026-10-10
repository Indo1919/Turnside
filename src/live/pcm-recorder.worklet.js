// Microphone audio is averaged down to mono 16 kHz and emitted as little-endian PCM16.
class TurnsidePcmRecorder extends AudioWorkletProcessor {
  constructor() {
    super();
    this.phase = 0;
    this.sum = 0;
    this.count = 0;
    this.peak = 0;
    this.buffer = new ArrayBuffer(3200);
    this.view = new DataView(this.buffer);
    this.filled = 0;
  }

  process(inputs) {
    const input = inputs[0]?.[0];
    if (!input) return true;
    for (const value of input) {
      this.sum += value;
      this.count++;
      this.peak = Math.max(this.peak, Math.abs(value));
      this.phase += 16000 / sampleRate;
      while (this.phase >= 1) {
        const sample = Math.max(-1, Math.min(1, this.sum / this.count));
        this.view.setInt16(
          this.filled * 2,
          Math.round(sample * (sample < 0 ? 32768 : 32767)),
          true,
        );
        this.filled++;
        this.phase--;
        if (this.filled === 1600) {
          this.port.postMessage(
            { pcm: this.buffer, level: Math.min(1, this.peak * 3) },
            [this.buffer],
          );
          this.buffer = new ArrayBuffer(3200);
          this.view = new DataView(this.buffer);
          this.filled = 0;
          this.peak = 0;
        }
      }
      if (this.phase < 16000 / sampleRate) {
        this.sum = 0;
        this.count = 0;
      }
    }
    return true;
  }
}

registerProcessor("turnside-pcm-recorder", TurnsidePcmRecorder);
