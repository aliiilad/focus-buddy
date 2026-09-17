// Focus Buddy — work first, scroll later.
// A warm, unhurried focus timer that also guards your social apps:
//   1. An iPhone Shortcuts automation opens this page as ?from=Instagram
//      when you open a social app without unlocked time (see SHORTCUTS_SETUP.md).
//   2. Finishing focus sessions earns scroll minutes.
//   3. Spending minutes runs the "FB Unlock" shortcut, which saves an
//      "unlocked until" time so the automation lets the app open.
// Everything lives in this browser (localStorage). Add ?debug=1 to speed time up.
//
// The hearth keeps burning even while you're on another tab or Safari is
// closed: the timer stores *when* it ends, not a countdown in memory.

const params = new URLSearchParams(location.search);
const DEBUG = params.get("debug") === "1";

// In debug mode one "minute" lasts 2 seconds, so a 25-min session takes 50s.
const MINUTE = DEBUG ? 2000 : 60 * 1000;
// How long a looser scroll-rule change waits before it applies.
const PENDING_DELAY = DEBUG ? 60 * 1000 : 24 * 60 * 60 * 1000;
// The pause you sit through before an unlock button works.
const PAUSE_SECONDS = DEBUG ? 3 : 10;
const UNLOCK_SHORTCUT_NAME = "FB Unlock";

const KEY_PREFIX = DEBUG ? "fb_debug_" : "fb_";
const STORAGE_KEYS = {
  settings: KEY_PREFIX + "settings",
  sessions: KEY_PREFIX + "sessions",
  cycle: KEY_PREFIX + "cycle",
  timer: KEY_PREFIX + "timer",
  scroll: KEY_PREFIX + "scroll",
};

const DEFAULT_SETTINGS = {
  focus: 25,
  short: 5,
  long: 15,
  sound: true,
  calm: false,
  // Scroll rules
  workPer: 25,         // focus minutes...
  scrollPer: 10,       // ...earn this many scroll minutes
  dailyCap: 60,        // most scroll minutes you can earn per day
  unlockBlock: 10,     // minutes spent per unlock
  emergencyWait: 5,    // first emergency wait (doubles with each use per day)
  emergencyUnlock: 10, // minutes an emergency unlock gives
};

// "looser" = the direction that makes the rules easier. Those changes wait
// PENDING_DELAY; stricter changes apply right away.
const RULES = {
  workPer:         { label: "Focus needed", hint: "Minutes of focus per reward", looser: "down", min: 5, max: 120, step: 5 },
  scrollPer:       { label: "Scroll earned", hint: "Minutes of scrolling per reward", looser: "up", min: 1, max: 30, step: 1 },
  dailyCap:        { label: "Daily earning cap", hint: "Most scroll minutes per day", looser: "up", min: 0, max: 240, step: 5 },
  unlockBlock:     { label: "Minutes per unlock", hint: "Keep it short: apps re-lock on next open", looser: "up", min: 1, max: 30, step: 1 },
  emergencyWait:   { label: "Emergency wait", hint: "Doubles with each use in a day", looser: "down", min: 1, max: 60, step: 1 },
  emergencyUnlock: { label: "Emergency unlock", hint: "Minutes it gives you", looser: "up", min: 1, max: 30, step: 1 },
};

const MODE_LABEL = { focus: "Focus", short: "Rest", long: "Long rest" };
const MODE_ACCENT = { focus: "--ember", short: "--rose", long: "--moss" };

const STATUS_LINES = {
  idle: "Ready when you are.",
  running: {
    focus: [
      "The hearth is lit. Settle in.",
      "Still glowing. You've got this.",
      "Quiet, steady, warm. Keep going.",
    ],
    short: "Rest a while. I'll keep watch.",
    long: "A longer rest. No rush back.",
  },
  paused: "Banked low. Come back whenever.",
  complete: {
    short: "Rest complete. Ready for another round?",
    long: "Well rested. Ready when you are.",
  },
};

// ---------------------------------------------------------------- storage

function load(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage blocked — the page still works for this visit */
  }
}

function todayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ---------------------------------------------------------------- state

const settings = { ...DEFAULT_SETTINGS, ...load(STORAGE_KEYS.settings, {}) };

