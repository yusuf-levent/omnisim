from typing import Dict, Any

from .acute_coronary_syndrome import SCENARIO_PROMPT as ACS_PROMPT
from .anaphylactic_shock import SCENARIO_PROMPT as ANAPHYLAXIS_PROMPT
from .status_asthmaticus import SCENARIO_PROMPT as ASTHMA_PROMPT
from .tension_pneumothorax import SCENARIO_PROMPT as PNTHX_PROMPT
from .acute_pulmonary_edema import SCENARIO_PROMPT as EDEMA_PROMPT
from .hypovolemic_shock import SCENARIO_PROMPT as HYPOVOLEMIA_PROMPT
from .opioid_overdose import SCENARIO_PROMPT as OPIOID_PROMPT
from .diabetic_ketoacidosis import SCENARIO_PROMPT as DKA_PROMPT
from .acute_ischemic_stroke import SCENARIO_PROMPT as STROKE_PROMPT
from .septic_shock import SCENARIO_PROMPT as SEPSIS_PROMPT
from .hyperkalemia_crisis import SCENARIO_PROMPT as HYPERKALEMIA_PROMPT
from .adrenal_crisis import SCENARIO_PROMPT as ADRENAL_PROMPT
from .meningococcal_sepsis import SCENARIO_PROMPT as MENINGOCOCCAL_PROMPT
from .eclampsia import SCENARIO_PROMPT as ECLAMPSIA_PROMPT
from .upper_gi_bleed import SCENARIO_PROMPT as GI_BLEED_PROMPT
from .carbon_monoxide_poisoning import SCENARIO_PROMPT as CO_PROMPT
from .pediatric_svt import SCENARIO_PROMPT as PEDIATRIC_SVT_PROMPT
from .exertional_heat_stroke import SCENARIO_PROMPT as HEAT_STROKE_PROMPT
from .thyroid_storm import SCENARIO_PROMPT as THYROID_STORM_PROMPT
from .massive_pulmonary_embolism import SCENARIO_PROMPT as PE_PROMPT

