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
}


def get_scenario(scenario_type: str) -> Dict[str, Any]:
    if scenario_type not in SCENARIOS:
        raise ValueError(f"Invalid scenario type: {scenario_type}")
    return SCENARIOS[scenario_type]