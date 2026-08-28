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
let hasBreachedThreshold = false;

// Event Timeline Tracking
let sessionActionLogs = [];
let sessionStartTime = null;

// Web Audio API State & Telemetry
let audioCtx = null;
let isAudioEnabled = true;
let cachedReportData = null;

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

// Scenario-Specific Quick Action Chips
const QUICK_ACTIONS = {
  acute_coronary_syndrome: [
    { label: "🫁 High-Flow O2", cmd: "Administer High-Flow Oxygen via Non-Rebreather Mask (15L/min)" },
    { label: "📈 12-Lead ECG", cmd: "Perform immediate 12-Lead ECG and monitor rhythm" },
    { label: "💊 Aspirin 325mg", cmd: "Administer 325mg chewable Aspirin PO" },
    { label: "💉 Sublingual NTG", cmd: "Administer Sublingual Nitroglycerin 0.4mg" },
    { label: "🧪 Stat Cardiac Labs", cmd: "Order Stat Troponin-I, CK-MB, and Arterial Blood Gas" },
    { label: "⚡ Defib 200J", cmd: "Prepare Defibrillator and charge to 200J Biphasic", warning: true },
  ],
  acute_ischemic_stroke: [
    { label: "🧠 Non-Contrast Head CT", cmd: "Stat Non-Contrast Head CT to rule out intracranial hemorrhage" },
    { label: "🩸 Stat Capillary Glucose", cmd: "Perform fingerstick blood glucose check immediately" },
    { label: "⏱️ NIHSS Assessment", cmd: "Perform complete NIH Stroke Scale (NIHSS) assessment" },
    { label: "💊 IV Labetalol 10mg", cmd: "Administer IV Labetalol 10mg to manage severe hypertension" },
    { label: "💉 Prep IV Alteplase (tPA)", cmd: "Calculate dose and prepare IV Alteplase (tPA) for acute stroke" },
    { label: "🏥 Code Neuro Stroke Alert", cmd: "Activate Stroke Team and Neurointerventional suite", warning: true },
  ],
  acute_pulmonary_edema: [
    { label: "🫁 Non-Invasive BiPAP", cmd: "Initiate BiPAP non-invasive ventilation (IPAP 12 / EPAP 6)" },
    { label: "💉 IV Furosemide 40mg", cmd: "Administer IV Furosemide 40mg bolus" },
    { label: "💊 IV Nitroglycerin Drip", cmd: "Start IV Nitroglycerin infusion at 20 mcg/min" },
    { label: "📐 Elevate Bed Head 90°", cmd: "Position patient in high Fowler position upright" },
    { label: "🧪 Stat BNP & ABG", cmd: "Draw Stat BNP, Arterial Blood Gas, and Troponin" },
    { label: "🚨 Intubation Tray", cmd: "Prepare Rapid Sequence Intubation (RSI) kit", warning: true },
  ],
  anaphylactic_shock: [
    { label: "💉 IM Epinephrine 0.3mg", cmd: "Administer IM Epinephrine 0.3mg (1:1000) anterolateral thigh" },
    { label: "💧 1000mL Saline Bolus", cmd: "Infuse 1000mL 0.9% Normal Saline rapid pressure bag" },
    { label: "💊 IV Diphenhydramine 50mg", cmd: "Administer IV Diphenhydramine 50mg" },
    { label: "💉 IV Methylprednisolone", cmd: "Administer IV Methylprednisolone 125mg" },
    { label: "🫁 Nebulized Albuterol", cmd: "Administer Nebulized Albuterol 2.5mg with Oxygen" },
    { label: "🚨 Prep Surgical Airway", cmd: "Prepare Cricothyroidotomy kit for impending laryngospasm", warning: true },
  ],
  diabetic_ketoacidosis: [
    { label: "💧 1L 0.9% Normal Saline", cmd: "Infuse 1 Liter 0.9% Normal Saline IV bolus" },
    { label: "🩸 Stat VBG, K+, Glucose", cmd: "Draw Stat VBG, Potassium, Beta-hydroxybutyrate, Glucose" },
    { label: "💉 Regular Insulin Bolus", cmd: "Administer Regular Insulin IV 0.1 units/kg bolus" },
    { label: "🧪 IV Potassium 20mEq", cmd: "Add 20 mEq Potassium Chloride to IV maintenance fluids" },
    { label: "📊 Continuous Glucose Mon", cmd: "Establish hourly point-of-care capillary glucose monitoring" },
    { label: "⚠️ Monitor Anion Gap", cmd: "Calculate and monitor serum anion gap and osmolality", warning: true },
  ],
  hypovolemic_shock: [
    { label: "🩸 Dual 14G IV Lines", cmd: "Place bilateral 14G large-bore peripheral IV access lines" },
    { label: "🩸 2 Units O-Neg Blood", cmd: "Initiate rapid transfusion of 2 Units Uncrossed O-Negative PRBCs" },
    { label: "💧 Rapid Level-1 Infuser", cmd: "Connect Level-1 rapid blood and fluid warmer infuser" },
    { label: "🔍 Stat Bedside FAST Exam", cmd: "Perform emergency bedside FAST ultrasound for free fluid" },
    { label: "💉 Tranexamic Acid (TXA)", cmd: "Administer 1g IV Tranexamic Acid (TXA) over 10 minutes" },
    { label: "🚨 Massive Transfusion (MTP)", cmd: "Activate Massive Transfusion Protocol (1:1:1)", warning: true },
  ],
  default: [
    { label: "🫁 High-Flow O2", cmd: "Administer High-Flow Oxygen via Non-Rebreather Mask (15L/min)" },
    { label: "🩸 Dual Large-Bore IV", cmd: "Establish dual large-bore 18G IV peripheral lines" },
    { label: "🧪 Stat Emergency Panel", cmd: "Order Stat Complete Blood Count, Electrolytes, and ABG" },
    { label: "📈 12-Lead ECG", cmd: "Perform immediate 12-Lead ECG and monitor continuous rhythm" },
  ],
};