SCENARIOS: Dict[str, Dict[str, Any]] = {
    "acute_coronary_syndrome": {
        "label": "1. Acute Coronary Syndrome (STEMI)",
        "icon": "🫀",
        "desc": "Crushing retrosternal chest pain, diaphoresis, and acute ST-elevation management.",
        "tag": "Cardiology Emergency",
        "enabled": True,
        "prompt": ACS_PROMPT,
    },
    "anaphylactic_shock": {
        "label": "2. Anaphylactic Shock",
        "icon": "⚡",
        "desc": "Severe systemic allergic reaction, stridor, angioedema, and distributive shock.",
        "tag": "Immunology",
        "enabled": True,
        "prompt": ANAPHYLAXIS_PROMPT,
    },
    "status_asthmaticus": {
        "label": "3. Status Asthmaticus",
        "icon": "🫁",
        "desc": "Life-threatening bronchospasm, silent chest findings, and acute respiratory failure.",
        "tag": "Pulmonology",
        "enabled": True,
        "prompt": ASTHMA_PROMPT,
    },
    "tension_pneumothorax": {
        "label": "4. Tension Pneumothorax",
        "icon": "💥",
        "desc": "Thoracic trauma, absent breath sounds, tracheal deviation, and obstructive shock.",
        "tag": "Trauma Surgery",
        "enabled": True,
        "prompt": PNTHX_PROMPT,
    },
    "acute_pulmonary_edema": {
        "label": "5. Acute Pulmonary Edema",
        "icon": "🌊",
        "desc": "Orthopnea, pink frothy sputum, bilateral crackles, and severe hypertensive crisis.",
        "tag": "Cardiology Emergency",
        "enabled": True,
        "prompt": EDEMA_PROMPT,
    },
    "hypovolemic_shock": {
        "label": "6. Hemorrhagic Shock (Internal Bleed)",
        "icon": "🩸",
        "desc": "Acute abdomen, syncope, profound hypotension, and massive transfusion protocol.",
        "tag": "Emergency Surgery",
        "enabled": True,
        "prompt": HYPOVOLEMIA_PROMPT,
    },
    "opioid_overdose": {
        "label": "7. Opioid Toxicity & Coma",
        "icon": "💊",
        "desc": "Pinpoint pupils, coma, and severe respiratory depression (RR 4/min).",
        "tag": "Toxicology",
        "enabled": True,
        "prompt": OPIOID_PROMPT,
    },
    "diabetic_ketoacidosis": {
        "label": "8. Diabetic Ketoacidosis (DKA)",
        "icon": "🧪",
        "desc": "Kussmaul breathing, acetone odor, hyperglycemia, and fluid-electrolyte resuscitation.",
        "tag": "Endocrinology",
        "enabled": True,
        "prompt": DKA_PROMPT,
    },
    "acute_ischemic_stroke": {
        "label": "9. Acute Ischemic Stroke",
        "icon": "🧠",
        "desc": "Acute hemiplegia, expressive aphasia, and time-critical thrombolytic management.",
        "tag": "Neurology Emergency",
        "enabled": True,
        "prompt": STROKE_PROMPT,
    },
    "septic_shock": {
        "label": "10. Septic Shock (Urosepsis)",
        "icon": "🦠",
        "desc": "High fever, elevated lactate, warm distributive shock, and Hour-1 bundle protocol.",
        "tag": "Infectious Disease",
        "enabled": True,
        "prompt": SEPSIS_PROMPT,
    },
    "hyperkalemia_crisis": {
        "label": "11. Severe Hyperkalemia",
        "icon": "⚡",
        "desc": "Renal failure, bradycardia, widened QRS, and immediate membrane stabilization.",
        "tag": "Nephrology Emergency",
        "enabled": True,
        "prompt": HYPERKALEMIA_PROMPT,
    },
    "adrenal_crisis": {
        "label": "12. Adrenal Crisis",
        "icon": "🧬",
        "desc": "Refractory hypotension, hypoglycemia, electrolyte collapse, and urgent steroid rescue.",
        "tag": "Endocrine Shock",
        "enabled": True,
        "prompt": ADRENAL_PROMPT,
    },
    "meningococcal_sepsis": {
        "label": "13. Meningococcal Sepsis",
        "icon": "🧫",
        "desc": "Fever, neck stiffness, purpuric rash, shock, and immediate antibiotic resuscitation.",
        "tag": "Critical Infection",
        "enabled": True,
        "prompt": MENINGOCOCCAL_PROMPT,
    },
    "eclampsia": {
        "label": "14. Eclampsia",
        "icon": "🤰",
        "desc": "Pregnancy-associated seizure, severe hypertension, magnesium therapy, and OB activation.",
        "tag": "Obstetric Emergency",
        "enabled": True,
        "prompt": ECLAMPSIA_PROMPT,
    },
    "upper_gi_bleed": {
        "label": "15. Massive Upper GI Bleed",
        "icon": "🩸",
        "desc": "Hematemesis, melena, hemorrhagic shock, transfusion, and urgent endoscopy bundle.",
        "tag": "Gastroenterology",
        "enabled": True,
        "prompt": GI_BLEED_PROMPT,
    },
    "carbon_monoxide_poisoning": {
        "label": "16. Carbon Monoxide Poisoning",
        "icon": "🏭",
        "desc": "Headache, confusion, falsely normal pulse oximetry, and high-flow oxygen treatment.",
        "tag": "Toxicology",
        "enabled": True,
        "prompt": CO_PROMPT,
    },
    "pediatric_svt": {
        "label": "17. Pediatric SVT",
        "icon": "👶",
        "desc": "Narrow-complex tachycardia, pediatric instability assessment, adenosine, and cardioversion.",
        "tag": "Pediatric Emergency",
        "enabled": True,
        "prompt": PEDIATRIC_SVT_PROMPT,
    },
    "exertional_heat_stroke": {
        "label": "18. Exertional Heat Stroke",
        "icon": "🌡️",
        "desc": "Hyperthermia, encephalopathy, rhabdomyolysis risk, and immediate active cooling.",
        "tag": "Environmental Emergency",
        "enabled": True,
        "prompt": HEAT_STROKE_PROMPT,
    },
    "thyroid_storm": {
        "label": "19. Thyroid Storm",
        "icon": "🔥",
        "desc": "Extreme tachycardia, fever, delirium, and staged antithyroid emergency therapy.",
        "tag": "Endocrine Emergency",
        "enabled": True,
        "prompt": THYROID_STORM_PROMPT,
    },
    "massive_pulmonary_embolism": {
        "label": "20. Massive Pulmonary Embolism",
        "icon": "🫁",
        "desc": "Sudden hypoxia, obstructive shock, RV strain, anticoagulation, and reperfusion decisions.",
        "tag": "Vascular Emergency",
        "enabled": True,
        "prompt": PE_PROMPT,
    },
}


def get_scenario(scenario_type: str) -> Dict[str, Any]:
    if scenario_type not in SCENARIOS:
        raise ValueError(f"Invalid scenario type: {scenario_type}")
    return SCENARIOS[scenario_type]