const timer = {
  mode: "focus",
  lengthMin: settings.focus,
  running: false,
  endsAt: null,   // timestamp while running
  pausedMs: null, // remaining ms while paused
  taskName: "",
  ...load(STORAGE_KEYS.timer, {}),
};

let cycleCount = Number(load(STORAGE_KEYS.cycle, 0)) || 0;

const scroll = {
  creditMin: 0,            // scroll minutes available today
  creditDay: todayKey(),   // the day that credit belongs to
  emergency: null,         // { start, waitMin } while waiting
  unlockedUntil: 0,        // shown on the home screen only
  pending: [],             // [{ field, value, applyAt }]
  days: {},                // daily log keyed "YYYY-MM-DD"
  ...load(STORAGE_KEYS.scroll, {}),
};

let currentRoute = "home";
let statusNote = "";       // a one-off message, e.g. "Session complete…"
let justCompleted = false; // bloom the hearth on the next render
let liveUpdate = null;     // per-view function run every second

const saveSettings = () => save(STORAGE_KEYS.settings, settings);
const saveTimer = () => save(STORAGE_KEYS.timer, timer);
const saveScroll = () => save(STORAGE_KEYS.scroll, scroll);

function today() {
  const key = todayKey();
  if (!scroll.days[key]) {
    scroll.days[key] = { earned: 0, spent: 0, emergencies: 0, gateOpens: 0 };
  }
  return scroll.days[key];
}

// ---------------------------------------------------------------- helpers

function formatTime(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const s = (totalSeconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function formatWait(ms) {
  const mins = Math.max(1, Math.ceil(ms / 60000));
  const h = Math.floor(mins / 60);
  return h ? `${h}h ${mins % 60}m` : `${mins}m`;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ---------------------------------------------------------------- sound

let audioCtx = null;

function chime() {
  if (!settings.sound) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const now = audioCtx.currentTime;
    [523.25, 659.25].forEach((freq, i) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, now + i * 0.12);
      gain.gain.linearRampToValueAtTime(0.14, now + i * 0.12 + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.12 + 0.9);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(now + i * 0.12);
      osc.stop(now + i * 0.12 + 1);
    });
  } catch {
    /* Web Audio unavailable — the hearth stays quiet, that's fine. */
  }
}

// ---------------------------------------------------------------- timer

function remainingMs() {
  if (timer.running) return timer.endsAt - Date.now();
  if (timer.pausedMs != null) return timer.pausedMs;
  return timer.lengthMin * MINUTE;
}

const isStarted = () => timer.running || timer.pausedMs != null;
const focusInProgress = () => timer.mode === "focus" && isStarted();

function resetTimer(mode) {
  timer.mode = mode;
  timer.lengthMin = settings[mode];
  timer.running = false;
  timer.endsAt = null;
  timer.pausedMs = null;
  saveTimer();
}

function startTimer() {
  if (timer.running) return;
  timer.endsAt = Date.now() + remainingMs();
  timer.running = true;
  timer.pausedMs = null;
  statusNote = "";
  saveTimer();
  render();
}

function pauseTimer() {
  timer.pausedMs = Math.max(0, timer.endsAt - Date.now());
  timer.running = false;
  timer.endsAt = null;
  saveTimer();
  render();
}

function endEarly() {
  const wasFocus = timer.mode === "focus";
  resetTimer(timer.mode);
  statusNote = wasFocus ? "Ended early. No scroll time for that one, and that's okay." : "";
  render();
  document.title = "Focus Buddy";
}

// Scroll minutes a focus session of this length earns right now (daily cap included).
function earnFor(lengthMin) {
  const raw = Math.floor((lengthMin * settings.scrollPer) / settings.workPer);
  return Math.min(raw, Math.max(0, settings.dailyCap - today().earned));
}

