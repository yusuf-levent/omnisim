<div align="center">
  
# 🫀 OmniSim AI
**High-Fidelity Clinical Decision Simulator & AI Mentor**

[![Live Demo](https://img.shields.io/badge/Live%20Demo-omni.weetis.com-38bdf8?style=for-the-badge&logo=vercel)](https://omni.weetis.com/)
[![FastAPI](https://img.shields.io/badge/Backend-FastAPI-005571?style=for-the-badge&logo=fastapi)](https://fastapi.tiangolo.com/)
[![VanillaJS](https://img.shields.io/badge/Frontend-Vanilla%20JS-F7DF1E?style=for-the-badge&logo=javascript)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![Groq](https://img.shields.io/badge/LLM%20Engine-Groq%20%2F%20Qwen-f59e0b?style=for-the-badge)](#)

*Turning Large Language Models from passive chatbots into active, time-pressured medical training environments.*

<img src="https://via.placeholder.com/1200x600/0f172a/38bdf8?text=OmniSim+AI+Dashboard+Screenshot" alt="OmniSim AI Dashboard" width="100%">
*(Replace this placeholder with an actual screenshot of the simulation dashboard)*

</div>

---

## 🚀 The Prometheus Hackathon Value Proposition

Current AI tools in education often act as glorified search engines or passive tutors. **OmniSim AI disrupts this by creating an immersive, high-stakes clinical environment.**

We tackle the challenge of **medical training scalability** by simulating the intense pressure of an emergency resuscitation bay. Learners are not just answering questions; they are making critical, time-sensitive interventions. After each scenario, our **Asynchronous AI Mentor** analyzes the learner's weaknesses across their historical sessions, generating targeted case recommendations and specific medical topics to review. 

OmniSim AI proves that LLMs can function as strict, objective evaluators and long-term pedagogical mentors.

---

## ✨ Core Features

### ⏱️ Dynamic Bedside Simulation
- **20+ Interactive Clinical Scenarios:** Ranging from Acute Coronary Syndrome (STEMI) and Massive Pulmonary Embolism to Pediatric SVT and Status Asthmaticus.
- **Real-Time Telemetry & Vitals:** A custom-built Web Audio API integration generates authentic ECG monitor beeps that pitch-shift based on the patient's SpO2 levels. Vitals dynamically respond to the user's pharmacological interventions.
- **Triage Code Red Engine:** A countdown timer forces decisions under pressure. Delayed interventions accelerate patient deterioration, mimicking real-life physiological collapse.

### 🧠 Dual Learning Modes
- **Guided Mode (Junior):** Provides quick-action suggestion chips to help medical students internalize protocols.
- **Expert Mode (Senior):** Strips away all UI hints, requiring free-text clinical orders processed via Natural Language Understanding (NLU).

### 📊 Objective AI Evaluation (OSCE Standards)
- The simulation concludes with a rigorous performance report evaluated against international guidelines (AHA, ERC, ATLS).
- Scores are divided into 4 key competencies: **Protocol Adherence, Diagnostic Accuracy, Patient Safety, and Pharmacology Precision.**
- **Ground-Truth Audit Trail:** To eliminate LLM hallucinations during grading, the backend forcefully injects the exact user action log into the evaluation prompt.

### 🤖 Stateful AI Mentor & Learner Profiles
- **Continuous Learning:** Users can create unique profiles or "Claim" their guest sessions. 
- **Pedagogical Analytics:** An asynchronous AI task evaluates the last 10 completed cases, identifying recurring clinical errors (e.g., *missing early reperfusion in STEMI*).
- **Adaptive Recommendations:** The dashboard provides personalized scenario suggestions and specific medical topics to study based on the identified weaknesses.

---

## 🏗️ System Architecture

OmniSim follows a highly decoupled architecture. The frontend uses pure, dependency-free Vanilla JavaScript for ultra-low latency DOM manipulation and audio synthesis, while the backend relies on FastAPI for robust asynchronous LLM orchestration.

```text
omnisim/
├── backend/
│   ├── app/
│   │   ├── core/          # Environment variables & CORS configurations
│   │   ├── db/            # SQLAlchemy database engine & Session management
│   │   ├── services/      # LLM / Groq API integration & prompt engineering
│   │   ├── scenarios/     # Modular Python dictionaries for clinical cases
│   │   ├── main.py        # FastAPI routes, BackgroundTasks & Core Logic
│   │   ├── models.py      # SQLite schemas (Profiles, Vitals, Logs, Reports)
│   │   └── schemas.py     # Pydantic validation models for I/O
│   ├── alembic/           # Database migration scripts
│   ├── Dockerfile         # Production container configuration
│   └── requirements.txt   # Python dependencies
├── frontend/
│   ├── index.html         # Single Page Application (SPA) structure
│   └── assets/
│       ├── css/style.css  # Custom CSS (No external frameworks)
│       └── js/
│           ├── app.js     # State machine, Audio Context, LLM parsing, UI logic
│           └── config.js  # Environment-based API Endpoint routing
└── render.yaml            # Cloud deployment infrastructure-as-code

💻 Local Development Setup
1. Backend API Installation
Ensure you have Python 3.10+ installed.

Bash
# Clone the repository and navigate to the backend
cd omnisim/backend

# Create and activate a virtual environment
python -m venv venv
source venv/bin/activate  # On Windows use: venv\Scripts\activate

# Install required dependencies
pip install -r requirements.txt
Create a .env file in the backend/ directory:

Kod snippet'i
GROQ_API_KEY=your_groq_api_key_here
LLM_MODEL=qwen/qwen3.8-27b
DATABASE_URL=sqlite:///./omnisim.db
FRONTEND_ORIGINS=http://localhost:5500,http://127.0.0.1:5500
Run database migrations and start the FastAPI server:

Bash
# Initialize the database schema
alembic upgrade head

# Start the development server
uvicorn app.main:app --reload --port 8000
API Documentation will be available at: http://localhost:8000/docs

2. Frontend Client Installation
The frontend is a pure static SPA and requires zero build tools (No Webpack, No Vite). Simply serve the directory:

Bash
cd ../frontend
python -m http.server 5500
Open http://localhost:5500 in your browser. (Ensure frontend/assets/js/config.js points to http://localhost:8000 for local development).

🚀 Deployment Strategy
Backend (Render): Configured for seamless deployment on Render via Docker. The Dockerfile includes an entrypoint that automatically runs Alembic migrations (alembic upgrade head) before starting the Uvicorn worker.

Frontend (Cloudflare Pages / Vercel): Can be deployed in seconds by pointing the platform to the frontend directory with zero build commands.

🔮 Future Vision & Roadmap
While OmniSim AI was built for emergency medicine, the underlying state-machine and AI evaluation architecture is domain-agnostic. Future expansions include:

Scenario Builder UI: Allowing medical instructors to visually design custom cases.

Multiplayer Resuscitation: Syncing state across multiple clients so a team of residents (Airway, Meds, Defib) can collaborate in real-time.

Cross-Domain Expansion: Applying the same high-pressure simulation engine to Crisis Management, Aviation Emergencies, and Cybersecurity Incident Response.