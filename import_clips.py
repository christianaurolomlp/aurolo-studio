#!/usr/bin/env python3
"""
Import clips into Aurolo Studio database.

Usage:
    python import_clips.py --stream-title "Title" --stream-date "2025-03-31" \
        --clips-dir /tmp/clips_final_1080p --youtube-id "VIDEO_ID" \
        [--metadata /tmp/gemini_clips_raw.json]
"""
import argparse
import json
import os
import subprocess
from datetime import datetime
from database import init_db, SessionLocal, Stream, Clip


def get_duration(filepath):
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


def generate_caption_tiktok(title):
    return f"{title}\n\n¿Te gustó? Dale like y sigue 🚀\n\n#Bitcoin #BTC #Trading #TradingEnVivo #Aurolo #CryptoTrading"


def generate_caption_youtube(title):
    return f"{title} | Trading en Vivo con Aurolo\n\n🔥 Opera en Bitunix: https://www.m45.group/bitunix\n\n#Bitcoin #BTC #TradingEnVivo #YouTubeShorts #Aurolo"


def main():
    parser = argparse.ArgumentParser(description="Import clips into Aurolo Studio")
    parser.add_argument("--stream-title", required=True)
    parser.add_argument("--stream-date", required=True)
    parser.add_argument("--clips-dir", required=True)
    parser.add_argument("--youtube-id", default=None)
    parser.add_argument("--metadata", default="/tmp/gemini_clips_raw.json")
    parser.add_argument("--db-clips-dir", default="./clips",
                        help="Directory where clips will be stored for the app")
    args = parser.parse_args()

    # Load metadata
    metadata = {"tiktok": [], "youtube": []}
    if os.path.exists(args.metadata):
        with open(args.metadata, "r") as f:
            metadata = json.load(f)
        print(f"✅ Loaded metadata: {len(metadata.get('tiktok', []))} TikTok, {len(metadata.get('youtube', []))} YouTube")
    else:
        print(f"⚠️  No metadata file found at {args.metadata}")

    # Init DB
    init_db()
    db = SessionLocal()

    # Create stream
    stream = Stream(
        youtube_id=args.youtube_id,
        title=args.stream_title,
        date=args.stream_date,
        thumbnail_url=f"https://img.youtube.com/vi/{args.youtube_id}/maxresdefault.jpg" if args.youtube_id else None,
    )
    db.add(stream)
    db.commit()
    db.refresh(stream)
    print(f"✅ Stream created: #{stream.id} — {stream.title}")

    # Ensure clips dir for app exists
    os.makedirs(args.db_clips_dir, exist_ok=True)

    # Index metadata by clip number
    tt_meta = {i + 1: m for i, m in enumerate(metadata.get("tiktok", []))}
    yt_meta = {i + 1: m for i, m in enumerate(metadata.get("youtube", []))}

    # Scan clips directory
    clip_files = sorted([f for f in os.listdir(args.clips_dir) if f.endswith(".mp4")])
    print(f"📁 Found {len(clip_files)} clip files")

    imported = 0
    for filename in clip_files:
        src_path = os.path.join(args.clips_dir, filename)

        # Determine platform and index
        if filename.startswith("tt_"):
            platform = "tiktok"
            idx = int(filename.replace("tt_", "").replace(".mp4", ""))
            meta = tt_meta.get(idx, {})
        elif filename.startswith("yt_"):
            platform = "youtube"
            idx = int(filename.replace("yt_", "").replace(".mp4", ""))
            meta = yt_meta.get(idx, {})
        else:
            print(f"  ⚠️  Skipping unknown format: {filename}")
            continue

        title = meta.get("titulo", f"Clip {filename}")
        duration = get_duration(src_path)

        # Copy clip to app's clips dir
        dest_path = os.path.join(args.db_clips_dir, filename)
        if not os.path.exists(dest_path):
            import shutil
            shutil.copy2(src_path, dest_path)

        # Score: higher index = lower score (first clips are "better" by default)
        total = len(tt_meta) if platform == "tiktok" else len(yt_meta)
        score = round((total - idx + 1) / total * 10, 1) if total > 0 else 5.0

        clip = Clip(
            stream_id=stream.id,
            filename=filename,
            platform=platform,
            title=title,
            score=score,
            status="pending",
            caption_tiktok=generate_caption_tiktok(title),
            caption_youtube=generate_caption_youtube(title),
            duration=duration,
        )
        db.add(clip)
        imported += 1
        print(f"  📎 {platform.upper()} #{idx}: {title[:50]}... ({duration:.1f}s, score: {score})")

    db.commit()
    stream_id = stream.id
    db.close()
    print(f"\n🎉 Imported {imported} clips into stream #{stream_id}")
    print(f"   Run: uvicorn main:app --reload --host 0.0.0.0 --port 8000")


if __name__ == "__main__":
    main()
