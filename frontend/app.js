const API_BASE = "http://localhost:8000";
let currentSessionId = null;
let activeScenarioKey = "default";

// Simulation State Engine
let currentHeartRate = 105;
let currentSpO2 = 94;
let heartRateDrift = -0.5;
let minHeartRate = 50;
let maxHeartRate = 140;
let timeLeft = 30;
const TURN_DURATION = 30;
let gameLoopInterval = null;
let isRequestInProgress = false;

// Event Timeline Tracking
let sessionActionLogs = [];
let sessionStartTime = null;

// Web Audio API State & Telemetry
let audioCtx = null;
let isAudioEnabled = true;

// Dynamic Differential Diagnosis (DDx) Profiles
const DDX_PROFILES = {
  acute_coronary_syndrome: [
    { name: "Acute STEMI / ACS", baseProb: 88, color: "red" },
    { name: "Aortic Dissection", baseProb: 8, color: "yellow" },
    { name: "Pulmonary Embolism", baseProb: 4, color: "blue" },
  ],
  septic_shock: [
    { name: "Septic Shock / Urosepsis", baseProb: 86, color: "red" },
    { name: "Cardiogenic Shock", baseProb: 9, color: "yellow" },
    { name: "Hypovolemic Shock", baseProb: 5, color: "blue" },
  ],
  anaphylaxis: [
    { name: "Severe Anaphylactic Shock", baseProb: 90, color: "red" },
    { name: "Severe Acute Asthma", baseProb: 7, color: "yellow" },
    { name: "Laryngeal Angioedema", baseProb: 3, color: "blue" },
  ],
  status_asthmaticus: [
    { name: "Status Asthmaticus", baseProb: 87, color: "red" },
    { name: "Tension Pneumothorax", baseProb: 8, color: "yellow" },
    { name: "Foreign Body Aspiration", baseProb: 5, color: "blue" },
  ],
  tension_pneumothorax: [
    { name: "Tension Pneumothorax", baseProb: 89, color: "red" },
    { name: "Massive Hemothorax", baseProb: 8, color: "yellow" },
    { name: "Pericardial Tamponade", baseProb: 3, color: "blue" },
  ],
  default: [
    { name: "Primary Clinical Condition", baseProb: 85, color: "red" },
    { name: "Secondary Differential", baseProb: 10, color: "yellow" },
    { name: "Alternative Etiology", baseProb: 5, color: "blue" },
  ],
};

const screens = {
  select: document.getElementById("screen-select"),
  sim: document.getElementById("screen-sim"),
  report: document.getElementById("screen-report"),
};

function showScreen(name) {
  Object.values(screens).forEach((el) => el.classList.remove("active"));
  screens[name].classList.add("active");

  const abortBtn = document.getElementById("btn-abort-session");
  if (name === "sim") {
    abortBtn.style.display = "block";
    initECGAnimation();
  } else {
    abortBtn.style.display = "none";
    stopECGAnimation();
  }
}

// --- 1. Realistic Philips/GE Bedside Monitor Audio Engine ---
function initAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }
}

function playBedsideBeep() {
  if (!isAudioEnabled || !audioCtx) return;
  try {
    const now = audioCtx.currentTime;

    // SpO2 ve HR değerine göre ton modülasyonu (Oksijen düşünce ton kalınlaşır)
    let baseFreq = 976;
    if (currentSpO2 < 85) baseFreq = 680;
    else if (currentSpO2 < 90) baseFreq = 780;
    else if (currentSpO2 < 94) baseFreq = 880;

    if (currentHeartRate > 125) baseFreq += 60;

    const osc1 = audioCtx.createOscillator();
    const gain1 = audioCtx.createGain();
    const osc2 = audioCtx.createOscillator();
    const gain2 = audioCtx.createGain();

    osc1.type = "sine";
    osc1.frequency.setValueAtTime(baseFreq, now);

    osc2.type = "triangle";
    osc2.frequency.setValueAtTime(baseFreq * 2, now);

    // Gür ve keskin hastane monitörü vuruşu (Attack / Decay)
    gain1.gain.setValueAtTime(0.001, now);
    gain1.gain.linearRampToValueAtTime(0.35, now + 0.004);
    gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);

    gain2.gain.setValueAtTime(0.001, now);
    gain2.gain.linearRampToValueAtTime(0.09, now + 0.004);
    gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);

    osc1.connect(gain1);
    gain1.connect(audioCtx.destination);

    osc2.connect(gain2);
    gain2.connect(audioCtx.destination);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.08);
    osc2.stop(now + 0.08);
  } catch (e) {
    console.error("Audio error", e);
  }
}