function completeSession() {
  const mode = timer.mode;
  if (mode === "focus") {
    const earned = earnFor(timer.lengthMin);
    logSession(timer.lengthMin);
    scroll.creditMin += earned;
    today().earned += earned;
    cycleCount = (cycleCount + 1) % 4;
    save(STORAGE_KEYS.cycle, cycleCount);
    statusNote = earned > 0
      ? `Session complete. You earned ${earned} scroll minutes.`
      : "Session complete. Today's earning cap is reached, but the hearth is still warm.";
  } else {
    statusNote = STATUS_LINES.complete[mode];
  }

  chime();
  justCompleted = true;
  document.title = "Focus Buddy";

  // Suggest the natural next mode, but let the person choose.
  resetTimer(mode === "focus" ? (cycleCount === 0 ? "long" : "short") : "focus");
}

// ---------------------------------------------------------------- scroll rules

function currentEmergencyWait() {
  return settings.emergencyWait * Math.pow(2, today().emergencies);
}

const emergencyReadyAt = () => scroll.emergency.start + scroll.emergency.waitMin * MINUTE;

function isLooser(field, value, than) {
  return RULES[field].looser === "up" ? value > than : value < than;
}

function runUnlockShortcut(minutes) {
  // The shortcut always gets real minutes, even in debug mode.
  scroll.unlockedUntil = Date.now() + minutes * 60 * 1000;
  saveScroll();
  location.href =
    `shortcuts://run-shortcut?name=${encodeURIComponent(UNLOCK_SHORTCUT_NAME)}&input=text&text=${minutes}`;
}

function startEmergency() {
  // Counts as soon as you start waiting, so starting and giving up still costs you.
  scroll.emergency = { start: Date.now(), waitMin: currentEmergencyWait() };
  today().emergencies += 1;
  saveScroll();
  render();
}

function useEmergency() {
  const minutes = settings.emergencyUnlock;
  scroll.emergency = null;
  statusNote = `Emergency unlock: ${minutes} minutes. Switch back to your app.`;
  go("home");
  runUnlockShortcut(minutes);
}

// Runs on load and every second. Returns true when the screen needs redrawing.
function housekeeping() {
  let changed = false;
  const now = Date.now();

  // New day: unused credit and emergency waits expire at midnight.
  if (scroll.creditDay !== todayKey()) {
    scroll.creditDay = todayKey();
    scroll.creditMin = 0;
    scroll.emergency = null;
    changed = true;
  }

  // Looser rule changes whose delay has passed.
  const due = scroll.pending.filter((p) => now >= p.applyAt);
  if (due.length) {
    due.forEach((p) => { settings[p.field] = p.value; });
    scroll.pending = scroll.pending.filter((p) => now < p.applyAt);
    saveSettings();
    changed = true;
  }

  if (timer.running && remainingMs() <= 0) {
    completeSession();
    changed = true;
  }

  if (changed) saveScroll();
  return changed;
}

// ---------------------------------------------------------------- sessions / stats

function logSession(minutes) {
  const sessions = load(STORAGE_KEYS.sessions, []);
  sessions.push({
    date: todayKey(),
    label: timer.taskName.trim() || "Focus session",
    minutes,
    timestamp: Date.now(),
  });
  save(STORAGE_KEYS.sessions, sessions);
}

