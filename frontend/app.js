const API_BASE = "http://localhost:8000";
let currentSessionId = null;
let activeScenarioKey = "acute_coronary_syndrome";

// Simulation State Engine
let currentHeartRate = 105;
let currentSpO2 = 94;
let currentBP = "150/95";
let currentConsciousness = "Alert";
let heartRateDrift = 0.4;
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
    { name: "Acute Anterior STEMI / ACS", baseProb: 88, color: "red" },
    { name: "Aortic Dissection", baseProb: 8, color: "yellow" },
    { name: "Pulmonary Embolism", baseProb: 4, color: "blue" },
  ],
  acute_ischemic_stroke: [
    { name: "Acute Left MCA Ischemic Stroke", baseProb: 85, color: "red" },
    { name: "Hemorrhagic Stroke", baseProb: 10, color: "yellow" },
    { name: "Hypoglycemia / Todd's Paralysis", baseProb: 5, color: "blue" },
  ],
  acute_pulmonary_edema: [
    { name: "Acute Cardiogenic Pulmonary Edema", baseProb: 86, color: "red" },
    { name: "Severe Pneumonia / ARDS", baseProb: 9, color: "yellow" },
    { name: "Acute COPD Exacerbation", baseProb: 5, color: "blue" },
  ],
  anaphylactic_shock: [
    { name: "Severe Anaphylactic Shock", baseProb: 89, color: "red" },
    { name: "Acute Laryngospasm / Foreign Body", baseProb: 7, color: "yellow" },
    { name: "Vasovagal Syncope", baseProb: 4, color: "blue" },
  ],
  diabetic_ketoacidosis: [
    { name: "Diabetic Ketoacidosis (DKA)", baseProb: 87, color: "red" },
    { name: "Hyperosmolar Hyperglycemic State", baseProb: 8, color: "yellow" },
    { name: "Acute Pancreatitis / Sepsis", baseProb: 5, color: "blue" },
  ],
  hypovolemic_shock: [
    { name: "Hemorrhagic Hypovolemic Shock", baseProb: 88, color: "red" },
    { name: "Ruptured Ectopic / Abdominal Trauma", baseProb: 8, color: "yellow" },
    { name: "Septic Shock", baseProb: 4, color: "blue" },
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

    let baseFreq = 976;
    if (currentSpO2 < 82) baseFreq = 540;
    else if (currentSpO2 < 88) baseFreq = 680;
    else if (currentSpO2 < 93) baseFreq = 820;

    if (currentHeartRate > 125) baseFreq += 40;

    const osc1 = audioCtx.createOscillator();
    const gain1 = audioCtx.createGain();
    const osc2 = audioCtx.createOscillator();
    const gain2 = audioCtx.createGain();

    osc1.type = "sine";
    osc1.frequency.setValueAtTime(baseFreq, now);

    osc2.type = "triangle";
    osc2.frequency.setValueAtTime(baseFreq * 2, now);

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
    console.error("Audio telemetry error", e);
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
  activeScenarioKey = scenarioType || "acute_coronary_syndrome";
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

    const age = data.turn?.age || 54;
    const gender = data.turn?.gender || "Male";
    const diagnosis = data.turn?.primary_diagnosis || "Acute Coronary Syndrome";
    const hr = data.turn?.heart_rate || 110;
    const bp = data.turn?.blood_pressure || "150/95";
    const spo2 = data.turn?.spo2 || 92;
    const note = data.turn?.system_note || "Patient admitted to the resuscitation bay.";

    currentHeartRate = hr;
    currentSpO2 = spo2;
    currentBP = bp;

    document.getElementById("patient-display-name").textContent = `${age} Y/O ${gender}`;
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
  initAudioContext();
  showScreen("sim");
  startGameLoop();
}

// --- 4. Ticking Simulation Engine (Safe & Debounced) ---
let hasBreachedThreshold = false; // Eşik döngüsünü kilitleyen bayrak

function stopGameLoop() {
  if (gameLoopInterval !== null) {
    clearInterval(gameLoopInterval);
    gameLoopInterval = null;
  }
}