// Scenario-Specific Lab & Diagnostics Results
const LAB_PANELS = {
  acute_coronary_syndrome: {
    ecgTitle: "12-LEAD TELEMETRY FINDINGS",
    ecg: "<strong>Rhythm:</strong> Sinus Tachycardia @ 112 bpm<br><strong>ST-Segment:</strong> >2.5mm elevation in leads V1-V4 (Acute Anterior STEMI)<br><strong>Reciprocal:</strong> ST-depression in leads II, III, aVF",
    labsTitle: "STAT BIOMARKERS",
    labs: "<strong>hs-Troponin-I:</strong> <span class='text-danger'>1.94 ng/mL (High)</span><br><strong>Serum Lactate:</strong> 2.4 mmol/L<br><strong>ABG:</strong> pH 7.35, pO2 81, pCO2 39, HCO3 22<br><strong>Blood Glucose:</strong> 138 mg/dL",
  },
  acute_ischemic_stroke: {
    ecgTitle: "NEUROIMAGING & TELEMETRY",
    ecg: "<strong>Non-Contrast Head CT:</strong> No intracranial hemorrhage/mass effect detected. Early subtle sulcal effacement in Left MCA territory.<br><strong>Rhythm:</strong> Sinus Rhythm @ 88 bpm (No acute AFib)",
    labsTitle: "STAT STROKE LAB PANEL",
    labs: "<strong>Fingerstick Glucose:</strong> 112 mg/dL (Hypoglycemia excluded)<br><strong>INR / PT:</strong> 1.05 / 11.8s (Within therapeutic window)<br><strong>Platelets:</strong> 245,000 /mcL<br><strong>Creatinine:</strong> 0.95 mg/dL",
  },
  acute_pulmonary_edema: {
    ecgTitle: "CARDIAC & ULTRASOUND FINDINGS",
    ecg: "<strong>Bedside Lung US:</strong> Diffuse bilateral B-lines ('Wet Lungs') across all 8 zones.<br><strong>Telemetry:</strong> Sinus Tachycardia @ 124 bpm, LVH strain pattern.",
    labsTitle: "BIOMARKERS & GASOMETRY",
    labs: "<strong>NT-proBNP:</strong> <span class='text-danger'>8,450 pg/mL (Critical)</span><br><strong>ABG:</strong> pH 7.28, pO2 58 mmHg (Severe Hypoxemia), pCO2 48<br><strong>Troponin-I:</strong> 0.12 ng/mL (Mild elevation secondary to strain)",
  },
  anaphylactic_shock: {
    ecgTitle: "AIRWAY & TELEMETRY OBSERVATIONS",
    ecg: "<strong>Airway Scope:</strong> Moderate supraglottic edema, vocal cord swelling with inspiratory stridor.<br><strong>Rhythm:</strong> Sinus Tachycardia @ 132 bpm with frequent PACs.",
    labsTitle: "STAT SHOCK LABS",
    labs: "<strong>Serum Tryptase:</strong> <span class='text-danger'>32.4 mcg/L (Markedly Elevated)</span><br><strong>Venous Lactate:</strong> 3.8 mmol/L<br><strong>ABG:</strong> pH 7.31, pO2 72, pCO2 42<br><strong>WBC:</strong> 14.2 x10^3/mcL (Eosinophils 8%)",
  },
  diabetic_ketoacidosis: {
    ecgTitle: "METABOLIC ECG SIGNS",
    ecg: "<strong>Rhythm:</strong> Sinus Tachycardia @ 118 bpm<br><strong>T-Waves:</strong> Peaked symmetric T-waves suggestive of hyperkalemia risk.<br><strong>QTc:</strong> 440ms (Normal)",
    labsTitle: "STAT METABOLIC & KETONE PANEL",
    labs: "<strong>Capillary Glucose:</strong> <span class='text-danger'>542 mg/dL (Critical High)</span><br><strong>Serum Beta-Hydroxybutyrate:</strong> <span class='text-danger'>6.8 mmol/L</span><br><strong>VBG:</strong> pH 7.14, HCO3 9 mEq/L, pCO2 24 (Kussmaul)<br><strong>Serum Potassium (K+):</strong> 5.4 mEq/L<br><strong>Anion Gap:</strong> 26 (High AG Metabolic Acidosis)",
  },
  hypovolemic_shock: {
    ecgTitle: "TRAUMA FAST & ECG MONITOR",
    ecg: "<strong>Bedside FAST US:</strong> Positive free fluid in Morrison's pouch and splenorenal recess.<br><strong>Rhythm:</strong> Sinus Tachycardia @ 138 bpm with narrow QRS complexes.",
    labsTitle: "STAT BLOOD & COAGULATION",
    labs: "<strong>Hemoglobin / Hct:</strong> <span class='text-danger'>6.8 g/dL / 20.4%</span><br><strong>Serum Lactate:</strong> <span class='text-danger'>5.2 mmol/L (Severe tissue hypoperfusion)</span><br><strong>ABG:</strong> pH 7.22, Base Deficit -9.5 mEq/L<br><strong>Platelets / Fibrinogen:</strong> 110k / 140 mg/dL",
  },
  default: {
    ecgTitle: "TELEMETRY OVERVIEW",
    ecg: "<strong>Rhythm:</strong> Sinus Tachycardia @ 110 bpm.<br><strong>Ischemia:</strong> Non-specific ST/T wave changes.",
    labsTitle: "GENERAL EMERGENCY PANEL",
    labs: "<strong>CBC:</strong> WBC 11.2, Hb 13.5<br><strong>Lactate:</strong> 1.8 mmol/L<br><strong>Basic Chemistries:</strong> Na 139, K 4.1, Cr 1.0",
  },
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
  if (!isAudioEnabled || !audioCtx || currentConsciousness === "Unresponsive") return;
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

// --- 3. Dynamic Quick Chips & Diagnostics Renderer ---
function renderQuickActions() {
  const container = document.getElementById("quick-action-container");
  if (!container) return;

  const actions = QUICK_ACTIONS[activeScenarioKey] || QUICK_ACTIONS.default;
  container.innerHTML = actions
    .map(
      (act) => `
    <button type="button" class="chip-btn ${act.warning ? "warning" : ""}" onclick="executeQuickAction('${act.cmd.replace(/'/g, "\\'")}')">
      ${act.label}
    </button>
  `
    )
    .join("");
}

function renderLabModal() {
  const container = document.getElementById("lab-content-container");
  if (!container) return;

  const data = LAB_PANELS[activeScenarioKey] || LAB_PANELS.default;
  container.innerHTML = `
    <div class="lab-box">
      <h4>${data.ecgTitle}</h4>
      <p>${data.ecg}</p>
    </div>
    <div class="lab-box">
      <h4>${data.labsTitle}</h4>
      <p>${data.labs}</p>
    </div>
  `;
}

// --- 4. Start Session & Modal Handling ---
async function startSession(scenarioType) {
  activeScenarioKey = scenarioType || "acute_coronary_syndrome";
  hasBreachedThreshold = false;
  isRequestInProgress = false;
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
    const diagnosis = data.turn?.primary_diagnosis || "Acute Clinical Inception";
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

    renderQuickActions();
    renderLabModal();

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

// --- 5. Ticking Simulation Engine (Safe & Debounced) ---
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

  gameLoopInterval = setInterval(() => {
    if (isRequestInProgress) return;

    timeLeft--;
    updateTimerUI();

    currentHeartRate += heartRateDrift;
    const roundedHR = Math.round(currentHeartRate);
    const hrEl = document.getElementById("vital-nabiz");
    if (hrEl) hrEl.textContent = roundedHR;

    // Kritik Güvenlik Eşiği Denetimi
    if ((roundedHR <= minHeartRate || roundedHR >= maxHeartRate) && !hasBreachedThreshold) {
      hasBreachedThreshold = true;
      stopGameLoop();
      logTimelineEvent("Threshold Breach", `Heart rate critical (${roundedHR} bpm)`);
      sendActionToServer(`[CRITICAL THRESHOLD BREACHED: Heart Rate reached ${roundedHR} bpm! Patient entering cardiovascular collapse!]`);
    } 
    // 30 Saniye Timeout Denetimi
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
  chipBtns.forEach((btn) => (btn.disabled = disabled));
}

// --- 6. Turn Rendering & DDx Updates ---
let lastSystemNote = "";

function renderTurn(turn, userMessage = null, shouldStartTimer = true) {
  const log = document.getElementById("chat-log");

  if (userMessage) {
    appendLogEntry("user", userMessage);
    hasBreachedThreshold = false;
  }

  if (turn?.system_note && turn.system_note.trim() !== "" && turn.system_note !== lastSystemNote) {
    appendLogEntry("sistem", turn.system_note);
    const doctorNoteEl = document.getElementById("doctor-note-text");
    if (doctorNoteEl) doctorNoteEl.textContent = turn.system_note;
    lastSystemNote = turn.system_note;
  }

  if (turn?.patient_dialogue && turn.patient_dialogue.trim() !== "" && turn.consciousness !== "Unresponsive") {
    appendLogEntry("hasta", turn.patient_dialogue);
  }

  currentHeartRate = turn?.heart_rate || currentHeartRate;
  currentSpO2 = turn?.spo2 || currentSpO2;
  currentBP = turn?.blood_pressure || currentBP;
  currentConsciousness = turn?.consciousness || "Alert";
  heartRateDrift = turn?.heart_rate_drift !== undefined ? turn.heart_rate_drift : 0.4;
  minHeartRate = turn?.min_heart_rate || 50;
  maxHeartRate = turn?.max_heart_rate || 140;

  document.getElementById("vital-nabiz").textContent = Math.round(currentHeartRate);
  document.getElementById("vital-tansiyon").textContent = currentBP;
  document.getElementById("vital-spo2").textContent = currentSpO2;
  document.getElementById("vital-bilinc").textContent = String(currentConsciousness).toUpperCase();
  document.getElementById("turn-count").textContent = turn?.turn_no || 1;

  updateDDxBoard(turn);
  log.scrollTop = log.scrollHeight;

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

// --- 7. Quick Action Execution & Dispatch ---
function executeQuickAction(commandText) {
  if (isRequestInProgress || !currentSessionId) return;
  stopGameLoop();
  logTimelineEvent("Doctor Order", commandText);
  sendActionToServer(commandText);
}

async function sendActionToServer(message) {
  if (!currentSessionId || isRequestInProgress) return;

  isRequestInProgress = true;
  stopGameLoop();
  setInteractionsDisabled(true);

  try {
    const payload = {
      message: message,
      current_hr: Math.round(currentHeartRate),
      current_spo2: currentSpO2,
      current_bp: currentBP,
    };

    const res = await fetch(`${API_BASE}/session/${currentSessionId}/act`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) throw new Error("Request failed");

    const turn = await res.json();
    renderTurn(turn, message.startsWith("[") ? null : message, true);
  } catch (err) {
    console.error("Action error:", err);
    startGameLoop();
  } finally {
    isRequestInProgress = false;
    setInteractionsDisabled(false);
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

function openLabModal() {
  document.getElementById("lab-modal").classList.add("active");
}

function closeLabModal() {
  document.getElementById("lab-modal").classList.remove("active");
}

// --- 8. Web Audio Outcome Sentezleyici ---
function playOutcomeAudio(isSuccess) {
  if (!isAudioEnabled || !audioCtx) return;
  try {
    const now = audioCtx.currentTime;
    if (isSuccess) {
      [523.25, 659.25, 783.99].forEach((freq, idx) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, now + idx * 0.12);
        gain.gain.setValueAtTime(0.001, now + idx * 0.12);
        gain.gain.linearRampToValueAtTime(0.2, now + idx * 0.12 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.12 + 0.5);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now + idx * 0.12);
        osc.stop(now + idx * 0.12 + 0.55);
      });
    } else {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(820, now);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.25, now + 0.05);
      gain.gain.setValueAtTime(0.25, now + 2.5);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 3.0);

      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + 3.0);
    }
  } catch (e) {
    console.error("Outcome audio error:", e);
  }
}