function computeStreak(sessions) {
  const days = new Set(sessions.map((s) => s.date));
  let streak = 0;
  const cursor = new Date();
  // If nothing logged yet today, start counting from yesterday.
  if (!days.has(todayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  while (days.has(todayKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function weekMinutes(sessions) {
  const result = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = todayKey(d);
    const minutes = sessions.filter((s) => s.date === key).reduce((sum, s) => sum + s.minutes, 0);
    result.push({ key, minutes, label: d.toLocaleDateString(undefined, { weekday: "short" })[0], isToday: i === 0 });
  }
  return result;
}

// ---------------------------------------------------------------- rendering

function go(route) {
  // Leaving the gate: drop ?from=… so a refresh doesn't show it again.
  if (route !== "gate" && params.has("from")) {
    params.delete("from");
    const q = params.toString();
    history.replaceState(null, "", location.pathname + (q ? `?${q}` : ""));
  }
  currentRoute = route;
  render();
}

function render() {
  liveUpdate = null;
  const app = document.getElementById("app");
  app.innerHTML = "";
  if (DEBUG) {
    const banner = document.createElement("p");
    banner.className = "debug-banner";
    banner.textContent = "Debug mode: 1 minute = 2 seconds";
    app.appendChild(banner);
  }
  const views = { home: renderHome, gate: renderGate, stats: renderStats, settings: renderSettings };
  app.appendChild(views[currentRoute]());
  syncNav();

  if (justCompleted) {
    justCompleted = false;
    const hearth = document.querySelector(".hearth");
    if (hearth) {
      hearth.dataset.state = "complete";
      setTimeout(() => {
        if (hearth.isConnected) hearth.dataset.state = "idle";
      }, 1100);
    }
  }
}

function syncNav() {
  document.querySelectorAll(".topbar nav button").forEach((btn) => {
    btn.setAttribute("aria-current", btn.dataset.nav === currentRoute ? "true" : "false");
  });
}

// Updates the numbers that change every second, without redrawing.
function tickDisplay() {
  const left = remainingMs();
  document.querySelectorAll(".timer-display").forEach((el) => { el.textContent = formatTime(left); });
  document.title = timer.running ? `${formatTime(left)} · ${MODE_LABEL[timer.mode]}` : "Focus Buddy";
  const status = document.querySelector(".view-home .status-line");
  if (status) status.textContent = statusText();
  if (liveUpdate) liveUpdate();
}

function statusText() {
  if (statusNote) return statusNote;
  if (timer.running) {
    if (timer.mode !== "focus") return STATUS_LINES.running[timer.mode];
    const lines = STATUS_LINES.running.focus;
    return lines[Math.floor(Date.now() / 8000) % lines.length];
  }
  if (isStarted()) return STATUS_LINES.paused;
  if (timer.mode === "focus") return `${STATUS_LINES.idle} This one earns ${earnFor(timer.lengthMin)} scroll minutes.`;
  return STATUS_LINES.idle;
}

function hearthMarkup(extraClass = "") {
  const state = timer.running ? "running" : isStarted() ? "paused" : "idle";
  return `
    <div class="hearth ${extraClass}" data-state="${state}" style="--accent: var(${MODE_ACCENT[timer.mode]}); --accent-soft: ${timer.mode === "focus" ? "var(--ember-soft)" : "var(--cream)"};">
      <div class="hearth-glow layer-1"></div>
      <div class="hearth-glow layer-2"></div>
      <div class="hearth-glow layer-3"></div>
      <div class="hearth-core">
        <div class="timer-display">${formatTime(remainingMs())}</div>
        <div class="cycle-dots">
          ${[0, 1, 2, 3].map((i) => `<span class="${i < cycleCount ? "filled" : ""}"></span>`).join("")}
        </div>
      </div>
    </div>`;
}

function creditPill() {
  const unlocked = scroll.unlockedUntil > Date.now()
    ? ` · apps open for ~${Math.ceil((scroll.unlockedUntil - Date.now()) / 60000)} more min`
    : "";
  return `<div class="credit-pill"><strong>${scroll.creditMin} min</strong> scroll time earned${unlocked}</div>`;
}

// ----- Home: the hearth -----
function renderHome() {
  const section = document.createElement("section");
  section.className = "view view-home";

  section.innerHTML = `
    ${creditPill()}

    <div class="mode-tabs" role="tablist" aria-label="Session type">
      ${["focus", "short", "long"]
        .map((m) => `<button role="tab" data-mode="${m}" class="${m === timer.mode ? "active" : ""}" aria-selected="${m === timer.mode}">${MODE_LABEL[m]}</button>`)
        .join("")}
    </div>

    ${hearthMarkup()}

    <p class="prompt">What deserves your attention right now?</p>
    <input class="task-input" type="text" maxlength="60" placeholder="Name this session (optional)"
      value="${escapeHtml(timer.taskName).replace(/"/g, "&quot;")}" ${timer.running ? "disabled" : ""} />

    <button class="btn-primary" id="toggleBtn">
      ${timer.running ? "Let it dim" : isStarted() ? "Relight" : timer.mode === "focus" ? "Light the hearth" : "Settle in"}
    </button>
    ${isStarted()
      ? `<button class="btn-ghost" id="endBtn">${timer.mode === "focus" ? "End early (earns nothing), and that's okay" : "End early, and that's okay"}</button>`
      : ""}
    <p class="status-line" aria-live="polite">${escapeHtml(statusText())}</p>
  `;

  if (scroll.emergency) section.appendChild(emergencyCard());

  section.querySelectorAll(".mode-tabs button").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (isStarted()) return;
      statusNote = "";
      resetTimer(btn.dataset.mode);
      render();
    });
  });

  section.querySelector(".task-input").addEventListener("input", (e) => {
    timer.taskName = e.target.value;
    saveTimer();
  });

  section.querySelector("#toggleBtn").addEventListener("click", () => {
    if (timer.running) pauseTimer();
    else startTimer();
  });

  const endBtn = section.querySelector("#endBtn");
  if (endBtn) endBtn.addEventListener("click", endEarly);

  return section;
}

