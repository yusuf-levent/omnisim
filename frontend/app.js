const API_BASE = "http://localhost:8000";
let currentSessionId = null;
let activeScenarioKey = "acute_coronary_syndrome";

// Simulation State Engine
let currentHeartRate = 105;
let currentSpO2 = 94;
let currentBP = "150/95";
let currentConsciousness = "Alert";
let heartRateDrift = 0.4;
let minHeartRate = 35;
let maxHeartRate = 185;
let timeLeft = 30;
const TURN_DURATION = 30;
let gameLoopInterval = null;
let isRequestInProgress = false;
let hasBreachedThreshold = false;
let isEndingSession = false;

// Event Timeline Tracking
let sessionActionLogs = [];
let sessionStartTime = null;

// Web Audio API State & Telemetry
let audioCtx = null;
let isAudioEnabled = true;
let cachedReportData = null;

// 1. Dynamic Differential Diagnosis (DDx) Profiles
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
  status_asthmaticus: [
    { name: "Severe Status Asthmaticus", baseProb: 88, color: "red" },
    { name: "Foreign Body Aspiration", baseProb: 7, color: "yellow" },
    { name: "Tension Pneumothorax", baseProb: 5, color: "blue" },
  ],
  tension_pneumothorax: [
    { name: "Tension Pneumothorax", baseProb: 90, color: "red" },
    { name: "Cardiac Tamponade", baseProb: 6, color: "yellow" },
    { name: "Massive Hemothorax", baseProb: 4, color: "blue" },
  ],
  septic_shock: [
    { name: "Septic Shock (Urosepsis)", baseProb: 86, color: "red" },
    { name: "Adrenal Crisis", baseProb: 8, color: "yellow" },
    { name: "Cardiogenic Shock", baseProb: 6, color: "blue" },
  ],
  opioid_overdose: [
    { name: "Acute Opioid Toxicity", baseProb: 92, color: "red" },
    { name: "Severe Hypothermia / Myxedema", baseProb: 5, color: "yellow" },
    { name: "Brainstem Hemorrhage", baseProb: 3, color: "blue" },
  ],
  acute_opioid_toxicity: [
    { name: "Acute Opioid Toxicity", baseProb: 92, color: "red" },
    { name: "Severe Hypothermia / Myxedema", baseProb: 5, color: "yellow" },
    { name: "Brainstem Hemorrhage", baseProb: 3, color: "blue" },
  ],
  default: [
    { name: "Primary Clinical Condition", baseProb: 85, color: "red" },
    { name: "Secondary Differential", baseProb: 10, color: "yellow" },
    { name: "Alternative Etiology", baseProb: 5, color: "blue" },
  ],
};