// --- 9. Scorecard & Transition Modal ---
async function finishSession() {
  stopGameLoop();
  stopECGAnimation();
  try {
    const res = await fetch(`${API_BASE}/session/${currentSessionId}/end`, {
      method: "POST",
    });
    cachedReportData = await res.json();

    const isSuccess =
      cachedReportData.score >= 60 &&
      !cachedReportData.status_badge.includes("FAIL") &&
      !cachedReportData.status_badge.includes("ARREST");

    const modalBadge = document.getElementById("outcome-badge");
    const modalIcon = document.getElementById("outcome-icon");
    const modalTitle = document.getElementById("outcome-title");
    const modalDesc = document.getElementById("outcome-desc");

    if (isSuccess) {
      modalBadge.style.color = "#10b981";
      modalBadge.textContent = "✅ CLINICAL STABILIZATION ACHIEVED";
      modalIcon.textContent = "🫀✨";
      modalTitle.textContent = "Patient Successfully Stabilized";
      modalDesc.textContent =
        "Timely and protocol-adherent interventions effectively reversed acute decompensation. Patient stabilized and transferred to the ICU / Cath Lab.";
    } else {
      modalBadge.style.color = "#ef4444";
      modalBadge.textContent = "🚨 CRITICAL FAILURE / CARDIAC ARREST";
      modalIcon.textContent = "⚡📉";
      modalTitle.textContent = "Patient Entered Asystole / VF Arrest";
      modalDesc.textContent =
        cachedReportData.errors ||
        "Prolonged ischemia and absence of critical stabilization orders resulted in fatal cardiovascular collapse.";
    }

    playOutcomeAudio(isSuccess);
    document.getElementById("outcome-modal").classList.add("active");
  } catch (err) {
    alert("Error fetching report: " + err.message);
  }
}

