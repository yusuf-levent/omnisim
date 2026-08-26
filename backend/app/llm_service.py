"""
LLM ile konuşan tek katman. Bütün prompt gönderme / JSON parse etme mantığı
burada toplanıyor - main.py bu detaylarla uğraşmıyor.

Hızlı/ucuz bir model kullanıyoruz (örn. gpt-4o-mini) çünkü:
- Karmaşık muhakeme gerekmiyor, sadece yapılandırılmış JSON üretimi.
- Demo sırasında gecikme yaşamamak önemli.

NOT: OPENAI_API_KEY ortam değişkenini .env dosyasına eklemen gerekiyor.
Başka bir sağlayıcı kullanmak istersen (Anthropic, Gemini vb.) sadece bu
dosyayı değiştirmen yeterli - geri kalan kod etkilenmez.
"""
import json

from openai import OpenAI

from config import settings

client = OpenAI(
    api_key=settings.GROQ_API_KEY,
    base_url="https://api.groq.com/openai/v1",
)
MODEL = settings.LLM_MODEL

def _call_llm(system_prompt: str, conversation: list[dict]) -> dict:
    """
    conversation: [{"role": "user"/"assistant", "content": "..."}]
    Döndürür: parse edilmiş JSON dict.
    """
    messages = [{"role": "system", "content": system_prompt}] + conversation

    response = client.chat.completions.create(
        model=MODEL,
        messages=messages,
        response_format={"type": "json_object"},
        temperature=0.8,
    )
    content = response.choices[0].message.content
    return json.loads(content)


def start_scenario(scenario_prompt: str) -> dict:
    """Vakayı başlatır, ilk hasta profilini üretir."""
    conversation = [
        {"role": "user", "content": "Vakayı başlat. Yukarıdaki kurallara göre ilk hasta profilini ve durumu üret."}
    ]
    return _call_llm(scenario_prompt, conversation)


def process_turn(scenario_prompt: str, history: list[dict], user_message: str) -> dict:
    """
    history: önceki turların [{"role": ..., "content": ...}] formatında listesi
    (main.py bunu InteractionLog kayıtlarından oluşturuyor).
    """
    conversation = history + [{"role": "user", "content": user_message}]
    return _call_llm(scenario_prompt, conversation)


def generate_report(scenario_prompt: str, history: list[dict]) -> dict:
    """Vaka bitince tüm geçmişi analiz edip karne üretir."""
    report_instruction = """
    Vaka sona erdi. Yukarıdaki tüm konuşma geçmişini bir tıp eğitmeni gözüyle
    değerlendir. SADECE aşağıdaki JSON formatında cevap ver:
    {
      "skor": <0-100 arası int>,
      "guclu_yonler": "doktorun iyi yaptığı şeyler, 1-2 cümle",
      "hatalar": "doktorun kaçırdığı veya yanlış yaptığı şeyler, 1-2 cümle",
      "oneri": "hangi konuya tekrar çalışması gerektiğine dair somut bir öneri"
    }
    """
    conversation = history + [{"role": "user", "content": report_instruction}]
    return _call_llm(scenario_prompt, conversation)