// 2. Scenario-Specific Quick Actions
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
    { label: "🫁 High-Flow O2 via NRB", cmd: "Administer 100% High-Flow Oxygen via Non-Rebreather Mask (15L/min)" },
    { label: "💧 1000mL Saline Bolus", cmd: "Infuse 1000mL 0.9% Normal Saline rapid pressure bag" },
    { label: "💊 IV Diphenhydramine 50mg", cmd: "Administer IV Diphenhydramine 50mg" },
    { label: "💉 IV Methylprednisolone", cmd: "Administer IV Methylprednisolone 125mg" },
    { label: "🫁 Nebulized Albuterol", cmd: "Administer Nebulized Albuterol 2.5mg with Oxygen" },
    { label: "🚨 Prep Surgical Airway", cmd: "Prepare Cricothyroidotomy kit for impending laryngospasm", warning: true },
  ],
  diabetic_ketoacidosis: [
    { label: "💧 1L 0.9% Normal Saline", cmd: "Infuse 1 Liter 0.9% Normal Saline IV bolus" },
    { label: "🩸 Stat VBG, K+, Glucose", cmd: "Draw Stat VBG, Potassium, Beta-hydroxybutyrate, Glucose" },
    { label: "💉 Regular Insulin Drip", cmd: "Initiate IV Regular Insulin continuous infusion at 0.1 units/kg/hr (No bolus)" },
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
  status_asthmaticus: [
    { label: "🫁 High-Flow O2 via NRB", cmd: "Administer High-Flow Oxygen via Non-Rebreather Mask (15L/min, target SpO2 93-95%)" },
    { label: "💨 Neb Albuterol + Ipratropium", cmd: "Start Continuous Nebulized Albuterol 5mg + Ipratropium Bromide 0.5mg" },
    { label: "💉 IV Methylprednisolone 125mg", cmd: "Administer IV Methylprednisolone 125mg bolus" },
    { label: "🧪 IV Magnesium Sulfate 2g", cmd: "Infuse IV Magnesium Sulfate 2g over 20 minutes" },
    { label: "💉 SubQ Epinephrine 0.3mg", cmd: "Administer Subcutaneous Epinephrine 0.3mg (1:1000) for refractory bronchospasm" },
    { label: "🚨 Prep RSI & Ketamine", cmd: "Prepare Rapid Sequence Intubation tray with Ketamine for bronchodilation", warning: true },
  ],
  tension_pneumothorax: [
    { label: "⚡ Immediate Needle Decompression", cmd: "Perform immediate needle decompression with 14G angiocath at 2nd ICS mid-clavicular line" },
    { label: "🫁 Emergent Tube Thoracostomy", cmd: "Place 28-32 Fr chest tube at 5th ICS anterior-axillary line and connect to water seal" },
    { label: "🫁 High-Flow O2 via NRB", cmd: "Administer 100% High-Flow Oxygen via Non-Rebreather Mask (15L/min)" },
    { label: "🔍 Stat Bedside eFAST Ultrasound", cmd: "Perform immediate eFAST ultrasound evaluating lung sliding and pericardial space" },
    { label: "🩸 Rapid Crystalloid Bolus", cmd: "Infuse 1000mL warmed Normal Saline wide open to assist venous return" },
    { label: "⚠️ Order Portable CXR", cmd: "Order stat portable AP chest radiograph (Warning: Do not delay decompression!)", warning: true },
  ],
  septic_shock: [
    { label: "🩸 Stat Blood/Urine Cultures", cmd: "Draw 2 sets of Blood Cultures and Urine Culture stat prior to antibiotics" },
    { label: "💉 IV Broad-Spectrum Antibiotics", cmd: "Administer IV Ceftriaxone 2g and IV Vancomycin 1.5g within Hour-1 Sepsis Bundle" },
    { label: "💧 30 mL/kg Crystalloid Bolus", cmd: "Infuse 30 mL/kg IV 0.9% Normal Saline rapid bolus under pressure bag" },
    { label: "🧪 Stat Serum Lactate", cmd: "Draw Stat Serum Lactate and repeat in 2 hours" },
    { label: "💊 IV Norepinephrine Drip", cmd: "Start central IV Norepinephrine infusion at 5 mcg/min titrating for MAP >= 65 mmHg" },
    { label: "🚨 Central Venous Line", cmd: "Place Right Internal Jugular Central Venous Line (CVC)", warning: true },
  ],
  opioid_overdose: [
    { label: "🫁 Bag-Valve-Mask (BVM) 100% O2", cmd: "Initiate immediate Bag-Valve-Mask ventilation with 100% Oxygen (12 breaths/min)" },
    { label: "💉 IV Naloxone 0.4mg Titrated", cmd: "Administer IV Naloxone 0.4mg bolus titrated to restore spontaneous respiration" },
    { label: "👃 Intranasal Naloxone 2mg", cmd: "Administer Intranasal Naloxone 2mg via mucosal atomizer device (MAD)" },
    { label: "🩸 Stat Blood Gas & Tox Panel", cmd: "Draw Stat Arterial Blood Gas (ABG), Serum Acetaminophen level, and Urine Tox Screen" },
    { label: "🌡️ Core Temp & Warming", cmd: "Check core rectal temperature and initiate passive rewarming" },
    { label: "🚨 Prep Endotracheal Tube", cmd: "Prepare Endotracheal Intubation tray if refractory to Naloxone", warning: true },
  ],
  acute_opioid_toxicity: [
    { label: "🫁 Bag-Valve-Mask (BVM) 100% O2", cmd: "Initiate immediate Bag-Valve-Mask ventilation with 100% Oxygen (12 breaths/min)" },
    { label: "💉 IV Naloxone 0.4mg Titrated", cmd: "Administer IV Naloxone 0.4mg bolus titrated to restore spontaneous respiration" },
    { label: "👃 Intranasal Naloxone 2mg", cmd: "Administer Intranasal Naloxone 2mg via mucosal atomizer device (MAD)" },
    { label: "🩸 Stat Blood Gas & Tox Panel", cmd: "Draw Stat Arterial Blood Gas (ABG), Serum Acetaminophen level, and Urine Tox Screen" },
    { label: "🌡️ Core Temp & Warming", cmd: "Check core rectal temperature and initiate passive rewarming" },
    { label: "🚨 Prep Endotracheal Tube", cmd: "Prepare Endotracheal Intubation tray if refractory to Naloxone", warning: true },
  ],
  default: [
    { label: "🫁 High-Flow O2", cmd: "Administer High-Flow Oxygen via Non-Rebreather Mask (15L/min)" },
    { label: "🩸 Dual Large-Bore IV", cmd: "Establish dual large-bore 18G IV peripheral lines" },
    { label: "🧪 Stat Emergency Panel", cmd: "Order Stat Complete Blood Count, Electrolytes, and ABG" },
    { label: "📈 12-Lead ECG", cmd: "Perform immediate 12-Lead ECG and monitor continuous rhythm" },
  ],
};