function toggleAudio() {
  isAudioEnabled = !isAudioEnabled;
  document.getElementById("audio-status").textContent = isAudioEnabled ? "ON" : "OFF";
  if (isAudioEnabled) initAudioContext();
}

// --- 2. Dynamic Scenario Loader ---
async function loadScenarios() {
  try {
    const res = await fetch(`${API_BASE}/scenarios`);
    const scenarios = await res.json();

    const container = document.getElementById("scenario-list");
    if (!container) return;
    container.innerHTML = "";

    Object.entries(scenarios).forEach(([key, val]) => {
      const card = document.createElement("div");
      card.className = `scenario-card ${val.enabled ? "featured" : "disabled"}`;
      card.innerHTML = `
        <div class="card-icon">${val.icon}</div>
        <span class="scenario-tag ${val.enabled ? "live" : "lock"}">${val.tag}</span>
        <h3>${val.label}</h3>
        <p class="card-desc">${val.desc}</p>
        <button class="btn-primary" ${val.enabled ? "" : "disabled"} onclick="startSession('${key}')">
          ${val.enabled ? "INITIALIZE CASE" : "COMING SOON"}
        </button>
      `;
      container.appendChild(card);
    });
  } catch (err) {
    console.error("Failed to load scenarios:", err);
  }
}

// --- 3. Start Session & Modal Handling ---
async function startSession(scenarioType) {
  activeScenarioKey = scenarioType || "default";
  initAudioContext();
  try {
    const res = await fetch(`${API_BASE}/session/start?scenario_type=${scenarioType}`, {
      method: "POST",
    });
    if (!res.ok) throw new Error("Could not connect to backend server.");

    const data = await res.json();
    currentSessionId = data.session_id;
    sessionActionLogs = [];
    sessionStartTime = Date.now();

    document.getElementById("chat-log").innerHTML = "";

    const age = data.turn?.age || 58;
    const gender = data.turn?.gender || "Male";
    const diagnosis = data.turn?.primary_diagnosis || "Acute Coronary Syndrome";
    const hr = data.turn?.heart_rate || 105;
    const bp = data.turn?.blood_pressure || "150/95";
    const spo2 = data.turn?.spo2 || 93;
    const note = data.turn?.system_note || "Patient admitted to the resuscitation bay.";

    currentHeartRate = hr;
    currentSpO2 = spo2;

    document.getElementById("patient-age").textContent = age;
    document.getElementById("patient-gender").textContent = String(gender).toUpperCase();
    document.getElementById("patient-tani").textContent = diagnosis;
    document.getElementById("vital-spo2").textContent = spo2;

    document.getElementById("modal-info").textContent = note;
    document.getElementById("modal-age-gender").textContent = `${age} Y/O / ${gender}`;
    document.getElementById("modal-tani").textContent = diagnosis;
    document.getElementById("modal-nabiz").textContent = hr;
    document.getElementById("modal-tansiyon").textContent = bp;

    logTimelineEvent("EMS Admission", `Patient admitted with ${diagnosis}`);
    renderTurn(data.turn, null, false);
    document.getElementById("patient-modal").classList.add("active");
  } catch (err) {
    alert("Initialization Error: " + err.message);
  }
}

function closePatientModal() {
  document.getElementById("patient-modal").classList.remove("active");
  showScreen("sim");
  startGameLoop();
}

// --- 4. Ticking Simulation Engine ---
function startGameLoop() {
  clearInterval(gameLoopInterval);
  timeLeft = TURN_DURATION;
  updateTimerUI();

  gameLoopInterval = setInterval(() => {
    if (isRequestInProgress) return;

    timeLeft--;

    currentHeartRate += heartRateDrift;
    const roundedHR = Math.round(currentHeartRate);
    document.getElementById("vital-nabiz").textContent = roundedHR;
    updateTimerUI();

    if (roundedHR <= minHeartRate || roundedHR >= maxHeartRate) {
      clearInterval(gameLoopInterval);
      logTimelineEvent("Threshold Breach", `Heart rate critical (${roundedHR} bpm)`);
      sendActionToServer(`[CRITICAL THRESHOLD BREACHED: Heart Rate reached ${roundedHR} bpm! Hemodynamic collapse imminent!]`);
      return;
    }

    if (timeLeft <= 0) {
      clearInterval(gameLoopInterval);
      logTimelineEvent("Timeout Error", "30s elapsed with zero interventions");
      sendActionToServer("[TIMEOUT: No clinical action taken for 30 seconds]");
    }
  }, 1000);
}