function startGameLoop() {
  stopGameLoop();
  timeLeft = TURN_DURATION;
  updateTimerUI();

  console.log(`⏱️ [GAME LOOP BAŞLADI] Süre: ${timeLeft}s | HR: ${Math.round(currentHeartRate)} bpm`);

  gameLoopInterval = setInterval(() => {
    // İstek devam ederken sayacı dondur
    if (isRequestInProgress) return;

    timeLeft--;
    updateTimerUI();

    currentHeartRate += heartRateDrift;
    const roundedHR = Math.round(currentHeartRate);
    const hrEl = document.getElementById("vital-nabiz");
    if (hrEl) hrEl.textContent = roundedHR;

    // 1. Kritik Güvenlik Eşiği Denetimi (Tek seferlik kilit ile tetiklenir)
    if ((roundedHR <= minHeartRate || roundedHR >= maxHeartRate) && !hasBreachedThreshold) {
      hasBreachedThreshold = true;
      stopGameLoop();
      logTimelineEvent("Threshold Breach", `Heart rate critical (${roundedHR} bpm)`);
      sendActionToServer(`[CRITICAL THRESHOLD BREACHED: Heart Rate reached ${roundedHR} bpm! Patient entering cardiovascular collapse!]`);
    } 
    // 2. 30 Saniye Timeout Denetimi
    else if (timeLeft <= 0) {
      stopGameLoop();
      logTimelineEvent("Timeout Error", "30s elapsed with zero interventions");
      sendActionToServer("[TIMEOUT: No clinical action taken for 30 seconds. Patient deteriorating.]");
    }
  }, 1000);
}
function updateTimerUI() {
  const timerDisplay = document.getElementById("timer-display");
  if (timerDisplay) {
    timerDisplay.textContent = timeLeft < 10 ? `0${timeLeft}` : timeLeft;
  }
}

function setInteractionsDisabled(disabled) {
  const submitBtn = document.getElementById("submit-btn");
  if (submitBtn) submitBtn.disabled = disabled;
  
  const input = document.getElementById("action-input");
  if (input) input.disabled = disabled;

  const chipBtns = document.querySelectorAll(".chip-btn");
  chipBtns.forEach(btn => btn.disabled = disabled);
}

// --- 5. Turn Rendering & DDx Updates ---
let lastSystemNote = "";

