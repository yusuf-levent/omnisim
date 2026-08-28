import json
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session as DBSession

from . import models
from .core.config import get_frontend_origins
from .db.database import get_db
from .scenarios import SCENARIOS, get_scenario
from .schemas import ActionRequest, TurnResponse, ReportResponse, SessionStartResponse
from .services import llm_service

MAX_TURNS = 15
DEFAULT_REPORT_CRITERIA = {
    "protocol_adherence": 15,
    "diagnostic_accuracy": 15,
    "patient_safety": 15,
    "pharmacology_precision": 15,
}

app = FastAPI(title="OmniSim AI - Clinical Case Simulator")

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_frontend_origins(),
    allow_methods=["*"],
    allow_headers=["*"],
)


def _history_from_logs(session: models.SimSession, limit: int | None = 6) -> list[dict]:
    history = []
    vitals_map = {}
    if hasattr(session, "vitals") and session.vitals:
        vitals_map = {v.turn_no: v for v in session.vitals}

    for log in (session.logs or []):
        if log.user_message:
            history.append({"role": "user", "content": log.user_message})

        vital = vitals_map.get(log.turn_no)
        assistant_payload = {
            "patient_dialogue": log.patient_dialogue or "",
            "system_note": log.system_note or "",
            "heart_rate": getattr(vital, "heart_rate", 110) if vital else 110,
            "blood_pressure": getattr(vital, "blood_pressure", "150/95") if vital else "150/95",
            "spo2": getattr(vital, "spo2", 92) if vital else 92,
            "consciousness": getattr(vital, "consciousness", "Alert") if vital else "Alert",
        }
        history.append({
            "role": "assistant",
            "content": json.dumps(assistant_payload, ensure_ascii=False)
        })

    if limit is None:
        return history
    # Live turns stay short for latency, while final reports use the full audit trail.
    return history[-limit:]


def _report_history_from_logs(session: models.SimSession) -> list[dict]:
    history = _history_from_logs(session, limit=None)
    action_lines = []

    for log in (session.logs or []):
        if log.user_message:
            vital = next((v for v in (session.vitals or []) if v.turn_no == log.turn_no), None)
            vital_text = ""
            if vital:
                vital_text = (
                    f" -> resulting vitals: HR {vital.heart_rate}, "
                    f"BP {vital.blood_pressure}, SpO2 {vital.spo2}, "
                    f"consciousness {vital.consciousness}"
                )
            action_lines.append(f"Turn {log.turn_no}: {log.user_message}{vital_text}")

    audit_trail = "\n".join(action_lines) or "No physician interventions were recorded."
    history.append({
        "role": "user",
        "content": (
            "GROUND-TRUTH ACTION AUDIT TRAIL FOR SCORING. "
            "Do not mark an intervention as omitted if it appears in this list:\n"
            f"{audit_trail}"
        ),
    })
    return history


def _criteria_from_report(report: models.ReportResult) -> dict[str, int]:
    if report.criteria_json:
        try:
            criteria = json.loads(report.criteria_json)
            if isinstance(criteria, dict):
                return {key: int(criteria.get(key, val)) for key, val in DEFAULT_REPORT_CRITERIA.items()}
        except (TypeError, ValueError, json.JSONDecodeError):
            pass
    return DEFAULT_REPORT_CRITERIA.copy()


def _clean_report_criteria(raw_criteria: object) -> dict[str, int]:
    if not isinstance(raw_criteria, dict):
        return DEFAULT_REPORT_CRITERIA.copy()
    cleaned = {}
    for key, default in DEFAULT_REPORT_CRITERIA.items():
        try:
            cleaned[key] = max(0, min(25, int(raw_criteria.get(key, default))))
        except (TypeError, ValueError):
            cleaned[key] = default
    return cleaned


