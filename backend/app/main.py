import json
import hashlib
from fastapi import FastAPI, Depends, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session as DBSession

from . import models
from .core.config import get_frontend_origins
from .db.database import get_db
from .scenarios import SCENARIOS, get_scenario
from .schemas import (
    ActionRequest,
    LearnerCaseSummary,
    LearnerLoginRequest,
    LearnerProfileResponse,
    ReportResponse,
    ScenarioRecommendation,
    SessionStartResponse,
    TurnResponse,
)
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

def get_password_hash(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()

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
        history.append({"role": "assistant", "content": json.dumps(assistant_payload, ensure_ascii=False)})

    if limit is None: return history
    return history[-limit:]

def _report_history_from_logs(session: models.SimSession) -> list[dict]:
    history = _history_from_logs(session, limit=None)
    action_lines = []
    for log in (session.logs or []):
        if log.user_message:
            vital = next((v for v in (session.vitals or []) if v.turn_no == log.turn_no), None)
            vital_text = f" -> vitals: HR {vital.heart_rate}, BP {vital.blood_pressure}, SpO2 {vital.spo2}" if vital else ""
            action_lines.append(f"Turn {log.turn_no}: {log.user_message}{vital_text}")
    audit_trail = "\n".join(action_lines) or "No physician interventions were recorded."
    history.append({
        "role": "user",
        "content": f"GROUND-TRUTH ACTION AUDIT TRAIL FOR SCORING. Do not mark an intervention as omitted if it appears here:\n{audit_trail}",
    })
    return history

def _criteria_from_report(report: models.ReportResult) -> dict[str, int]:
    if report.criteria_json:
        try:
            criteria = json.loads(report.criteria_json)
            if isinstance(criteria, dict):
                return {key: int(criteria.get(key, val)) for key, val in DEFAULT_REPORT_CRITERIA.items()}
        except (TypeError, ValueError, json.JSONDecodeError): pass
    return DEFAULT_REPORT_CRITERIA.copy()

def _clean_report_criteria(raw_criteria: object) -> dict[str, int]:
    if not isinstance(raw_criteria, dict): return DEFAULT_REPORT_CRITERIA.copy()
    cleaned = {}
    for key, default in DEFAULT_REPORT_CRITERIA.items():
        try: cleaned[key] = max(0, min(25, int(raw_criteria.get(key, default))))
        except (TypeError, ValueError): cleaned[key] = default
    return cleaned

def _fallback_report(session: models.SimSession) -> dict:
    action_text = "\n".join(log.user_message or "" for log in (session.logs or []) if log.user_message).lower()
    supportive_terms = ("oxygen", "o2", "aspirin", "ecg", "troponin", "labs", "nitroglycerin", "fluid", "saline", "epinephrine", "naloxone", "magnesium", "calcium", "insulin", "dextrose", "antibiotic", "ceftriaxone", "norepinephrine", "adenosine", "cardioversion", "thrombolysis", "cooling", "catheterization", "cath lab")
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
        "criteria": {"protocol_adherence": criteria_score, "diagnostic_accuracy": criteria_score, "patient_safety": criteria_score, "pharmacology_precision": criteria_score},
        "strengths": "The recorded actions include appropriate stabilizing interventions.",
        "errors": "Automated AI scoring was unavailable.",
        "suggestions": "Review the full timeline against the relevant emergency protocol."
    }

def _scenario_label(scenario_type: str) -> str:
    scenario = SCENARIOS.get(scenario_type, {})
    return str(scenario.get("label", scenario_type.replace("_", " ").title()))

def _focus_area_from_cases(cases: list[LearnerCaseSummary]) -> str:
    if not cases: return "Protocol"
    latest = cases[0]
    lowest_key = min(latest.criteria, key=lambda key: latest.criteria.get(key, 25), default="protocol_adherence")
    return {"protocol_adherence": "Protocol", "diagnostic_accuracy": "Diagnosis", "patient_safety": "Safety", "pharmacology_precision": "Pharmacology"}.get(lowest_key, "Protocol")

