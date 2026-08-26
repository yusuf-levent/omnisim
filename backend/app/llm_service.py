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
    Vaka sona erdi. Doktorun tüm performansını sıkı bir tıp ve hackathon jürisi gözüyle puanla.
    
    PUANLAMA KURALLARI:
    - Doktor HİÇBİR ŞEY YAPMADIYSA, sadece zaman aşımına uğradıysa veya hastayı öldürdüyse skor 0-10 ARASI OLMALIDIR. Asla boş yere 20+ verme.
    - Başarılı, hızlı ve doğru adımlar (MONA protokolü, EKG, O2, Aspirin) attıysa 80-100 ver.
    - 4 jüri kriterinin her biri 0-25 arası puanlanmalıdır.

    SADECE aşağıdaki JSON formatında cevap ver:
    {
      "score": <0-100 arası tam sayı>,
      "status_badge": "BÜYÜK BAŞARI | GELİŞTİRİLMELİ | KRİTİK HATA",
      "correct_actions": <int, doğru işlem sayısı>,
      "incorrect_actions": <int, hatalı işlem veya zaman aşımı sayısı>,
      "reaction_score": <1-10 arası reaksiyon hızı puanı>,
      "criteria": {
        "educational_impact": <0-25>,
        "creative_ai_use": <0-25>,
        "technical_execution": <0-25>,
        "pitch_demo": <0-25>
      },
      "strengths": "Doktorun yaptığı en iyi 1-2 şey",
      "errors": "Kaçırılan noktalar veya zaman kaybı",
      "suggestions": "Tekrar çalışması gereken kritik klinik konu"
    }
    """
    conversation = history + [{"role": "user", "content": report_instruction}]
    return _call_llm(scenario_prompt, conversation)