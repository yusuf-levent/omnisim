import json
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session as DBSession

from . import models, llm_service
from .database import engine, get_db, Base
from .scenarios import SCENARIOS, get_scenario
from .schemas import ActionRequest, TurnResponse, ReportResponse, SessionStartResponse

MAX_TURNS = 15

Base.metadata.create_all(bind=engine)

app = FastAPI(title="OmniSim AI - Clinical Case Simulator")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def _history_from_logs(session: models.SimSession) -> list[dict]:
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
    # Son turları tut (ilkini değil) — model her seferinde en güncel bağlamı görmeli
    return history[-6:]


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
    result = llm_service.process_turn(scenario["prompt"], history, full_user_message)

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
            status_badge="COMPLETED",
            correct_actions=0,
            incorrect_actions=0,
            reaction_score=5,
            criteria={
                "protocol_adherence": 15,
                "diagnostic_accuracy": 15,
                "patient_safety": 15,
                "pharmacology_precision": 15,
            },
            strengths=existing_report.strengths,
            errors=existing_report.errors,
            suggestions=existing_report.suggestions,
        )

    scenario = get_scenario(session.scenario_type)
    history = _history_from_logs(session)
    result = llm_service.generate_report(scenario["prompt"], history)

    report = models.ReportResult(
        session_id=session_id,
        score=int(result.get("score", 0)),
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
        criteria=result.get("criteria", {
            "protocol_adherence": 15,
            "diagnostic_accuracy": 15,
            "patient_safety": 15,
            "pharmacology_precision": 15,
        }),
        strengths=str(result.get("strengths", "No entries recorded")),
        errors=str(result.get("errors", "No critical errors recorded")),
        suggestions=str(result.get("suggestions", "Review clinical guidelines.")),
    )
