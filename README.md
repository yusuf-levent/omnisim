# OmniSim AI

Hata yapmanın güvenli olduğu, AI destekli pedagojik simülasyon platformu.
MVP kapsamı: tek modül (Kalp Krizi vakası), tek vaka tipi, 6 tur, karne ekranı.

## Proje Yapısı

```
omnisim/
├── backend/
│   ├── app/
│   │   ├── core/
│   │   │   └── config.py    # Ortam değişkenleri ve uygulama ayarları
│   │   ├── db/
│   │   │   └── database.py  # SQLite bağlantısı
│   │   ├── services/
│   │   │   └── llm_service.py # LLM ile konuşan tek katman
│   │   ├── main.py          # FastAPI endpoint'leri
│   │   ├── models.py        # 4 tablo: SimSession, VitalState, InteractionLog, ReportResult
│   │   ├── schemas.py       # Pydantic şemaları
│   │   └── scenarios/       # MODÜLERLİK BURADA - yeni vaka eklemek için buraya dosya at
│   │       ├── __init__.py  # vaka tipi registry
│   │       └── acute_coronary_syndrome.py
│   ├── requirements.txt
│   └── .env.example
└── frontend/
    ├── index.html
    └── assets/
        ├── css/
        │   └── style.css
        └── js/
            └── app.js        # vanilla JS, framework yok
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

**Not:** `frontend/assets/js/app.js` içindeki `API_BASE` değişkeni backend'in adresini gösteriyor,
lokal geliştirmede `http://localhost:8000` olarak kalabilir. Deploy ettiğinde
gerçek backend URL'iyle değiştir.

## Yeni Vaka Tipi Ekleme (Modülerlik)

1. `backend/app/scenarios/` klasörüne yeni bir `.py` dosyası ekle (örn. `goz_muayenesi.py`)
2. İçine mevcut vaka dosyalarındaki formatta bir `SCENARIO_PROMPT` yaz
3. `scenarios/__init__.py` içindeki `SCENARIOS` dict'ine yeni satırı ekle, `enabled: True` yap

Başka hiçbir dosyayı değiştirmen gerekmiyor.

## Deploy

### Backend: Render + Docker

Repo kökünde `render.yaml`, backend içinde `Dockerfile` hazır.

1. Kodu GitHub'a push et.
2. Render Dashboard'da **New +** → **Blueprint** seç.
3. Bu repo'yu bağla; Render kökteki `render.yaml` dosyasını okuyacak.
4. `GROQ_API_KEY` ortam değişkenini Render'da gir.
5. Deploy tamamlanınca backend URL'ini not al, örn. `https://omnisim-backend.onrender.com`.

Render web servislerinde uygulama `PORT` ortam değişkenine bağlanır; Dockerfile bunu otomatik kullanıyor.

Docker kullanmadan Render'ın Python 3 ekranından manuel kurulum yaparsan:

- Name: `omnisim-backend`
- Project: boş bırakılabilir
- Language: `Python 3`
- Branch: `main`
- Region: sana yakın olması için `Frankfurt` varsa onu seç; yoksa varsayılan bölge de çalışır
- Root Directory: `backend`
- Build Command: `pip install -r requirements.txt`
- Start Command: `python -m alembic upgrade head && python -m uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- Plan: test/demo için `Free`
- Environment Variables:
  - `GROQ_API_KEY`: Groq API anahtarın
  - `LLM_MODEL`: `qwen/qwen3.8-27b`
  - `DATABASE_URL`: boş bırakırsan SQLite kullanır; kalıcı veri için Postgres bağlantı adresi ver

### Alembic

Veritabanı migration sistemi hazır. Yeni model değişikliğinden sonra backend klasöründe:

```bash
python -m alembic revision --autogenerate -m "change description"
python -m alembic upgrade head
```

Docker/Render başlangıcında `python -m alembic upgrade head` otomatik çalışır.

### Frontend: Cloudflare Pages

Frontend statik çalışıyor; build sistemi yok.

1. Cloudflare Pages'te **Create a project** → Git repo'yu seç.
2. Framework preset: **None**.
3. Build command: boş bırak veya `exit 0`.
4. Build output directory: `frontend`.
5. Deploy öncesi `frontend/assets/js/config.js` içindeki backend adresini Render URL'iyle değiştir:

```js
window.OMNISIM_API_BASE = "https://omnisim-backend.onrender.com";
```

Deploy sonrası Cloudflare Pages URL'i üzerinden frontend açılır ve API isteklerini Render backend'e gönderir.

## Mimari Notlar

- Her tur, geçmiş konuşmanın tamamıyla birlikte LLM'e gönderiliyor (stateless
  değil, LLM her seferinde tüm bağlamı görüyor).
- Nabız/tansiyon değişimi bir turda ±10 ile sınırlı (prompt içinde tanımlı) -
  LLM'in mantıksız sıçrama yapmasını engellemek için.
- Vaka en fazla 6 tur sürer - LLM "bitti" demese bile backend zorla bitirir,
  demo sırasında "vaka hiç bitmiyor" riskini ortadan kaldırır.
- Decision tree / kural motoru KULLANILMIYOR - her tur doğrudan LLM'e gidiyor,
  hızlı/ucuz model (gpt-4o-mini) seçilerek gecikme riski azaltıldı.
