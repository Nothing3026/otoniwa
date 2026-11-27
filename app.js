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
  const gardenTrack = document.querySelector("#gardenTrack");
  const gardenMap = document.querySelector("#gardenMap");
  const extendGardenButton = document.querySelector("#extendGardenButton");
  const unlockSectionButton = document.querySelector("#unlockSectionButton");
  const listenFromStart = document.querySelector("#listenFromStart");
  const listenFromHere = document.querySelector("#listenFromHere");
  const gardenerName = document.querySelector("#gardenerName");
  const passBatonButton = document.querySelector("#passBatonButton");
  const receiveBatonInput = document.querySelector("#receiveBatonInput");
  const relayHistoryList = document.querySelector("#relayHistoryList");
  const batonScene = document.querySelector("#batonScene");
  const batonSceneMessage = document.querySelector("#batonSceneMessage");
  const skipBatonScene = document.querySelector("#skipBatonScene");
  const playhead = document.querySelector("#playhead");
  const toast = document.querySelector("#toast");
  const seedCards = [...document.querySelectorAll(".seed-card")];
  const bpmSlider = document.querySelector("#bpmSlider");
  const bpmValue = document.querySelector("#bpmValue");
  const fairyButton = document.querySelector("#fairyButton");
  const gnomeButton = document.querySelector("#gnomeButton");
  const residentBubble = document.querySelector("#residentBubble");
  const residentBubbleIcon = document.querySelector("#residentBubbleIcon");
  const residentBubbleName = document.querySelector("#residentBubbleName");
  const residentBubbleMessage = document.querySelector("#residentBubbleMessage");
  const residentActions = document.querySelector("#residentActions");
  const suggestionGlow = document.querySelector("#suggestionGlow");
  const seedBasket = document.querySelector("#seedBasket");
  const seedBasketBtn = document.querySelector("#seedBasketBtn");
  const seedBasketPanel = document.querySelector("#seedBasketPanel");
  const seedPendingBar = document.querySelector("#seedPendingBar");
  const seedPendingDisplay = document.querySelector("#seedPendingDisplay");
  const seedPendingCancel = document.querySelector("#seedPendingCancel");
  const seedTray = document.querySelector(".seed-tray");

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
  const DATA_VERSION = 3;
  const MAX_SECTIONS = 12;
  const MAX_SEEDS = 768;
  const SESSION_KEY = "otoniwa-garden-v3";
  const LEGACY_SESSION_KEY = "otoniwa-garden";
  const seeds = [];
  const sections = [];
  const relayHistory = [];
  let bpm = 84;
  let nextId = 1;
  let activeSectionIndex = 0;
  let playbackStartMode = "here";
  let userInteractingUntil = 0;
  let programmaticScrollUntil = 0;
  let scrollTimer = null;
  let saveTimer = null;
  let batonTimer = null;
  let audio = null;
  let master = null;
  let noiseBuffer = null;
  const activeSources = new Set();
  let scheduler = null;
  let isPlaying = false;
  let currentStep = 0;
  let nextStepTime = 0;
  let toastTimer = null;
  let followPlayback = false;
  let isManipulating = false;
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
  let residentSession = null;
  let residentWorkTimer = null;
  let residentChangePending = false;
  let fairySuggestionCursor = 0;
  let pendingFairySuggestion = null;
  let fairyAddedSeed = null;
  let gnomeProposal = null;
  let gnomeSnapshot = null;
  let pendingSeedType = null;
  let gardenTapId = null;
  let gardenTapStartX = 0;
  let gardenTapStartY = 0;
  let seedBasketFrame = null;

  function makeId(prefix = "garden") {
    if (globalThis.crypto?.randomUUID) return `${prefix}-${crypto.randomUUID()}`;
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  }

  function gardenerLabel(index = relayHistory.length) {
    const name = gardenerName.value.trim();
    if (name) return name.slice(0, 30);
    if (index === 0) return "最初の庭師";
    return `${index + 1}人目の庭師`;
  }

  function activeSection() {
    return sections[activeSectionIndex] || sections[0];
  }

  function activeSeeds() {
    return seeds.filter(seed => seed.section === activeSectionIndex);
  }

  function sectionElement(index) {
    return gardenTrack.querySelector(`[data-section-index="${index}"]`);
  }

  function updateEmptyHints() {
    sections.forEach((_, index) => {
      const hint = sectionElement(index)?.querySelector(".empty-hint");
      if (hint) hint.classList.toggle("hidden", seeds.some(seed => seed.section === index));
    });
  }

  function updatePerformanceMode() {
    const smallDevice = Number(navigator.hardwareConcurrency || 8) <= 4;
    garden.classList.toggle("light-effects", smallDevice || sections.length > 8);
  }

  function sectionMarkup(index) {
    return `
      <div class="garden-sky" aria-hidden="true"></div>
      <div class="garden-grid" aria-hidden="true">${"<span></span>".repeat(8)}</div>
      <div class="empty-hint">
        <span class="hint-sprout" aria-hidden="true">🌱</span>
        <strong>${index ? "続きをここから育てよう" : "ここに種を置いてみよう"}</strong>
        <span>上は高い音 · 右へ行くほど後に鳴る</span>
      </div>
      <div class="garden-label high" aria-hidden="true">たかい</div>
      <div class="garden-label low" aria-hidden="true">ひくい</div>`;
  }

  function wireSectionDrop(sectionEl) {
    sectionEl.addEventListener("dragover", event => {
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
      if (!sections[Number(sectionEl.dataset.sectionIndex)]?.locked) sectionEl.classList.add("drag-over");
    });
    sectionEl.addEventListener("dragleave", event => {
      if (!sectionEl.contains(event.relatedTarget)) sectionEl.classList.remove("drag-over");
    });
    sectionEl.addEventListener("drop", event => {
      event.preventDefault();
      const sectionIndex = Number(sectionEl.dataset.sectionIndex);
      sectionEl.classList.remove("drag-over");
      if (sections[sectionIndex]?.locked) {
        showToast("前の庭師さんのお庭は大切に残しているよ");
        return;
      }
      setActiveSection(sectionIndex, false);
      const type = event.dataTransfer.getData("text/plain") || dragType;
      const point = positionFromPoint(event.clientX, event.clientY, sectionEl);
      addSeed(type, point.x, point.y, sectionIndex);
    });
  }

  function renderSections() {
    const previousChildren = new Map([...gardenTrack.children].map(el => [el.dataset.sectionId, el]));
    gardenTrack.replaceChildren();
    sections.forEach((section, index) => {
      let el = previousChildren.get(section.id);
      if (!el) {
        el = document.createElement("section");
        el.className = "garden-section";
        el.dataset.sectionId = section.id;
        el.innerHTML = sectionMarkup(index);
        wireSectionDrop(el);
      }
      el.dataset.sectionIndex = String(index);
      el.classList.toggle("locked", Boolean(section.locked));
      el.setAttribute("aria-label", `${index + 1}つ目のお庭${section.locked ? "。前の庭師さんの音" : ""}`);
      gardenTrack.appendChild(el);
    });
    seeds.forEach(seed => sectionElement(seed.section)?.appendChild(seed.el));
    renderGardenMap();
    updateEmptyHints();
    updatePerformanceMode();
  }

  function renderGardenMap() {
    gardenMap.replaceChildren();
    sections.forEach((section, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = section.locked ? "🍃" : "🌱";
      button.classList.toggle("active", index === activeSectionIndex);
      button.dataset.authorMark = section.author ? section.author.slice(0, 1) : "";
      button.setAttribute("aria-label", `${index + 1}つ目のお庭へ${section.author ? `。${section.author}` : ""}`);
      button.addEventListener("click", () => setActiveSection(index));
      gardenMap.appendChild(button);
    });
    unlockSectionButton.hidden = !activeSection()?.locked;
    extendGardenButton.disabled = sections.length >= MAX_SECTIONS;
  }

  function setActiveSection(index, scroll = true) {
    activeSectionIndex = Math.max(0, Math.min(sections.length - 1, Number(index) || 0));
    renderGardenMap();
    if (scroll) {
      userInteractingUntil = Date.now() + 900;
      programmaticScrollUntil = Date.now() + 700;
      sectionElement(activeSectionIndex)?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" });
    }
  }

  function addSection({ locked = false, author = "" } = {}, announce = true) {
    if (sections.length >= MAX_SECTIONS) {
      showToast("お庭はここまで育ったよ");
      return null;
    }
    const section = { id: makeId("section"), locked: Boolean(locked), author: String(author || "").slice(0, 30) };
    sections.push(section);
    renderSections();
    if (announce) {
      setActiveSection(sections.length - 1);
      showToast("小道の先に、新しいお庭がひらいたよ");
    }
    queueSessionSave();
    return section;
  }

  function serializeGarden() {
    return {
      app: "otoniwa",
      version: DATA_VERSION,
      title: "音庭で生まれた曲",
      bpm,
      sections: sections.map(({ id, author, locked }) => ({ id, author, locked: Boolean(locked) })),
      seeds: seeds.map(({ id, type, x, y, size, section, source }) => ({ id, type, x, y, size, section, source: source || "user" })),
      effects: { plants: true, light: garden.classList.contains("light-effects") ? "light" : "full" },
      relay: relayHistory.map(entry => ({ gardener: entry.gardener, at: entry.at, sections: entry.sections })),
    };
  }

  function queueSessionSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { localStorage.setItem(SESSION_KEY, JSON.stringify(serializeGarden())); } catch (_) { /* private mode */ }
    }, 180);
  }

  function normalizeGardenData(raw) {
    if (Array.isArray(raw)) raw = { version: 1, seeds: raw };
    if (!raw || typeof raw !== "object") throw new Error("音のバトンの形が分かりません");
    const rawSeeds = Array.isArray(raw.seeds) ? raw.seeds : [];
    const rawSections = Array.isArray(raw.sections) && raw.sections.length ? raw.sections : [{ id: "legacy-section", author: "最初の庭師" }];
    if (rawSections.length > MAX_SECTIONS || rawSeeds.length > MAX_SEEDS) throw new Error("この音のバトンは大きすぎるみたい");
    const normalizedSections = rawSections.map((section, index) => ({
      id: typeof section?.id === "string" ? section.id.slice(0, 80) : `section-${index + 1}`,
      author: typeof section?.author === "string" ? section.author.slice(0, 30) : "",
      locked: Boolean(section?.locked),
    }));
    const normalizedSeeds = rawSeeds.map((seed, index) => {
      const type = String(seed?.type || "");
      const x = Number(seed?.x);
      const y = Number(seed?.y);
      const size = Number(seed?.size);
      const section = Number.isInteger(Number(seed?.section)) ? Number(seed.section) : 0;
      if (!kinds[type] || !Number.isFinite(x) || !Number.isFinite(y) || ![1, 2, 3].includes(size) || section < 0 || section >= normalizedSections.length) throw new Error(`読めない音の種があります（${index + 1}粒目）`);
      return { id: Number.isFinite(Number(seed.id)) ? Number(seed.id) : index + 1, type, x: Math.max(.035, Math.min(.965, x)), y: Math.max(.055, Math.min(.945, y)), size, section, source: typeof seed.source === "string" ? seed.source.slice(0, 20) : "user" };
    });
    const history = Array.isArray(raw.relay) ? raw.relay.slice(0, 50).map(entry => ({ gardener: String(entry?.gardener || "庭師さん").slice(0, 30), at: String(entry?.at || ""), sections: Math.max(1, Math.min(MAX_SECTIONS, Number(entry?.sections) || 1)) })) : [];
    return { bpm: Math.max(50, Math.min(160, Number(raw.bpm) || 84)), sections: normalizedSections, seeds: normalizedSeeds, relay: history };
  }

  function runDataFormatSelfCheck() {
    let brokenRejected = false;
    const legacy = normalizeGardenData([{ id: 1, type: "sparkle", x: .2, y: .3, size: 2 }]);
    try {
      normalizeGardenData({ sections: [{ id: "one" }], seeds: [{ type: "unknown", x: .2, y: .3, size: 2 }] });
    } catch (_) {
      brokenRejected = true;
    }
    const passed = legacy.sections.length === 1 && legacy.seeds[0]?.section === 0 && brokenRejected;
    document.documentElement.dataset.dataCheck = passed ? "passed" : "failed";
    return passed;
  }

  function replaceGardenFromData(data, { received = false } = {}) {
    stopEverything();
    seeds.splice(0).forEach(seed => seed.el?.remove());
    sections.splice(0);
    relayHistory.splice(0);
    data.sections.forEach(section => sections.push({ ...section, locked: received ? true : Boolean(section.locked) }));
    data.relay.forEach(entry => relayHistory.push(entry));
    bpm = data.bpm;
    bpmSlider.value = String(bpm);
    updateTempoDisplay();
    renderSections();
    data.seeds.forEach(seed => addSeed(seed.type, seed.x, seed.y, seed.section, { size: seed.size, id: seed.id, source: seed.source, quiet: true, allowLocked: true }));
    nextId = Math.max(1, ...seeds.map(seed => seed.id + 1));
    if (received) {
      const author = gardenerName.value.trim().slice(0, 30);
      addSection({ author }, false);
      activeSectionIndex = sections.length - 1;
    }
    renderSections();
    setActiveSection(received ? sections.length - 1 : 0, false);
    renderRelayHistory();
    queueSessionSave();
  }

  function renderRelayHistory() {
    relayHistoryList.replaceChildren();
    if (!relayHistory.length) {
      const item = document.createElement("li");
      item.textContent = "まだ最初のお庭です";
      relayHistoryList.appendChild(item);
      return;
    }
    relayHistory.forEach(entry => {
      const item = document.createElement("li");
      item.textContent = `${entry.gardener}さんが ${entry.sections}つ目まで育てました`;
      relayHistoryList.appendChild(item);
    });
  }

  function showBatonScene(message, onDone) {
    clearTimeout(batonTimer);
    batonSceneMessage.textContent = message;
    batonScene.hidden = false;
    const finish = () => {
      clearTimeout(batonTimer);
      batonScene.hidden = true;
      skipBatonScene.onclick = null;
      onDone?.();
    };
    skipBatonScene.onclick = finish;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) finish();
    else batonTimer = setTimeout(finish, 1250);
  }

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 1400);
  }

  function secondsPerStep(tempo = bpm) {
    return 30 / tempo;
  }

  function stepForSeed(seed) {
    return Math.min(7, Math.floor(seed.x * 8));
  }

  function areTupletNeighbors(a, b) {
    if (stepForSeed(a) !== stepForSeed(b)) return false;
    return Math.hypot((a.x - b.x) * 1.2, a.y - b.y) < .105;
  }

  function buildTupletClusters(stepSeeds) {
    const waiting = [...stepSeeds];
    const clusters = [];
    while (waiting.length) {
      const cluster = [waiting.shift()];
      for (let index = 0; index < cluster.length; index += 1) {
        for (let candidate = waiting.length - 1; candidate >= 0; candidate -= 1) {
          if (areTupletNeighbors(cluster[index], waiting[candidate])) {
            cluster.push(waiting[candidate]);
            waiting.splice(candidate, 1);
          }
        }
      }
      clusters.push(cluster);
    }
    return clusters;
  }

  function forEachTupletSeed(stepSeeds, baseTime, tempo, callback) {
    buildTupletClusters(stepSeeds).forEach(cluster => {
      const ordered = [...cluster].sort((a, b) => a.y - b.y || a.id - b.id);
      const spacing = cluster.length > 1 ? secondsPerStep(tempo) * .68 / cluster.length : 0;
      ordered.forEach((seed, index) => callback(seed, baseTime + spacing * index));
    });
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

  function setResidentActions(actions) {
    residentActions.replaceChildren();
    actions.forEach(({ label, kind = "", onClick, disabled = false }) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `resident-action ${kind}`.trim();
      button.textContent = label;
      button.disabled = disabled;
      if (onClick) button.addEventListener("click", onClick);
      residentActions.appendChild(button);
    });
  }

  function showResidentBubble(resident, message, actions) {
    residentSession = resident;
    residentBubble.dataset.resident = resident;
    residentBubbleIcon.textContent = resident === "fairy" ? "🧚" : "🧑‍🌾";
    residentBubbleName.textContent = resident === "fairy" ? "妖精さん" : "こびとさん";
    residentBubbleMessage.textContent = message;
    setResidentActions(actions);
    residentBubble.hidden = false;
    fairyButton.setAttribute("aria-expanded", String(resident === "fairy"));
    gnomeButton.setAttribute("aria-expanded", String(resident === "gnome"));
  }

  function hideSuggestionGlow() {
    suggestionGlow.hidden = true;
  }

  function showSuggestionGlow(x, y) {
    suggestionGlow.style.left = `${x * 100}%`;
    suggestionGlow.style.top = `${y * 100}%`;
    suggestionGlow.hidden = false;
  }

  function closeResidentBubble(force = false) {
    if (!force && residentChangePending) {
      showToast("元に戻すか、このままにするか選んでね");
      return false;
    }
    if (!force && residentWorkTimer) {
      showToast("こびとさんがお仕事中だよ");
      return false;
    }
    clearTimeout(residentWorkTimer);
    residentWorkTimer = null;
    residentChangePending = false;
    residentBubble.hidden = true;
    fairyButton.setAttribute("aria-expanded", "false");
    gnomeButton.setAttribute("aria-expanded", "false");
    fairyButton.classList.remove("working");
    gnomeButton.classList.remove("working");
    hideSuggestionGlow();
    residentSession = null;
    pendingFairySuggestion = null;
    fairyAddedSeed = null;
    gnomeProposal = null;
    gnomeSnapshot = null;
    return true;
  }

  function findQuietSpot(preferredY) {
    const gardenSeeds = activeSeeds();
    const yChoices = [preferredY, Math.max(.1, preferredY - .17), Math.min(.88, preferredY + .17)];
    const candidates = [];
    for (let step = 0; step < 8; step += 1) {
      yChoices.forEach(y => candidates.push({ x: (step + .5) / 8, y }));
    }
    if (gardenSeeds.length === 0) return candidates[2];
    return candidates.reduce((best, candidate) => {
      const nearest = Math.min(...gardenSeeds.map(seed => Math.hypot((candidate.x - seed.x) * 1.25, candidate.y - seed.y)));
      const sameStep = gardenSeeds.filter(seed => Math.floor(seed.x * 8) === Math.floor(candidate.x * 8)).length;
      const score = nearest - sameStep * .055;
      return !best || score > best.score ? { ...candidate, score } : best;
    }, null);
  }

  function buildFairySuggestion(index) {
    const templates = [
      { type: "sparkle", y: .22, message: "ここに光る音を一粒、置いてみる？", placed: "きらきらを一粒だけ、そっと置いたよ" },
      { type: "fluffy", y: .44, message: "ここにやさしい空気を一粒、置いてみる？", placed: "ふわふわを一粒だけ、そっと置いたよ" },
      { type: "sparkle", y: .34, message: "もう少し明るい雰囲気にしてみる？", placed: "明るい音を一粒だけ、添えたよ" },
      { type: "fluffy", y: .27, message: "もう少し夢みたいにしてみる？", placed: "夢みたいな音を一粒だけ、添えたよ" },
      { type: null, y: .57, message: "このあたりが少し寂しそう。光で場所だけ見てみる？", placed: "ここが次のひらめきになりそう。何も変えていないよ" },
    ];
    const template = templates[index % templates.length];
    const spot = findQuietSpot(template.y);
    return { ...template, index: index % templates.length, x: spot.x, y: spot.y, previewOnly: !template.type };
  }

  function finishFairyChoice() {
    residentChangePending = false;
    closeResidentBubble();
    showToast("妖精さんは葉っぱの陰へ戻ったよ");
  }

  function undoFairySeed() {
    if (fairyAddedSeed && seeds.includes(fairyAddedSeed)) removeSeed(fairyAddedSeed, false);
    residentChangePending = false;
    fairyAddedSeed = null;
    showResidentBubble("fairy", "元のお庭に戻したよ。今のままでも、とっても素敵だよ", [
      { label: "ありがとう", kind: "primary", onClick: finishFairyChoice },
    ]);
  }

  function placeFairySuggestion() {
    if (!pendingFairySuggestion) return;
    fairySuggestionCursor = (pendingFairySuggestion.index + 1) % 5;
    if (pendingFairySuggestion.previewOnly) {
      showSuggestionGlow(pendingFairySuggestion.x, pendingFairySuggestion.y);
      showResidentBubble("fairy", pendingFairySuggestion.placed, [
        { label: "ありがとう", kind: "primary", onClick: () => closeResidentBubble() },
      ]);
      return;
    }
    fairyButton.classList.add("working");
    setTimeout(() => fairyButton.classList.remove("working"), 520);
    fairyAddedSeed = addSeed(pendingFairySuggestion.type, pendingFairySuggestion.x, pendingFairySuggestion.y, activeSectionIndex, { source: "fairy" });
    hideSuggestionGlow();
    if (!fairyAddedSeed) return;
    fairyAddedSeed.el.classList.add("resident-adjusted");
    setTimeout(() => fairyAddedSeed?.el?.classList.remove("resident-adjusted"), 600);
    residentChangePending = true;
    showResidentBubble("fairy", pendingFairySuggestion.placed, [
      { label: "元に戻す", onClick: undoFairySeed },
      { label: "このまま育てる", kind: "primary", onClick: finishFairyChoice },
    ]);
  }

  function showFairySuggestion(index) {
    pendingFairySuggestion = buildFairySuggestion(index);
    fairySuggestionCursor = pendingFairySuggestion.index;
    showSuggestionGlow(pendingFairySuggestion.x, pendingFairySuggestion.y);
    showResidentBubble("fairy", pendingFairySuggestion.message, [
      { label: "置いてみる", kind: "primary", onClick: placeFairySuggestion },
      { label: "ちがうのを見る", onClick: () => showFairySuggestion((fairySuggestionCursor + 1) % 5) },
      { label: "やめておく", kind: "quiet", onClick: () => {
        closeResidentBubble();
        showToast("今のままでも、とっても素敵だよ");
      } },
    ]);
  }

  function askFairy() {
    if (residentChangePending || residentWorkTimer) {
      showToast("先に今のお手伝いを決めてね");
      return;
    }
    fairyButton.classList.add("working");
    setTimeout(() => fairyButton.classList.remove("working"), 460);
    let startIndex = fairySuggestionCursor;
    if (activeSection()?.locked) {
      showToast("このお庭は前の庭師さんから預かっているよ");
      return;
    }
    if (!activeSeeds().some(seed => seed.type === "sparkle")) startIndex = 0;
    else if (!activeSeeds().some(seed => seed.type === "fluffy")) startIndex = 1;
    showFairySuggestion(startIndex);
  }

  function snapshotGarden(selectedSeeds = activeSeeds()) {
    return selectedSeeds.map(seed => ({ id: seed.id, x: seed.x, y: seed.y, size: seed.size, source: seed.source }));
  }

  function buildGnomeProposal() {
    if (activeSection()?.locked) return null;
    const gardenSeeds = activeSeeds();
    if (gardenSeeds.length === 0) return null;
    const stepFor = seed => Math.min(7, Math.floor(seed.x * 8));
    const stepCounts = Array.from({ length: 8 }, (_, step) => gardenSeeds.filter(seed => stepFor(seed) === step).length);
    const loudSeeds = gardenSeeds.filter(seed => seed.size === 3 && !seed.tuplet);
    const loudPair = loudSeeds.find(seed => loudSeeds.some(other => other !== seed && stepFor(other) === stepFor(seed)));
    if (loudSeeds.length >= 4 || loudPair) {
      const seed = loudPair || loudSeeds[0];
      return {
        message: "大きな音が少し重なっているみたい。ひと粒だけ小さくする？",
        done: "大きな音をひと粒だけ、小さくしたよ",
        change: { seed, after: { size: 2 } },
      };
    }

    let crowdedPair = null;
    for (let first = 0; first < gardenSeeds.length && !crowdedPair; first += 1) {
      for (let second = first + 1; second < gardenSeeds.length; second += 1) {
        const a = gardenSeeds[first];
        const b = gardenSeeds[second];
        if (stepFor(a) === stepFor(b) && Math.abs(a.y - b.y) < .15 && !a.tuplet && !b.tuplet) {
          crowdedPair = [a, b];
          break;
        }
      }
    }
    if (crowdedPair) {
      const seed = crowdedPair[1];
      const currentStep = stepFor(seed);
      const neighborSteps = [currentStep - 1, currentStep + 1].filter(step => step >= 0 && step <= 7);
      const targetStep = neighborSteps.sort((a, b) => stepCounts[a] - stepCounts[b])[0];
      if (targetStep !== undefined) {
        return {
          message: "ここがぎゅうぎゅうみたい。ひと粒だけ隣へ動かす？",
          done: "重なっていた音を、ひと粒だけ隣へ動かしたよ",
          change: { seed, after: { x: (targetStep + .5) / 8 } },
        };
      }
    }

    const lowSeeds = gardenSeeds.filter(seed => !seed.tuplet && (seed.type === "grainy" || seed.y > .78));
    const lowSeedToSoften = lowSeeds.find(seed => seed.size > 1);
    if (lowSeeds.length >= 4 && lowSeedToSoften) {
      return {
        message: "低い音が少し集まっているみたい。ひと粒だけ小さくする？",
        done: "低い音をひと粒だけ、やさしく整えたよ",
        change: { seed: lowSeedToSoften, after: { size: lowSeedToSoften.size - 1 } },
      };
    }

    const timingSeed = gardenSeeds.find(seed => {
      if (seed.tuplet) return false;
      const center = (stepFor(seed) + .5) / 8;
      const distance = Math.abs(seed.x - center);
      return distance > .025 && distance < .056;
    });
    if (timingSeed) {
      return {
        message: "ひと粒だけ、小道から少し外れているみたい。近くへ並べる？",
        done: "ひと粒だけ、近くの小道へそっと並べたよ",
        change: { seed: timingSeed, after: { x: (stepFor(timingSeed) + .5) / 8 } },
      };
    }
    return null;
  }

  function finishGnomeChoice() {
    residentChangePending = false;
    closeResidentBubble();
    showToast("こびとさんは小屋へ戻ったよ");
  }

  function undoGnomeWork() {
    if (gnomeSnapshot) {
      const previous = new Map(gnomeSnapshot.map(state => [state.id, state]));
      seeds.forEach(seed => {
        const state = previous.get(seed.id);
        if (!state) return;
        seed.x = state.x;
        seed.y = state.y;
        seed.size = state.size;
        seed.source = state.source;
        updateSeedElement(seed);
        seed.el.classList.add("resident-adjusted");
        setTimeout(() => seed.el?.classList.remove("resident-adjusted"), 580);
      });
    }
    residentChangePending = false;
    showResidentBubble("gnome", "元のお庭に戻したよ。大切な種はそのままだよ", [
      { label: "ありがとう", kind: "primary", onClick: finishGnomeChoice },
    ]);
  }

  function applyGnomeProposal() {
    if (!gnomeProposal?.change?.seed || !seeds.includes(gnomeProposal.change.seed)) {
      showResidentBubble("gnome", "今日はお仕事なし。きれいなお庭だよ", [
        { label: "ありがとう", kind: "primary", onClick: () => closeResidentBubble() },
      ]);
      return;
    }
    gnomeSnapshot = snapshotGarden([gnomeProposal.change.seed]);
    gnomeButton.classList.add("working");
    showResidentBubble("gnome", "とんとん…少しだけ整えているよ", [
      { label: "お仕事中…", disabled: true },
    ]);
    residentWorkTimer = setTimeout(() => {
      residentWorkTimer = null;
      gnomeButton.classList.remove("working");
      const { seed, after } = gnomeProposal.change;
      if (!seeds.includes(seed)) {
        residentChangePending = false;
        showResidentBubble("gnome", "今日はお仕事なし。きれいなお庭だよ", [
          { label: "ありがとう", kind: "primary", onClick: () => closeResidentBubble() },
        ]);
        return;
      }
      if (after.x !== undefined) seed.x = after.x;
      if (after.y !== undefined) seed.y = after.y;
      if (after.size !== undefined) seed.size = after.size;
      seed.source = "gnome";
      updateSeedElement(seed);
      seed.el.classList.add("resident-adjusted");
      setTimeout(() => seed.el?.classList.remove("resident-adjusted"), 580);
      residentChangePending = true;
      showResidentBubble("gnome", gnomeProposal.done, [
        { label: "元に戻す", onClick: undoGnomeWork },
        { label: "今のままにする", kind: "primary", onClick: finishGnomeChoice },
      ]);
    }, 620);
  }

  function askGnome() {
    if (residentChangePending || residentWorkTimer) {
      showToast("先に今のお手伝いを決めてね");
      return;
    }
    hideSuggestionGlow();
    gnomeProposal = buildGnomeProposal();
    if (!gnomeProposal) {
      showResidentBubble("gnome", "今日はお仕事なし。きれいなお庭だよ", [
        { label: "ありがとう", kind: "primary", onClick: () => closeResidentBubble() },
      ]);
      return;
    }
    showResidentBubble("gnome", gnomeProposal.message, [
      { label: "整えてもらう", kind: "primary", onClick: applyGnomeProposal },
      { label: "元に戻す", disabled: true },
      { label: "今のままにする", kind: "quiet", onClick: () => {
        closeResidentBubble();
        showToast("今のお庭を大切にするね");
      } },
    ]);
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

    const sectionCount = Math.max(1, ...seedSnapshot.map(seed => (seed.section || 0) + 1));
    const totalSteps = sectionCount * 8;
    for (let stepIndex = 0, time = 0.06; time < duration; stepIndex += 1, time += secondsPerStep(tempo)) {
      const globalStep = stepIndex % totalSteps;
      const section = Math.floor(globalStep / 8);
      const step = globalStep % 8;
      forEachTupletSeed(
        seedSnapshot.filter(seed => (seed.section || 0) === section && stepForSeed(seed) === step),
        time,
        tempo,
        playRenderedSeed,
      );
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
    if (!isPlaying) startPlayback({ quiet: true, follow: true });
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
    const seedSnapshot = seeds.map(({ id, type, x, y, size, section }) => ({ id, type, x, y, size, section }));
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

  function downloadBaton() {
    const author = gardenerLabel(relayHistory.length);
    sections.forEach(section => { if (!section.author) section.author = author; });
    const last = relayHistory.at(-1);
    if (!last || last.gardener !== author || last.sections !== sections.length) {
      relayHistory.push({ gardener: author, at: new Date().toISOString(), sections: sections.length });
    }
    renderRelayHistory();
    renderGardenMap();
    const data = serializeGarden();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `otoniwa-baton-${new Date().toISOString().slice(0, 10)}.json`;
    link.hidden = true;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    queueSessionSave();
    showToast("次の庭師さんへ、音のバトンができたよ");
  }

  function passBaton() {
    if (!seeds.length) {
      showToast("バトンに入れる音の種を、ひと粒置いてね");
      return;
    }
    showBatonScene("音の種を大切に包んでいるよ…");
    downloadBaton();
  }

  async function receiveBaton(file) {
    if (!file) return;
    receiveBatonInput.value = "";
    if (file.size > 1024 * 1024) {
      showToast("この音のバトンは大きすぎるみたい");
      return;
    }
    try {
      const text = await file.text();
      const data = normalizeGardenData(JSON.parse(text));
      showBatonScene("音の種袋をひらいているよ…", () => {
        replaceGardenFromData(data, { received: true });
        showToast("前のお庭の先に、続きを育てる場所がひらいたよ");
      });
    } catch (error) {
      showToast(error instanceof SyntaxError ? "このファイルは音のバトンではないみたい" : error.message || "音のバトンを開けませんでした");
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

  function scheduleStep(globalStep, time) {
    const section = Math.floor(globalStep / 8);
    const step = globalStep % 8;
    const delay = Math.max(0, (time - audio.currentTime) * 1000);
    setTimeout(() => {
      if (!isPlaying) return;
      const target = sectionElement(section);
      if (target && playhead.parentElement !== target) target.appendChild(playhead);
      playhead.style.transform = `translateX(${step * 100}%)`;
      [...gardenMap.children].forEach((el, index) => el.classList.toggle("playing", index === section));
      if (followPlayback && !isManipulating && section !== activeSectionIndex && Date.now() > userInteractingUntil) {
        activeSectionIndex = section;
        renderGardenMap();
        [...gardenMap.children].forEach((el, index) => el.classList.toggle("playing", index === section));
        programmaticScrollUntil = Date.now() + 700;
        target?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" });
      }
    }, delay);
    forEachTupletSeed(
      seeds.filter(seed => seed.section === section && stepForSeed(seed) === step),
      time,
      bpm,
      trigger,
    );
  }

  function playbackStepCount() {
    const lastPlantedSection = seeds.reduce((last, seed) => Math.max(last, seed.section), -1);
    return Math.max(8, (lastPlantedSection + 1) * 8);
  }

  function schedulerTick() {
    if (!audio || !isPlaying) return;
    while (nextStepTime < audio.currentTime + scheduleAhead) {
      scheduleStep(currentStep, nextStepTime);
      nextStepTime += secondsPerStep();
      currentStep = (currentStep + 1) % playbackStepCount();
    }
  }

  function startPlayback({ quiet = false, follow = false, from = playbackStartMode } = {}) {
    if (!ensureAudio()) return;
    if (isPlaying) return;
    isPlaying = true;
    followPlayback = follow;
    const lastPlayableSectionStart = Math.max(0, playbackStepCount() - 8);
    currentStep = from === "start" ? 0 : Math.min(activeSectionIndex * 8, lastPlayableSectionStart);
    if (follow) {
      const startSection = Math.floor(currentStep / 8);
      activeSectionIndex = startSection;
      renderGardenMap();
      programmaticScrollUntil = Date.now() + 700;
      sectionElement(startSection)?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" });
    }
    nextStepTime = audio.currentTime + 0.06;
    master.gain.cancelScheduledValues(audio.currentTime);
    master.gain.setValueAtTime(0.0001, audio.currentTime);
    master.gain.linearRampToValueAtTime(0.72, audio.currentTime + 0.02);
    schedulerTick();
    scheduler = setInterval(schedulerTick, 25);
    garden.classList.add("playing");
    playButton.setAttribute("aria-pressed", "true");
    playButton.innerHTML = '<span aria-hidden="true">♫</span><span>再生中</span>';
    if (!quiet && seeds.length === 0) showToast("種を置くと、ここから音が育つよ");
  }

  function stopPlayback() {
    isPlaying = false;
    followPlayback = false;
    isManipulating = false;
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
    [...gardenMap.children].forEach(el => el.classList.remove("playing"));
  }

  function stopEverything() {
    stopRecording();
    stopPlayback();
  }

  function positionFromPoint(clientX, clientY, targetSection = sectionElement(activeSectionIndex)) {
    const rect = targetSection.getBoundingClientRect();
    return {
      x: Math.max(0.035, Math.min(0.965, (clientX - rect.left) / rect.width)),
      y: Math.max(0.055, Math.min(0.945, (clientY - rect.top) / rect.height)),
    };
  }

  function sectionFromPoint(clientX, clientY) {
    return document.elementFromPoint(clientX, clientY)?.closest?.(".garden-section") || null;
  }

  function refreshTupletGroups() {
    seeds.forEach(seed => {
      seed.tuplet = false;
      seed.el.classList.remove("tuplet");
    });
    sections.forEach((_, section) => {
      for (let step = 0; step < 8; step += 1) {
        buildTupletClusters(seeds.filter(seed => seed.section === section && stepForSeed(seed) === step))
          .filter(cluster => cluster.length > 1)
          .forEach(cluster => cluster.forEach(seed => {
            seed.tuplet = true;
            seed.el.classList.add("tuplet");
          }));
      }
    });
    seeds.forEach(seed => {
      const tupletMessage = seed.tuplet ? "。近くの種と連符で鳴ります" : "";
      seed.el.setAttribute("aria-label", `${kinds[seed.type].label}。大きさ${seed.size}。ドラッグで移動、押すと大きさ変更、長押しで消せます${tupletMessage}`);
    });
  }

  function updateSeedElement(seed) {
    seed.el.style.left = `${seed.x * 100}%`;
    seed.el.style.top = `${seed.y * 100}%`;
    seed.el.style.setProperty("--size", [0.82, 1, 1.2][seed.size - 1]);
    refreshTupletGroups();
    queueSessionSave();
  }

  function removeSeed(seed, announce = true) {
    const index = seeds.indexOf(seed);
    if (index < 0) return;
    seeds.splice(index, 1);
    seed.el.remove();
    refreshTupletGroups();
    updateEmptyHints();
    queueSessionSave();
    if (announce) showToast(`${kinds[seed.type].label}の種を摘んだよ`);
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
      if (sections[seed.section]?.locked) {
        showToast("前の庭師さんの音は、そのまま聴けるよ");
        return;
      }
      isManipulating = true;
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
        const wasTuplet = seed.tuplet;
        const point = positionFromPoint(event.clientX, event.clientY);
        seed.x = point.x;
        seed.y = point.y;
        updateSeedElement(seed);
        if (!wasTuplet && seed.tuplet) showToast("重なった種が、ころころ連符になったよ");
      }
    });

    seed.el.addEventListener("pointerup", event => {
      isManipulating = false;
      cancelLongPress();
      if (seed.el.hasPointerCapture(event.pointerId)) seed.el.releasePointerCapture(event.pointerId);
      seed.el.classList.remove("moving");
      if (moved) suppressPlacementClick = true;
    });

    seed.el.addEventListener("pointercancel", () => {
      isManipulating = false;
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

  function addSeed(type, x, y, section = activeSectionIndex, options = {}) {
    if (!kinds[type]) return null;
    if (!sections[section] || (sections[section].locked && !options.allowLocked)) {
      if (!options.quiet) showToast("前の庭師さんのお庭は大切に残しているよ");
      return null;
    }
    if (seeds.length >= MAX_SEEDS) {
      showToast("音の種はここまで育ったよ");
      return null;
    }
    const el = document.createElement("button");
    el.type = "button";
    el.className = `placed-seed ${type}`;
    el.textContent = kinds[type].icon;
    const seed = { id: options.id ?? nextId++, type, x, y, size: options.size ?? 2, section, source: options.source || "user", el };
    nextId = Math.max(nextId, seed.id + 1);
    seeds.push(seed);
    updateSeedElement(seed);
    attachPlacedSeedGestures(seed);
    sectionElement(section)?.appendChild(el);
    updateEmptyHints();
    if (options.quiet) return seed;
    if (!isPlaying) startPlayback({ quiet: true, follow: false, from: "here" });
    else if (ensureAudio()) trigger(seed, audio.currentTime + 0.02);
    return seed;
  }

  function clearGarden() {
    cancelPendingSeed();
    closeResidentBubble(true);
    stopEverything();
    const removable = seeds.filter(seed => !sections[seed.section]?.locked);
    removable.forEach(seed => {
      const index = seeds.indexOf(seed);
      if (index >= 0) seeds.splice(index, 1);
      seed.el.remove();
    });
    updateEmptyHints();
    queueSessionSave();
    showToast(removable.length ? "育てていたお庭をまっさらにしたよ" : "預かったお庭はそのまま大切に残っているよ");
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
      gardenTrack.querySelectorAll(".drag-over").forEach(el => el.classList.remove("drag-over"));
      dragType = null;
    });

    card.addEventListener("pointerdown", event => {
      event.preventDefault();
      isManipulating = true;
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
      const target = sectionFromPoint(event.clientX, event.clientY);
      gardenTrack.querySelectorAll(".drag-over").forEach(el => el.classList.remove("drag-over"));
      if (target && !sections[Number(target.dataset.sectionIndex)]?.locked) target.classList.add("drag-over");
    });
    card.addEventListener("pointerup", event => {
      isManipulating = false;
      if (!pointerGhost) return;
      const target = sectionFromPoint(event.clientX, event.clientY);
      if (target) {
        const section = Number(target.dataset.sectionIndex);
        const point = positionFromPoint(event.clientX, event.clientY, target);
        addSeed(dragType, point.x, point.y, section);
        suppressClick = true;
      }
      pointerGhost.remove(); pointerGhost = null;
      card.classList.remove("dragging"); gardenTrack.querySelectorAll(".drag-over").forEach(el => el.classList.remove("drag-over")); dragType = null;
    });

    card.addEventListener("click", () => {
      if (suppressClick) {
        suppressClick = false;
        return;
      }
      if (dragType || pointerGhost) return;
      const count = activeSeeds().filter(seed => seed.type === card.dataset.seed).length;
      addSeed(card.dataset.seed, 0.18 + (count % 4) * 0.2, 0.25 + ((count * 0.21) % 0.5));
    });
  });

  garden.addEventListener("wheel", event => {
    if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
    event.preventDefault();
    userInteractingUntil = Date.now() + 900;
    garden.scrollLeft += event.deltaY;
  }, { passive: false });
  garden.addEventListener("pointerdown", event => {
    if (!event.target.closest(".placed-seed")) userInteractingUntil = Date.now() + 1200;
    if (!event.target.closest(".seed-basket") && !seedBasketPanel.hidden) closeSeedBasket();
    if (pendingSeedType
        && !event.target.closest(".placed-seed")
        && !event.target.closest(".resident")
        && !event.target.closest(".seed-basket")) {
      gardenTapId = event.pointerId;
      gardenTapStartX = event.clientX;
      gardenTapStartY = event.clientY;
    }
  });
  garden.addEventListener("scroll", () => {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
      if (Date.now() < programmaticScrollUntil) return;
      const index = Math.round(garden.scrollLeft / Math.max(1, garden.clientWidth));
      if (index !== activeSectionIndex) {
        activeSectionIndex = Math.max(0, Math.min(sections.length - 1, index));
        renderGardenMap();
      }
    }, 80);
  }, { passive: true });

  playButton.addEventListener("click", () => {
    if (isPlaying) { stopEverything(); } else { startPlayback({ follow: true }); }
  });
  stopButton.addEventListener("click", stopEverything);
  recordButton.addEventListener("click", () => isRecording() ? stopRecording() : startRecording());
  clearButton.addEventListener("click", clearGarden);
  fairyButton.addEventListener("click", askFairy);
  gnomeButton.addEventListener("click", askGnome);
  extendGardenButton.addEventListener("click", () => addSection({ author: gardenerName.value.trim().slice(0, 30) }));
  unlockSectionButton.addEventListener("click", () => {
    const section = activeSection();
    if (!section?.locked) return;
    section.locked = false;
    renderSections();
    showToast("このお庭にも、そっと手を加えられるようになったよ");
    queueSessionSave();
  });
  listenFromStart.addEventListener("click", () => {
    playbackStartMode = "start";
    listenFromStart.classList.add("active");
    listenFromHere.classList.remove("active");
    showToast("次は、はじめのお庭から聴くよ");
  });
  listenFromHere.addEventListener("click", () => {
    playbackStartMode = "here";
    listenFromHere.classList.add("active");
    listenFromStart.classList.remove("active");
    showToast("次は、今見ているお庭から聴くよ");
  });
  passBatonButton.addEventListener("click", passBaton);
  receiveBatonInput.addEventListener("change", () => receiveBaton(receiveBatonInput.files?.[0]));
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
  document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      if (residentSession) closeResidentBubble();
      if (pendingSeedType) cancelPendingSeed();
    }
  });
  window.addEventListener("beforeunload", () => {
    stopRecording();
    if (recordingUrl) URL.revokeObjectURL(recordingUrl);
  });

  // ── Seed basket: portrait-mobile tap-to-plant ──
  function updateSeedBasketVisibility() {
    seedBasketFrame = null;
    const portraitMobile = window.matchMedia("(max-width: 760px) and (orientation: portrait)").matches;
    const gardenRect = garden.getBoundingClientRect();
    const trayRect = seedTray.getBoundingClientRect();
    const gardenIsVisible = gardenRect.bottom > 80 && gardenRect.top < window.innerHeight - 56;
    const seedTrayHasGone = trayRect.bottom < 180;
    const shouldShow = portraitMobile && gardenIsVisible && seedTrayHasGone;

    seedBasket.classList.toggle("is-visible", shouldShow);
    seedBasket.setAttribute("aria-hidden", String(!shouldShow));
    if (!shouldShow) closeSeedBasket();
  }

  function queueSeedBasketVisibility() {
    if (seedBasketFrame !== null) return;
    seedBasketFrame = requestAnimationFrame(updateSeedBasketVisibility);
  }

  function openSeedBasket() {
    seedBasketPanel.hidden = false;
    seedBasketBtn.setAttribute("aria-expanded", "true");
  }
  function closeSeedBasket() {
    seedBasketPanel.hidden = true;
    seedBasketBtn.setAttribute("aria-expanded", "false");
  }
  function selectPendingSeed(type) {
    pendingSeedType = type;
    closeSeedBasket();
    const k = kinds[type];
    seedPendingDisplay.textContent = `${k.icon} ${k.label}`;
    seedPendingBar.hidden = false;
    seedBasketBtn.hidden = true;
    seedBasketPanel.querySelectorAll(".basket-panel-seed").forEach(btn =>
      btn.classList.toggle("selected", btn.dataset.seed === type));
    showToast("庭をタップして種を植えよう");
  }
  function cancelPendingSeed() {
    if (!pendingSeedType && seedBasketPanel.hidden && seedPendingBar.hidden) return;
    pendingSeedType = null;
    gardenTapId = null;
    seedPendingBar.hidden = true;
    seedBasketBtn.hidden = false;
    closeSeedBasket();
    seedBasketPanel.querySelectorAll(".basket-panel-seed").forEach(btn =>
      btn.classList.remove("selected"));
  }

  seedBasketBtn.addEventListener("click", () => {
    if (seedBasketPanel.hidden) openSeedBasket(); else closeSeedBasket();
  });
  seedBasketPanel.querySelectorAll(".basket-panel-seed").forEach(btn => {
    btn.addEventListener("click", () => {
      if (pendingSeedType === btn.dataset.seed) cancelPendingSeed();
      else selectPendingSeed(btn.dataset.seed);
    });
  });
  seedPendingCancel.addEventListener("click", event => {
    event.stopPropagation();
    cancelPendingSeed();
  });
  // Tapping the display label reopens the panel to change seed
  seedPendingDisplay.addEventListener("click", () => {
    seedPendingBar.hidden = true;
    seedBasketBtn.hidden = false;
    openSeedBasket();
  });

  // Garden tap-to-plant gesture
  garden.addEventListener("pointermove", event => {
    if (gardenTapId !== null && event.pointerId === gardenTapId) {
      if (Math.hypot(event.clientX - gardenTapStartX, event.clientY - gardenTapStartY) > 8) {
        gardenTapId = null;
      }
    }
  });
  garden.addEventListener("pointerup", event => {
    if (gardenTapId !== null && event.pointerId === gardenTapId && pendingSeedType) {
      gardenTapId = null;
      const section = sectionFromPoint(event.clientX, event.clientY);
      if (section) {
        const idx = Number(section.dataset.sectionIndex);
        if (sections[idx]?.locked) {
          showToast("前の庭師さんのお庭は大切に残しているよ");
        } else {
          const point = positionFromPoint(event.clientX, event.clientY, section);
          addSeed(pendingSeedType, point.x, point.y, idx);
        }
      }
    } else {
      gardenTapId = null;
    }
  });
  garden.addEventListener("pointercancel", event => {
    if (event.pointerId === gardenTapId) gardenTapId = null;
  });
  window.addEventListener("scroll", queueSeedBasketVisibility, { passive: true });
  window.addEventListener("resize", queueSeedBasketVisibility, { passive: true });

  function initializeGarden() {
    if (!runDataFormatSelfCheck()) throw new Error("音庭データの安全確認に失敗しました");
    let saved = null;
    try {
      const text = localStorage.getItem(SESSION_KEY) || localStorage.getItem(LEGACY_SESSION_KEY);
      if (text) saved = normalizeGardenData(JSON.parse(text));
    } catch (_) {
      localStorage.removeItem(SESSION_KEY);
    }
    if (saved) replaceGardenFromData(saved);
    else {
      for (let index = 0; index < 4; index += 1) addSection({}, false);
      renderSections();
      renderRelayHistory();
    }
    updateTempoDisplay();
  }

  initializeGarden();
  updateSeedBasketVisibility();

  Object.defineProperty(window, "OtoniwaData", {
    value: Object.freeze({
      validate: normalizeGardenData,
      snapshot: serializeGarden,
    }),
    configurable: false,
    writable: false,
  });

  if ("serviceWorker" in navigator && window.isSecureContext) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./service-worker.js").catch(() => {
        // The garden still works normally when offline installation is unavailable.
      });
    });
  }
})();