function updateTimerUI() {
  const timerDisplay = document.getElementById("timer-display");
  if (timerDisplay) {
    timerDisplay.textContent = timeLeft < 10 ? `0${timeLeft}` : timeLeft;
  }
}

// --- 5. Turn Rendering & DDx Updates ---
function renderTurn(turn, userMessage = null, shouldStartTimer = true) {
  const log = document.getElementById("chat-log");

  if (userMessage) appendLogEntry("user", userMessage);
  if (turn?.system_note && turn.system_note.trim() !== "") {
    appendLogEntry("sistem", turn.system_note);
    document.getElementById("doctor-note-text").textContent = turn.system_note;
  }
  if (turn?.patient_dialogue && turn.patient_dialogue.trim() !== "" && turn.consciousness !== "Unresponsive") {
    appendLogEntry("hasta", turn.patient_dialogue);
  }

  currentHeartRate = turn?.heart_rate || 105;
  currentSpO2 = turn?.spo2 || 94;
  heartRateDrift = turn?.heart_rate_drift !== undefined ? turn.heart_rate_drift : -0.5;
  minHeartRate = turn?.min_heart_rate || 50;
  maxHeartRate = turn?.max_heart_rate || 140;

  document.getElementById("vital-nabiz").textContent = Math.round(currentHeartRate);
  document.getElementById("vital-tansiyon").textContent = turn?.blood_pressure || "145/90";
  document.getElementById("vital-spo2").textContent = currentSpO2;
  document.getElementById("vital-bilinc").textContent = String(turn?.consciousness || "Alert").toUpperCase();
  document.getElementById("turn-count").textContent = turn?.turn_no || 1;

  updateDDxBoard(turn);
  log.scrollTop = log.scrollHeight;

  if (turn?.case_completed) {
    clearInterval(gameLoopInterval);
    setTimeout(() => finishSession(), 1200);
  } else if (shouldStartTimer) {
    startGameLoop();
  }
}

function appendLogEntry(type, text) {
  const log = document.getElementById("chat-log");
  const entry = document.createElement("div");
  entry.className = `log-entry ${type}`;
  entry.textContent = text;
  log.appendChild(entry);
}

function updateDDxBoard(turn) {
  const container = document.getElementById("ddx-list-container");
  if (!container) return;

  const profile = DDX_PROFILES[activeScenarioKey] || DDX_PROFILES.default;
  const hr = turn?.heart_rate || 100;

  let p1 = Math.min(95, Math.max(50, profile[0].baseProb + (hr > 110 ? 4 : -4)));
  let p2 = Math.max(4, Math.round((100 - p1) * 0.7));
  let p3 = Math.max(1, 100 - p1 - p2);

  const probs = [p1, p2, p3];

  container.innerHTML = profile
    .map(
      (item, idx) => `
    <div class="ddx-item">
      <div class="ddx-labels">
        <span>${item.name}</span>
        <span>${probs[idx]}%</span>
      </div>
      <div class="ddx-bar-bg">
        <div class="ddx-bar-fill ${item.color}" style="width: ${probs[idx]}%;"></div>
      </div>
    </div>
  `
    )
    .join("");
}

// --- 6. Quick Action Execution & Dispatch ---
function executeQuickAction(commandText) {
  if (isRequestInProgress) return;
  const input = document.getElementById("action-input");
  input.value = "";
  clearInterval(gameLoopInterval);
  logTimelineEvent("Doctor Order", commandText);
  sendActionToServer(commandText);
}

async function sendActionToServer(message) {
  if (!currentSessionId || isRequestInProgress) return;

  isRequestInProgress = true;
  const submitBtn = document.getElementById("submit-btn");
  if (submitBtn) submitBtn.disabled = true;

  try {
    const res = await fetch(`${API_BASE}/session/${currentSessionId}/act`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });
    if (!res.ok) throw new Error("Request failed");
    const turn = await res.json();
    renderTurn(turn, message.startsWith("[") ? null : message, true);
  } catch (err) {
    console.error("Action error:", err);
  } finally {
    isRequestInProgress = false;
    if (submitBtn) submitBtn.disabled = false;
  }
}

