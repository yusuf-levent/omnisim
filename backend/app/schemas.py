from pydantic import BaseModel
from typing import Optional, Dict


class ActionRequest(BaseModel):
    message: str


class TurnResponse(BaseModel):
    session_id: str
    turn_no: int
    age: int = 58
    gender: str = "Male"
    primary_diagnosis: str = "Acute Coronary Syndrome"
    patient_dialogue: str
    system_note: str
    heart_rate: int
    blood_pressure: str
    spo2: int = 94
    consciousness: str = "Alert"
    heart_rate_drift: float = -0.5
    min_heart_rate: int = 50
    max_heart_rate: int = 140
    case_completed: bool


class ReportResponse(BaseModel):
    session_id: str
    score: int
    status_badge: str
    correct_actions: int
    incorrect_actions: int
    reaction_score: int
    criteria: Dict[str, int]
    strengths: str
    errors: str
    suggestions: str


class SessionStartResponse(BaseModel):
    session_id: str
    scenario_type: str
    turn: TurnResponse