from fastapi import FastAPI, Depends, HTTPException, Request, UploadFile, File, Form
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from database import init_db, get_db, Stream, Clip
from pydantic import BaseModel
from typing import Optional
import os
import subprocess
import json

app = FastAPI(title="Aurolo Studio")

# Static files & templates
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

# Clips directory (configurable)
CLIPS_DIR = os.getenv("CLIPS_DIR", "./clips")

# Init DB on startup
@app.on_event("startup")
def startup():
    init_db()


# --- UI ---
@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})


# --- API: Streams ---
class StreamCreate(BaseModel):
    youtube_id: Optional[str] = None
    title: str
    date: str
    thumbnail_url: Optional[str] = None


@app.get("/api/streams")
def get_streams(db: Session = Depends(get_db)):
    streams = db.query(Stream).order_by(Stream.date.desc()).all()
    results = []
    for s in streams:
        total = db.query(Clip).filter(Clip.stream_id == s.id).count()
        approved = db.query(Clip).filter(Clip.stream_id == s.id, Clip.status == "approved").count()
        pending = db.query(Clip).filter(Clip.stream_id == s.id, Clip.status == "pending").count()
        results.append({
            "id": s.id,
            "youtube_id": s.youtube_id,
            "title": s.title,
            "date": s.date,
            "thumbnail_url": s.thumbnail_url,
            "total_clips": total,
            "approved_clips": approved,
            "pending_clips": pending,
            "created_at": s.created_at.isoformat() if s.created_at else None,
        })
    return results


@app.post("/api/streams")
def create_stream(data: StreamCreate, db: Session = Depends(get_db)):
    stream = Stream(
        youtube_id=data.youtube_id,
        title=data.title,
        date=data.date,
        thumbnail_url=data.thumbnail_url,
    )
    db.add(stream)
    db.commit()
    db.refresh(stream)
    return {"id": stream.id, "title": stream.title}


# --- API: Clips ---
@app.get("/api/streams/{stream_id}/clips")
def get_clips(stream_id: int, db: Session = Depends(get_db)):
    stream = db.query(Stream).filter(Stream.id == stream_id).first()
    if not stream:
        raise HTTPException(status_code=404, detail="Stream not found")
    clips = db.query(Clip).filter(Clip.stream_id == stream_id).order_by(Clip.score.desc()).all()
    return [{
        "id": c.id,
        "stream_id": c.stream_id,
        "filename": c.filename,
        "platform": c.platform,
        "title": c.title,
        "score": c.score,
        "status": c.status,
        "caption_tiktok": c.caption_tiktok,
        "caption_youtube": c.caption_youtube,
        "duration": c.duration,
        "created_at": c.created_at.isoformat() if c.created_at else None,
    } for c in clips]


@app.post("/api/clips/{clip_id}/approve")
def approve_clip(clip_id: int, db: Session = Depends(get_db)):
    clip = db.query(Clip).filter(Clip.id == clip_id).first()
    if not clip:
        raise HTTPException(status_code=404, detail="Clip not found")
    clip.status = "approved"
    db.commit()
    return {"id": clip.id, "status": clip.status}


@app.post("/api/clips/{clip_id}/reject")
def reject_clip(clip_id: int, db: Session = Depends(get_db)):
    clip = db.query(Clip).filter(Clip.id == clip_id).first()
    if not clip:
        raise HTTPException(status_code=404, detail="Clip not found")
    clip.status = "rejected"
    db.commit()
    return {"id": clip.id, "status": clip.status}


@app.get("/api/clips/{clip_id}/download")
def download_clip(clip_id: int, db: Session = Depends(get_db)):
    clip = db.query(Clip).filter(Clip.id == clip_id).first()
    if not clip:
        raise HTTPException(status_code=404, detail="Clip not found")
    filepath = os.path.join(CLIPS_DIR, clip.filename)
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="File not found on disk")
    return FileResponse(filepath, filename=clip.filename, media_type="video/mp4")


@app.get("/api/clips/{clip_id}/video")
def serve_clip_video(clip_id: int, db: Session = Depends(get_db)):
    """Serve clip video for HTML5 player."""
    clip = db.query(Clip).filter(Clip.id == clip_id).first()
    if not clip:
        raise HTTPException(status_code=404, detail="Clip not found")
    filepath = os.path.join(CLIPS_DIR, clip.filename)
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="File not found on disk")
    return FileResponse(filepath, media_type="video/mp4")


# --- API: Upload Clip ---
def _get_duration(filepath: str) -> float:
    """Get video duration using ffprobe."""
    try:
        result = subprocess.run(
            ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", filepath],
            capture_output=True, text=True
        )
        data = json.loads(result.stdout)
        return float(data.get("format", {}).get("duration", 0))
    except Exception:
        return 0.0


@app.post("/api/streams/{stream_id}/clips")
async def upload_clip(
    stream_id: int,
    video: UploadFile = File(...),
    platform: str = Form(...),
    title: str = Form(...),
    score: float = Form(5.0),
    caption_tiktok: Optional[str] = Form(None),
    caption_youtube: Optional[str] = Form(None),
    db: Session = Depends(get_db),
):
    """Upload a clip video file and create DB record."""
    stream = db.query(Stream).filter(Stream.id == stream_id).first()
    if not stream:
        raise HTTPException(status_code=404, detail="Stream not found")

    if platform not in ("tiktok", "youtube"):
        raise HTTPException(status_code=400, detail="Platform must be 'tiktok' or 'youtube'")

    # Ensure clips dir exists
    os.makedirs(CLIPS_DIR, exist_ok=True)

    # Save file
    filename = video.filename or f"clip_{stream_id}_{platform}.mp4"
    filepath = os.path.join(CLIPS_DIR, filename)
    content = await video.read()
    with open(filepath, "wb") as f:
        f.write(content)

    # Get duration
    duration = _get_duration(filepath)

    # Create DB record
    clip = Clip(
        stream_id=stream_id,
        filename=filename,
        platform=platform,
        title=title,
        score=score,
        status="pending",
        caption_tiktok=caption_tiktok,
        caption_youtube=caption_youtube,
        duration=duration,
    )
    db.add(clip)
    db.commit()
    db.refresh(clip)

    return {
        "id": clip.id,
        "filename": clip.filename,
        "platform": clip.platform,
        "title": clip.title,
        "duration": clip.duration,
        "status": clip.status,
    }


# --- API: Stats ---
@app.get("/api/stats")
def get_stats(db: Session = Depends(get_db)):
    total_streams = db.query(Stream).count()
    total_clips = db.query(Clip).count()
    approved = db.query(Clip).filter(Clip.status == "approved").count()
    pending = db.query(Clip).filter(Clip.status == "pending").count()
    rejected = db.query(Clip).filter(Clip.status == "rejected").count()
    tiktok = db.query(Clip).filter(Clip.platform == "tiktok").count()
    youtube = db.query(Clip).filter(Clip.platform == "youtube").count()
    return {
        "total_streams": total_streams,
        "total_clips": total_clips,
        "approved": approved,
        "pending": pending,
        "rejected": rejected,
        "tiktok": tiktok,
        "youtube": youtube,
    }
