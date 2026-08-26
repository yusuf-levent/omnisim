from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session as DBSession

from . import models, llm_service
from .database import engine, get_db, Base
from .scenarios import SCENARIOS, get_scenario
from .schemas import ActionRequest, TurnResponse, ReportResponse, SessionStartResponse

MAX_TURNS = 6  # LLM ne derse desin, backend bu turda vakayı zorla bitirir

Base.metadata.create_all(bind=engine)

app = FastAPI(title="OmniSim AI")

# Geliştirme aşamasında serbest, deploy ederken frontend domainine daraltılabilir
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def _history_from_logs(logs: list[models.InteractionLog]) -> list[dict]:
    """DB'deki log kayıtlarını LLM'e verilecek conversation formatına çevirir."""
    history = []
    for log in logs:
        if log.user_message:
            history.append({"role": "user", "content": log.user_message})
        assistant_content = f'{{"hasta_repligi": "{log.hasta_repligi}", "sistem_notu": "{log.sistem_notu}"}}'
        history.append({"role": "assistant", "content": assistant_content})
    return history


@app.get("/scenarios")
def list_scenarios():
    """Frontend'in vaka seçim ekranını çizmesi için - enabled olmayanlar da
    'yakında' etiketiyle listelenir."""
    return {
        key: {"label": val["label"], "enabled": val["enabled"]}
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

    vital = models.VitalState(
        session_id=session.id,
        nabiz=result["nabiz"],
        tansiyon=result["tansiyon"],
        bilinc=result["bilinc"],
        turn_no=1,
    )
    log = models.InteractionLog(
        session_id=session.id,
        turn_no=1,
        user_message=None,
        hasta_repligi=result["hasta_repligi"],
        sistem_notu=result["sistem_notu"],
    )
    db.add_all([vital, log])
    db.commit()

    turn = TurnResponse(
        session_id=session.id,
        turn_no=1,
        hasta_repligi=result["hasta_repligi"],
        sistem_notu=result["sistem_notu"],
        nabiz=result["nabiz"],
        tansiyon=result["tansiyon"],
        bilinc=result["bilinc"],
        vaka_bitti_mi=False,
    )
    return SessionStartResponse(session_id=session.id, scenario_type=scenario_type, turn=turn)


@app.post("/session/{session_id}/act", response_model=TurnResponse)
def act(session_id: str, action: ActionRequest, db: DBSession = Depends(get_db)):
    session = db.query(models.SimSession).filter_by(id=session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Oturum bulunamadı")
    if session.status == "finished":
        raise HTTPException(status_code=400, detail="Bu vaka zaten sona erdi")

    scenario = get_scenario(session.scenario_type)
    history = _history_from_logs(session.logs)

    result = llm_service.process_turn(scenario["prompt"], history, action.message)

    new_turn_no = session.turn_count + 1
    force_end = new_turn_no >= MAX_TURNS
    vaka_bitti = result.get("vaka_bitti_mi", False) or force_end

    vital = models.VitalState(
        session_id=session.id,
        nabiz=result["nabiz"],
        tansiyon=result["tansiyon"],
        bilinc=result["bilinc"],
        turn_no=new_turn_no,
    )
    log = models.InteractionLog(
        session_id=session.id,
        turn_no=new_turn_no,
        user_message=action.message,
        hasta_repligi=result["hasta_repligi"],
        sistem_notu=result["sistem_notu"],
    )
    session.turn_count = new_turn_no
    if vaka_bitti:
        session.status = "finished"

    db.add_all([vital, log])
    db.commit()

    return TurnResponse(
        session_id=session.id,
        turn_no=new_turn_no,
        hasta_repligi=result["hasta_repligi"],
        sistem_notu=result["sistem_notu"],
        nabiz=result["nabiz"],
        tansiyon=result["tansiyon"],
        bilinc=result["bilinc"],
        vaka_bitti_mi=vaka_bitti,
    )


@app.post("/session/{session_id}/end", response_model=ReportResponse)
def end_session(session_id: str, db: DBSession = Depends(get_db)):
    session = db.query(models.SimSession).filter_by(id=session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Oturum bulunamadı")

    existing_report = db.query(models.ReportResult).filter_by(session_id=session_id).first()
    if existing_report:
        return ReportResponse(
            session_id=session_id,
            skor=existing_report.skor,
            guclu_yonler=existing_report.guclu_yonler,
            hatalar=existing_report.hatalar,
            oneri=existing_report.oneri,
        )

    scenario = get_scenario(session.scenario_type)
    history = _history_from_logs(session.logs)
    result = llm_service.generate_report(scenario["prompt"], history)

    report = models.ReportResult(
        session_id=session_id,
        skor=result["skor"],
        guclu_yonler=result["guclu_yonler"],
        hatalar=result["hatalar"],
        oneri=result["oneri"],
    )
    session.status = "finished"
    db.add(report)
    db.commit()

    return ReportResponse(
        session_id=session_id,
        skor=report.skor,
        guclu_yonler=report.guclu_yonler,
        hatalar=report.hatalar,
        oneri=report.oneri,
    )


@app.get("/session/{session_id}")
def get_session(session_id: str, db: DBSession = Depends(get_db)):
    """Sayfa yenilenirse diye mevcut durumu döner."""
    session = db.query(models.SimSession).filter_by(id=session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Oturum bulunamadı")

    last_vital = session.vitals[-1] if session.vitals else None
    return {
        "session_id": session.id,
        "scenario_type": session.scenario_type,
        "status": session.status,
        "turn_count": session.turn_count,
        "logs": [
            {
                "turn_no": log.turn_no,
                "user_message": log.user_message,
                "hasta_repligi": log.hasta_repligi,
                "sistem_notu": log.sistem_notu,
            }
            for log in session.logs
        ],
        "current_vital": {
            "nabiz": last_vital.nabiz,
            "tansiyon": last_vital.tansiyon,
            "bilinc": last_vital.bilinc,
        } if last_vital else None,
    }
