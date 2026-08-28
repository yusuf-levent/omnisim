const API_BASE = (window.OMNISIM_API_BASE || "http://localhost:8000").replace(/\/+$/, "");
const apiUrl = (path) => `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
const API_TIMEOUT_MS = 45000;
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
let selectedDifficulty = "easy";
let pendingScenarioKey = null;
let pendingSessionReady = false;

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
  hyperkalemia_crisis: [
    { name: "Severe Hyperkalemia", baseProb: 90, color: "red" },
    { name: "Complete Heart Block", baseProb: 7, color: "yellow" },
    { name: "Digoxin Toxicity", baseProb: 3, color: "blue" },
  ],
  adrenal_crisis: [
    { name: "Acute Adrenal Crisis", baseProb: 87, color: "red" },
    { name: "Septic Shock", baseProb: 9, color: "yellow" },
    { name: "DKA / Hypoglycemic Crisis", baseProb: 4, color: "blue" },
  ],
  meningococcal_sepsis: [
    { name: "Meningococcal Sepsis", baseProb: 88, color: "red" },
    { name: "Viral Meningitis", baseProb: 7, color: "yellow" },
    { name: "Rocky Mountain Spotted Fever", baseProb: 5, color: "blue" },
  ],
  eclampsia: [
    { name: "Eclampsia", baseProb: 90, color: "red" },
    { name: "Intracranial Hemorrhage", baseProb: 6, color: "yellow" },
    { name: "Epileptic Seizure Disorder", baseProb: 4, color: "blue" },
  ],
  upper_gi_bleed: [
    { name: "Massive Upper GI Bleed", baseProb: 88, color: "red" },
    { name: "Ruptured Esophageal Varix", baseProb: 8, color: "yellow" },
    { name: "Lower GI Bleed", baseProb: 4, color: "blue" },
  ],
  carbon_monoxide_poisoning: [
    { name: "Carbon Monoxide Poisoning", baseProb: 86, color: "red" },
    { name: "Cyanide Toxicity", baseProb: 8, color: "yellow" },
    { name: "Viral Syndrome / Migraine", baseProb: 6, color: "blue" },
  ],
  pediatric_svt: [
    { name: "Pediatric SVT", baseProb: 91, color: "red" },
    { name: "Sinus Tachycardia from Shock", baseProb: 6, color: "yellow" },
    { name: "Atrial Flutter", baseProb: 3, color: "blue" },
  ],
  exertional_heat_stroke: [
    { name: "Exertional Heat Stroke", baseProb: 89, color: "red" },
    { name: "Sepsis with Hyperthermia", baseProb: 7, color: "yellow" },
    { name: "Serotonin Syndrome", baseProb: 4, color: "blue" },
  ],
  thyroid_storm: [
    { name: "Thyroid Storm", baseProb: 87, color: "red" },
    { name: "Sepsis / Hyperadrenergic Shock", baseProb: 8, color: "yellow" },
    { name: "Stimulant Toxicity", baseProb: 5, color: "blue" },
  ],
  massive_pulmonary_embolism: [
    { name: "Massive Pulmonary Embolism", baseProb: 88, color: "red" },
    { name: "Tension Pneumothorax", baseProb: 7, color: "yellow" },
    { name: "Acute Coronary Syndrome", baseProb: 5, color: "blue" },
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
  hyperkalemia_crisis: [
    { label: "⚡ IV Calcium Gluconate", cmd: "Administer IV Calcium Gluconate 1g immediately for myocardial membrane stabilization" },
    { label: "💉 Insulin + Dextrose", cmd: "Administer Regular Insulin 10 units IV with Dextrose 25g IV to shift potassium intracellularly" },
    { label: "🫁 Nebulized Albuterol", cmd: "Administer high-dose Nebulized Albuterol 10-20mg for potassium shift" },
    { label: "🧪 Stat BMP + VBG", cmd: "Draw Stat BMP, Magnesium, VBG, and repeat potassium level" },
    { label: "🩺 Continuous ECG", cmd: "Place patient on continuous cardiac monitor and obtain repeat 12-lead ECG" },
    { label: "🚨 Emergent Dialysis", cmd: "Activate nephrology for emergent hemodialysis due to unstable severe hyperkalemia", warning: true },
  ],
  adrenal_crisis: [
    { label: "💉 IV Hydrocortisone 100mg", cmd: "Administer Hydrocortisone 100mg IV immediately for suspected adrenal crisis" },
    { label: "💧 2L Normal Saline", cmd: "Infuse 2 liters of isotonic Normal Saline rapidly for adrenal shock" },
    { label: "🩸 Check Glucose Now", cmd: "Perform immediate bedside glucose check and treat hypoglycemia if present" },
    { label: "🍬 IV Dextrose", cmd: "Administer IV Dextrose 25g for suspected hypoglycemia in adrenal crisis" },
    { label: "🧪 Cortisol/ACTH Labs", cmd: "Draw cortisol and ACTH levels without delaying steroid administration" },
    { label: "🚨 ICU Vasopressor Prep", cmd: "Prepare Norepinephrine infusion if hypotension persists after fluids and steroids", warning: true },
  ],
  meningococcal_sepsis: [
    { label: "🛡️ Droplet Isolation", cmd: "Initiate droplet precautions and PPE for suspected meningococcal disease" },
    { label: "💉 IV Ceftriaxone Now", cmd: "Administer IV Ceftriaxone 2g immediately without delaying for lumbar puncture" },
    { label: "🩸 Blood Cultures", cmd: "Draw two sets of blood cultures immediately but do not delay antibiotics" },
    { label: "💧 30 mL/kg Fluids", cmd: "Infuse 30 mL/kg isotonic crystalloid bolus for septic shock" },
    { label: "💊 Norepinephrine MAP>65", cmd: "Start Norepinephrine infusion titrated to MAP >= 65 mmHg if shock persists" },
    { label: "🚨 ICU + Public Health", cmd: "Activate ICU, infectious disease, and public health notification for meningococcemia", warning: true },
  ],
  eclampsia: [
    { label: "↩️ Left Lateral Position", cmd: "Place patient in left lateral position and protect airway after eclamptic seizure" },
    { label: "🫁 High-Flow O2", cmd: "Administer high-flow oxygen and suction airway secretions after seizure" },
    { label: "💉 Magnesium Sulfate Load", cmd: "Administer Magnesium Sulfate 4-6g IV loading dose for eclampsia seizure control" },
    { label: "💊 IV Labetalol", cmd: "Administer IV Labetalol for severe-range pregnancy hypertension" },
    { label: "🧪 HELLP Labs", cmd: "Order CBC, CMP, creatinine, AST/ALT, platelets, urine protein, and coagulation studies" },
    { label: "🚨 OB/NICU Activate", cmd: "Activate obstetrics, anesthesia, and NICU for urgent maternal-fetal management", warning: true },
  ],
  upper_gi_bleed: [
    { label: "🩸 Two 14G IVs", cmd: "Place two 14G large-bore IV lines for massive upper GI bleeding" },
    { label: "🧪 Type & Crossmatch", cmd: "Send type and crossmatch, CBC, INR, fibrinogen, CMP, and lactate immediately" },
    { label: "🩸 Transfuse PRBCs", cmd: "Transfuse uncrossmatched O-negative PRBCs due to unstable hemorrhagic shock" },
    { label: "💊 IV Pantoprazole", cmd: "Administer Pantoprazole 80mg IV bolus then infusion for upper GI bleeding" },
    { label: "💉 Octreotide + Ceftriaxone", cmd: "Administer Octreotide infusion and Ceftriaxone due to suspected variceal hemorrhage" },
    { label: "🚨 Urgent Endoscopy", cmd: "Activate GI for emergent endoscopy after hemodynamic resuscitation", warning: true },
  ],
  carbon_monoxide_poisoning: [
    { label: "🫁 100% O2 NRB", cmd: "Administer 100% Oxygen via non-rebreather mask immediately for suspected carbon monoxide poisoning" },
    { label: "🩸 Co-Oximetry ABG", cmd: "Draw arterial blood gas with co-oximetry and carboxyhemoglobin level" },
    { label: "📈 ECG + Troponin", cmd: "Obtain ECG and Troponin to evaluate carbon monoxide myocardial injury" },
    { label: "🤰 Pregnancy Test", cmd: "Check pregnancy status because fetal carbon monoxide toxicity changes hyperbaric threshold" },
    { label: "🧠 Neuro Assessment", cmd: "Perform serial neurological assessment for confusion, syncope, or focal deficit" },
    { label: "🚨 Hyperbaric Consult", cmd: "Consult hyperbaric oxygen center for severe CO poisoning criteria", warning: true },
  ],
  pediatric_svt: [
    { label: "🩺 Assess Stability", cmd: "Assess pediatric perfusion, mental status, blood pressure, and signs of shock" },
    { label: "🧊 Vagal Maneuver", cmd: "Attempt age-appropriate vagal maneuver with ice to face if patient is stable" },
    { label: "💉 Adenosine 0.1mg/kg", cmd: "Administer rapid IV Adenosine 0.1 mg/kg followed immediately by saline flush" },
    { label: "💉 Adenosine 0.2mg/kg", cmd: "Administer second rapid IV Adenosine dose 0.2 mg/kg if SVT persists" },
    { label: "📈 12-Lead Rhythm Strip", cmd: "Obtain 12-lead ECG and continuous rhythm strip during adenosine administration" },
    { label: "🚨 Sync Cardioversion", cmd: "Perform synchronized cardioversion 0.5-1 J/kg for unstable pediatric SVT", warning: true },
  ],
  exertional_heat_stroke: [
    { label: "🌊 Cold-Water Immersion", cmd: "Start immediate cold-water immersion cooling for exertional heat stroke" },
    { label: "👕 Remove Gear", cmd: "Remove clothing and equipment to maximize evaporative and conductive cooling" },
    { label: "🌡️ Rectal Temp Probe", cmd: "Place continuous rectal temperature probe for accurate core temperature monitoring" },
    { label: "💧 Chilled IV Saline", cmd: "Start chilled isotonic IV fluids as adjunctive cooling and volume support" },
    { label: "🧪 CK/CMP/Coags", cmd: "Order CK, CMP, renal function, electrolytes, coagulation panel, and urinalysis for rhabdomyolysis" },
    { label: "🚨 ICU Cooling Team", cmd: "Activate ICU and continue rapid cooling until core temperature reaches 38.6 C", warning: true },
  ],
  thyroid_storm: [
    { label: "💊 Propranolol", cmd: "Administer Propranolol for thyroid storm tachycardia if no contraindication" },
    { label: "💊 PTU Loading Dose", cmd: "Administer Propylthiouracil loading dose to block thyroid hormone synthesis" },
    { label: "🧪 Iodine After PTU", cmd: "Administer iodine solution at least one hour after thionamide therapy" },
    { label: "💉 IV Hydrocortisone", cmd: "Administer Hydrocortisone 100mg IV for thyroid storm and adrenal support" },
    { label: "🌡️ Active Cooling", cmd: "Begin active cooling and supportive care; avoid salicylates" },
    { label: "🚨 Treat Trigger + ICU", cmd: "Activate ICU and search for trigger such as infection, MI, or medication nonadherence", warning: true },
  ],
  massive_pulmonary_embolism: [
    { label: "🫁 High-Flow O2", cmd: "Administer high-flow oxygen for severe hypoxemia in suspected massive pulmonary embolism" },
    { label: "🔍 Bedside Echo", cmd: "Perform bedside echocardiography to assess RV dilation and obstructive shock" },
    { label: "🧪 D-Dimer/Troponin/BNP", cmd: "Order D-dimer if appropriate, Troponin, BNP, ABG, lactate, and coagulation studies" },
    { label: "💉 IV Heparin", cmd: "Start IV unfractionated Heparin anticoagulation if no contraindication" },
    { label: "📸 CT Pulmonary Angiography", cmd: "Order CT Pulmonary Angiography if patient is stable enough for transport" },
    { label: "🚨 Systemic Thrombolysis", cmd: "Administer systemic thrombolysis for massive PE with persistent obstructive shock", warning: true },
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
  hyperkalemia_crisis: {
    ecgTitle: "HYPERKALEMIA ECG & RENAL CONTEXT",
    ecg: "<strong>Rhythm:</strong> Junctional bradycardia @ 48 bpm<br><strong>QRS:</strong> <span class='text-danger'>Widened QRS 158ms with tall peaked T waves</span><br><strong>History:</strong> Missed dialysis, AV fistula present, no urine output for 24 hours.",
    labsTitle: "STAT ELECTROLYTES",
    labs: "<strong>Potassium:</strong> <span class='text-danger'>7.8 mEq/L (Life-threatening)</span><br><strong>Creatinine:</strong> 8.9 mg/dL<br><strong>VBG:</strong> pH 7.21, HCO3 14<br><strong>Glucose:</strong> 116 mg/dL<br><strong>Magnesium:</strong> 2.5 mg/dL",
  },
  adrenal_crisis: {
    ecgTitle: "SHOCK & METABOLIC FINDINGS",
    ecg: "<strong>Telemetry:</strong> Sinus Tachycardia @ 128 bpm with narrow complexes<br><strong>Perfusion:</strong> Cool extremities, delayed capillary refill, shock poorly responsive to initial crystalloid.",
    labsTitle: "ADRENAL CRISIS PANEL",
    labs: "<strong>Sodium:</strong> <span class='text-danger'>121 mEq/L</span><br><strong>Potassium:</strong> <span class='text-danger'>5.9 mEq/L</span><br><strong>Glucose:</strong> <span class='text-danger'>48 mg/dL</span><br><strong>Cortisol:</strong> pending; draw but do not delay hydrocortisone<br><strong>Lactate:</strong> 3.4 mmol/L",
  },
  meningococcal_sepsis: {
    ecgTitle: "MENINGITIS & SHOCK OBSERVATIONS",
    ecg: "<strong>Exam:</strong> Non-blanching petechial/purpuric rash on trunk and legs, neck stiffness, photophobia.<br><strong>Telemetry:</strong> Sinus Tachycardia @ 138 bpm, narrow QRS, hypotensive shock.",
    labsTitle: "SEPSIS / DIC PANEL",
    labs: "<strong>Lactate:</strong> <span class='text-danger'>5.1 mmol/L</span><br><strong>WBC:</strong> 22.8 x10^3/mcL with bands<br><strong>Platelets:</strong> <span class='text-danger'>74,000 /mcL</span><br><strong>INR:</strong> 1.8<br><strong>Procalcitonin:</strong> markedly elevated",
  },
  eclampsia: {
    ecgTitle: "OBSTETRIC SEIZURE MONITORING",
    ecg: "<strong>Maternal Telemetry:</strong> Sinus Tachycardia @ 116 bpm after witnessed tonic-clonic seizure.<br><strong>Bedside:</strong> Hyperreflexia and clonus present; fetal heart tracing not yet established.",
    labsTitle: "PREECLAMPSIA / HELLP PANEL",
    labs: "<strong>Blood Pressure:</strong> <span class='text-danger'>190/118 mmHg</span><br><strong>Urine Protein:</strong> 3+<br><strong>Platelets:</strong> 92,000 /mcL<br><strong>AST/ALT:</strong> 118 / 132 U/L<br><strong>Creatinine:</strong> 1.4 mg/dL",
  },
  upper_gi_bleed: {
    ecgTitle: "HEMORRHAGIC SHOCK MONITOR",
    ecg: "<strong>Telemetry:</strong> Sinus Tachycardia @ 136 bpm, low pulse pressure.<br><strong>Bedside:</strong> Active hematemesis, melena, cool clammy skin, orthostatic collapse.",
    labsTitle: "MASSIVE BLEEDING PANEL",
    labs: "<strong>Hemoglobin:</strong> <span class='text-danger'>6.9 g/dL</span><br><strong>Platelets:</strong> 128,000 /mcL<br><strong>INR:</strong> 1.7<br><strong>BUN/Cr:</strong> 54 / 1.3<br><strong>Lactate:</strong> <span class='text-danger'>4.9 mmol/L</span>",
  },
  carbon_monoxide_poisoning: {
    ecgTitle: "CO TOXICITY & CARDIAC SCREEN",
    ecg: "<strong>Pulse Ox:</strong> 100% despite confusion and headache; reading is unreliable in CO poisoning.<br><strong>ECG:</strong> Sinus Tachycardia @ 118 bpm with subtle ST depression.",
    labsTitle: "CO-OXIMETRY / TOX PANEL",
    labs: "<strong>Carboxyhemoglobin:</strong> <span class='text-danger'>31%</span><br><strong>ABG PaO2:</strong> 238 mmHg on oxygen, tissue hypoxia persists<br><strong>Lactate:</strong> 3.1 mmol/L<br><strong>Troponin-I:</strong> 0.18 ng/mL<br><strong>Pregnancy Test:</strong> pending",
  },
  pediatric_svt: {
    ecgTitle: "PEDIATRIC RHYTHM STRIP",
    ecg: "<strong>Rhythm:</strong> <span class='text-danger'>Regular narrow-complex tachycardia @ 228 bpm</span><br><strong>P Waves:</strong> Not clearly visible<br><strong>Perfusion:</strong> Pale, anxious, weak peripheral pulses.",
    labsTitle: "PEDIATRIC STABILIZATION DATA",
    labs: "<strong>Glucose:</strong> 102 mg/dL<br><strong>Electrolytes:</strong> Na 138, K 4.2, Mg 1.9<br><strong>Capillary Refill:</strong> 4 seconds<br><strong>Weight:</strong> estimated 32 kg for dose calculation",
  },
  exertional_heat_stroke: {
    ecgTitle: "CORE TEMPERATURE & ORGAN RISK",
    ecg: "<strong>Core Rectal Temp:</strong> <span class='text-danger'>41.3 C</span><br><strong>Telemetry:</strong> Sinus Tachycardia @ 154 bpm<br><strong>Exam:</strong> Confused, ataxic, hot skin after outdoor exertion.",
    labsTitle: "HEAT STROKE PANEL",
    labs: "<strong>CK:</strong> <span class='text-danger'>7,850 U/L</span><br><strong>Creatinine:</strong> 1.8 mg/dL<br><strong>Potassium:</strong> 5.3 mEq/L<br><strong>AST/ALT:</strong> 220 / 176 U/L<br><strong>INR:</strong> 1.5",
  },
  thyroid_storm: {
    ecgTitle: "HYPERMETABOLIC TELEMETRY",
    ecg: "<strong>Rhythm:</strong> Atrial Fibrillation with RVR @ 162 bpm<br><strong>Exam:</strong> Tremor, goiter, hyperpyrexia, agitation, warm moist skin.",
    labsTitle: "THYROID STORM PANEL",
    labs: "<strong>TSH:</strong> <span class='text-danger'>< 0.01 mIU/L</span><br><strong>Free T4:</strong> <span class='text-danger'>Markedly elevated</span><br><strong>Total T3:</strong> elevated<br><strong>Temperature:</strong> 40.4 C<br><strong>Lactate:</strong> 3.0 mmol/L",
  },
  massive_pulmonary_embolism: {
    ecgTitle: "RV STRAIN & OBSTRUCTIVE SHOCK",
    ecg: "<strong>ECG:</strong> Sinus Tachycardia @ 138 bpm, S1Q3T3 pattern, anterior T-wave inversions.<br><strong>Bedside Echo:</strong> Dilated RV with septal bowing and poor LV filling.",
    labsTitle: "PE RISK STRATIFICATION PANEL",
    labs: "<strong>ABG:</strong> pH 7.47, pCO2 28, pO2 56<br><strong>Lactate:</strong> <span class='text-danger'>4.2 mmol/L</span><br><strong>Troponin-I:</strong> 0.32 ng/mL<br><strong>BNP:</strong> 680 pg/mL<br><strong>D-Dimer:</strong> markedly elevated",
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
  const container = document.getElementById("scenario-list");
  if (!container) return;

  try {
    const res = await fetch(apiUrl("/scenarios"));
    if (!res.ok) throw new Error(`Scenario API returned ${res.status}`);

    const scenarios = await res.json();
    const scenarioEntries = Object.entries(scenarios).filter(
      ([, val]) => val && typeof val === "object" && typeof val.label === "string"
    );

    if (scenarioEntries.length === 0) {
      throw new Error("Scenario API returned an invalid payload");
    }

    container.innerHTML = "";

    scenarioEntries.forEach(([key, val]) => {
      const card = document.createElement("div");
      card.className = `scenario-card ${val.enabled ? "featured" : "disabled"}`;
      card.innerHTML = `
        <div class="card-icon">${val.icon}</div>
        <span class="scenario-tag ${val.enabled ? "live" : "lock"}">${val.tag}</span>
        <h3>${val.label}</h3>
        <p class="card-desc">${val.desc}</p>
        <button class="btn-primary" ${val.enabled ? "" : "disabled"} onclick="openDifficultyModal('${key}')">
          ${val.enabled ? "INITIALIZE CASE" : "COMING SOON"}
        </button>
      `;
      container.appendChild(card);
    });
  } catch (err) {
    console.error("Failed to load scenarios:", err);
    container.innerHTML = `
      <div class="scenario-card disabled">
        <div class="card-icon">⚠️</div>
        <span class="scenario-tag lock">BACKEND OFFLINE</span>
        <h3>Cases could not be loaded</h3>
        <p class="card-desc">Check the Render backend URL in config.js and confirm /scenarios is live.</p>
        <button class="btn-primary" disabled>WAITING FOR API</button>
      </div>
    `;
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

  if (selectedDifficulty === "hard") {
    container.innerHTML = "";
    container.classList.add("hidden");
    return;
  }

  container.classList.remove("hidden");
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
async function openDifficultyModal(scenarioType) {
  await startSession(scenarioType);
}

async function startSession(scenarioType) {
  activeScenarioKey = scenarioType || "acute_coronary_syndrome";
  hasBreachedThreshold = false;
  isRequestInProgress = false;
  isEndingSession = false;
  pendingScenarioKey = scenarioType;
  pendingSessionReady = false;
  stopGameLoop();
  initAudioContext();

  try {
    const res = await fetchWithTimeout(apiUrl(`/session/start?scenario_type=${scenarioType}`), {
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

    document.getElementById("difficulty-modal-info").textContent = note;
    document.getElementById("difficulty-age-gender").textContent = `${age} Y/O / ${gender}`;
    document.getElementById("difficulty-tani").textContent = diagnosis;
    document.getElementById("difficulty-nabiz").textContent = hr;
    document.getElementById("difficulty-tansiyon").textContent = bp;

    renderLabModal();

    logTimelineEvent("EMS Admission", `Patient admitted with ${diagnosis}`);
    renderTurn(data.turn, null, false);
    pendingSessionReady = true;
    document.getElementById("difficulty-modal").classList.add("active");
  } catch (err) {
    alert("Initialization Error: " + err.message);
  }
}

function closeDifficultyModal() {
  currentSessionId = null;
  pendingScenarioKey = null;
  pendingSessionReady = false;
  hasBreachedThreshold = false;
  isRequestInProgress = false;
  isEndingSession = false;
  stopGameLoop();
  document.getElementById("difficulty-modal")?.classList.remove("active");
}

function confirmDifficultySelection(difficulty) {
  if (!pendingSessionReady || !currentSessionId) return;
  selectedDifficulty = difficulty === "hard" ? "hard" : "easy";
  document.getElementById("difficulty-modal")?.classList.remove("active");
  renderQuickActions();
  initAudioContext();
  showScreen("sim");
  startGameLoop();
  pendingScenarioKey = null;
  pendingSessionReady = false;
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

  const quickActionBar = document.getElementById("quick-action-container");
  if (quickActionBar) quickActionBar.classList.toggle("is-disabled", disabled);
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
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
  requestAnimationFrame(() => {
    log.scrollTop = log.scrollHeight;
  });
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

    const res = await fetchWithTimeout(apiUrl(`/session/${currentSessionId}/act`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      let detail = "Backend connection failed";
      try {
        const errorPayload = await res.json();
        detail = errorPayload.detail || detail;
      } catch (_) {}
      throw new Error(detail);
    }

    const turn = await res.json();
    
    // 4. Backend'den cevap gelince geçici Yükleniyor ibaresini kaldır
    const loadingEl = document.getElementById(loadingId);
    if (loadingEl) loadingEl.remove();

    renderTurn(turn, null, true);
  } catch (err) {
    console.error("Action error:", err);
    const loadingEl = document.getElementById(loadingId);
    if (loadingEl) loadingEl.remove();
    const errorMessage =
      err.name === "AbortError"
        ? "Action timed out after 45 seconds. The order was not evaluated; try again after checking backend logs."
        : `Action could not be processed: ${err.message}`;
    appendLogEntry("sistem", errorMessage);
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
  if (isEndingSession) return;

  const modal = document.getElementById("abort-confirm-modal");
  const stage = document.getElementById("confirm-stage");
  const hr = document.getElementById("confirm-hr");
  const spo2 = document.getElementById("confirm-spo2");

  if (stage) stage.textContent = document.getElementById("turn-count")?.textContent || "--";
  if (hr) hr.textContent = `${Math.round(currentHeartRate)} bpm`;
  if (spo2) spo2.textContent = `${currentSpO2}%`;

  modal?.classList.add("active");
}

function closeAbortConfirmModal() {
  document.getElementById("abort-confirm-modal")?.classList.remove("active");
}

function confirmAbortSession() {
  closeAbortConfirmModal();
  stopGameLoop();
  finishSession();
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
    const res = await fetchWithTimeout(apiUrl(`/session/${currentSessionId}/end`), {
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
  selectedDifficulty = "easy";
  pendingScenarioKey = null;
  pendingSessionReady = false;
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
