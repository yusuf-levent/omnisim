import os
from pathlib import Path
from openai import OpenAI
from ..config import settings
# .env dosyasını mutlak yoldan zorla oku


api_key = settings.GROQ_API_KEY1 or settings.GROQ_API_KEY2

print(f"1. Okunan API Key: {api_key[:8]}...{api_key[-4:] if api_key else 'YOK'}")

client = OpenAI(
    api_key=api_key.strip() if api_key else "",
    base_url="https://api.groq.com/openai/v1",
)

try:
    models = [m.id for m in client.models.list().data]
    print(f"2. Groq Bağlantısı Başarılı! Kullanılabilir Modeller: {models[:4]}")
    
    # Test Chat Çağrısı
    test_model = "llama-3.1-8b-instant" if "llama-3.1-8b-instant" in models else models[0]
    print(f"3. Test Çağrısı Yapılıyor (Model: {test_model})...")
    
    resp = client.chat.completions.create(
        model=test_model,
        messages=[{"role": "user", "content": "Respond in JSON format: {\"status\": \"ok\"}"}],
        response_format={"type": "json_object"}
    )
    print(f"4. Yanıt Alındı: {resp.choices[0].message.content}")
except Exception as e:
    print(f"\n[!] HATA DETAYI: {e}")