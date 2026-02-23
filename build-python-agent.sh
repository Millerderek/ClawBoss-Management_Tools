#!/bin/bash
set -e

echo "=== Creating Python agent directory ==="
mkdir -p /root/clawd/voice-gateway/clawboss-agent

echo "=== Creating requirements.txt ==="
cat > /root/clawd/voice-gateway/clawboss-agent/requirements.txt << 'EOF'
livekit-agents[deepgram,elevenlabs,openai]>=0.12.0
livekit-plugins-deepgram>=0.6.0
livekit-plugins-elevenlabs>=0.6.0
livekit-plugins-openai>=0.6.0
python-dotenv>=1.0.0
httpx>=0.27.0
EOF

echo "=== Creating agent.py ==="
cat > /root/clawd/voice-gateway/clawboss-agent/agent.py << 'EOF'
import os
import logging
from dotenv import load_dotenv
from livekit.agents import AutoSubscribe, JobContext, WorkerOptions, cli, llm
from livekit.agents.voice_assistant import VoiceAssistant
from livekit.plugins import deepgram, elevenlabs, openai

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("clawboss-agent")

SESSION_MODE = os.getenv("SPRING_SESSION_MODE", "conversational")
OPENCLAW_API_KEY = os.getenv("OPENCLAW_API_KEY", "")
OPENCLAW_ENDPOINT = os.getenv("OPENCLAW_ENDPOINT", "https://toolkit.lutherbot.com/v1/chat/completions")
OPENCLAW_MODEL = os.getenv("OPENCLAW_MODEL", "moonshotai/kimi-k2")
OPENCLAW_BASE_URL = OPENCLAW_ENDPOINT.replace("/chat/completions", "")

CLAWBOSS_SYSTEM_PROMPT = """You are ClawBoss, an AI manager assistant.
Your job is to listen to 1:1 meetings and capture structured notes.
Never repeat back raw transcripts. Only provide concise structured summaries.
Focus on: decisions made, action items, blockers, and key discussion points.
Be brief and professional."""

VOICENOTE_SYSTEM_PROMPT = """You are ClawBoss, an AI manager assistant.
The manager is leaving a voice note. Extract key points and action items.
Be concise and structured."""

CONVERSATIONAL_SYSTEM_PROMPT = """You are ClawBoss, an AI manager assistant.
Be helpful, concise, and professional."""

def get_system_prompt() -> str:
    if SESSION_MODE == "clawboss":
        return CLAWBOSS_SYSTEM_PROMPT
    elif SESSION_MODE == "voicenote":
        return VOICENOTE_SYSTEM_PROMPT
    return CONVERSATIONAL_SYSTEM_PROMPT

async def entrypoint(ctx: JobContext):
    logger.info(f"ClawBoss agent starting | room={ctx.room.name} | mode={SESSION_MODE}")

    await ctx.connect(auto_subscribe=AutoSubscribe.AUDIO_ONLY)

    llm_client = openai.LLM(
        model=OPENCLAW_MODEL,
        api_key=OPENCLAW_API_KEY,
        base_url=OPENCLAW_BASE_URL,
    )

    stt_client = deepgram.STT(
        api_key=os.getenv("DEEPGRAM_API_KEY", ""),
        model="nova-2",
        language="en-US",
    )

    tts_client = elevenlabs.TTS(
        api_key=os.getenv("ELEVENLABS_API_KEY", ""),
        voice_id=os.getenv("ELEVENLABS_VOICE_ID", "21m00Tcm4TlvDq8ikWAM"),
        model="eleven_turbo_v2",
    )

    initial_ctx = llm.ChatContext().append(
        role="system",
        text=get_system_prompt(),
    )

    assistant = VoiceAssistant(
        vad=None,
        stt=stt_client,
        llm=llm_client,
        tts=tts_client,
        chat_ctx=initial_ctx,
    )

    assistant.start(ctx.room)
    logger.info("ClawBoss assistant started and listening")

    await assistant.say("ClawBoss is ready.", allow_interruptions=False)

if __name__ == "__main__":
    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
            worker_type="room",
        )
    )
EOF

echo "=== Creating Dockerfile ==="
cat > /root/clawd/voice-gateway/clawboss-agent/Dockerfile << 'EOF'
FROM python:3.11-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc g++ build-essential \
    && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY agent.py .
CMD ["python", "agent.py", "start"]
EOF

echo "=== Adding clawboss-agent to docker-compose.yml ==="
# Remove old LiveKit session from Node server - it won't be used
cat >> /root/clawd/voice-gateway/docker-compose.yml << 'EOF'
  clawboss-agent:
    build:
      context: ./clawboss-agent
    container_name: clawboss-agent
    restart: unless-stopped
    env_file:
      - agent/.env
    environment:
      - LIVEKIT_URL=ws://livekit-server:7880
      - LIVEKIT_API_KEY=${LIVEKIT_API_KEY}
      - LIVEKIT_API_SECRET=${LIVEKIT_API_SECRET}
    depends_on:
      - livekit
    networks:
      - voice-net
EOF

echo "=== Done — now set API keys in agent/.env then run: ==="
echo "    docker compose up -d --build clawboss-agent"
