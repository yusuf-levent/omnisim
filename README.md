# OmniSim AI

Hata yapmanın güvenli olduğu, AI destekli pedagojik simülasyon platformu.
MVP kapsamı: tek modül (Kalp Krizi vakası), tek vaka tipi, 6 tur, karne ekranı.

## Proje Yapısı

```
omnisim/
├── backend/
│   ├── app/
│   │   ├── main.py          # FastAPI endpoint'leri
│   │   ├── database.py      # SQLite bağlantısı
│   │   ├── models.py        # 4 tablo: SimSession, VitalState, InteractionLog, ReportResult
│   │   ├── schemas.py       # Pydantic şemaları
│   │   ├── llm_service.py   # LLM ile konuşan tek katman
│   │   └── scenarios/       # MODÜLERLİK BURADA - yeni vaka eklemek için buraya dosya at
│   │       ├── __init__.py  # vaka tipi registry
│   │       └── kalp_krizi.py
│   ├── requirements.txt
│   └── .env.example
└── frontend/
    ├── index.html
    ├── style.css
    └── app.js                # vanilla JS, framework yok
```

## Kurulum (Backend)

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env
# .env dosyasını aç, OPENAI_API_KEY'i gerçek key'inle değiştir

uvicorn app.main:app --reload --port 8000
```

Backend `http://localhost:8000` adresinde çalışmaya başlar.
API dokümantasyonunu görmek için: `http://localhost:8000/docs`

## Kurulum (Frontend)

Build sistemi yok, tek yapman gereken `frontend/index.html`'i bir tarayıcıda açmak
veya basit bir static server ile servis etmek:

```bash
cd frontend
python -m http.server 5500
```

Sonra `http://localhost:5500` adresini aç.

**Not:** `app.js` içindeki `API_BASE` değişkeni backend'in adresini gösteriyor,
lokal geliştirmede `http://localhost:8000` olarak kalabilir. Deploy ettiğinde
gerçek backend URL'iyle değiştir.

## Yeni Vaka Tipi Ekleme (Modülerlik)

1. `backend/app/scenarios/` klasörüne yeni bir `.py` dosyası ekle (örn. `goz_muayenesi.py`)
2. İçine `kalp_krizi.py`'deki formatta bir `SCENARIO_PROMPT` yaz
3. `scenarios/__init__.py` içindeki `SCENARIOS` dict'ine yeni satırı ekle, `enabled: True` yap

Başka hiçbir dosyayı değiştirmen gerekmiyor.

## Deploy

- **Backend:** Railway veya Render'a Docker/otomatik Python deploy ile.
  `DATABASE_URL`'i istersen Postgres'e çevirebilirsin (SQLAlchemy kodu değişmez).
- **Frontend:** Cloudflare Pages'e statik dosya olarak (`frontend/` klasörünü at).
  Deploy sonrası `app.js`'teki `API_BASE`'i güncellemeyi unutma.

## Mimari Notlar

- Her tur, geçmiş konuşmanın tamamıyla birlikte LLM'e gönderiliyor (stateless
  değil, LLM her seferinde tüm bağlamı görüyor).
- Nabız/tansiyon değişimi bir turda ±10 ile sınırlı (prompt içinde tanımlı) -
  LLM'in mantıksız sıçrama yapmasını engellemek için.
- Vaka en fazla 6 tur sürer - LLM "bitti" demese bile backend zorla bitirir,
  demo sırasında "vaka hiç bitmiyor" riskini ortadan kaldırır.
- Decision tree / kural motoru KULLANILMIYOR - her tur doğrudan LLM'e gidiyor,
  hızlı/ucuz model (gpt-4o-mini) seçilerek gecikme riski azaltıldı.
