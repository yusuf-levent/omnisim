from pydantic import BaseModel
from typing import Optional


class ActionRequest(BaseModel):
    message: str


class TurnResponse(BaseModel):
    session_id: str
    turn_no: int
    hasta_repligi: str
    sistem_notu: str
    nabiz: int
    tansiyon: str
    bilinc: str
    vaka_bitti_mi: bool


class ReportResponse(BaseModel):
    session_id: str
    skor: int
    guclu_yonler: str
    hatalar: str
    oneri: str


class SessionStartResponse(BaseModel):
    session_id: str
    scenario_type: str
    turn: TurnResponse
