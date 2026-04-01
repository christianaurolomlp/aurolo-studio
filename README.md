# 🎬 Aurolo Studio

El OpusClip personal de Aurolo — plataforma para gestionar clips de directos de YouTube.

## Stack
- **Backend:** FastAPI (Python)
- **Frontend:** HTML/CSS/JS + Tailwind CDN
- **Database:** SQLite + SQLAlchemy

## Setup local

```bash
pip install -r requirements.txt

# Importar clips
python import_clips.py \
    --stream-title "Trading en Vivo - 31 Marzo" \
    --stream-date "2025-03-31" \
    --clips-dir /tmp/clips_final_1080p \
    --youtube-id "VIDEO_ID"

# Iniciar servidor
uvicorn main:app --reload --port 8000
```

Abrir http://localhost:8000

## API Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/streams` | Listar streams |
| POST | `/api/streams` | Crear stream |
| GET | `/api/streams/{id}/clips` | Clips de un stream |
| POST | `/api/clips/{id}/approve` | Aprobar clip |
| POST | `/api/clips/{id}/reject` | Rechazar clip |
| GET | `/api/clips/{id}/download` | Descargar clip |
| GET | `/api/clips/{id}/video` | Servir video para player |
| GET | `/api/stats` | Estadísticas globales |

## Deploy (Railway)
```bash
railway up
```