// ----- Emergency unlock card (gate + home) -----
function emergencyCard() {
  const card = document.createElement("div");
  card.className = "gate-card";

  if (!scroll.emergency) {
    const wait = currentEmergencyWait();
    card.innerHTML = `
      <h2>Emergency</h2>
      <p>Really need it now? Wait ${wait} minutes for ${settings.emergencyUnlock} minutes of access. The wait doubles every time you use it today.</p>
      <button class="btn-ghost" id="emergencyStart">Start a ${wait}-minute wait</button>`;
    card.querySelector("#emergencyStart").addEventListener("click", startEmergency);
    return card;
  }

  card.innerHTML = `
    <h2>Emergency wait</h2>
    <div class="gate-countdown" id="emergencyLeft">${formatTime(emergencyReadyAt() - Date.now())}</div>
    <p>Still want it when this reaches zero? Often the urge has passed by then.</p>
    <button class="btn-primary" id="emergencyUse" disabled>Unlock ${settings.emergencyUnlock} minutes</button>
    <button class="btn-ghost" id="emergencyCancel">Never mind</button>`;
  card.querySelector("#emergencyUse").addEventListener("click", useEmergency);
  card.querySelector("#emergencyCancel").addEventListener("click", () => {
    scroll.emergency = null;
    saveScroll();
    render();
  });

  const previous = liveUpdate;
  liveUpdate = () => {
    if (previous) previous();
    const left = emergencyReadyAt() - Date.now();
    const el = document.getElementById("emergencyLeft");
    const btn = document.getElementById("emergencyUse");
    if (el) el.textContent = formatTime(left);
    if (btn) btn.disabled = left > 0;
  };
  return card;
}

// ----- Gate: opened by the Shortcuts automation -----
function renderGate() {
  const section = document.createElement("section");
  section.className = "view view-gate";
  const rawName = params.get("from") || "that app";
  const appName = escapeHtml(rawName);

  // 1) A focus session is lit (or banked): no way through.
  if (focusInProgress()) {
    section.innerHTML = `
      <h1>Back to work</h1>
      <p class="gate-lede">Your focus session is ${timer.running ? "still burning" : "paused"}. ${appName} can wait.</p>
      ${hearthMarkup("hearth-mini")}
      <button class="btn-primary" id="backBtn">${timer.running ? "Return to the hearth" : "Relight"}</button>`;
    section.querySelector("#backBtn").addEventListener("click", () => {
      if (!timer.running) startTimer();
      go("home");
    });
    return section;
  }

  // 2) Earned minutes: pause, name the reason, then unlock.
  if (scroll.creditMin > 0) {
    const minutes = Math.min(scroll.creditMin, settings.unlockBlock);
    const pauseEndsAt = Date.now() + PAUSE_SECONDS * 1000;
    section.innerHTML = `
      <h1>Open ${appName}?</h1>
      <p class="gate-lede">You have ${scroll.creditMin} earned minutes. This unlock uses ${minutes}.</p>
      <label class="prompt" for="intent">What are you opening it for?</label>
      <input class="task-input" id="intent" type="text" maxlength="80" placeholder="e.g. reply to Sam's message" autocomplete="off" />
      <button class="btn-primary" id="unlockBtn" disabled>Breathe for ${PAUSE_SECONDS}s…</button>
      <button class="btn-ghost" id="notNow">Not now</button>`;

    const intent = section.querySelector("#intent");
    const unlockBtn = section.querySelector("#unlockBtn");
    const refresh = () => {
      const secs = Math.ceil((pauseEndsAt - Date.now()) / 1000);
      if (secs > 0) {
        unlockBtn.disabled = true;
        unlockBtn.textContent = `Breathe for ${secs}s…`;
        return;
      }
      unlockBtn.disabled = intent.value.trim().length < 3;
      unlockBtn.textContent = unlockBtn.disabled ? "Name your reason first" : `Unlock ${minutes} minutes`;
    };
    intent.addEventListener("input", refresh);
    liveUpdate = refresh;

    unlockBtn.addEventListener("click", () => {
      scroll.creditMin -= minutes;
      today().spent += minutes;
      saveScroll();
      statusNote = `Unlocked ${minutes} minutes. Switch back to ${rawName}.`;
      go("home");
      runUnlockShortcut(minutes);
    });
    section.querySelector("#notNow").addEventListener("click", () => {
      statusNote = "Nice. Nothing spent. The hearth is here when you're ready.";
      go("home");
    });
    return section;
  }

  // 3) No earned time: work first (or wait out an emergency).
  section.innerHTML = `
    <h1>Work first</h1>
    <p class="gate-lede">No scroll time for ${appName} yet. A ${settings.focus}-minute focus session earns ${earnFor(settings.focus)} minutes.</p>
    <button class="btn-primary" id="lightBtn">Light the hearth</button>`;
  section.querySelector("#lightBtn").addEventListener("click", () => {
    resetTimer("focus");
    go("home");
    startTimer();
  });
  section.appendChild(emergencyCard());
  return section;
}

