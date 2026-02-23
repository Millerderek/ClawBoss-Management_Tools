import base64
import io
import json
import os
from pathlib import Path
from typing import Optional

import numpy as np
import soundfile as sf
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from resemblyzer import VoiceEncoder

vault_dir = Path(os.environ.get("CLAWVAULT_PATH", "/etc/openclaw/clawboss"))
vault_dir.mkdir(parents=True, exist_ok=True)

encoder = VoiceEncoder()
app = FastAPI(title="ClawBoss Resemblyzer")


class EnrollRequest(BaseModel):
    manager_id: str
    audio_base64: str


class MatchRequest(BaseModel):
    audio_base64: str
    manager_id: Optional[str] = None


def decode_audio(data: str):
    raw = base64.b64decode(data)
    audio, sr = sf.read(io.BytesIO(raw))
    return audio, sr


def load_voiceprint(manager_id: str):
    path = vault_dir / f"clawboss.{manager_id}.voiceprint"
    if not path.exists():
        return None
    return np.loadtxt(path)


def save_voiceprint(manager_id: str, emb: np.ndarray):
    path = vault_dir / f"clawboss.{manager_id}.voiceprint"
    with open(path, "w") as f:
        np.savetxt(f, emb)


def cosine_similarity(a: np.ndarray, b: np.ndarray):
    if a is None or b is None:
        return 0.0
    a_norm = a / np.linalg.norm(a)
    b_norm = b / np.linalg.norm(b)
    return float(np.dot(a_norm, b_norm))


@app.post("/enroll")
def enroll(req: EnrollRequest):
    audio, sr = decode_audio(req.audio_base64)
    emb = encoder.embed_utterance(audio)
    save_voiceprint(req.manager_id, emb)
    return {"status": "saved", "manager_id": req.manager_id}


@app.post("/match")
def match(req: MatchRequest):
    audio, sr = decode_audio(req.audio_base64)
    emb = encoder.embed_utterance(audio)
    if req.manager_id:
        stored = load_voiceprint(req.manager_id)
        confidence = cosine_similarity(emb, stored)
        return {
            "manager_id": req.manager_id,
            "confidence": confidence,
            "match": confidence >= 0.7,
        }
    scores = {}
    for path in vault_dir.glob("clawboss.*.voiceprint"):
        manager_id = path.stem.split(".")[1]
        stored = np.loadtxt(path)
        conf = cosine_similarity(emb, stored)
        scores[manager_id] = conf
    if not scores:
        raise HTTPException(status_code=404, detail="No voiceprints enrolled")
    best = max(scores.items(), key=lambda x: x[1])
    manager_id, confidence = best
    return {
        "manager_id": manager_id,
        "confidence": confidence,
        "match": confidence >= 0.7,
    }

@app.get("/health")
def health():
    return {"status": "ok", "stored": len(list(vault_dir.glob("*.voiceprint")))}