function proceedToScorecard() {
  document.getElementById("outcome-modal").classList.remove("active");
  if (!cachedReportData) return;

  const report = cachedReportData;
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
}

// --- Yenilenmiş Rozetli Görsel Timeline Replay ---
function renderTimelineReplay() {
  const container = document.getElementById("timeline-events");
  if (!container) return;
  container.innerHTML = "";

  sessionActionLogs.forEach((item) => {
    const row = document.createElement("div");

    let typeClass = "primary";
    let icon = "🩺";

    if (item.tag.includes("Timeout")) {
      typeClass = "danger";
      icon = "⌛";
    } else if (item.tag.includes("Breach")) {
      typeClass = "danger";
      icon = "⚡";
    } else if (item.tag.includes("EMS") || item.tag.includes("Admission")) {
      typeClass = "primary";
      icon = "🚑";
    } else if (item.tag.includes("Order") || item.tag.includes("Doctor")) {
      typeClass = "success";
      icon = "💊";
    }

    row.className = `timeline-item ${typeClass}`;
    row.innerHTML = `
      <span class="timeline-badge">${icon} +${item.time}</span>
      <div class="timeline-body">
        <strong class="timeline-tag">${item.tag}:</strong>
        <span class="timeline-action">${item.desc}</span>
      </div>
    `;
    container.appendChild(row);
  });
}

