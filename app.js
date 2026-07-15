(() => {
  "use strict";

  const garden = document.querySelector("#garden");
  const playButton = document.querySelector("#playButton");
  const stopButton = document.querySelector("#stopButton");
  const recordButton = document.querySelector("#recordButton");
  const clearButton = document.querySelector("#clearButton");
  const recordingPanel = document.querySelector("#recordingPanel");
  const recordingAudio = document.querySelector("#recordingAudio");
  const downloadRecording = document.querySelector("#downloadRecording");
  const shareRecording = document.querySelector("#shareRecording");
  const discardRecording = document.querySelector("#discardRecording");
  const emptyHint = document.querySelector("#emptyHint");
  const playhead = document.querySelector("#playhead");
  const toast = document.querySelector("#toast");
  const seedCards = [...document.querySelectorAll(".seed-card")];
  const bpmSlider = document.querySelector("#bpmSlider");
  const bpmValue = document.querySelector("#bpmValue");

  const kinds = {
    sparkle: { icon: "✨", label: "きらきら" },
    fluffy: { icon: "🌱", label: "ふわふわ" },
    bubbly: { icon: "💧", label: "ぽこぽこ" },
    grainy: { icon: "🖤", label: "ざらざら" },
    drizzle: { icon: "🌧️", label: "しとしと" },
    breeze: { icon: "🍃", label: "そよそよ" },
    wood: { icon: "🌳", label: "こつこつ" },
    bird: { icon: "🐦", label: "ぴるぴる" },
  };

  const notes = [130.81, 146.83, 164.81, 196, 220, 261.63, 293.66, 329.63, 392, 440, 523.25, 587.33];
  const scheduleAhead = 0.12;
  const seeds = [];
  let bpm = 84;
  let nextId = 1;
  let audio = null;
  let master = null;
  let noiseBuffer = null;
  const activeSources = new Set();
  let scheduler = null;
  let isPlaying = false;
  let currentStep = 0;
  let nextStepTime = 0;
  let toastTimer = null;
  let dragType = null;
  let pointerGhost = null;
  let recordingProcessor = null;
  let recordingSilence = null;
  let recordingChunks = [];
  let recordingSampleRate = 44100;
  let recording = false;
  let recordingFinishing = false;
  let recordingStartedAt = 0;
  let recordingBlob = null;
  let recordingUrl = null;
  let recordingFilename = "";

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 1400);
  }

  function secondsPerStep(tempo = bpm) {
    return 30 / tempo;
  }

  function tempoFeeling(tempo) {
    if (tempo < 72) return "ゆっくり";
    if (tempo > 124) return "はやい";
    return "ふつう";
  }

  function updateTempoDisplay() {
    bpmValue.textContent = `${bpm} BPM`;
    bpmSlider.setAttribute("aria-valuetext", `${tempoFeeling(bpm)} ${bpm} BPM`);
    garden.style.setProperty("--step-motion", `${Math.min(0.42, secondsPerStep() * 0.72)}s`);
  }

  function ensureAudio() {
    if (!audio) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) {
        showToast("このブラウザでは音を鳴らせません");
        return false;
      }
      audio = new AudioContext();
      master = audio.createGain();
      master.gain.value = 0.72;
      master.connect(audio.destination);

      noiseBuffer = audio.createBuffer(1, audio.sampleRate * 2, audio.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    }
    if (audio.state === "suspended") audio.resume();
    return true;
  }

  function isRecording() {
    return recording;
  }

  function setRecordButton(recording) {
    recordButton.setAttribute("aria-pressed", String(recording));
    recordButton.setAttribute("aria-label", recording ? "録音を止める" : "録音");
    recordButton.innerHTML = recording
      ? '<span class="record-dot" aria-hidden="true"></span><span>録音中</span>'
      : '<span class="record-dot" aria-hidden="true"></span><span>録音</span>';
  }

  function clearRecordingUrl() {
    recordingAudio.pause();
    recordingAudio.removeAttribute("src");
    recordingAudio.load();
    if (recordingUrl) URL.revokeObjectURL(recordingUrl);
    recordingUrl = null;
    recordingBlob = null;
    recordingFilename = "";
    downloadRecording.removeAttribute("href");
    shareRecording.hidden = true;
  }

  function filenameForRecording() {
    const now = new Date();
    const stamp = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0"),
      "-",
      String(now.getHours()).padStart(2, "0"),
      String(now.getMinutes()).padStart(2, "0"),
      String(now.getSeconds()).padStart(2, "0"),
    ].join("");
    return `otoniwa-${stamp}.wav`;
  }

  function writeAscii(view, offset, text) {
    for (let index = 0; index < text.length; index += 1) {
      view.setUint8(offset + index, text.charCodeAt(index));
    }
  }

  function createWavBlob(chunks, sampleRate) {
    const sampleCount = chunks.reduce((total, chunk) => total + chunk.length, 0);
    const buffer = new ArrayBuffer(44 + sampleCount * 2);
    const view = new DataView(buffer);
    writeAscii(view, 0, "RIFF");
    view.setUint32(4, 36 + sampleCount * 2, true);
    writeAscii(view, 8, "WAVE");
    writeAscii(view, 12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeAscii(view, 36, "data");
    view.setUint32(40, sampleCount * 2, true);

    let offset = 44;
    chunks.forEach(chunk => {
      for (let index = 0; index < chunk.length; index += 1) {
        const sample = Math.max(-1, Math.min(1, chunk[index]));
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
        offset += 2;
      }
    });
    return new Blob([buffer], { type: "audio/wav" });
  }

  function publishRecording(blob) {
    clearRecordingUrl();
    recordingBlob = blob;
    recordingUrl = URL.createObjectURL(recordingBlob);
    recordingFilename = filenameForRecording();
    recordingAudio.src = recordingUrl;
    downloadRecording.href = recordingUrl;
    downloadRecording.download = recordingFilename;
    recordingPanel.hidden = false;

    if (typeof File === "function" && typeof navigator.canShare === "function") {
      const file = new File([recordingBlob], recordingFilename, { type: recordingBlob.type });
      shareRecording.hidden = !navigator.canShare({ files: [file] });
    }
    showToast("曲の種を録音したよ ♫");
  }

  async function renderGardenRecording(duration, sampleRate, seedSnapshot, tempo) {
    const OfflineAudioContext = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!OfflineAudioContext) return null;
    const frameCount = Math.max(1, Math.ceil(duration * sampleRate));
    const context = new OfflineAudioContext(1, frameCount, sampleRate);
    const output = context.createGain();
    output.gain.value = 0.72;
    output.connect(context.destination);
    const renderedNoise = context.createBuffer(1, sampleRate * 2, sampleRate);
    const noiseData = renderedNoise.getChannelData(0);
    for (let index = 0; index < noiseData.length; index += 1) noiseData[index] = Math.random() * 2 - 1;

    const renderedEnvelope = (gainNode, time, peak, attack, release) => {
      gainNode.gain.setValueAtTime(0.0001, time);
      gainNode.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), time + attack);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, time + attack + release);
    };
    const playRenderedSeed = (seed, time) => {
      if (seed.type === "sparkle") {
        const gain = context.createGain();
        const fundamental = context.createOscillator();
        const shimmer = context.createOscillator();
        const shimmerGain = context.createGain();
        fundamental.type = "sine";
        shimmer.type = "sine";
        fundamental.frequency.value = pitchFor(seed) * 2;
        shimmer.frequency.value = pitchFor(seed) * 4.01;
        shimmerGain.gain.value = 0.28;
        fundamental.connect(gain);
        shimmer.connect(shimmerGain).connect(gain);
        gain.connect(output);
        renderedEnvelope(gain, time, volumeFor(seed), 0.008, 0.72);
        fundamental.start(time); shimmer.start(time);
        fundamental.stop(time + 0.82); shimmer.stop(time + 0.82);
      }
      if (seed.type === "fluffy") {
        const gain = context.createGain();
        const filter = context.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.value = 850 + (1 - seed.y) * 1250;
        filter.Q.value = 0.5;
        const base = pitchFor(seed) / 2;
        [1, 1.5, 2].forEach((ratio, index) => {
          const osc = context.createOscillator();
          osc.type = index === 0 ? "triangle" : "sine";
          osc.frequency.value = base * ratio;
          osc.detune.value = index === 1 ? -5 : index === 2 ? 4 : 0;
          osc.connect(filter);
          osc.start(time);
          osc.stop(time + 1.55);
        });
        filter.connect(gain).connect(output);
        renderedEnvelope(gain, time, volumeFor(seed) * 0.58, 0.22, 1.22);
      }
      if (seed.type === "bubbly") {
        const gain = context.createGain();
        const osc = context.createOscillator();
        const startPitch = 90 + (1 - seed.y) * 170;
        osc.type = "sine";
        osc.frequency.setValueAtTime(startPitch * 1.8, time);
        osc.frequency.exponentialRampToValueAtTime(startPitch, time + 0.12);
        osc.connect(gain).connect(output);
        renderedEnvelope(gain, time, volumeFor(seed) * 1.2, 0.006, 0.22);
        osc.start(time); osc.stop(time + 0.28);
      }
      if (seed.type === "grainy") {
        const source = context.createBufferSource();
        const lowFilter = context.createBiquadFilter();
        const gritFilter = context.createBiquadFilter();
        const lowGain = context.createGain();
        const gritGain = context.createGain();
        const mix = context.createGain();
        source.buffer = renderedNoise;
        lowFilter.type = "lowpass";
        lowFilter.frequency.value = 260 + (1 - seed.y) * 520;
        lowFilter.Q.value = 2.2;
        gritFilter.type = "bandpass";
        gritFilter.frequency.value = 950 + (1 - seed.y) * 1450;
        gritFilter.Q.value = 0.75;
        lowGain.gain.value = 0.72;
        gritGain.gain.value = 0.5;
        source.connect(lowFilter).connect(lowGain).connect(mix);
        source.connect(gritFilter).connect(gritGain).connect(mix);
        mix.connect(output);
        renderedEnvelope(mix, time, volumeFor(seed) * 0.95, 0.01, 0.5);
        source.start(time, Math.random());
        source.stop(time + 0.56);
      }
      if (seed.type === "drizzle") {
        const wash = context.createBufferSource();
        const filter = context.createBiquadFilter();
        const washGain = context.createGain();
        wash.buffer = renderedNoise;
        filter.type = "bandpass";
        filter.frequency.value = 1500 + (1 - seed.y) * 2800;
        filter.Q.value = 0.7;
        wash.connect(filter).connect(washGain).connect(output);
        renderedEnvelope(washGain, time, volumeFor(seed) * 0.42, 0.018, 0.62);
        wash.start(time, Math.random() * 1.1);
        wash.stop(time + 0.7);
        [0.02, 0.16, 0.29].forEach((offset, index) => {
          const drop = context.createOscillator();
          const dropGain = context.createGain();
          const startPitch = pitchFor(seed) * (3.3 + index * 0.38);
          drop.type = "sine";
          drop.frequency.setValueAtTime(startPitch, time + offset);
          drop.frequency.exponentialRampToValueAtTime(startPitch * 0.58, time + offset + 0.09);
          drop.connect(dropGain).connect(output);
          renderedEnvelope(dropGain, time + offset, volumeFor(seed) * 0.14, 0.003, 0.1);
          drop.start(time + offset);
          drop.stop(time + offset + 0.13);
        });
      }
      if (seed.type === "breeze") {
        const source = context.createBufferSource();
        const filter = context.createBiquadFilter();
        const softener = context.createBiquadFilter();
        const gain = context.createGain();
        const lfo = context.createOscillator();
        const lfoDepth = context.createGain();
        source.buffer = renderedNoise;
        filter.type = "bandpass";
        filter.frequency.value = 430 + (1 - seed.y) * 1150;
        filter.Q.value = 0.55;
        softener.type = "lowpass";
        softener.frequency.value = 2300;
        lfo.frequency.value = 0.7;
        lfoDepth.gain.value = 120;
        lfo.connect(lfoDepth).connect(filter.frequency);
        source.connect(filter).connect(softener).connect(gain).connect(output);
        renderedEnvelope(gain, time, volumeFor(seed) * 0.52, 0.2, 1.02);
        source.start(time, Math.random() * 0.55);
        lfo.start(time);
        source.stop(time + 1.3);
        lfo.stop(time + 1.3);
      }
      if (seed.type === "wood") {
        const gain = context.createGain();
        const base = pitchFor(seed) * 0.92;
        [[1, 1], [2.02, 0.28], [3.85, 0.1]].forEach(([ratio, level]) => {
          const osc = context.createOscillator();
          const partialGain = context.createGain();
          osc.type = ratio === 1 ? "sine" : "triangle";
          osc.frequency.value = base * ratio;
          partialGain.gain.value = level;
          osc.connect(partialGain).connect(gain);
          osc.start(time);
          osc.stop(time + 0.38);
        });
        gain.connect(output);
        renderedEnvelope(gain, time, volumeFor(seed) * 0.72, 0.004, 0.31);
        const click = context.createBufferSource();
        const clickFilter = context.createBiquadFilter();
        const clickGain = context.createGain();
        click.buffer = renderedNoise;
        clickFilter.type = "highpass";
        clickFilter.frequency.value = 1300;
        click.connect(clickFilter).connect(clickGain).connect(output);
        renderedEnvelope(clickGain, time, volumeFor(seed) * 0.11, 0.002, 0.045);
        click.start(time, Math.random());
        click.stop(time + 0.06);
      }
      if (seed.type === "bird") {
        const base = pitchFor(seed) * 2.05;
        [[0, 1, 1.14], [0.13, 1.24, 1.38], [0.25, 1.1, 1.28]].forEach(([offset, fromRatio, toRatio]) => {
          const chirp = context.createOscillator();
          const chirpGain = context.createGain();
          chirp.type = "sine";
          chirp.frequency.setValueAtTime(base * fromRatio, time + offset);
          chirp.frequency.exponentialRampToValueAtTime(base * toRatio, time + offset + 0.11);
          chirp.connect(chirpGain).connect(output);
          renderedEnvelope(chirpGain, time + offset, volumeFor(seed) * 0.38, 0.009, 0.12);
          chirp.start(time + offset);
          chirp.stop(time + offset + 0.15);
        });
      }
    };

    for (let stepIndex = 0, time = 0.06; time < duration; stepIndex += 1, time += secondsPerStep(tempo)) {
      const step = stepIndex % 8;
      seedSnapshot
        .filter(seed => Math.min(7, Math.floor(seed.x * 8)) === step)
        .forEach(seed => playRenderedSeed(seed, time));
    }
    const rendered = await context.startRendering();
    return new Float32Array(rendered.getChannelData(0));
  }

  async function finishRecording(chunks, sampleRate, duration, seedSnapshot, tempo) {
    let finishedChunks = chunks;
    if (finishedChunks.length === 0) {
      const rendered = await renderGardenRecording(duration, sampleRate, seedSnapshot, tempo);
      if (!rendered) {
        showToast("録音を作れませんでした");
        return;
      }
      finishedChunks = [rendered];
    }
    publishRecording(createWavBlob(finishedChunks, sampleRate));
  }

  function startRecording() {
    if (recordingFinishing) {
      showToast("いま録音を仕上げているよ");
      return;
    }
    if (seeds.length === 0) {
      showToast("先に音の種を置いてね");
      return;
    }
    if (!ensureAudio()) return;
    if (typeof audio.createScriptProcessor !== "function") {
      showToast("このブラウザは録音に対応していません");
      return;
    }

    recordingPanel.hidden = true;
    recordingChunks = [];
    recordingSampleRate = audio.sampleRate;
    recordingStartedAt = audio.currentTime;
    recordingProcessor = audio.createScriptProcessor(4096, 1, 1);
    recordingSilence = audio.createGain();
    recordingSilence.gain.value = 0;
    recordingProcessor.onaudioprocess = event => {
      if (!recording) return;
      recordingChunks.push(new Float32Array(event.inputBuffer.getChannelData(0)));
    };
    master.connect(recordingProcessor);
    recordingProcessor.connect(recordingSilence);
    recordingSilence.connect(audio.destination);
    recording = true;
    setRecordButton(true);
    if (!isPlaying) startPlayback(true);
    showToast("録音を始めたよ ●");
  }

  function stopRecording() {
    if (!isRecording()) return;
    recording = false;
    try { master.disconnect(recordingProcessor); } catch (_) { /* already disconnected */ }
    try { recordingProcessor.disconnect(); } catch (_) { /* already disconnected */ }
    try { recordingSilence.disconnect(); } catch (_) { /* already disconnected */ }
    recordingProcessor.onaudioprocess = null;
    recordingProcessor = null;
    recordingSilence = null;
    const finishedChunks = recordingChunks;
    recordingChunks = [];
    const duration = Math.max(0.35, audio.currentTime - recordingStartedAt);
    const seedSnapshot = seeds.map(({ type, x, y, size }) => ({ type, x, y, size }));
    const recordingTempo = bpm;
    setRecordButton(false);
    recordingFinishing = true;
    finishRecording(finishedChunks, recordingSampleRate, duration, seedSnapshot, recordingTempo)
      .catch(() => showToast("録音を作れませんでした"))
      .finally(() => { recordingFinishing = false; });
  }

  async function shareCurrentRecording() {
    if (!recordingBlob || typeof File !== "function" || typeof navigator.share !== "function") return;
    const file = new File([recordingBlob], recordingFilename, { type: recordingBlob.type });
    try {
      await navigator.share({ title: "音庭で生まれた曲", files: [file] });
    } catch (error) {
      if (error?.name !== "AbortError") showToast("共有できませんでした");
    }
  }

  function volumeFor(seed) {
    return [0.16, 0.28, 0.42][seed.size - 1];
  }

  function pitchFor(seed) {
    const index = Math.round((1 - seed.y) * (notes.length - 1));
    return notes[Math.max(0, Math.min(notes.length - 1, index))];
  }

  function envelope(gainNode, time, peak, attack, release) {
    const gain = gainNode.gain;
    gain.cancelScheduledValues(time);
    gain.setValueAtTime(0.0001, time);
    gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), time + attack);
    gain.exponentialRampToValueAtTime(0.0001, time + attack + release);
  }

  function trackSource(source) {
    activeSources.add(source);
    garden.dataset.activeSources = String(activeSources.size);
    source.addEventListener("ended", () => {
      activeSources.delete(source);
      garden.dataset.activeSources = String(activeSources.size);
    }, { once: true });
    return source;
  }

  function silenceAllSources() {
    for (const source of activeSources) {
      try { source.stop(0); } catch (_) { /* already stopped */ }
      try { source.disconnect(); } catch (_) { /* already disconnected */ }
    }
    activeSources.clear();
    garden.dataset.activeSources = "0";
  }

  function playSparkle(seed, time) {
    const gain = audio.createGain();
    const fundamental = trackSource(audio.createOscillator());
    const shimmer = trackSource(audio.createOscillator());
    const shimmerGain = audio.createGain();
    fundamental.type = "sine";
    shimmer.type = "sine";
    fundamental.frequency.value = pitchFor(seed) * 2;
    shimmer.frequency.value = pitchFor(seed) * 4.01;
    shimmerGain.gain.value = 0.28;
    fundamental.connect(gain);
    shimmer.connect(shimmerGain).connect(gain);
    gain.connect(master);
    envelope(gain, time, volumeFor(seed), 0.008, 0.72);
    fundamental.start(time); shimmer.start(time);
    fundamental.stop(time + 0.82); shimmer.stop(time + 0.82);
  }

  function playFluffy(seed, time) {
    const gain = audio.createGain();
    const filter = audio.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 850 + (1 - seed.y) * 1250;
    filter.Q.value = 0.5;
    const base = pitchFor(seed) / 2;
    [1, 1.5, 2].forEach((ratio, index) => {
      const osc = trackSource(audio.createOscillator());
      osc.type = index === 0 ? "triangle" : "sine";
      osc.frequency.value = base * ratio;
      osc.detune.value = index === 1 ? -5 : index === 2 ? 4 : 0;
      osc.connect(filter);
      osc.start(time);
      osc.stop(time + 1.55);
    });
    filter.connect(gain).connect(master);
    envelope(gain, time, volumeFor(seed) * 0.58, 0.22, 1.22);
  }

  function playBubbly(seed, time) {
    const gain = audio.createGain();
    const osc = trackSource(audio.createOscillator());
    osc.type = "sine";
    const startPitch = 90 + (1 - seed.y) * 170;
    osc.frequency.setValueAtTime(startPitch * 1.8, time);
    osc.frequency.exponentialRampToValueAtTime(startPitch, time + 0.12);
    osc.connect(gain).connect(master);
    envelope(gain, time, volumeFor(seed) * 1.2, 0.006, 0.22);
    osc.start(time); osc.stop(time + 0.28);
  }

  function playGrainy(seed, time) {
    const source = trackSource(audio.createBufferSource());
    const lowFilter = audio.createBiquadFilter();
    const gritFilter = audio.createBiquadFilter();
    const lowGain = audio.createGain();
    const gritGain = audio.createGain();
    const mix = audio.createGain();
    source.buffer = noiseBuffer;
    lowFilter.type = "lowpass";
    lowFilter.frequency.value = 260 + (1 - seed.y) * 520;
    lowFilter.Q.value = 2.2;
    gritFilter.type = "bandpass";
    gritFilter.frequency.value = 950 + (1 - seed.y) * 1450;
    gritFilter.Q.value = 0.75;
    lowGain.gain.value = 0.72;
    gritGain.gain.value = 0.5;
    source.connect(lowFilter).connect(lowGain).connect(mix);
    source.connect(gritFilter).connect(gritGain).connect(mix);
    mix.connect(master);
    envelope(mix, time, volumeFor(seed) * 0.95, 0.01, 0.5);
    source.start(time, Math.random());
    source.stop(time + 0.56);
  }

  function playDrizzle(seed, time) {
    const wash = trackSource(audio.createBufferSource());
    const filter = audio.createBiquadFilter();
    const washGain = audio.createGain();
    wash.buffer = noiseBuffer;
    filter.type = "bandpass";
    filter.frequency.value = 1500 + (1 - seed.y) * 2800;
    filter.Q.value = 0.7;
    wash.connect(filter).connect(washGain).connect(master);
    envelope(washGain, time, volumeFor(seed) * 0.42, 0.018, 0.62);
    wash.start(time, Math.random() * 1.1);
    wash.stop(time + 0.7);

    [0.02, 0.16, 0.29].forEach((offset, index) => {
      const drop = trackSource(audio.createOscillator());
      const dropGain = audio.createGain();
      const startPitch = pitchFor(seed) * (3.3 + index * 0.38);
      drop.type = "sine";
      drop.frequency.setValueAtTime(startPitch, time + offset);
      drop.frequency.exponentialRampToValueAtTime(startPitch * 0.58, time + offset + 0.09);
      drop.connect(dropGain).connect(master);
      envelope(dropGain, time + offset, volumeFor(seed) * 0.14, 0.003, 0.1);
      drop.start(time + offset);
      drop.stop(time + offset + 0.13);
    });
  }

  function playBreeze(seed, time) {
    const source = trackSource(audio.createBufferSource());
    const filter = audio.createBiquadFilter();
    const softener = audio.createBiquadFilter();
    const gain = audio.createGain();
    const lfo = trackSource(audio.createOscillator());
    const lfoDepth = audio.createGain();
    source.buffer = noiseBuffer;
    filter.type = "bandpass";
    filter.frequency.value = 430 + (1 - seed.y) * 1150;
    filter.Q.value = 0.55;
    softener.type = "lowpass";
    softener.frequency.value = 2300;
    lfo.frequency.value = 0.7;
    lfoDepth.gain.value = 120;
    lfo.connect(lfoDepth).connect(filter.frequency);
    source.connect(filter).connect(softener).connect(gain).connect(master);
    envelope(gain, time, volumeFor(seed) * 0.52, 0.2, 1.02);
    source.start(time, Math.random() * 0.55);
    lfo.start(time);
    source.stop(time + 1.3);
    lfo.stop(time + 1.3);
  }

  function playWood(seed, time) {
    const gain = audio.createGain();
    const base = pitchFor(seed) * 0.92;
    [[1, 1], [2.02, 0.28], [3.85, 0.1]].forEach(([ratio, level]) => {
      const osc = trackSource(audio.createOscillator());
      const partialGain = audio.createGain();
      osc.type = ratio === 1 ? "sine" : "triangle";
      osc.frequency.value = base * ratio;
      partialGain.gain.value = level;
      osc.connect(partialGain).connect(gain);
      osc.start(time);
      osc.stop(time + 0.38);
    });
    gain.connect(master);
    envelope(gain, time, volumeFor(seed) * 0.72, 0.004, 0.31);

    const click = trackSource(audio.createBufferSource());
    const clickFilter = audio.createBiquadFilter();
    const clickGain = audio.createGain();
    click.buffer = noiseBuffer;
    clickFilter.type = "highpass";
    clickFilter.frequency.value = 1300;
    click.connect(clickFilter).connect(clickGain).connect(master);
    envelope(clickGain, time, volumeFor(seed) * 0.11, 0.002, 0.045);
    click.start(time, Math.random());
    click.stop(time + 0.06);
  }

  function playBird(seed, time) {
    const base = pitchFor(seed) * 2.05;
    [
      [0, 1, 1.14],
      [0.13, 1.24, 1.38],
      [0.25, 1.1, 1.28],
    ].forEach(([offset, fromRatio, toRatio]) => {
      const chirp = trackSource(audio.createOscillator());
      const chirpGain = audio.createGain();
      chirp.type = "sine";
      chirp.frequency.setValueAtTime(base * fromRatio, time + offset);
      chirp.frequency.exponentialRampToValueAtTime(base * toRatio, time + offset + 0.11);
      chirp.connect(chirpGain).connect(master);
      envelope(chirpGain, time + offset, volumeFor(seed) * 0.38, 0.009, 0.12);
      chirp.start(time + offset);
      chirp.stop(time + offset + 0.15);
    });
  }

  function animateSeed(seed, delayMs) {
    setTimeout(() => {
      if (!seed.el?.isConnected) return;
      seed.el.classList.remove("sounding");
      void seed.el.offsetWidth;
      seed.el.classList.add("sounding");
      setTimeout(() => seed.el?.classList.remove("sounding"), 360);
    }, Math.max(0, delayMs));
  }

  function trigger(seed, time) {
    if (!audio || !master) return;
    if (seed.type === "sparkle") playSparkle(seed, time);
    if (seed.type === "fluffy") playFluffy(seed, time);
    if (seed.type === "bubbly") playBubbly(seed, time);
    if (seed.type === "grainy") playGrainy(seed, time);
    if (seed.type === "drizzle") playDrizzle(seed, time);
    if (seed.type === "breeze") playBreeze(seed, time);
    if (seed.type === "wood") playWood(seed, time);
    if (seed.type === "bird") playBird(seed, time);
    animateSeed(seed, (time - audio.currentTime) * 1000);
  }

  function scheduleStep(step, time) {
    const delay = Math.max(0, (time - audio.currentTime) * 1000);
    setTimeout(() => {
      if (isPlaying) playhead.style.transform = `translateX(${step * 100}%)`;
    }, delay);
    seeds.filter(seed => Math.min(7, Math.floor(seed.x * 8)) === step).forEach(seed => trigger(seed, time));
  }

  function schedulerTick() {
    if (!audio || !isPlaying) return;
    while (nextStepTime < audio.currentTime + scheduleAhead) {
      scheduleStep(currentStep, nextStepTime);
      nextStepTime += secondsPerStep();
      currentStep = (currentStep + 1) % 8;
    }
  }

  function startPlayback(silent = false) {
    if (!ensureAudio()) return;
    if (isPlaying) return;
    isPlaying = true;
    currentStep = 0;
    nextStepTime = audio.currentTime + 0.06;
    master.gain.cancelScheduledValues(audio.currentTime);
    master.gain.setValueAtTime(0.0001, audio.currentTime);
    master.gain.linearRampToValueAtTime(0.72, audio.currentTime + 0.02);
    schedulerTick();
    scheduler = setInterval(schedulerTick, 25);
    garden.classList.add("playing");
    playButton.setAttribute("aria-pressed", "true");
    playButton.innerHTML = '<span aria-hidden="true">♫</span><span>再生中</span>';
    if (!silent && seeds.length === 0) showToast("種を置くと、ここから音が育つよ");
  }

  function stopPlayback() {
    isPlaying = false;
    clearInterval(scheduler);
    scheduler = null;
    if (audio && master) {
      master.gain.cancelScheduledValues(audio.currentTime);
      master.gain.setValueAtTime(0, audio.currentTime);
      silenceAllSources();
    }
    garden.classList.remove("playing");
    playButton.setAttribute("aria-pressed", "false");
    playButton.innerHTML = '<span aria-hidden="true">▶</span><span>再生</span>';
    playhead.style.transform = "translateX(0)";
  }

  function stopEverything() {
    stopRecording();
    stopPlayback();
  }

  function positionFromPoint(clientX, clientY) {
    const rect = garden.getBoundingClientRect();
    return {
      x: Math.max(0.035, Math.min(0.965, (clientX - rect.left) / rect.width)),
      y: Math.max(0.055, Math.min(0.945, (clientY - rect.top) / rect.height)),
    };
  }

  function updateSeedElement(seed) {
    seed.el.style.left = `${seed.x * 100}%`;
    seed.el.style.top = `${seed.y * 100}%`;
    seed.el.style.setProperty("--size", [0.82, 1, 1.2][seed.size - 1]);
    seed.el.setAttribute("aria-label", `${kinds[seed.type].label}。大きさ${seed.size}。ドラッグで移動、押すと大きさ変更、長押しで消せます`);
  }

  function removeSeed(seed) {
    const index = seeds.indexOf(seed);
    if (index < 0) return;
    seeds.splice(index, 1);
    seed.el.remove();
    if (seeds.length === 0) emptyHint.classList.remove("hidden");
    showToast(`${kinds[seed.type].label}の種を摘んだよ`);
  }

  function attachPlacedSeedGestures(seed) {
    let moved = false;
    let suppressPlacementClick = false;
    let longPressed = false;
    let longPressTimer = null;
    let startX = 0;
    let startY = 0;

    const cancelLongPress = () => {
      clearTimeout(longPressTimer);
      longPressTimer = null;
      seed.el.classList.remove("holding");
    };

    seed.el.addEventListener("pointerdown", event => {
      event.preventDefault();
      moved = false;
      longPressed = false;
      startX = event.clientX;
      startY = event.clientY;
      seed.el.setPointerCapture(event.pointerId);
      seed.el.classList.add("moving");
      seed.el.classList.add("holding");
      longPressTimer = setTimeout(() => {
        if (moved || !seed.el.isConnected) return;
        longPressed = true;
        suppressPlacementClick = true;
        seed.el.classList.remove("holding", "moving");
        seed.el.classList.add("removing");
        if (typeof navigator.vibrate === "function") navigator.vibrate(24);
        setTimeout(() => removeSeed(seed), 190);
      }, 620);
    });

    seed.el.addEventListener("pointermove", event => {
      if (!seed.el.hasPointerCapture(event.pointerId)) return;
      if (Math.hypot(event.clientX - startX, event.clientY - startY) > 5) {
        moved = true;
        cancelLongPress();
      }
      if (moved) {
        const point = positionFromPoint(event.clientX, event.clientY);
        seed.x = point.x;
        seed.y = point.y;
        updateSeedElement(seed);
      }
    });

    seed.el.addEventListener("pointerup", event => {
      cancelLongPress();
      if (seed.el.hasPointerCapture(event.pointerId)) seed.el.releasePointerCapture(event.pointerId);
      seed.el.classList.remove("moving");
      if (moved) suppressPlacementClick = true;
    });

    seed.el.addEventListener("pointercancel", () => {
      cancelLongPress();
      seed.el.classList.remove("moving");
    });

    seed.el.addEventListener("contextmenu", event => event.preventDefault());

    seed.el.addEventListener("click", () => {
      if (longPressed) {
        longPressed = false;
        return;
      }
      if (suppressPlacementClick) {
        suppressPlacementClick = false;
        return;
      }
      seed.size = seed.size % 3 + 1;
      updateSeedElement(seed);
      if (ensureAudio()) trigger(seed, audio.currentTime + 0.02);
    });

    seed.el.addEventListener("keydown", event => {
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        seed.el.classList.add("removing");
        setTimeout(() => removeSeed(seed), 190);
        return;
      }
      const amount = event.shiftKey ? 0.05 : 0.02;
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
        event.preventDefault();
        if (event.key === "ArrowLeft") seed.x -= amount;
        if (event.key === "ArrowRight") seed.x += amount;
        if (event.key === "ArrowUp") seed.y -= amount;
        if (event.key === "ArrowDown") seed.y += amount;
        seed.x = Math.max(.035, Math.min(.965, seed.x));
        seed.y = Math.max(.055, Math.min(.945, seed.y));
        updateSeedElement(seed);
      }
    });
  }

  function addSeed(type, x, y) {
    if (!kinds[type]) return;
    const el = document.createElement("button");
    el.type = "button";
    el.className = `placed-seed ${type}`;
    el.textContent = kinds[type].icon;
    const seed = { id: nextId++, type, x, y, size: 2, el };
    seeds.push(seed);
    updateSeedElement(seed);
    attachPlacedSeedGestures(seed);
    garden.appendChild(el);
    emptyHint.classList.add("hidden");
    if (!isPlaying) startPlayback(true);
    else if (ensureAudio()) trigger(seed, audio.currentTime + 0.02);
  }

  function clearGarden() {
    stopEverything();
    seeds.splice(0).forEach(seed => seed.el.remove());
    emptyHint.classList.remove("hidden");
    showToast("お庭をまっさらにしたよ");
  }

  seedCards.forEach(card => {
    let suppressClick = false;
    card.addEventListener("dragstart", event => {
      dragType = card.dataset.seed;
      card.classList.add("dragging");
      event.dataTransfer.effectAllowed = "copy";
      event.dataTransfer.setData("text/plain", dragType);
    });
    card.addEventListener("dragend", () => {
      card.classList.remove("dragging");
      garden.classList.remove("drag-over");
      dragType = null;
    });

    card.addEventListener("pointerdown", event => {
      event.preventDefault();
      dragType = card.dataset.seed;
      card.classList.add("dragging");
      pointerGhost = card.querySelector(".seed-icon").cloneNode(true);
      Object.assign(pointerGhost.style, {
        position: "fixed", left: `${event.clientX - 22}px`, top: `${event.clientY - 22}px`,
        zIndex: 100, pointerEvents: "none", background: "rgba(255,255,255,.9)", boxShadow: "0 8px 20px rgba(50,60,55,.2)"
      });
      document.body.appendChild(pointerGhost);
      card.setPointerCapture(event.pointerId);
    });
    card.addEventListener("pointermove", event => {
      if (!pointerGhost) return;
      pointerGhost.style.left = `${event.clientX - 22}px`;
      pointerGhost.style.top = `${event.clientY - 22}px`;
      const rect = garden.getBoundingClientRect();
      garden.classList.toggle("drag-over", event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom);
    });
    card.addEventListener("pointerup", event => {
      if (!pointerGhost) return;
      const rect = garden.getBoundingClientRect();
      if (event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom) {
        const point = positionFromPoint(event.clientX, event.clientY);
        addSeed(dragType, point.x, point.y);
        suppressClick = true;
      }
      pointerGhost.remove(); pointerGhost = null;
      card.classList.remove("dragging"); garden.classList.remove("drag-over"); dragType = null;
    });

    card.addEventListener("click", () => {
      if (suppressClick) {
        suppressClick = false;
        return;
      }
      if (dragType || pointerGhost) return;
      const count = seeds.filter(seed => seed.type === card.dataset.seed).length;
      addSeed(card.dataset.seed, 0.18 + (count % 4) * 0.2, 0.25 + ((count * 0.21) % 0.5));
    });
  });

  garden.addEventListener("dragover", event => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    garden.classList.add("drag-over");
  });
  garden.addEventListener("dragleave", event => {
    if (!garden.contains(event.relatedTarget)) garden.classList.remove("drag-over");
  });
  garden.addEventListener("drop", event => {
    event.preventDefault();
    const type = event.dataTransfer.getData("text/plain") || dragType;
    const point = positionFromPoint(event.clientX, event.clientY);
    garden.classList.remove("drag-over");
    addSeed(type, point.x, point.y);
  });

  playButton.addEventListener("click", () => isPlaying ? stopEverything() : startPlayback());
  stopButton.addEventListener("click", stopEverything);
  recordButton.addEventListener("click", () => isRecording() ? stopRecording() : startRecording());
  clearButton.addEventListener("click", clearGarden);
  bpmSlider.addEventListener("input", () => {
    bpm = Number(bpmSlider.value);
    updateTempoDisplay();
  });
  bpmSlider.addEventListener("change", () => {
    showToast(`成長速度を ${bpm} BPM にしたよ`);
  });
  shareRecording.addEventListener("click", shareCurrentRecording);
  discardRecording.addEventListener("click", () => {
    clearRecordingUrl();
    recordingPanel.hidden = true;
    showToast("録音を消したよ");
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && (isPlaying || isRecording())) stopEverything();
  });
  window.addEventListener("beforeunload", () => {
    stopRecording();
    if (recordingUrl) URL.revokeObjectURL(recordingUrl);
  });

  updateTempoDisplay();

  if ("serviceWorker" in navigator && window.isSecureContext) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./service-worker.js").catch(() => {
        // The garden still works normally when offline installation is unavailable.
      });
    });
  }
})();