def _fallback_report(session: models.SimSession) -> dict:
    action_text = "\n".join(
        log.user_message or ""
        for log in (session.logs or [])
        if log.user_message
    ).lower()
    supportive_terms = (
        "oxygen",
        "o2",
        "aspirin",
        "ecg",
        "troponin",
        "labs",
        "nitroglycerin",
        "fluid",
        "saline",
        "epinephrine",
        "naloxone",
        "magnesium",
        "calcium",
        "insulin",
        "dextrose",
        "antibiotic",
        "ceftriaxone",
        "norepinephrine",
        "adenosine",
        "cardioversion",
        "thrombolysis",
        "cooling",
        "catheterization",
        "cath lab",
    )
    matched = sorted({term for term in supportive_terms if term in action_text})
    correct_actions = len(matched)
    timeout_count = action_text.count("[timeout") + action_text.count("[critical threshold")
    score = max(20, min(85, 35 + correct_actions * 8 - timeout_count * 12))
    criteria_score = max(5, min(22, score // 4))

    return {
        "score": score,
        "status_badge": "COMPETENT" if score >= 60 else "NEEDS IMPROVEMENT",
        "correct_actions": correct_actions,
        "incorrect_actions": timeout_count,
        "reaction_score": max(1, min(10, 10 - timeout_count * 2)),
        "criteria": {
            "protocol_adherence": criteria_score,
            "diagnostic_accuracy": criteria_score,
            "patient_safety": criteria_score,
            "pharmacology_precision": criteria_score,
        },
        "strengths": "The recorded actions include appropriate stabilizing interventions from the case timeline.",
        "errors": "Automated AI scoring was unavailable, so this fallback report avoids marking recorded interventions as omitted.",
        "suggestions": "Review the full timeline and compare the intervention sequence against the relevant emergency protocol.",
    }


def _fallback_turn(action: ActionRequest) -> dict:
    current_hr = action.current_hr or 110
    current_spo2 = action.current_spo2 or 92
    current_bp = action.current_bp or "140/90"
    lower_msg = action.message.lower()

    is_supportive = any(
        term in lower_msg
        for term in (
            "oxygen",
            "o2",
            "fluid",
            "saline",
            "aspirin",
            "epinephrine",
            "naloxone",
            "magnesium",
            "calcium",
            "insulin",
            "dextrose",
            "antibiotic",
            "ceftriaxone",
            "norepinephrine",
            "adenosine",
            "cardioversion",
            "thrombolysis",
            "cooling",
        )
    )

    if is_supportive:
        hr_val = max(55, current_hr - 8)
        spo2_val = min(99, current_spo2 + 2)
        drift = -0.2
        note = "Order received; bedside team executes the intervention while remote evaluator response is delayed."
    else:
        hr_val = min(180, current_hr + 4)
        spo2_val = max(80, current_spo2 - 1)
        drift = 0.2
        note = "Order documented; patient remains unstable while remote evaluator response is delayed."

    return {
        "age": 54,
        "gender": "Male",
        "primary_diagnosis": "Active Emergency Case",
        "patient_dialogue": "",
        "system_note": note,
        "heart_rate": hr_val,
        "blood_pressure": current_bp,
        "spo2": spo2_val,
        "consciousness": "Alert",
        "heart_rate_drift": drift,
        "min_heart_rate": 35,
        "max_heart_rate": 185,
        "case_completed": False,
    }


@app.get("/scenarios")
def list_scenarios():
    return {
        key: {
            "label": val["label"],
            "icon": val.get("icon", "🏥"),
            "desc": val.get("desc", ""),
            "tag": val.get("tag", "Clinical Emergency"),
            "enabled": val["enabled"],
        }
        for key, val in SCENARIOS.items()
    }


@app.post("/session/start", response_model=SessionStartResponse)
def start_session(scenario_type: str, db: DBSession = Depends(get_db)):
    try:
        scenario = get_scenario(scenario_type)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    result = llm_service.start_scenario(scenario["prompt"])

    session = models.SimSession(scenario_type=scenario_type, turn_count=1)
    db.add(session)
    db.flush()

    hr_val = int(result.get("heart_rate", 105))
    bp_val = str(result.get("blood_pressure", "150/95"))
    spo2_val = int(result.get("spo2", 93))
    cons_val = str(result.get("consciousness", "Alert"))

    vital = models.VitalState(
        session_id=session.id,
        heart_rate=hr_val,
        blood_pressure=bp_val,
        spo2=spo2_val,
        consciousness=cons_val,
        turn_no=1,
    )
    log = models.InteractionLog(
        session_id=session.id,
        turn_no=1,
        user_message=None,
        patient_dialogue=result.get("patient_dialogue", ""),
        system_note=result.get("system_note", ""),
    )
    db.add_all([vital, log])
    db.commit()

    turn = TurnResponse(
        session_id=session.id,
        turn_no=1,
        age=int(result.get("age", 58)),
        gender=str(result.get("gender", "Male")),
        primary_diagnosis=str(result.get("primary_diagnosis", "Acute Coronary Syndrome")),
        patient_dialogue=result.get("patient_dialogue", ""),
        system_note=result.get("system_note", ""),
        heart_rate=hr_val,
        blood_pressure=bp_val,
        spo2=spo2_val,
        consciousness=cons_val,
        heart_rate_drift=float(result.get("heart_rate_drift", 0.4)),
        min_heart_rate=int(result.get("min_heart_rate", 35)),
        max_heart_rate=int(result.get("max_heart_rate", 185)),
        case_completed=bool(result.get("case_completed", False)),
    )
    return SessionStartResponse(session_id=session.id, scenario_type=scenario_type, turn=turn)


@app.post("/session/{session_id}/act", response_model=TurnResponse)
def act(session_id: str, action: ActionRequest, db: DBSession = Depends(get_db)):
    session = db.query(models.SimSession).filter_by(id=session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.status == "finished":
        raise HTTPException(status_code=400, detail="This simulation has already concluded")

    scenario = get_scenario(session.scenario_type)
    history = _history_from_logs(session)

    vital_context = ""
    if action.current_hr is not None:
        vital_context = f"[CURRENT VITALS: HR={action.current_hr} bpm, SpO2={action.current_spo2}%, BP={action.current_bp}] "

    full_user_message = f"{vital_context}{action.message}"
    try:
        result = llm_service.process_turn(scenario["prompt"], history, full_user_message)
    except llm_service.LLMServiceError:
        result = _fallback_turn(action)

    new_turn_no = session.turn_count + 1
    force_end = new_turn_no >= MAX_TURNS
    is_critical_breach = "[CRITICAL THRESHOLD" in action.message

    # Karar tamamen LLM'in klinik değerlendirmesine bırakıldı
    llm_completed = bool(result.get("case_completed", False))
    case_completed = llm_completed or force_end or is_critical_breach

    raw_hr = int(result.get("heart_rate", action.current_hr or 110))
    if action.current_hr is not None:
        hr_val = max(action.current_hr - 15, min(action.current_hr + 15, raw_hr))
    else:
        hr_val = raw_hr

    bp_val = str(result.get("blood_pressure", action.current_bp or "140/90"))
    spo2_val = int(result.get("spo2", action.current_spo2 or 92))
    cons_val = str(result.get("consciousness", "Alert"))

    vital = models.VitalState(
        session_id=session.id,
        heart_rate=hr_val,
        blood_pressure=bp_val,
        spo2=spo2_val,
        consciousness=cons_val,
        turn_no=new_turn_no,
    )
    log = models.InteractionLog(
        session_id=session.id,
        turn_no=new_turn_no,
        user_message=action.message,
        patient_dialogue=result.get("patient_dialogue", ""),
        system_note=result.get("system_note", ""),
    )
    session.turn_count = new_turn_no
    if case_completed:
        session.status = "finished"

    db.add_all([vital, log])
    db.commit()

    return TurnResponse(
        session_id=session.id,
        turn_no=new_turn_no,
        age=int(result.get("age", 54)),
        gender=str(result.get("gender", "Male")),
        primary_diagnosis=str(result.get("primary_diagnosis", "Acute Coronary Syndrome")),
        patient_dialogue=result.get("patient_dialogue", ""),
        system_note=result.get("system_note", ""),
        heart_rate=hr_val,
        blood_pressure=bp_val,
        spo2=spo2_val,
        consciousness=cons_val,
        heart_rate_drift=float(result.get("heart_rate_drift", 0.4)),
        min_heart_rate=int(result.get("min_heart_rate", 35)),
        max_heart_rate=int(result.get("max_heart_rate", 185)),
        case_completed=case_completed,
    )


@app.post("/session/{session_id}/end", response_model=ReportResponse)
def end_session(session_id: str, db: DBSession = Depends(get_db)):
    session = db.query(models.SimSession).filter_by(id=session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    existing_report = db.query(models.ReportResult).filter_by(session_id=session_id).first()
    if existing_report:
        return ReportResponse(
            session_id=session_id,
            score=existing_report.score,
            status_badge=existing_report.status_badge or "COMPLETED",
            correct_actions=existing_report.correct_actions or 0,
            incorrect_actions=existing_report.incorrect_actions or 0,
            reaction_score=existing_report.reaction_score or 5,
            criteria=_criteria_from_report(existing_report),
            strengths=existing_report.strengths,
            errors=existing_report.errors,
            suggestions=existing_report.suggestions,
        )

    scenario = get_scenario(session.scenario_type)
    history = _report_history_from_logs(session)
    try:
        result = llm_service.generate_report(scenario["prompt"], history)
    except llm_service.LLMServiceError:
        result = _fallback_report(session)
    criteria = _clean_report_criteria(result.get("criteria", DEFAULT_REPORT_CRITERIA))

    report = models.ReportResult(
        session_id=session_id,
        score=int(result.get("score", 0)),
        status_badge=str(result.get("status_badge", "COMPLETED")),
        correct_actions=int(result.get("correct_actions", 0)),
        incorrect_actions=int(result.get("incorrect_actions", 0)),
        reaction_score=int(result.get("reaction_score", 5)),
        criteria_json=json.dumps(criteria, ensure_ascii=False),
        strengths=str(result.get("strengths", "")),
        errors=str(result.get("errors", "")),
        suggestions=str(result.get("suggestions", "")),
    )
    session.status = "finished"
    db.add(report)
    db.commit()

    return ReportResponse(
        session_id=session_id,
        score=int(result.get("score", 0)),
        status_badge=str(result.get("status_badge", "COMPLETED")),
        correct_actions=int(result.get("correct_actions", 0)),
        incorrect_actions=int(result.get("incorrect_actions", 0)),
        reaction_score=int(result.get("reaction_score", 5)),
        criteria=criteria,
        strengths=str(result.get("strengths", "No entries recorded")),
        errors=str(result.get("errors", "No critical errors recorded")),
        suggestions=str(result.get("suggestions", "Review clinical guidelines.")),
    )