// 3. Scenario-Specific Laboratory Panels
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
  status_asthmaticus: {
    ecgTitle: "PULMONARY MECHANICS & TELEMETRY",
    ecg: "<strong>Peak Expiratory Flow (PEF):</strong> <span class='text-danger'>< 30% predicted (Severe Airway Obstruction)</span><br><strong>Auscultation:</strong> Markedly diminished breath sounds ('Silent Chest'), profound expiratory phase prolongation.<br><strong>Telemetry:</strong> Sinus Tachycardia @ 132 bpm with Right Ventricular Strain (P-pulmonale).",
    labsTitle: "STAT ARTERIAL BLOOD GAS (ABG)",
    labs: "<strong>pH:</strong> <span class='text-danger'>7.26 (Acute Respiratory Acidosis)</span><br><strong>pCO2:</strong> <span class='text-danger'>52 mmHg (Elevated - Impending Respiratory Failure)</span><br><strong>pO2:</strong> 58 mmHg (Severe Hypoxemia on room air)<br><strong>Lactate:</strong> 2.8 mmol/L (Secondary to work of breathing)",
  },
  tension_pneumothorax: {
    ecgTitle: "TRAUMA THORACIC eFAST & TELEMETRY",
    ecg: "<strong>Bedside eFAST US:</strong> Complete absence of lung sliding on Right hemithorax (Stratosphere/Barcode Sign). Positive lung point. No pericardial effusion.<br><strong>Telemetry:</strong> Sinus Tachycardia @ 144 bpm, low-voltage QRS complexes secondary to intrathoracic pressure.",
    labsTitle: "STAT BLOOD GAS & TRAUMA BIOMARKERS",
    labs: "<strong>Arterial Blood Gas (ABG):</strong> <span class='text-danger'>pH 7.18, pO2 52 mmHg (Critical Hypoxia), pCO2 56</span><br><strong>Base Deficit:</strong> -8.2 mEq/L (Severe tissue hypoperfusion)<br><strong>Serum Lactate:</strong> <span class='text-danger'>4.6 mmol/L</span><br><strong>Hemoglobin / Hematocrit:</strong> 13.8 g/dL / 41% (Normovolemic)",
  },
  septic_shock: {
    ecgTitle: "SEPSIS TELEMETRY & HEMODYNAMICS",
    ecg: "<strong>Telemetry:</strong> Sinus Tachycardia @ 132 bpm with bounding pulses.<br><strong>Hemodynamics:</strong> Calculated Mean Arterial Pressure (MAP) = 54 mmHg (Target >= 65 mmHg).",
    labsTitle: "STAT SEPSIS BIOMARKERS",
    labs: "<strong>Serum Lactate:</strong> <span class='text-danger'>4.8 mmol/L (Severe Tissue Hypoperfusion)</span><br><strong>White Blood Cells (WBC):</strong> 18.4 x10^3/mcL (Bands 16%)<br><strong>Creatinine:</strong> 2.1 mg/dL (Acute Kidney Injury)<br><strong>Urinalysis:</strong> Gross pyuria, positive leukocyte esterase & nitrites",
  },
  opioid_overdose: {
    ecgTitle: "AIRWAY, NEUROLOGY & TELEMETRY",
    ecg: "<strong>Airway & Breathing:</strong> Pinpoint pupils (1mm miosis), GCS 3 (E1V1M1), agonal RR 4/min without airway reflexes.<br><strong>Telemetry:</strong> Sinus Bradycardia @ 50-52 bpm, prolonged QTc intervals.",
    labsTitle: "STAT TOXICOLOGY & BLOOD GAS (ABG)",
    labs: "<strong>Arterial Blood Gas (ABG):</strong> <span class='text-danger'>pH 7.15, pCO2 72 mmHg (Severe Hypercapnic Acidosis), pO2 48 mmHg</span><br><strong>Serum Lactate:</strong> 3.2 mmol/L<br><strong>Urine Drug Screen:</strong> <span class='text-danger'>Positive for Opiates / Synthetic Fentanyl</span><br><strong>Acetaminophen / Salicylates:</strong> Undetectable (< 5 mcg/mL)",
  },
  acute_opioid_toxicity: {
    ecgTitle: "AIRWAY, NEUROLOGY & TELEMETRY",
    ecg: "<strong>Airway & Breathing:</strong> Pinpoint pupils (1mm miosis), GCS 3 (E1V1M1), agonal RR 4/min without airway reflexes.<br><strong>Telemetry:</strong> Sinus Bradycardia @ 50-52 bpm, prolonged QTc intervals.",
    labsTitle: "STAT TOXICOLOGY & BLOOD GAS (ABG)",
    labs: "<strong>Arterial Blood Gas (ABG):</strong> <span class='text-danger'>pH 7.15, pCO2 72 mmHg (Severe Hypercapnic Acidosis), pO2 48 mmHg</span><br><strong>Serum Lactate:</strong> 3.2 mmol/L<br><strong>Urine Drug Screen:</strong> <span class='text-danger'>Positive for Opiates / Synthetic Fentanyl</span><br><strong>Acetaminophen / Salicylates:</strong> Undetectable (< 5 mcg/mL)",
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
  if (!isAudioEnabled || !audioCtx || currentHeartRate <= 30) return;
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

function shuffleArray(array) {
  if (!Array.isArray(array)) return [];
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// --- 3. Dynamic Quick Chips & Diagnostics Renderer ---
function renderQuickActions(actions) {
  let container = 
    document.getElementById("quick-actions") || 
    document.getElementById("quick-actions-container") ||
    document.getElementById("actions-container") ||
    document.getElementById("quick-chips") ||
    document.querySelector(".quick-actions") ||
    document.querySelector(".chip-container") ||
    document.getElementById("quick-action-container");

  const actionForm = document.getElementById("action-form");
  if (!container && actionForm && actionForm.previousElementSibling) {
    container = actionForm.previousElementSibling;
  }

  if (!container) {
    console.error("Buton kapsayıcısı bulunamadı!");
    return;
  }

  container.innerHTML = "";

  const listToRender = actions || QUICK_ACTIONS[activeScenarioKey] || QUICK_ACTIONS.default || [];
  const randomizedActions = shuffleArray(listToRender);

  randomizedActions.forEach((action) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `chip-btn ${action.warning ? "warning" : ""}`.trim();
    btn.textContent = action.label;
    btn.onclick = (e) => {
      e.preventDefault();
      executeQuickAction(action.cmd);
    };
    container.appendChild(btn);
  });
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
  isEndingSession = false;
  stopGameLoop();
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
    currentConsciousness = data.turn?.consciousness || "Alert";
    minHeartRate = data.turn?.min_heart_rate !== undefined ? data.turn.min_heart_rate : 35;
    maxHeartRate = data.turn?.max_heart_rate !== undefined ? data.turn.max_heart_rate : 185;
    heartRateDrift = data.turn?.heart_rate_drift !== undefined ? data.turn.heart_rate_drift : 0.4;

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

// --- 5. Ticking Simulation Engine ---
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

    // Critical Safety Threshold Detection
    if ((roundedHR <= minHeartRate || roundedHR >= maxHeartRate) && !hasBreachedThreshold) {
      hasBreachedThreshold = true;
      stopGameLoop();
      logTimelineEvent("Threshold Breach", `Heart rate critical (${roundedHR} bpm)`);
      sendActionToServer(`[CRITICAL THRESHOLD BREACHED: Heart Rate reached ${roundedHR} bpm! Patient entering cardiovascular collapse!]`);
    } 
    // 30s Timeout Detection
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
  minHeartRate = turn?.min_heart_rate !== undefined ? turn.min_heart_rate : 35;
  maxHeartRate = turn?.max_heart_rate !== undefined ? turn.max_heart_rate : 185;

  document.getElementById("vital-nabiz").textContent = Math.round(currentHeartRate);
  document.getElementById("vital-tansiyon").textContent = currentBP;
  document.getElementById("vital-spo2").textContent = currentSpO2;
  document.getElementById("vital-bilinc").textContent = String(currentConsciousness).toUpperCase();
  document.getElementById("turn-count").textContent = turn?.turn_no || 1;

  updateDDxBoard(turn);
  log.scrollTop = log.scrollHeight;

  if (turn?.case_completed === true) {
    stopGameLoop();
    finishSession(); 
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
  if (isRequestInProgress || !currentSessionId || isEndingSession) return;
  
  stopGameLoop();
  logTimelineEvent("Doctor Order", commandText);
  sendActionToServer(commandText);
}

// KESİN ÇÖZÜM: 2. Kez basıldığında logların ve döngünün kilitlenmesini önleyen, tamamen İngilizce dinamik geri bildirimli sendActionToServer
async function sendActionToServer(message) {
  if (!currentSessionId || isEndingSession) return;
  if (isRequestInProgress) return; // Çift tıklama kilitlenmesini engeller

  isRequestInProgress = true;
  stopGameLoop();
  setInteractionsDisabled(true);

  // 1. Kullanıcının hamlesini anında ekrana basıyoruz
  if (!message.startsWith("[")) {
    appendLogEntry("user", message);
  }

  // 2. Müdahale türüne göre akıllı İngilizce dinamik yükleniyor mesajı belirleme
  let loadingText = "⏳ Preparing medication & executing clinical order...";
  const lowerMsg = message.toLowerCase();
  if (lowerMsg.includes("ecg") || lowerMsg.includes("ct") || lowerMsg.includes("labs") || lowerMsg.includes("xray") || lowerMsg.includes("fast") || lowerMsg.includes("blood gas")) {
    loadingText = "⏳ Ordering stat diagnostics & analyzing clinical data...";
  } else if (lowerMsg.includes("tube") || lowerMsg.includes("bvm") || lowerMsg.includes("decompression") || lowerMsg.includes("intubation") || lowerMsg.includes("bipap")) {
    loadingText = "⏳ Preparing airway & procedural equipment...";
  } else if (lowerMsg.includes("oxygen") || lowerMsg.includes("o2")) {
    loadingText = "⏳ Adjusting respiratory support & oxygen flow...";
  }

  // 3. Geçici Yükleniyor (Loading) Durumu Log Ekranına Ekleniyor
  const log = document.getElementById("chat-log");
  const loadingId = "loading-" + Date.now();
  const loadingEntry = document.createElement("div");
  loadingEntry.id = loadingId;
  loadingEntry.className = "log-entry sistem clinical-loading";
  loadingEntry.innerHTML = `
    <span class="loading-pulse" aria-hidden="true"></span>
    <span class="loading-copy">${loadingText}</span>
    <span class="loading-dots" aria-hidden="true"><i></i><i></i><i></i></span>
  `;
  log.appendChild(loadingEntry);
  log.scrollTop = log.scrollHeight;

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

    if (!res.ok) throw new Error("Backend connection failed");

    const turn = await res.json();
    
    // 4. Backend'den cevap gelince geçici Yükleniyor ibaresini kaldır
    const loadingEl = document.getElementById(loadingId);
    if (loadingEl) loadingEl.remove();

    renderTurn(turn, null, true);
  } catch (err) {
    console.error("Action error:", err);
    const loadingEl = document.getElementById(loadingId);
    if (loadingEl) loadingEl.remove();
    
    startGameLoop();
  } finally {
    // 5. Kritik: İstek bittiği an bayrağı ve buton kilitlerini temizle ki 2., 3. ve sonraki basışlarda asla kilitlenme olmasın
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
  if (isEndingSession || !currentSessionId) return;
  isEndingSession = true;

  stopGameLoop();
  stopECGAnimation();
  try {
    const res = await fetch(`${API_BASE}/session/${currentSessionId}/end`, {
      method: "POST",
    });
    if (!res.ok) throw new Error("Could not fetch evaluation report.");
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
  } finally {
    isEndingSession = false;
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

  let rawReaction = report.reaction_score !== undefined ? report.reaction_score : 8;
  if (rawReaction > 10) rawReaction = Math.round(rawReaction / 10);
  rawReaction = Math.max(1, Math.min(10, rawReaction));

  document.getElementById("report-score").textContent = report.score;
  document.getElementById("report-badge").textContent = report.status_badge || "COMPLETED";
  document.getElementById("rep-correct").textContent = report.correct_actions || 0;
  document.getElementById("rep-wrong").textContent = finalWrong;
  document.getElementById("rep-reaction").textContent = `${rawReaction}/10`;

  document.getElementById("report-strengths").textContent = report.strengths;
  document.getElementById("report-mistakes").textContent = report.errors;
  document.getElementById("report-suggestion").textContent = report.suggestions;

  renderTimelineReplay();
  showScreen("report");
  drawRadarChart(report.criteria);
}

// --- Visual Timeline Replay ---
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
  isEndingSession = false;
  stopGameLoop();
  stopECGAnimation();
  showScreen("select");
  loadScenarios();
}

// --- Clinical Competencies Radar Chart ---
function drawRadarChart(criteria = {}) {
  const canvas = document.getElementById("radar-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  const cx = width / 2;
  const cy = height / 2;
  const radius = 88;

  ctx.clearRect(0, 0, width, height);

  const axes = [
    { label: "Protocol Adherence", val: criteria?.protocol_adherence ?? 18 },
    { label: "Diagnostic Accuracy", val: criteria?.diagnostic_accuracy ?? 18 },
    { label: "Patient Safety", val: criteria?.patient_safety ?? 18 },
    { label: "Pharmacology", val: criteria?.pharmacology_precision ?? 18 },
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
  ctx.font = "bold 9.5px 'Plus Jakarta Sans'";
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

    const lx = cx + Math.cos(angle) * (radius + 20);
    const ly = cy + Math.sin(angle) * (radius + 14);
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

// --- 10. Synchronized Real-Time Telemetry ECG ---
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

    const isFlatline = currentHeartRate <= 30;
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
