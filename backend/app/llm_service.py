import json
from openai import OpenAI
from config import settings

client = OpenAI(
    api_key=settings.GROQ_API_KEY,
    base_url="https://api.groq.com/openai/v1",
)
MODEL = settings.LLM_MODEL


def _call_llm(system_prompt: str, conversation: list[dict]) -> dict:
    messages = [{"role": "system", "content": system_prompt}] + conversation
    response = client.chat.completions.create(
        model=MODEL,
        messages=messages,
        response_format={"type": "json_object"},
        temperature=0.8,
    )
    return json.loads(response.choices[0].message.content)


def start_scenario(scenario_prompt: str) -> dict:
    conversation = [
        {"role": "user", "content": "Vakayı başlat. Rastgele yaş, cinsiyet, ön tanı ve ilk durumu üret."}
    ]
    return _call_llm(scenario_prompt, conversation)


def process_turn(scenario_prompt: str, history: list[dict], user_message: str) -> dict:
    conversation = history + [{"role": "user", "content": user_message}]
    return _call_llm(scenario_prompt, conversation)
def generate_report(scenario_prompt: str, history: list[dict]) -> dict:
    report_instruction = """
    The clinical simulation has ended. You MUST write the ENTIRE evaluation STRICTLY IN ENGLISH.
    Do NOT use Turkish or any other language under any circumstances.

    SCORING STANDARDS:
    - If the user performed zero clinical interventions, accumulated timeouts, or allowed patient arrest: Overall score MUST be 0-15.
    - If appropriate emergency protocol was executed: Overall score 80-100.
    - Score each of the 4 jury criteria out of 25.

    OUTPUT FORMAT (JSON ONLY - ALL TEXT VALUES MUST BE IN ENGLISH):
    {
      "score": 85,
      "status_badge": "OUTSTANDING | NEEDS IMPROVEMENT | CRITICAL FAILURE (ARREST)",
      "correct_actions": 3,
      "incorrect_actions": 0,
      "reaction_score": 8,
      "criteria": {
        "educational_impact": 22,
        "creative_ai_use": 21,
        "technical_execution": 23,
        "pitch_demo": 22
      },
      "strengths": "Provide concise strengths strictly in English.",
      "errors": "Provide error analysis and missed steps strictly in English.",
      "suggestions": "Provide clinical study recommendations strictly in English."
    }
    """
    conversation = history + [{"role": "user", "content": report_instruction}]
    return _call_llm(scenario_prompt, conversation)