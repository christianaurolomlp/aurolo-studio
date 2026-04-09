from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime, ForeignKey, Text, event
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from datetime import datetime
import os

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./aurolo_studio.db")

# Fix Railway Postgres URL prefix
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql+pg8000://", 1)
elif DATABASE_URL.startswith("postgresql://") and "pg8000" not in DATABASE_URL:
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+pg8000://", 1)

print(f"[DB] Connecting to: {DATABASE_URL[:40]}...")

connect_args = {"check_same_thread": False} if "sqlite" in DATABASE_URL else {}
engine = create_engine(DATABASE_URL, connect_args=connect_args, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class Stream(Base):
    __tablename__ = "streams"
    id = Column(Integer, primary_key=True, index=True)
    youtube_id = Column(String, nullable=True)
    title = Column(String, nullable=False)
    date = Column(String, nullable=False)
    thumbnail_url = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    clips = relationship("Clip", back_populates="stream", cascade="all, delete-orphan")


class Clip(Base):
    __tablename__ = "clips"
    id = Column(Integer, primary_key=True, index=True)
    stream_id = Column(Integer, ForeignKey("streams.id"), nullable=False)
    filename = Column(String, nullable=False)
    platform = Column(String, nullable=False)
    title = Column(String, nullable=False)
    score = Column(Float, default=0.0)
    status = Column(String, default="pending")
    caption_tiktok = Column(Text, nullable=True)
    caption_youtube = Column(Text, nullable=True)
    duration = Column(Float, default=0.0)
    video_url = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    stream = relationship("Stream", back_populates="clips")


def init_db():
    Base.metadata.create_all(bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