function renderTurn(turn, userMessage = null, shouldStartTimer = true) {
  const log = document.getElementById("chat-log");

  // Kullanıcı mesajı varsa bas ve eşik kilidini sıfırla
  if (userMessage) {
    appendLogEntry("user", userMessage);
    hasBreachedThreshold = false;
  }
  
  // Sistem notunu bas (Mükerrer kontrolü ile)
  if (turn?.system_note && turn.system_note.trim() !== "" && turn.system_note !== lastSystemNote) {
    appendLogEntry("sistem", turn.system_note);
    const doctorNoteEl = document.getElementById("doctor-note-text");
    if (doctorNoteEl) doctorNoteEl.textContent = turn.system_note;
    lastSystemNote = turn.system_note;
  }
  
  // Hasta diyaloğunu bas
  if (turn?.patient_dialogue && turn.patient_dialogue.trim() !== "" && turn.consciousness !== "Unresponsive") {
    appendLogEntry("hasta", turn.patient_dialogue);
  }

  // Vitalleri güncelle
  currentHeartRate = turn?.heart_rate || currentHeartRate;
  currentSpO2 = turn?.spo2 || currentSpO2;
  currentBP = turn?.blood_pressure || currentBP;
  currentConsciousness = turn?.consciousness || "Alert";
  heartRateDrift = turn?.heart_rate_drift !== undefined ? turn.heart_rate_drift : 0.4;
  minHeartRate = turn?.min_heart_rate || 50;
  maxHeartRate = turn?.max_heart_rate || 140;

  // Telemetri kartlarını güncelle
  document.getElementById("vital-nabiz").textContent = Math.round(currentHeartRate);
  document.getElementById("vital-tansiyon").textContent = currentBP;
  document.getElementById("vital-spo2").textContent = currentSpO2;
  document.getElementById("vital-bilinc").textContent = String(currentConsciousness).toUpperCase();
  document.getElementById("turn-count").textContent = turn?.turn_no || 1;

  // DDx tablosunu yenile ve logu en alta kaydır
  updateDDxBoard(turn);
  log.scrollTop = log.scrollHeight;

  // Vaka sonlanma denetimi
  if (turn?.case_completed || turn?.consciousness === "Unresponsive") {
    stopGameLoop();
    setTimeout(() => finishSession(), 1500);
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
  const hr = turn?.heart_rate || Math.round(currentHeartRate);

  let p1 = Math.min(95, Math.max(50, profile[0].baseProb + (hr > 115 ? 4 : -3)));
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
  if (isRequestInProgress || !currentSessionId) return;
  stopGameLoop();
  logTimelineEvent("Doctor Order", commandText);
  sendActionToServer(commandText);
}

async function sendActionToServer(message) {
  const reqId = Math.random().toString(36).substring(7);
  console.log(`🚀 [İSTEK BAŞLADI] ID: #${reqId} | isRequestInProgress: ${isRequestInProgress} | Mesaj: ${message.substring(0, 45)}...`);

  if (!currentSessionId || isRequestInProgress) {
    console.warn(`🚫 [İSTEK ENGELLENDİ] ID: #${reqId} - Zaten aktif bir istek var veya oturum yok!`);
    return;
  }

  isRequestInProgress = true;
  stopGameLoop();
  setInteractionsDisabled(true);

  try {
    const payload = {
      message: message,
      current_hr: Math.round(currentHeartRate),
      current_spo2: currentSpO2,
      current_bp: currentBP
    };

    console.log(`📤 [PAYLOAD GÖNDERİLİYOR] ID: #${reqId} -> Backend'e giden vitaller:`, payload);

    const res = await fetch(`${API_BASE}/session/${currentSessionId}/act`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    
    if (!res.ok) throw new Error("Request failed");
    
    const turn = await res.json();
    console.log(`📥 [YANIT GELDİ] ID: #${reqId} -> Gelen Stage: ${turn.turn_no} | Yeni HR: ${turn.heart_rate} | Bitti mi: ${turn.case_completed}`);
    
    renderTurn(turn, message.startsWith("[") ? null : message, true);
  } catch (err) {
    console.error(`❌ [İSTEK HATASI] ID: #${reqId}:`, err);
    startGameLoop();
  } finally {
    isRequestInProgress = false;
    setInteractionsDisabled(false);
    console.log(`🔓 [KİLİT AÇILDI] ID: #${reqId} tamamlandı.`);
  }
}

document.getElementById("action-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const input = document.getElementById("action-input");
  const message = input.value.trim();
  if (!message || isRequestInProgress) return;

  input.value = "";
  stopGameLoop();
  logTimelineEvent("Custom Order", message);
  sendActionToServer(message);
});

function logTimelineEvent(tag, desc) {
  const elapsedSec = sessionStartTime ? Math.round((Date.now() - sessionStartTime) / 1000) : 0;
  sessionActionLogs.push({ time: `${elapsedSec}s`, tag, desc });
}

function abortSession() {
  if (confirm("Conclude the simulation now and generate the jury evaluation report?")) {
    stopGameLoop();
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
  stopGameLoop();
  stopECGAnimation();
  try {
    const res = await fetch(`${API_BASE}/session/${currentSessionId}/end`, {
      method: "POST",
    });
    const report = await res.json();

    const actualTimeouts = sessionActionLogs.filter(
      (l) => l.tag === "Timeout Error" || l.tag === "Threshold Breach"
    ).length;
    const finalWrong = Math.max(report.incorrect_actions || 0, actualTimeouts);

    document.getElementById("report-score").textContent = report.score;
    document.getElementById("report-badge").textContent = report.status_badge || "COMPLETED";
    document.getElementById("rep-correct").textContent = report.correct_actions || 0;
    document.getElementById("rep-wrong").textContent = finalWrong;
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
    const isTimeout = item.tag.includes("Timeout") || item.tag.includes("Breach");
    const tagColor = isTimeout ? "#ef4444" : "#38bdf8";

    row.innerHTML = `
      <span class="timeline-time">[+${item.time}]</span>
      <strong style="color: ${tagColor};">${item.tag}:</strong>
      <span class="timeline-action">${item.desc}</span>
    `;
    container.appendChild(row);
  });
}

function returnToMenu() {
  currentSessionId = null;
  stopGameLoop();
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

    const validHR = Math.max(35, Math.min(220, currentHeartRate));
    const beatInterval = 60 / validHR;

    timeSinceLastBeat += dt;

    if (timeSinceLastBeat >= beatInterval) {
      timeSinceLastBeat %= beatInterval;
      hasBeepedThisBeat = false;
    }

    x += 2.2;
    if (x > width) {
      x = 0;
      points = [];
    }

    let y = midY;
    const t = timeSinceLastBeat;

    if (t >= 0.04 && t < 0.12) {
      y = midY - 6 * Math.sin(((t - 0.04) / 0.08) * Math.PI);
    } else if (t >= 0.13 && t < 0.16) {
      y = midY + 4;
    } else if (t >= 0.16 && t < 0.22) {
      y = midY - 48 * Math.sin(((t - 0.16) / 0.06) * Math.PI);

      if (!hasBeepedThisBeat && t >= 0.18) {
        playBedsideBeep();
        hasBeepedThisBeat = true;
      }
    } else if (t >= 0.22 && t < 0.26) {
      y = midY + 16;
    } else if (t >= 0.28 && t < 0.40) {
      y = midY - 12 * Math.sin(((t - 0.28) / 0.12) * Math.PI);
    } else {
      y = midY + (Math.random() - 0.5) * 1.5;
    }

    points.push({ x, y });

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