const API_BASE = "http://localhost:8000";
let currentSessionId = null;

// Simulation State Engine
let currentHeartRate = 105;
let heartRateDrift = -0.5;
let minHeartRate = 50;
let maxHeartRate = 140;
let timeLeft = 30;
const TURN_DURATION = 30;
let gameLoopInterval = null;
let isRequestInProgress = false;

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
  }
}

// --- 1. Load All 10 Scenarios from Backend ---
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

// --- 2. Start Simulation & Modal Setup ---
async function startSession(scenarioType) {
  try {
    const res = await fetch(`${API_BASE}/session/start?scenario_type=${scenarioType}`, {
      method: "POST",
    });
    if (!res.ok) throw new Error("Could not connect to backend server.");

    const data = await res.json();
    currentSessionId = data.session_id;

    document.getElementById("chat-log").innerHTML = "";

    const age = data.turn?.age || 58;
    const gender = data.turn?.gender || "Male";
    const diagnosis = data.turn?.primary_diagnosis || "Acute Emergency Case";
    const hr = data.turn?.heart_rate || 105;
    const bp = data.turn?.blood_pressure || "150/95";
    const spo2 = data.turn?.spo2 || 93;
    const note = data.turn?.system_note || "Patient admitted to the resuscitation bay.";

    document.getElementById("patient-age").textContent = age;
    document.getElementById("patient-gender").textContent = String(gender).toUpperCase();
    document.getElementById("patient-tani").textContent = diagnosis;
    document.getElementById("vital-spo2").textContent = spo2;

    document.getElementById("modal-info").textContent = note;
    document.getElementById("modal-age-gender").textContent = `${age} Y/O / ${gender}`;
    document.getElementById("modal-tani").textContent = diagnosis;
    document.getElementById("modal-nabiz").textContent = hr;
    document.getElementById("modal-tansiyon").textContent = bp;

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

// --- 3. Live 30-Second Code Red Ticking Engine ---
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

    // Trigger 1: Critical Threshold Breach
    if (roundedHR <= minHeartRate || roundedHR >= maxHeartRate) {
      clearInterval(gameLoopInterval);
      sendActionToServer(`[CRITICAL THRESHOLD BREACHED: Heart Rate reached ${roundedHR} bpm! Hemodynamic collapse imminent!]`);
      return;
    }

    // Trigger 2: 30-Second Decision Timeout
    if (timeLeft <= 0) {
      clearInterval(gameLoopInterval);
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

// --- 4. Render Turn ---
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
  heartRateDrift = turn?.heart_rate_drift !== undefined ? turn.heart_rate_drift : -0.5;
  minHeartRate = turn?.min_heart_rate || 50;
  maxHeartRate = turn?.max_heart_rate || 140;

  document.getElementById("vital-nabiz").textContent = Math.round(currentHeartRate);
  document.getElementById("vital-tansiyon").textContent = turn?.blood_pressure || "145/90";
  document.getElementById("vital-spo2").textContent = turn?.spo2 || 94;
  document.getElementById("vital-bilinc").textContent = String(turn?.consciousness || "Alert").toUpperCase();
  document.getElementById("turn-count").textContent = turn?.turn_no || 1;

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

// --- 5. Action Dispatcher ---
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
  sendActionToServer(message);
});

function abortSession() {
  if (confirm("Conclude the simulation now and generate the jury evaluation report?")) {
    clearInterval(gameLoopInterval);
    finishSession();
  }
}

// --- 6. Report & Radar Chart ---
async function finishSession() {
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

    showScreen("report");
    drawRadarChart(report.criteria);
  } catch (err) {
    alert("Error fetching report: " + err.message);
  }
}

function returnToMenu() {
  currentSessionId = null;
  clearInterval(gameLoopInterval);
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
    { label: "Educational Impact", val: criteria.educational_impact || 15 },
    { label: "Creative AI Use", val: criteria.creative_ai_use || 15 },
    { label: "Technical Execution", val: criteria.technical_execution || 15 },
    { label: "Pitch & Demo", val: criteria.pitch_demo || 15 },
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

// --- 7. Real-Time Telemetry ECG Waveform Animation ---
let ecgAnimationId = null;
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

  function draw() {
    x += 2;
    if (x > width) {
      x = 0;
      points = [];
    }

    let y = midY;
    const cycle = x % 120;
    if (cycle > 40 && cycle < 48) y = midY - 6;
    else if (cycle >= 48 && cycle < 52) y = midY + 4;
    else if (cycle >= 52 && cycle < 60) y = midY - 45;
    else if (cycle >= 60 && cycle < 66) y = midY + 18;
    else if (cycle >= 75 && cycle < 90) y = midY - 10;

    y += (Math.random() - 0.5) * 2;
    points.push({ x, y });

    ctx.fillStyle = "rgba(3, 7, 18, 0.15)";
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = "#38bdf8";
    ctx.lineWidth = 2;
    ctx.shadowBlur = 8;
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
  draw();
}

// Initialize lobby on load
loadScenarios();