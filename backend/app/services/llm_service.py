import json
import time
import logging
from openai import OpenAI
from app.core.config import settings

logger = logging.getLogger("llm_timing")

client = OpenAI(
    api_key=settings.GROQ_API_KEY,
    base_url="https://api.groq.com/openai/v1",
)
MODEL = settings.LLM_MODEL


class LLMServiceError(RuntimeError):
    pass


def _call_llm(system_prompt: str, conversation: list[dict], max_tokens: int = 280) -> dict:
    enforce_system = (
        system_prompt
        + "\n\nREAL-TIME RESPONSE RULES:\n"
        + "1. Return only valid JSON matching the scenario output format.\n"
        + "2. All string values must be in medical English; address the user as Doctor.\n"
        + "3. Follow the active scenario's clinical rules and termination criteria exactly.\n"
        + "4. Keep patient_dialogue and system_note to one short sentence each.\n"
        + "5. Do not end the case unless the active scenario's success or fatal criteria are met."
    )
    messages = [{"role": "system", "content": enforce_system}] + conversation

    prompt_chars = sum(len(m["content"]) for m in messages)
    t0 = time.monotonic()

    try:
        response = client.chat.completions.create(
            model=MODEL,
            messages=messages,
            response_format={"type": "json_object"},
            temperature=0.2,
            max_tokens=max_tokens,
        )
    except Exception as exc:
        logger.exception("LLM provider call failed")
        raise LLMServiceError(str(exc)) from exc

    elapsed = time.monotonic() - t0
    usage = response.usage
    logger.warning(
        "LLM call: provider=groq model=%s %.2fs | prompt_chars=%d | prompt_tokens=%s | completion_tokens=%s",
        MODEL,
        elapsed,
        prompt_chars,
        getattr(usage, "prompt_tokens", "?"),
        getattr(usage, "completion_tokens", "?"),
    )

    try:
        return json.loads(response.choices[0].message.content)
    except (json.JSONDecodeError, TypeError, AttributeError) as exc:
        logger.exception("LLM returned invalid JSON")
        raise LLMServiceError("LLM returned invalid JSON") from exc


def start_scenario(scenario_prompt: str) -> dict:
    conversation = [
        {
            "role": "user",
            "content": "Initialize the emergency clinical simulation. Generate randomized patient age, gender, baseline vitals, objective EMS triage note, initial dialogue, and set clinical_status to 'IN_PROGRESS' with case_completed as false strictly in English JSON.",
        }
    ]
    return _call_llm(scenario_prompt, conversation)


def process_turn(scenario_prompt: str, history: list[dict], user_message: str) -> dict:
    conversation = history + [{"role": "user", "content": user_message}]
    return _call_llm(scenario_prompt, conversation)


def generate_report(scenario_prompt: str, history: list[dict]) -> dict:
    report_instruction = """
    The clinical simulation has ended. You MUST evaluate the physician's clinical performance STRICTLY IN ENGLISH according to rigorous international OSCE rubrics (AHA, ERC, BTS, GINA, SSC, ATLS).
    Do NOT use Turkish under any circumstances.
    Use the GROUND-TRUTH ACTION AUDIT TRAIL in the conversation as the authoritative source of physician actions.
    Never criticize the physician for omitting an intervention that appears in that audit trail.

    SCORING STANDARDS:
    1. EXCELLENT STABILIZATION & PROTOCOL ADHERENCE (90-100 / OUTSTANDING):
       - Full first-line and supportive resuscitation bundle executed appropriately. All 4 competencies scored 22-25 / 25.
    2. INCOMPLETE / PARTIAL (50-79 / COMPETENT or NEEDS IMPROVEMENT):
       - Incomplete supportive measures or minor protocol delays.
    3. ARREST / FATAL NEGLECT (0-35 / CRITICAL FAILURE):
       - Zero intervention, uncorrected lethal hypoxia, or fatal drug contraindications.

    OUTPUT FORMAT (JSON ONLY - ALL TEXT IN ENGLISH):
    {
      "score": int,
      "status_badge": "OUTSTANDING | COMPETENT | NEEDS IMPROVEMENT | CRITICAL FAILURE (ARREST)",
      "correct_actions": int,
      "incorrect_actions": int,
      "reaction_score": int,
      "criteria": {
        "protocol_adherence": int,
        "diagnostic_accuracy": int,
        "patient_safety": int,
        "pharmacology_precision": int
      },
      "strengths": "Concise analysis of correct interventions strictly in English.",
      "errors": "Strict critique of omitted steps or 'No critical clinical errors recorded.' strictly in English.",
      "suggestions": "Actionable guideline recommendations strictly in English."
    }
    """
    conversation = history + [{"role": "user", "content": report_instruction}]
    return _call_llm(scenario_prompt, conversation, max_tokens=800)
