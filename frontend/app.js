// Backend URL - deploy ettiğinde Railway/Render adresini buraya yaz
const API_BASE = "http://localhost:8000";
const STORAGE_KEY = "omnisim_session_id";

let currentSessionId = null;

const screens = {
  select: document.getElementById("screen-select"),
  sim: document.getElementById("screen-sim"),
  report: document.getElementById("screen-report"),
};

function showScreen(name) {
  Object.values(screens).forEach((el) => el.classList.remove("active"));
  screens[name].classList.add("active");
}

// --- 1. Vaka seçim ekranı ---
// app.js içindeki loadScenarios fonksiyonunu şu şekilde güncelleyebilirsiniz:
async function loadScenarios() {
  const res = await fetch(`${API_BASE}/scenarios`);
  const scenarios = await res.json();

  const container = document.getElementById("scenario-list");
  container.innerHTML = "";

  Object.entries(scenarios).forEach(([key, val]) => {
    const card = document.createElement("div");
    card.className = "scenario-card" + (val.enabled ? "" : " disabled");
    card.innerHTML = `
      <h3>${val.label}</h3>
      <span class="scenario-tag">${val.enabled ? 'Aktif Simülasyon' : 'Yakında'}</span>
    `;
    if (val.enabled) {
      card.addEventListener("click", () => startSession(key));
    }
    container.appendChild(card);
  });
}

// --- 2. Vaka başlatma ---
async function startSession(scenarioType) {
  const res = await fetch(`${API_BASE}/session/start?scenario_type=${scenarioType}`, {
    method: "POST",
  });
  if (!res.ok) {
    alert("Vaka başlatılamadı, backend çalışıyor mu kontrol et.");
    return;
  }
  const data = await res.json();
  currentSessionId = data.session_id;
  localStorage.setItem(STORAGE_KEY, currentSessionId);

  document.getElementById("chat-log").innerHTML = "";
  document.getElementById("turn-count").textContent = "0";

  renderTurn(data.turn);
  showScreen("sim");
}

// --- 3. Tur render etme (hasta repliği + sistem notu + vitalleri güncelle) ---
function renderTurn(turn, userMessage = null) {
  const log = document.getElementById("chat-log");

  if (userMessage) {
    appendLogEntry("user", userMessage);
  }
  if (turn.sistem_notu) {
    appendLogEntry("sistem", turn.sistem_notu);
  }
  if (turn.hasta_repligi) {
  appendLogEntry("hasta", turn.hasta_repligi);
  }

  updateVital("vital-nabiz", turn.nabiz, turn.nabiz > 120 || turn.nabiz < 60);
  updateVital("vital-tansiyon", turn.tansiyon, false);
  updateVital("vital-bilinc", turn.bilinc, turn.bilinc !== "açık");

  document.getElementById("turn-count").textContent = turn.turn_no;

  log.scrollTop = log.scrollHeight;

  if (turn.vaka_bitti_mi) {
    setTimeout(() => finishSession(), 1200);
  }
}

function appendLogEntry(type, text) {
  const log = document.getElementById("chat-log");
  const entry = document.createElement("div");
  entry.className = `log-entry ${type}`;
  entry.textContent = text;
  log.appendChild(entry);
}

function updateVital(elementId, value, isAlert) {
  const el = document.getElementById(elementId);
  el.textContent = value;
  el.classList.toggle("alert", isAlert);
}

// --- 4. Kullanıcı mesaj gönderme ---
document.getElementById("action-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = document.getElementById("action-input");
  const message = input.value.trim();
  if (!message || !currentSessionId) return;

  input.value = "";
  const submitBtn = e.target.querySelector("button");
  submitBtn.disabled = true;

  try {
    const res = await fetch(`${API_BASE}/session/${currentSessionId}/act`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });
    if (!res.ok) throw new Error("İstek başarısız");
    const turn = await res.json();
    renderTurn(turn, message);
  } catch (err) {
    alert("Bir şeyler ters gitti: " + err.message);
  } finally {
    submitBtn.disabled = false;
  }
});

// --- 5. Karne ekranı ---
async function finishSession() {
  const res = await fetch(`${API_BASE}/session/${currentSessionId}/end`, {
    method: "POST",
  });
  const report = await res.json();

  document.getElementById("report-score").textContent = report.skor;
  document.getElementById("report-strengths").textContent = report.guclu_yonler;
  document.getElementById("report-mistakes").textContent = report.hatalar;
  document.getElementById("report-suggestion").textContent = report.oneri;

  showScreen("report");
}

document.getElementById("restart-btn").addEventListener("click", () => {
  currentSessionId = null;
  localStorage.removeItem(STORAGE_KEY);
  showScreen("select");
  loadScenarios();
});

// --- 6. Sayfa açılışında: yarım kalmış bir vaka var mı kontrol et ---
async function resumeSessionIfExists() {
  const savedId = localStorage.getItem(STORAGE_KEY);
  if (!savedId) {
    loadScenarios();
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/session/${savedId}`);
    if (!res.ok) throw new Error("Oturum artık geçerli değil");
    const data = await res.json();

    if (data.status === "finished") {
      // Vaka zaten bitmişti (ör. karneyi görmeden sayfa kapanmış), temizle
      localStorage.removeItem(STORAGE_KEY);
      loadScenarios();
      return;
    }

    // Aktif bir vaka var, kaldığı yerden devam ettir
    currentSessionId = savedId;
    document.getElementById("chat-log").innerHTML = "";

    data.logs.forEach((log) => {
      if (log.user_message) appendLogEntry("user", log.user_message);
      if (log.sistem_notu) appendLogEntry("sistem", log.sistem_notu);
      appendLogEntry("hasta", log.hasta_repligi);
    });

    if (data.current_vital) {
      updateVital("vital-nabiz", data.current_vital.nabiz, data.current_vital.nabiz > 120 || data.current_vital.nabiz < 60);
      updateVital("vital-tansiyon", data.current_vital.tansiyon, false);
      updateVital("vital-bilinc", data.current_vital.bilinc, data.current_vital.bilinc !== "açık");
    }
    document.getElementById("turn-count").textContent = data.turn_count;

    showScreen("sim");
  } catch (err) {
    // Kayıtlı id bozuksa veya bulunamadıysa temizleyip baştan başla
    localStorage.removeItem(STORAGE_KEY);
    loadScenarios();
  }
}

// --- Başlangıç ---
resumeSessionIfExists();
