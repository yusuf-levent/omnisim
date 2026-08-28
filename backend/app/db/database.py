"""
SQLite veritabanı bağlantısı.
Dosya tabanlı, hiçbir ayrı DB servisi kurulmasına gerek yok.
İleride Postgres'e geçmek istersen sadece DATABASE_URL'i değiştirmen yeterli
(SQLAlchemy ORM kodu aynı kalır).
"""
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

DATABASE_URL = "sqlite:///./omnisim.db"

engine = create_engine(
    DATABASE_URL, connect_args={"check_same_thread": False}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