def _learner_recommendations(cases: list[LearnerCaseSummary], focus_area: str) -> list[dict]:
    played_scenarios = {c.scenario for c in cases}
    recs = []
    targets = {
        "Pharmacology": ["anaphylactic_shock", "pediatric_svt", "opioid_overdose", "status_asthmaticus"],
        "Diagnosis": ["massive_pulmonary_embolism", "eclampsia", "carbon_monoxide_poisoning", "acute_ischemic_stroke"],
        "Safety": ["tension_pneumothorax", "hypovolemic_shock", "exertional_heat_stroke"],
        "Protocol": ["acute_coronary_syndrome", "septic_shock", "diabetic_ketoacidosis", "adrenal_crisis"]
    }

    primary_pool = [k for k in targets.get(focus_area, targets["Protocol"]) if k not in played_scenarios and k in SCENARIOS]
    if primary_pool:
        recs.append(ScenarioRecommendation(scenario_id=primary_pool[0], title=_scenario_label(primary_pool[0]), category=f"{focus_area} Focus", reason=f"Targeted case to improve your lower score in {focus_area.lower()}.", difficulty="Intermediate"))
        played_scenarios.add(primary_pool[0])

    general_pool = [k for k, v in SCENARIOS.items() if k not in played_scenarios and v.get("enabled", True)]
    for k in general_pool[:1]:
        recs.append(ScenarioRecommendation(scenario_id=k, title=_scenario_label(k), category=SCENARIOS[k].get("tag", "Clinical Case"), reason="Expand your clinical practice.", difficulty="Intermediate"))
        played_scenarios.add(k)
    return recs[:2]

def _update_ai_recommendations(learner_id: str, db: DBSession):
    learner = db.query(models.LearnerProfile).filter_by(id=learner_id).first()
    if not learner: return

    sessions = db.query(models.SimSession).filter_by(learner_id=learner_id, status="finished").order_by(models.SimSession.created_at.desc()).limit(10).all()
    history_data = []
    for s in sessions:
        if s.report:
            history_data.append({"scenario": s.scenario_type, "score": s.report.score, "errors": s.report.errors, "criteria": json.loads(s.report.criteria_json) if s.report.criteria_json else {}})
            
    if not history_data: return
    available_scenarios = [{"id": k, "label": v["label"], "tag": v.get("tag", "")} for k, v in SCENARIOS.items() if v.get("enabled")]
    try:
        ai_result = llm_service.generate_profile_recommendations(history_data, available_scenarios)
        learner.ai_recommendations = json.dumps(ai_result, ensure_ascii=False)
        db.commit()
    except Exception as e:
        print(f"AI Recommendation generation failed: {e}")

def _build_learner_profile_response(learner: models.LearnerProfile, db: DBSession) -> LearnerProfileResponse:
    sessions = db.query(models.SimSession).filter_by(learner_id=learner.id).order_by(models.SimSession.created_at.desc()).all()
    case_summaries: list[LearnerCaseSummary] = []
    for session in sessions:
        if not session.report: continue
        report = session.report
        case_summaries.append(LearnerCaseSummary(session_id=session.id, scenario=session.scenario_type, scenario_title=_scenario_label(session.scenario_type), score=int(report.score or 0), badge=report.status_badge or "COMPLETED", criteria=_criteria_from_report(report), errors=report.errors or "", suggestions=report.suggestions or "", completed_at=(report.created_at or session.created_at).isoformat()))

    average_score = round(sum(case.score for case in case_summaries) / len(case_summaries)) if case_summaries else None
    recent_cases = case_summaries[:8]
    focus_area = _focus_area_from_cases(recent_cases)

    recs = []
    topics = []
    if recent_cases:
        if learner.ai_recommendations:
            try:
                parsed = json.loads(learner.ai_recommendations)
                if isinstance(parsed, dict):
                    recs = [ScenarioRecommendation(**r) for r in parsed.get("recommendations", [])]
                    topics = parsed.get("study_topics", [])
            except Exception: pass
        if not recs:
            recs = _learner_recommendations(recent_cases, focus_area)
            topics = ["Review AHA ACLS Guidelines", f"Study pharmacology dosing for {focus_area}"]

    return LearnerProfileResponse(
        learner_id=learner.id, username=learner.username, display_name=learner.display_name,
        completed_cases=len(case_summaries), total_available_cases=len([k for k,v in SCENARIOS.items() if v.get("enabled")]),
        average_score=average_score, focus_area=focus_area, recommendations=recs, study_topics=topics, recent_cases=recent_cases
    )

def _fallback_turn(action: ActionRequest) -> dict:
    current_hr = action.current_hr or 110
    current_spo2 = action.current_spo2 or 92
    current_bp = action.current_bp or "140/90"
    lower_msg = action.message.lower()
    is_supportive = any(term in lower_msg for term in ("oxygen", "o2", "fluid", "saline", "aspirin", "epinephrine", "naloxone", "magnesium", "calcium", "insulin"))
    if is_supportive:
        return {"age": 54, "gender": "Male", "primary_diagnosis": "Active Emergency Case", "patient_dialogue": "", "system_note": "Order received.", "heart_rate": max(55, current_hr - 8), "blood_pressure": current_bp, "spo2": min(99, current_spo2 + 2), "consciousness": "Alert", "heart_rate_drift": -0.2, "min_heart_rate": 35, "max_heart_rate": 185, "case_completed": False}
    else:
        return {"age": 54, "gender": "Male", "primary_diagnosis": "Active Emergency Case", "patient_dialogue": "", "system_note": "Order documented.", "heart_rate": min(180, current_hr + 4), "blood_pressure": current_bp, "spo2": max(80, current_spo2 - 1), "consciousness": "Alert", "heart_rate_drift": 0.2, "min_heart_rate": 35, "max_heart_rate": 185, "case_completed": False}