// ----- Stats -----
function renderStats() {
  const section = document.createElement("section");
  section.className = "view view-stats";

  const sessions = load(STORAGE_KEYS.sessions, []);
  const streak = computeStreak(sessions);
  const week = weekMinutes(sessions);
  const maxMinutes = Math.max(...week.map((d) => d.minutes), settings.focus);
  const recent = [...sessions].reverse().slice(0, 8);
  const t = today();

  section.innerHTML = `
    <h1>Your focus, kept warm</h1>

    <div class="streak-card">
      <span class="streak-number">${streak}</span>
      <span class="streak-label">day${streak === 1 ? "" : "s"} showing up</span>
    </div>

    <h2>Scroll budget today</h2>
    <div class="budget-grid">
      <div><strong>${t.earned}<small>/${settings.dailyCap}</small></strong><span>min earned</span></div>
      <div><strong>${t.spent}</strong><span>min spent</span></div>
      <div><strong>${t.gateOpens}</strong><span>times the gate caught you</span></div>
      <div><strong>${t.emergencies}</strong><span>emergency unlocks</span></div>
    </div>

    <h2>This week</h2>
    <div class="week-chart">
      ${week
        .map((d) => `
        <div class="week-day ${d.isToday ? "today" : ""}">
          <div class="week-bar" style="height:${Math.max(6, (d.minutes / maxMinutes) * 100)}%" title="${d.minutes} min"></div>
          <span>${d.label}</span>
        </div>`)
        .join("")}
    </div>

    <h2>Recent sessions</h2>
    ${recent.length
      ? `<ul class="session-log">
        ${recent
          .map((s) => `
          <li>
            <span class="dot"></span>
            <span class="name">${escapeHtml(s.label)}</span>
            <span class="meta">${s.minutes} min · ${new Date(s.timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
          </li>`)
          .join("")}
      </ul>`
      : `<p class="empty-state">No sessions yet. Light the hearth to begin.</p>`}
  `;

  return section;
}

