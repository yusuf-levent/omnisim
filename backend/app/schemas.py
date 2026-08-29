from pydantic import BaseModel
from typing import Optional, Dict, List


class ActionRequest(BaseModel):
    message: str
    current_hr: Optional[int] = None
    current_spo2: Optional[int] = None
    current_bp: Optional[str] = None


class TurnResponse(BaseModel):
    session_id: str
    turn_no: int
    age: int = 54
    gender: str = "Male"
    primary_diagnosis: str = "Acute Coronary Syndrome"
    patient_dialogue: str
    system_note: str
    heart_rate: int
    blood_pressure: str
    spo2: int = 92
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


class LearnerLoginRequest(BaseModel):
    learner_id: Optional[str] = None
    display_name: str
    training_track: str = "Emergency Medicine"


class LearnerCaseSummary(BaseModel):
    session_id: str
    scenario: str
    score: int
    badge: str
    criteria: Dict[str, int]
    errors: str
    suggestions: str
    completed_at: str


class LearnerProfileResponse(BaseModel):
    learner_id: str
    display_name: str
    training_track: str
    completed_cases: int
    average_score: Optional[int]
    focus_area: str
    recommendations: List[str]
    recent_cases: List[LearnerCaseSummary]
