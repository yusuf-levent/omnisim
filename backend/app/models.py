import uuid
from datetime import datetime
from sqlalchemy import Column, String, Integer, Float, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from .db.database import Base

def gen_id() -> str:
    return str(uuid.uuid4())

class LearnerProfile(Base):
    __tablename__ = "learner_profiles"

    id = Column(String, primary_key=True, default=gen_id)
    username = Column(String, unique=True, index=True, nullable=False)
    email = Column(String, unique=True, index=True, nullable=True)
    password_hash = Column(String, nullable=True)
    display_name = Column(String, nullable=False)
    training_track = Column(String, default="Emergency Medicine")
    ai_recommendations = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    sessions = relationship("SimSession", back_populates="learner")

class SimSession(Base):
    __tablename__ = "sim_sessions"

    id = Column(String, primary_key=True, default=gen_id)
    learner_id = Column(String, ForeignKey("learner_profiles.id"), nullable=True, index=True)
    scenario_type = Column(String, nullable=False)
    status = Column(String, default="active")  # active | finished
    turn_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)

    learner = relationship("LearnerProfile", back_populates="sessions")
    vitals = relationship("VitalState", back_populates="session", order_by="VitalState.id")
    logs = relationship("InteractionLog", back_populates="session", order_by="InteractionLog.id")
    report = relationship("ReportResult", back_populates="session", uselist=False)

class VitalState(Base):
    __tablename__ = "vital_states"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(String, ForeignKey("sim_sessions.id"), index=True)
    heart_rate = Column(Integer)
    blood_pressure = Column(String)
    spo2 = Column(Integer, default=92)
    consciousness = Column(String)
    turn_no = Column(Integer)
    created_at = Column(DateTime, default=datetime.utcnow)

    session = relationship("SimSession", back_populates="vitals")

class InteractionLog(Base):
    __tablename__ = "interaction_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(String, ForeignKey("sim_sessions.id"), index=True)
    turn_no = Column(Integer)
    user_message = Column(Text, nullable=True)
    patient_dialogue = Column(Text)
    system_note = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)

    session = relationship("SimSession", back_populates="logs")

class ReportResult(Base):
    __tablename__ = "report_results"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(String, ForeignKey("sim_sessions.id"), unique=True)
    score = Column(Integer)
    status_badge = Column(String, default="COMPLETED")
    correct_actions = Column(Integer, default=0)
    incorrect_actions = Column(Integer, default=0)
    reaction_score = Column(Integer, default=5)
    criteria_json = Column(Text)
    strengths = Column(Text)
    errors = Column(Text)
    suggestions = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)

    session = relationship("SimSession", back_populates="report")