function returnToMenu() {
  currentSessionId = null;
  hasBreachedThreshold = false;
  isRequestInProgress = false;
  stopGameLoop();
  stopECGAnimation();
  showScreen("select");
  loadScenarios();
}

// --- Yenilenmiş Klinik Yetkinlik Radar Grafiği ---
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

  // Tıbbi Performans Yetkinlik Eksenleri (Geriye Dönük Uyumluluklu)
  const axes = [
    { label: "Protocol Adherence", val: criteria?.protocol_adherence ?? criteria?.educational_impact ?? 18 },
    { label: "Diagnostic Accuracy", val: criteria?.diagnostic_accuracy ?? criteria?.creative_ai_use ?? 18 },
    { label: "Patient Safety", val: criteria?.patient_safety ?? criteria?.technical_execution ?? 18 },
    { label: "Pharmacology & Dosage", val: criteria?.pharmacology_precision ?? criteria?.pitch_demo ?? 18 },
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
    ctx.strokeStyle = "rgba(56, 189, 248, 0.15)";
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
    ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
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
  ctx.fillStyle = "rgba(56, 189, 248, 0.35)";
  ctx.fill();
  ctx.strokeStyle = "#38bdf8";
  ctx.lineWidth = 2.2;
  ctx.shadowBlur = 8;
  ctx.shadowColor = "#38bdf8";
  ctx.stroke();
}

// --- 10. Synchronized Real-Time Telemetry ECG (Flatline & Artery Aware) ---
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

    const isFlatline = currentConsciousness === "Unresponsive" || currentHeartRate <= 30;
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

    if (isFlatline) {
      y = midY + (Math.random() - 0.5) * 2;
    } else {
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
    }

    points.push({ x, y });

    ctx.fillStyle = "rgba(3, 7, 18, 0.16)";
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = isFlatline ? "#ef4444" : "#38bdf8";
    ctx.lineWidth = 2.2;
    ctx.shadowBlur = 9;
    ctx.shadowColor = isFlatline ? "#ef4444" : "#38bdf8";

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