@app.get("/scenarios")
def list_scenarios():
    return {key: {"label": val["label"], "icon": val.get("icon", "🏥"), "desc": val.get("desc", ""), "tag": val.get("tag", "Clinical Emergency"), "enabled": val["enabled"]} for key, val in SCENARIOS.items()}

@app.post("/learners", response_model=LearnerProfileResponse)
def upsert_learner(payload: LearnerLoginRequest, db: DBSession = Depends(get_db)):
    learner = db.query(models.LearnerProfile).filter_by(username=payload.username.lower()).first()
    if learner is None:
        learner = models.LearnerProfile(username=payload.username.lower(), email=payload.email.lower(), password_hash=get_password_hash(payload.password), display_name=payload.username)
        db.add(learner)
    else:
        if learner.password_hash != get_password_hash(payload.password): raise HTTPException(status_code=401, detail="Hatalı şifre girdiniz.")
    db.commit()
    db.refresh(learner)
    return _build_learner_profile_response(learner, db)

@app.get("/learners/{learner_id}/profile", response_model=LearnerProfileResponse)
def get_learner_profile(learner_id: str, db: DBSession = Depends(get_db)):
    learner = db.query(models.LearnerProfile).filter_by(id=learner_id).first()
    if not learner: raise HTTPException(status_code=404, detail="Learner profile not found")
    return _build_learner_profile_response(learner, db)

@app.post("/learners/{username}/refresh-ai", response_model=LearnerProfileResponse)
def refresh_ai(username: str, db: DBSession = Depends(get_db)):
    learner = db.query(models.LearnerProfile).filter_by(username=username.lower()).first()
    if not learner: raise HTTPException(status_code=404, detail="Learner not found")
    _update_ai_recommendations(learner.id, db)
    return _build_learner_profile_response(learner, db)

@app.post("/session/{session_id}/claim", response_model=LearnerProfileResponse)
def claim_session(session_id: str, username: str, db: DBSession = Depends(get_db)):
    session = db.query(models.SimSession).filter_by(id=session_id).first()
    if not session: raise HTTPException(status_code=404, detail="Session not found")
    learner = db.query(models.LearnerProfile).filter_by(username=username.lower()).first()
    if not learner: raise HTTPException(status_code=404, detail="Learner profile not found. Sign in first.")
    session.learner_id = learner.id
    db.commit()
    return _build_learner_profile_response(learner, db)

@app.post("/session/start", response_model=SessionStartResponse)
def start_session(scenario_type: str, learner_id: str | None = None, db: DBSession = Depends(get_db)):
    try: scenario = get_scenario(scenario_type)
    except ValueError as e: raise HTTPException(status_code=400, detail=str(e))
    learner = db.query(models.LearnerProfile).filter_by(id=learner_id).first() if learner_id else None
    result = llm_service.start_scenario(scenario["prompt"])
    session = models.SimSession(scenario_type=scenario_type, learner_id=learner.id if learner else None, turn_count=1)
    db.add(session)
    db.flush()
    hr_val = int(result.get("heart_rate", 105)); bp_val = str(result.get("blood_pressure", "150/95")); spo2_val = int(result.get("spo2", 93)); cons_val = str(result.get("consciousness", "Alert"))
    vital = models.VitalState(session_id=session.id, heart_rate=hr_val, blood_pressure=bp_val, spo2=spo2_val, consciousness=cons_val, turn_no=1)
    log = models.InteractionLog(session_id=session.id, turn_no=1, patient_dialogue=result.get("patient_dialogue", ""), system_note=result.get("system_note", ""))
    db.add_all([vital, log])
    db.commit()
    turn = TurnResponse(session_id=session.id, turn_no=1, age=int(result.get("age", 58)), gender=str(result.get("gender", "Male")), primary_diagnosis=str(result.get("primary_diagnosis", "Acute Coronary Syndrome")), patient_dialogue=result.get("patient_dialogue", ""), system_note=result.get("system_note", ""), heart_rate=hr_val, blood_pressure=bp_val, spo2=spo2_val, consciousness=cons_val, heart_rate_drift=float(result.get("heart_rate_drift", 0.4)), min_heart_rate=int(result.get("min_heart_rate", 35)), max_heart_rate=int(result.get("max_heart_rate", 185)), case_completed=bool(result.get("case_completed", False)))
    return SessionStartResponse(session_id=session.id, scenario_type=scenario_type, turn=turn)

