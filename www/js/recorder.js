// İnternetsiz mikrofon kaydı: sesi 16 kHz tek kanal olarak toplar,
// konuşma bitince (sessizlik) kendiliğinden durur.
const TARGET_RATE = 16000;

export function canRecord() {
  return !!(navigator.mediaDevices?.getUserMedia) && !!(window.AudioContext || window.webkitAudioContext);
}

// onLevel(0..1): ses seviyesi göstergesi için
// Döner: { stop(): Promise<Float32Array>, cancel() }
export async function startRecording({ onLevel, onAutoStop, silenceMs = 1300, maxMs = 20000 } = {}) {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  const Ctx = window.AudioContext || window.webkitAudioContext;
  let ctx;
  try { ctx = new Ctx({ sampleRate: TARGET_RATE }); } catch (_) { ctx = new Ctx(); }
  const source = ctx.createMediaStreamSource(stream);
  const proc = ctx.createScriptProcessor(4096, 1, 1);
  const chunks = [];
  let heardSpeech = false;
  let lastLoud = performance.now();
  const startedAt = performance.now();
  let noiseFloor = 0.008;
  let stopped = false;
  let resolveStop;
  const done = new Promise((r) => { resolveStop = r; });

  proc.onaudioprocess = (e) => {
    if (stopped) return;
    const data = e.inputBuffer.getChannelData(0);
    chunks.push(new Float32Array(data));
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
    const rms = Math.sqrt(sum / data.length);
    if (!heardSpeech) noiseFloor = noiseFloor * 0.95 + rms * 0.05;
    const threshold = Math.max(0.015, noiseFloor * 3);
    const now = performance.now();
    if (rms > threshold) { heardSpeech = true; lastLoud = now; }
    onLevel?.(Math.min(1, rms / 0.15));
    if ((heardSpeech && now - lastLoud > silenceMs) || now - startedAt > maxMs) {
      onAutoStop?.();
      finish();
    }
  };
  source.connect(proc);
  proc.connect(ctx.destination);

  async function finish() {
    if (stopped) return done;
    stopped = true;
    try { proc.disconnect(); source.disconnect(); } catch (_) { /* yok say */ }
    stream.getTracks().forEach((t) => t.stop());
    const rate = ctx.sampleRate;
    try { await ctx.close(); } catch (_) { /* yok say */ }
    let len = 0;
    for (const c of chunks) len += c.length;
    const all = new Float32Array(len);
    let o = 0;
    for (const c of chunks) { all.set(c, o); o += c.length; }
    resolveStop({ audio: rate === TARGET_RATE ? all : resample(all, rate, TARGET_RATE), heardSpeech });
    return done;
  }

  return {
    stop: finish,
    cancel: () => { finish(); },
    done,
  };
}

function resample(input, from, to) {
  const ratio = from / to;
  const out = new Float32Array(Math.floor(input.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const pos = i * ratio;
    const i0 = Math.floor(pos);
    const i1 = Math.min(i0 + 1, input.length - 1);
    const f = pos - i0;
    out[i] = input[i0] * (1 - f) + input[i1] * f;
  }
  return out;
}