document.getElementById("action-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const input = document.getElementById("action-input");
  const message = input.value.trim();
  if (!message || isRequestInProgress) return;

  input.value = "";
  clearInterval(gameLoopInterval);
  logTimelineEvent("Custom Order", message);
  sendActionToServer(message);
});

function logTimelineEvent(tag, desc) {
  const elapsedSec = sessionStartTime ? Math.round((Date.now() - sessionStartTime) / 1000) : 0;
  sessionActionLogs.push({ time: `${elapsedSec}s`, tag, desc });
}

function abortSession() {
  if (confirm("Conclude the simulation now and generate the jury evaluation report?")) {
    clearInterval(gameLoopInterval);
    finishSession();
  }
}

// --- 7. Diagnostics Lab Modal ---
function openLabModal() {
  document.getElementById("lab-modal").classList.add("active");
}

function closeLabModal() {
  document.getElementById("lab-modal").classList.remove("active");
}

// --- 8. Scorecard & Timeline Replay ---
async function finishSession() {
  stopECGAnimation();
  try {
    const res = await fetch(`${API_BASE}/session/${currentSessionId}/end`, {
      method: "POST",
    });
    const report = await res.json();

    document.getElementById("report-score").textContent = report.score;
    document.getElementById("report-badge").textContent = report.status_badge || "COMPLETED";
    document.getElementById("rep-correct").textContent = report.correct_actions || 0;
    document.getElementById("rep-wrong").textContent = report.incorrect_actions || 0;
    document.getElementById("rep-reaction").textContent = `${report.reaction_score || 5}/10`;

    document.getElementById("report-strengths").textContent = report.strengths;
    document.getElementById("report-mistakes").textContent = report.errors;
    document.getElementById("report-suggestion").textContent = report.suggestions;

    renderTimelineReplay();
    showScreen("report");
    drawRadarChart(report.criteria);
  } catch (err) {
    alert("Error fetching report: " + err.message);
  }
}

function renderTimelineReplay() {
  const container = document.getElementById("timeline-events");
  if (!container) return;
  container.innerHTML = "";

  sessionActionLogs.forEach((item) => {
    const row = document.createElement("div");
    row.className = "timeline-item";
    row.innerHTML = `
      <span class="timeline-time">[+${item.time}]</span>
      <strong style="color: #38bdf8;">${item.tag}:</strong>
      <span class="timeline-action">${item.desc}</span>
    `;
    container.appendChild(row);
  });
}

function returnToMenu() {
  currentSessionId = null;
  clearInterval(gameLoopInterval);
  stopECGAnimation();
  showScreen("select");
  loadScenarios();
}

