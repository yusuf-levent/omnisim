# OmniSim AI

OmniSim AI is an AI-powered clinical decision simulation platform for emergency
training. It gives learners a safe place to make high-pressure decisions, see
patient vitals change, and receive an OSCE-style performance report after the
case.

Live demo: https://omni.weetis.com/

## What It Does

- Runs interactive emergency medicine scenarios with AI-generated patient
  dialogue, clinical notes, vital responses, and final scoring.
- Includes 20 active cases such as STEMI, anaphylaxis, status asthmaticus,
  tension pneumothorax, DKA, sepsis, eclampsia, pediatric SVT, and massive PE.
- Supports two modes:
  - Guided: scenario-specific quick action buttons.
  - Expert: free-text clinical orders only.
- Shows real-time bedside telemetry, vitals, differential diagnosis estimates,
  lab/ECG panels, action timelines, and final educational feedback.
- Maintains learner profiles that turn completed simulation reports into
  adaptive recommendations and recent performance memory.
- Stores session logs, vital states, and evaluation reports through a FastAPI
  backend with SQLAlchemy and Alembic migrations.

## Hackathon Fit

The project targets the education challenge by turning AI into an active
training partner rather than a passive chatbot. Learners practice clinical
reasoning under time pressure, make interventions, and receive structured
feedback on protocol adherence, diagnostic accuracy, patient safety, and
pharmacology precision.

The long-term vision is to expand OmniSim beyond emergency medicine:

- user-created scenarios,
- a public scenario discovery page,
- scenario packs for different professions and domains,
- instructor dashboards,
- account-based learning history and analytics,
- and domain-specific simulation templates for healthcare, crisis response,
  legal training, customer support, sales, engineering operations, and other
  decision-heavy fields.

## Architecture

```text
omnisim/
├── backend/
│   ├── app/
│   │   ├── core/          # Environment and runtime settings
│   │   ├── db/            # SQLAlchemy database setup
│   │   ├── services/      # LLM provider integration
│   │   ├── scenarios/     # Modular scenario prompts and registry
│   │   ├── main.py        # FastAPI routes
│   │   ├── models.py      # Session, vitals, logs, reports
│   │   └── schemas.py     # API response/request schemas
│   ├── alembic/           # Database migrations
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── index.html
│   └── assets/
│       ├── css/style.css
│       └── js/
│           ├── app.js
│           └── config.js
├── render.yaml
└── README.md
```

## Backend Setup

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

On Windows:

```powershell
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
```

Create a `.env` file in `backend/`:

```env
GROQ_API_KEY=your_groq_api_key
LLM_MODEL=qwen/qwen3.8-27b
DATABASE_URL=sqlite:///./omnisim.db
FRONTEND_ORIGINS=https://omni.weetis.com,http://localhost:5500,http://127.0.0.1:5500
```

Run migrations and start the API:

```bash
python -m alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

API docs: http://localhost:8000/docs

## Frontend Setup

The frontend is static and does not require a build step.

```bash
cd frontend
python -m http.server 5500
```

Open http://localhost:5500.

For deployment, set the backend URL in `frontend/assets/js/config.js`:

```js
window.OMNISIM_API_BASE = "https://omnisim.onrender.com";
```

## Deployment

### Backend: Render

The repository includes `render.yaml` and `backend/Dockerfile`.

Required Render environment variables:

- `GROQ_API_KEY`
- `LLM_MODEL`, default: `qwen/qwen3.8-27b`
- `DATABASE_URL`, optional. If omitted, SQLite is used.
- `FRONTEND_ORIGINS`, optional. Default includes the live site and local dev
  origins.

The Docker startup command runs Alembic migrations automatically before starting
FastAPI.

### Frontend: Cloudflare Pages

- Framework preset: None
- Build command: empty or `exit 0`
- Build output directory: `frontend`

## Adding a Scenario

1. Add a new Python file under `backend/app/scenarios/`.
2. Define a `SCENARIO_PROMPT` using the existing scenario format.
3. Import it in `backend/app/scenarios/__init__.py`.
4. Add it to the `SCENARIOS` registry with `enabled: True`.

No frontend code is required for the scenario card itself. Add quick actions,
DDx, and lab panel entries in `frontend/assets/js/app.js` when the scenario
needs custom UI support.

## Reliability Notes

- Live turns use a short recent-history window for latency.
- Final reports use the full clinical action audit trail so recorded
  interventions are not lost during scoring.
- Report metrics are persisted and reused consistently when a completed report
  is opened again.
- Learner profiles are persisted through the backend when the API is available,
  with a frontend fallback so the demo does not lose the profile screen if the
  network or browser storage is restricted.
- If the LLM provider is temporarily unavailable during report generation, the
  backend returns a conservative fallback report from the recorded action log
  instead of leaving the demo without an evaluation screen.