// ----- Settings -----
function renderSettings() {
  const section = document.createElement("section");
  section.className = "view view-settings";
  const delayText = DEBUG ? "1 minute (debug)" : "24 hours";

  section.innerHTML = `
    <h1>Make it yours</h1>

    ${["focus", "short", "long"]
      .map((m) => `
      <div class="setting-row">
        <label>${m === "focus" ? "Focus length" : m === "short" ? "Short rest" : "Long rest"}</label>
        <div class="stepper" data-mode="${m}">
          <button data-dir="-1" aria-label="Decrease">–</button>
          <span class="value">${settings[m]} min</span>
          <button data-dir="1" aria-label="Increase">+</button>
        </div>
      </div>`)
      .join("")}

    <div class="setting-row toggle-row">
      <label>Chime when a session ends</label>
      <button class="switch" data-setting="sound" aria-pressed="${settings.sound}"></button>
    </div>

    <div class="setting-row toggle-row">
      <label>Calm hearth motion<span class="hint">Turns down the glow's movement.</span></label>
      <button class="switch" data-setting="calm" aria-pressed="${settings.calm}"></button>
    </div>

    <h2 class="view-settings-group-label">Scroll rules</h2>
    <p class="rules-note">Stricter changes apply now. Looser changes wait ${delayText}, so a weak moment can't rewrite the rules.</p>

    ${Object.entries(RULES)
      .map(([field, info]) => {
        const pend = scroll.pending.find((p) => p.field === field);
        const hint = pend
          ? `<span class="hint pending">Becomes ${pend.value} in ${formatWait(pend.applyAt - Date.now())}</span>`
          : `<span class="hint">${info.hint}</span>`;
        return `
      <div class="setting-row">
        <label>${info.label}${hint}</label>
        <div class="stepper" data-rule="${field}">
          <button data-dir="-1" aria-label="Decrease">–</button>
          <span class="value">${settings[field]} min</span>
          <button data-dir="1" aria-label="Increase">+</button>
        </div>
      </div>`;
      })
      .join("")}
  `;

  section.querySelectorAll(".stepper[data-mode]").forEach((stepper) => {
    const mode = stepper.dataset.mode;
    stepper.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", () => {
        const dir = Number(btn.dataset.dir);
        const next = Math.min(90, Math.max(5, settings[mode] + dir * 5));
        settings[mode] = next;
        saveSettings();
        if (timer.mode === mode && !isStarted()) {
          timer.lengthMin = next;
          saveTimer();
        }
        stepper.querySelector(".value").textContent = `${next} min`;
      });
    });
  });

  section.querySelectorAll(".stepper[data-rule]").forEach((stepper) => {
    const field = stepper.dataset.rule;
    stepper.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", () => changeRule(field, Number(btn.dataset.dir)));
    });
  });

  section.querySelectorAll(".switch").forEach((sw) => {
    sw.addEventListener("click", () => {
      const key = sw.dataset.setting;
      settings[key] = !settings[key];
      saveSettings();
      sw.setAttribute("aria-pressed", String(settings[key]));
      applyCalm();
    });
  });

  return section;
}

// One stepper click on a scroll rule. Steps from the pending value if there is one.
function changeRule(field, dir) {
  const info = RULES[field];
  const pend = scroll.pending.find((p) => p.field === field);
  const shown = pend ? pend.value : settings[field];
  const next = Math.min(info.max, Math.max(info.min, shown + dir * info.step));
  if (next === shown) return;

  const current = settings[field];
  scroll.pending = scroll.pending.filter((p) => p.field !== field);

  if (next === current) {
    // Back to the current value: the pending change is simply dropped.
  } else if (isLooser(field, next, current)) {
    // Loosening further restarts the clock; backing off keeps it.
    const applyAt = pend && !isLooser(field, next, shown) ? pend.applyAt : Date.now() + PENDING_DELAY;
    scroll.pending.push({ field, value: next, applyAt });
  } else {
    settings[field] = next;
    saveSettings();
  }
  saveScroll();
  render();
}

function applyCalm() {
  document.documentElement.style.setProperty("--pulse-scale", settings.calm ? "1.02" : "1.06");
  document.documentElement.style.setProperty("--pulse-speed", settings.calm ? "9s" : "5.5s");
}

// ---------------------------------------------------------------- nav & boot

document.querySelectorAll(".topbar nav button").forEach((btn) => {
  btn.addEventListener("click", () => go(btn.dataset.nav));
});

if (settings.calm) applyCalm();

housekeeping();
if (params.has("from")) {
  today().gateOpens += 1;
  saveScroll();
  currentRoute = "gate";
}
render();

setInterval(() => {
  if (housekeeping()) render();
  else tickDisplay();
}, 1000);

// Coming back to Safari after a while: catch up right away.
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && housekeeping()) render();
});