function drawRadarChart(criteria = {}) {
  const canvas = document.getElementById("radar-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  const cx = width / 2;
  const cy = height / 2;
  const radius = 95;

  ctx.clearRect(0, 0, width, height);

  const axes = [
    { label: "Educational Impact", val: criteria?.educational_impact ?? 18 },
    { label: "Creative AI Use", val: criteria?.creative_ai_use ?? 18 },
    { label: "Technical Execution", val: criteria?.technical_execution ?? 18 },
    { label: "Pitch & Demo", val: criteria?.pitch_demo ?? 18 },
  ];

  const totalAxes = axes.length;

  for (let r = 0.25; r <= 1.0; r += 0.25) {
    ctx.beginPath();
    for (let i = 0; i < totalAxes; i++) {
      const angle = (Math.PI * 2 / totalAxes) * i - Math.PI / 2;
      const x = cx + Math.cos(angle) * (radius * r);
      const y = cy + Math.sin(angle) * (radius * r);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
    ctx.stroke();
  }

  ctx.fillStyle = "#94a3b8";
  ctx.font = "bold 10px 'Plus Jakarta Sans'";
  ctx.textAlign = "center";

  for (let i = 0; i < totalAxes; i++) {
    const angle = (Math.PI * 2 / totalAxes) * i - Math.PI / 2;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(x, y);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
    ctx.stroke();

    const lx = cx + Math.cos(angle) * (radius + 24);
    const ly = cy + Math.sin(angle) * (radius + 18);
    ctx.fillText(`${axes[i].label} (${axes[i].val}/25)`, lx, ly);
  }

  ctx.beginPath();
  for (let i = 0; i < totalAxes; i++) {
    const scoreRatio = Math.min(25, Math.max(0, axes[i].val)) / 25;
    const angle = (Math.PI * 2 / totalAxes) * i - Math.PI / 2;
    const x = cx + Math.cos(angle) * (radius * scoreRatio);
    const y = cy + Math.sin(angle) * (radius * scoreRatio);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = "rgba(16, 185, 129, 0.35)";
  ctx.fill();
  ctx.strokeStyle = "#10b981";
  ctx.lineWidth = 2;
  ctx.stroke();
}

// --- 9. Synchronized Real-Time Telemetry ECG & Audio Engine ---
let ecgAnimationId = null;
let lastFrameTime = null;
let timeSinceLastBeat = 0;
let hasBeepedThisBeat = false;

function initECGAnimation() {
  const canvas = document.getElementById("ecg-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  canvas.width = canvas.parentElement.clientWidth;
  canvas.height = canvas.parentElement.clientHeight;

  let x = 0;
  let points = [];
  const width = canvas.width;
  const height = canvas.height;
  const midY = height / 2;

  lastFrameTime = performance.now();
  timeSinceLastBeat = 0;
  hasBeepedThisBeat = false;

  function draw(now) {
    const dt = (now - lastFrameTime) / 1000;
    lastFrameTime = now;

    // Nabız hızına göre kalp atım periyodu (saniye cinsinden)
    const validHR = Math.max(35, Math.min(220, currentHeartRate));
    const beatInterval = 60 / validHR;

    timeSinceLastBeat += dt;

    // Yeni kalp atımı başladığında döngüyü ve bip tetikleyicisini sıfırla
    if (timeSinceLastBeat >= beatInterval) {
      timeSinceLastBeat %= beatInterval;
      hasBeepedThisBeat = false;
    }

    // Monitörün yatay tarama hızı
    x += 2.2;
    if (x > width) {
      x = 0;
      points = [];
    }

    // Fizyolojik P-Q-R-S-T dalga formu ve R-Zirve senkronizasyonu
    let y = midY;
    const t = timeSinceLastBeat;

    if (t >= 0.04 && t < 0.12) {
      // P Dalgası
      y = midY - 6 * Math.sin(((t - 0.04) / 0.08) * Math.PI);
    } else if (t >= 0.13 && t < 0.16) {
      // Q Çökmesi
      y = midY + 4;
    } else if (t >= 0.16 && t < 0.22) {
      // R Dalgası (Zirve Vuruşu)
      y = midY - 48 * Math.sin(((t - 0.16) / 0.06) * Math.PI);

      // Zirve anında tek seferlik hastane monitör sesi tetikle
      if (!hasBeepedThisBeat && t >= 0.18) {
        playBedsideBeep();
        hasBeepedThisBeat = true;
      }
    } else if (t >= 0.22 && t < 0.26) {
      // S Çökmesi
      y = midY + 16;
    } else if (t >= 0.28 && t < 0.40) {
      // T Dalgası
      y = midY - 12 * Math.sin(((t - 0.28) / 0.12) * Math.PI);
    } else {
      // İzoelektrik hat ve hafif biyolojik osilasyon
      y = midY + (Math.random() - 0.5) * 1.5;
    }

    points.push({ x, y });

    // Ekran izini silerek arkadan akma hissi veren fosfor efekti
    ctx.fillStyle = "rgba(3, 7, 18, 0.16)";
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = "#38bdf8";
    ctx.lineWidth = 2.2;
    ctx.shadowBlur = 9;
    ctx.shadowColor = "#38bdf8";

    ctx.beginPath();
    for (let i = 0; i < points.length; i++) {
      if (i === 0) ctx.moveTo(points[i].x, points[i].y);
      else ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.stroke();

    ecgAnimationId = requestAnimationFrame(draw);
  }

  if (ecgAnimationId) cancelAnimationFrame(ecgAnimationId);
  ecgAnimationId = requestAnimationFrame(draw);
}

function stopECGAnimation() {
  if (ecgAnimationId) {
    cancelAnimationFrame(ecgAnimationId);
    ecgAnimationId = null;
  }
}

loadScenarios();