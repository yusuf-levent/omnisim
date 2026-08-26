"""
MODÜLERLİK BURADA YAŞIYOR.

Yeni bir vaka tipi (ör. "goz_muayenesi", "trafik_kazasi") eklemek için:
1. Bu klasöre yeni bir .py dosyası ekle (örnek: goz_muayenesi.py)
2. İçine SCENARIO_PROMPT string'ini yaz (kalp_krizi.py'deki formatı kopyala)
3. Aşağıdaki SCENARIOS dict'ine bir satır ekle

Başka hiçbir yeri değiştirmene gerek yok - main.py, llm_service.py hepsi
bu registry'den okuyor.
"""
from .kalp_krizi import SCENARIO_PROMPT as KALP_KRIZI_PROMPT

SCENARIOS = {
    "kalp_krizi": {
        "label": "Kalp Krizi Vakası",
        "prompt": KALP_KRIZI_PROMPT,
        "enabled": True,
    },
    # Örnek: ileride eklenecek, şimdilik "yakında" olarak frontend'de gösterilecek
    "goz_muayenesi": {
        "label": "Göz Muayenesi (Yakında)",
        "prompt": None,
        "enabled": False,
    },
}


def get_scenario(scenario_type: str) -> dict:
    scenario = SCENARIOS.get(scenario_type)
    if not scenario or not scenario["enabled"]:
        raise ValueError(f"Geçersiz veya henüz aktif olmayan vaka tipi: {scenario_type}")
    return scenario
