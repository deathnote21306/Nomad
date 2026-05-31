const btn         = document.getElementById('btn');
const resetBtn    = document.getElementById('reset-btn');
const preview     = document.getElementById('preview');
const placeholder = document.getElementById('preview-placeholder');
const micWrap     = document.getElementById('mic-wrap');
const micBar      = document.getElementById('mic-bar');
const pillAudio   = document.getElementById('pill-audio');
const pillVideo   = document.getElementById('pill-video');
const pillGemini  = document.getElementById('pill-gemini');

let mediaStream   = null;
let audioCtx      = null;
let playCtx       = null;
let analyser      = null;
let processor     = null;
let wsAudio       = null;
let wsVideo       = null;
let videoInterval = null;
let meterRaf      = null;

// ── Pill helpers ──────────────────────────────────────────────────────
function setPill(el, state, label) {
  el.textContent = label;
  el.className   = 'pill' + (state === 'ok' ? ' ok' : state === 'err' ? ' err' : '');
}

// ── Mic level meter (runs via requestAnimationFrame) ──────────────────
function startMeter() {
  const data = new Uint8Array(analyser.frequencyBinCount);
  function tick() {
    analyser.getByteTimeDomainData(data);
    let max = 0;
    for (let i = 0; i < data.length; i++) {
      max = Math.max(max, Math.abs(data[i] - 128));
    }
    micBar.style.width = Math.min(100, (max / 128) * 100 * 3) + '%';
    meterRaf = requestAnimationFrame(tick);
  }
  tick();
}

// ── Start ─────────────────────────────────────────────────────────────
async function start() {
  if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
    setPill(pillGemini, 'err', 'Needs HTTPS');
    return;
  }

  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: { facingMode: 'environment' },
    });
  } catch (e) {
    setPill(pillGemini, 'err', e.name);
    return;
  }

  // Show camera
  preview.srcObject   = mediaStream;
  preview.style.display = 'block';
  placeholder.style.display = 'none';
  micWrap.style.display = 'flex';

  // WebSockets
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const base  = `${proto}://${location.host}`;
  wsAudio = new WebSocket(`${base}/ws/audio`);
  wsVideo = new WebSocket(`${base}/ws/video`);

  wsAudio.binaryType = 'arraybuffer';
  wsAudio.onopen  = () => setPill(pillAudio, 'ok',  'Audio ✓');
  wsAudio.onclose = () => setPill(pillAudio, 'err', 'Audio ✗');
  wsAudio.onerror = () => setPill(pillAudio, 'err', 'Audio ✗');

  // Gemini audio → play on phone speaker (chunks scheduled back-to-back)
  playCtx = new AudioContext({ sampleRate: 24000 });
  let nextPlayAt = 0;
  wsAudio.onmessage = (e) => {
    // Text frame = control message
    if (typeof e.data === 'string') {
      const msg = JSON.parse(e.data);
      if (msg.type === 'interrupt') nextPlayAt = 0; // flush queued audio
      return;
    }
    if (!(e.data instanceof ArrayBuffer)) return;
    const i16 = new Int16Array(e.data);
    const f32 = new Float32Array(i16.length);
    for (let i = 0; i < i16.length; i++) f32[i] = i16[i] / 32768;
    const buf = playCtx.createBuffer(1, f32.length, 24000);
    buf.copyToChannel(f32, 0);
    const node = playCtx.createBufferSource();
    node.buffer = buf;
    node.connect(playCtx.destination);
    const startAt = Math.max(playCtx.currentTime + 0.02, nextPlayAt);
    node.start(startAt);
    nextPlayAt = startAt + buf.duration;
  };
  wsVideo.onopen  = () => { setPill(pillVideo, 'ok', 'Video ✓'); setPill(pillGemini, 'ok', 'Live'); };
  wsVideo.onclose = () => setPill(pillVideo, 'err', 'Video ✗');
  wsVideo.onerror = () => setPill(pillVideo, 'err', 'Video ✗');

  // Audio pipeline → 16 kHz Int16 PCM (AudioWorklet)
  audioCtx = new AudioContext({ sampleRate: 16000 });
  const src = audioCtx.createMediaStreamSource(mediaStream);

  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 256;
  src.connect(analyser);

  await audioCtx.audioWorklet.addModule('/static/audio-processor.js');
  processor = new AudioWorkletNode(audioCtx, 'pcm-processor');
  let micBuf = new Int16Array(0);
  const MIC_SEND_SAMPLES = 2048; // ~128ms at 16kHz
  processor.port.onmessage = (e) => {
    if (wsAudio.readyState !== WebSocket.OPEN) return;
    const f32 = e.data;
    const chunk = new Int16Array(f32.length);
    for (let i = 0; i < f32.length; i++)
      chunk[i] = Math.max(-32768, Math.min(32767, f32[i] * 32768));
    // accumulate into micBuf
    const merged = new Int16Array(micBuf.length + chunk.length);
    merged.set(micBuf);
    merged.set(chunk, micBuf.length);
    micBuf = merged;
    if (micBuf.length >= MIC_SEND_SAMPLES) {
      wsAudio.send(micBuf.buffer);
      micBuf = new Int16Array(0);
    }
  };
  src.connect(processor);
  processor.connect(audioCtx.destination);

  startMeter();

  // Video → JPEG every 500 ms
  const canvas = document.createElement('canvas');
  canvas.width  = 640;
  canvas.height = 480;
  const ctx2d   = canvas.getContext('2d');

  videoInterval = setInterval(() => {
    if (wsVideo.readyState !== WebSocket.OPEN) return;
    ctx2d.drawImage(preview, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(blob => {
      if (!blob) return;
      blob.arrayBuffer().then(buf => wsVideo.send(buf));
    }, 'image/jpeg', 0.85);
  }, 500);

  btn.textContent = 'Stop';
  btn.classList.add('stop');
}

// ── Stop — release mic first, then tear down everything ──────────────
async function stop() {
  btn.disabled = true;

  // 1. Kill mic/camera tracks immediately — this removes the orange dot
  mediaStream?.getTracks().forEach(t => t.stop());
  mediaStream = null;

  // 2. Tear down audio processing
  clearInterval(videoInterval);   videoInterval = null;
  cancelAnimationFrame(meterRaf); meterRaf      = null;
  processor?.disconnect();        processor     = null;
  analyser = null;
  audioCtx?.close();              audioCtx      = null;
  playCtx?.close();               playCtx       = null;

  // 3. Close WebSockets
  wsAudio?.close(); wsAudio = null;
  wsVideo?.close(); wsVideo = null;

  // 4. Reset UI
  preview.srcObject         = null;
  preview.style.display     = 'none';
  placeholder.style.display = 'flex';
  micWrap.style.display     = 'none';
  micBar.style.width        = '0%';
  setPill(pillAudio,  '', 'Audio');
  setPill(pillVideo,  '', 'Video');
  setPill(pillGemini, '', 'Gemini');
  btn.textContent = 'Start';
  btn.classList.remove('stop');
  btn.disabled = false;
}

// ── Reset — purge Gemini history, stop if running ────────────────────
async function reset() {
  resetBtn.disabled = true;
  setPill(pillGemini, '', 'Resetting…');
  if (mediaStream) await stop();
  await fetch('/live/restart', { method: 'POST' }).catch(() => {});
  setPill(pillGemini, 'ok', 'Fresh session');
  setTimeout(() => setPill(pillGemini, '', 'Gemini'), 2000);
  resetBtn.disabled = false;
}

btn.addEventListener('click', () => (mediaStream ? stop() : start()));
resetBtn.addEventListener('click', reset);
