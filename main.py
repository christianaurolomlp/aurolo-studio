from fastapi import FastAPI, Depends, HTTPException, Request, UploadFile, File, Form
from fastapi.responses import FileResponse, HTMLResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from database import init_db, get_db, Stream, Clip
from pydantic import BaseModel
from typing import Optional
import os
import subprocess
import json
import requests as http_requests

app = FastAPI(title="Aurolo Studio")

# Static files & templates
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

# Clips local dir (temporary fallback)
CLIPS_DIR = os.getenv("CLIPS_DIR", "/tmp/clips")

# GitHub config for permanent video storage
GITHUB_TOKEN = os.getenv("GITHUB_TOKEN", "")
GITHUB_REPO = os.getenv("GITHUB_REPO", "christianaurolomlp/aurolo-studio-clips")
GITHUB_RELEASE_TAG = os.getenv("GITHUB_RELEASE_TAG", "clips-latest")


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


@app.delete("/api/streams/{stream_id}")
def delete_stream(stream_id: int, db: Session = Depends(get_db)):
    stream = db.query(Stream).filter(Stream.id == stream_id).first()
    if not stream:
        raise HTTPException(status_code=404, detail="Stream not found")
    db.delete(stream)
    db.commit()
    return {"ok": True}


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
        "video_url": c.video_url,
        "created_at": c.created_at.isoformat() if c.created_at else None,
    } for c in clips]


@app.get("/api/clips")
def get_all_clips(db: Session = Depends(get_db)):
    clips = db.query(Clip).order_by(Clip.created_at.desc()).all()
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
        "video_url": c.video_url,
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


@app.get("/api/clips/{clip_id}/video")
def serve_clip_video(clip_id: int, db: Session = Depends(get_db)):
    """Serve clip video - redirect to permanent URL if available."""
    clip = db.query(Clip).filter(Clip.id == clip_id).first()
    if not clip:
        raise HTTPException(status_code=404, detail="Clip not found")

    # Prefer permanent URL
    if clip.video_url:
        return RedirectResponse(url=clip.video_url)

    # Fallback to local file
    filepath = os.path.join(CLIPS_DIR, clip.filename)
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="Video not available. Please re-run the pipeline.")
    return FileResponse(filepath, media_type="video/mp4")


@app.get("/api/clips/{clip_id}/download")
def download_clip(clip_id: int, db: Session = Depends(get_db)):
    clip = db.query(Clip).filter(Clip.id == clip_id).first()
    if not clip:
        raise HTTPException(status_code=404, detail="Clip not found")

    if clip.video_url:
        return RedirectResponse(url=clip.video_url)

    filepath = os.path.join(CLIPS_DIR, clip.filename)
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(filepath, filename=clip.filename, media_type="video/mp4")


# --- API: Upload Clip ---
def _get_duration(filepath: str) -> float:
    try:
        result = subprocess.run(
            ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", filepath],
            capture_output=True, text=True
        )
        data = json.loads(result.stdout)
        return float(data.get("format", {}).get("duration", 0))
    except Exception:
        return 0.0


def _upload_to_github(filepath: str, filename: str) -> Optional[str]:
    """Upload video file to GitHub Releases as a release asset. Returns download URL."""
    if not GITHUB_TOKEN:
        return None
    try:
        headers = {
            "Authorization": f"token {GITHUB_TOKEN}",
            "Accept": "application/vnd.github.v3+json"
        }
        # Get or create release
        release_url = f"https://api.github.com/repos/{GITHUB_REPO}/releases/tags/{GITHUB_RELEASE_TAG}"
        r = http_requests.get(release_url, headers=headers)
        if r.status_code == 404:
            # Create release
            r = http_requests.post(
                f"https://api.github.com/repos/{GITHUB_REPO}/releases",
                headers=headers,
                json={"tag_name": GITHUB_RELEASE_TAG, "name": "Clips Storage", "draft": False}
            )
        release = r.json()
        upload_url = release["upload_url"].replace("{?name,label}", "")

        # Upload asset
        with open(filepath, "rb") as f:
            data = f.read()
        r = http_requests.post(
            f"{upload_url}?name={filename}",
            headers={**headers, "Content-Type": "video/mp4"},
            data=data
        )
        if r.status_code in (201, 200):
            return r.json().get("browser_download_url")
    except Exception as e:
        print(f"GitHub upload failed: {e}")
    return None


@app.post("/api/streams/{stream_id}/clips")
async def upload_clip(
    stream_id: int,
    video: UploadFile = File(...),
    platform: str = Form(...),
    title: str = Form(...),
    score: float = Form(5.0),
    caption_tiktok: Optional[str] = Form(None),
    caption_youtube: Optional[str] = Form(None),
    video_url: Optional[str] = Form(None),
    db: Session = Depends(get_db),
):
    """Upload a clip video file and create DB record. Stores permanently on GitHub."""
    stream = db.query(Stream).filter(Stream.id == stream_id).first()
    if not stream:
        raise HTTPException(status_code=404, detail="Stream not found")

    if platform not in ("tiktok", "youtube"):
        raise HTTPException(status_code=400, detail="Platform must be 'tiktok' or 'youtube'")

    os.makedirs(CLIPS_DIR, exist_ok=True)
    filename = video.filename or f"clip_{stream_id}_{platform}.mp4"
    filepath = os.path.join(CLIPS_DIR, filename)
    content = await video.read()
    with open(filepath, "wb") as f:
        f.write(content)

    duration = _get_duration(filepath)

    # Upload to GitHub for permanent storage
    permanent_url = video_url  # If URL provided directly, use it
    if not permanent_url and GITHUB_TOKEN:
        permanent_url = _upload_to_github(filepath, filename)

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
        video_url=permanent_url,
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
        "video_url": clip.video_url,
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


@app.delete("/api/clips/{clip_id}")
async def delete_clip(clip_id: int, db: Session = Depends(get_db)):
    clip = db.query(Clip).filter(Clip.id == clip_id).first()
    if not clip:
        raise HTTPException(status_code=404, detail="Clip not found")
    db.delete(clip)
    db.commit()
    return {"ok": True, "deleted_id": clip_id}


@app.delete("/api/streams/{stream_id}/clips")
async def delete_all_clips(stream_id: int, db: Session = Depends(get_db)):
    clips = db.query(Clip).filter(Clip.stream_id == stream_id).all()
    count = len(clips)
    for clip in clips:
        db.delete(clip)
    db.commit()
    return {"ok": True, "deleted": count}


@app.patch("/api/clips/{clip_id}")
async def update_clip(clip_id: int, data: dict, db: Session = Depends(get_db)):
    clip = db.query(Clip).filter(Clip.id == clip_id).first()
    if not clip:
        raise HTTPException(status_code=404, detail="Clip not found")
    for field in ["caption_tiktok", "caption_youtube", "title", "score", "video_url", "status"]:
        if field in data:
            setattr(clip, field, data[field])
    db.commit()
    db.refresh(clip)
    return {"ok": True, "id": clip.id}