@app.post("/session/{session_id}/act", response_model=TurnResponse)
def act(session_id: str, action: ActionRequest, db: DBSession = Depends(get_db)):
    session = db.query(models.SimSession).filter_by(id=session_id).first()
    if not session: raise HTTPException(status_code=404, detail="Session not found")
    if session.status == "finished": raise HTTPException(status_code=400, detail="This simulation has already concluded")
    scenario = get_scenario(session.scenario_type)
    history = _history_from_logs(session)
    vital_context = f"[CURRENT VITALS: HR={action.current_hr} bpm, SpO2={action.current_spo2}%, BP={action.current_bp}] " if action.current_hr is not None else ""
    try: result = llm_service.process_turn(scenario["prompt"], history, f"{vital_context}{action.message}")
    except llm_service.LLMServiceError: result = _fallback_turn(action)
    new_turn_no = session.turn_count + 1
    force_end = new_turn_no >= MAX_TURNS
    case_completed = bool(result.get("case_completed", False)) or force_end or "[CRITICAL THRESHOLD" in action.message
    raw_hr = int(result.get("heart_rate", action.current_hr or 110))
    hr_val = max(action.current_hr - 15, min(action.current_hr + 15, raw_hr)) if action.current_hr is not None else raw_hr
    bp_val = str(result.get("blood_pressure", action.current_bp or "140/90"))
    spo2_val = int(result.get("spo2", action.current_spo2 or 92))
    cons_val = str(result.get("consciousness", "Alert"))
    vital = models.VitalState(session_id=session.id, heart_rate=hr_val, blood_pressure=bp_val, spo2=spo2_val, consciousness=cons_val, turn_no=new_turn_no)
    log = models.InteractionLog(session_id=session.id, turn_no=new_turn_no, user_message=action.message, patient_dialogue=result.get("patient_dialogue", ""), system_note=result.get("system_note", ""))
    session.turn_count = new_turn_no
    if case_completed: session.status = "finished"
    db.add_all([vital, log])
    db.commit()
    return TurnResponse(session_id=session.id, turn_no=new_turn_no, age=int(result.get("age", 54)), gender=str(result.get("gender", "Male")), primary_diagnosis=str(result.get("primary_diagnosis", "Acute Coronary Syndrome")), patient_dialogue=result.get("patient_dialogue", ""), system_note=result.get("system_note", ""), heart_rate=hr_val, blood_pressure=bp_val, spo2=spo2_val, consciousness=cons_val, heart_rate_drift=float(result.get("heart_rate_drift", 0.4)), min_heart_rate=int(result.get("min_heart_rate", 35)), max_heart_rate=int(result.get("max_heart_rate", 185)), case_completed=case_completed)
@app.post("/session/{session_id}/end", response_model=ReportResponse)
def end_session(session_id: str, db: DBSession = Depends(get_db)):
    session = db.query(models.SimSession).filter_by(id=session_id).first()
    if not session: raise HTTPException(status_code=404, detail="Session not found")
    
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
            suggestions=existing_report.suggestions
        )
        
    scenario = get_scenario(session.scenario_type)
    history = _report_history_from_logs(session)
    
    try: 
        result = llm_service.generate_report(scenario["prompt"], history)
    except llm_service.LLMServiceError: 
        result = _fallback_report(session)
        
    criteria = _clean_report_criteria(result.get("criteria", DEFAULT_REPORT_CRITERIA))
    
    # GÜNCELLEME: LLM'in uydurma ihtimali olan skoru devreden çıkarıp
    # sağ taraftaki puanı tam olarak 4 radar kriterinin toplamına eşitliyoruz.
    calculated_score = sum(criteria.values())
    
    report = models.ReportResult(
        session_id=session_id, 
        score=calculated_score, # int(result.get("score", 0)) yerine bunu kullandık
        status_badge=str(result.get("status_badge", "COMPLETED")), 
        correct_actions=int(result.get("correct_actions", 0)), 
        incorrect_actions=int(result.get("incorrect_actions", 0)), 
        reaction_score=int(result.get("reaction_score", 5)), 
        criteria_json=json.dumps(criteria, ensure_ascii=False), 
        strengths=str(result.get("strengths", "")), 
        errors=str(result.get("errors", "")), 
        suggestions=str(result.get("suggestions", ""))
    )
    
    session.status = "finished"
    db.add(report)
    db.commit()
    
    return ReportResponse(
        session_id=session_id, 
        score=report.score, 
        status_badge=report.status_badge, 
        correct_actions=report.correct_actions, 
        incorrect_actions=report.incorrect_actions, 
        reaction_score=report.reaction_score, 
        criteria=criteria, 
        strengths=report.strengths, 
        errors=report.errors, 
        suggestions=report.suggestions
    )