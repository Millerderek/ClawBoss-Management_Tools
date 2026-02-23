#!/bin/bash
set -e

echo "=== Setting up agent .env with real keys ==="

SECRET=$(grep LIVEKIT_API_SECRET /root/clawd/voice-gateway/livekit.env | cut -d= -f2)

cat > /root/clawd/voice-gateway/agent/.env << EOF
LIVEKIT_API_KEY=clawboss-livekit
LIVEKIT_API_SECRET=${SECRET}
LIVEKIT_URL=ws://livekit-server:7880
LIVEKIT_TOKEN_TTL=600
TOKEN_SERVER_PORT=8090
DEEPGRAM_API_KEY=7fe6585b6961fa84b401143bdd97efac790267c2
ELEVENLABS_API_KEY=sk_17034089d0492131bcb48b6028680c93e92525bd98363969
ELEVENLABS_VOICE_ID=21m00Tcm4TlvDq8ikWAM
OPENAI_API_KEY=sk-f3rNg3MucMuSRjDz9PhwGlKGrXeSiFwgl4vc0pn09POBxOqO
OPENAI_BASE_URL=https://api.moonshot.cn/v1
OPENCLAW_MODEL=moonshot-v1-8k
SPRING_SESSION_MODE=clawboss
RESEMBLYZER_URL=http://resemblyzer:5001
TWILIO_STREAM_TOKEN=luther-secret
TWILIO_STREAM_URL=wss://voice.lutherbot.com/twilio/stream
TWILIO_INCOMING_PATH=/twilio/incoming
TWILIO_STREAM_PATH=/twilio/stream
AUDIO_SAMPLE_RATE=16000
AUDIO_FRAME_MS=20
STT_PROVIDER=deepgram
TTS_PROVIDER=elevenlabs
LLM_PROVIDER=openai
LLM_TEMPERATURE=0.3
EOF

echo "=== agent/.env written ==="
cat /root/clawd/voice-gateway/agent/.env

echo "=== Updating clawboss-agent docker-compose entry ==="
# Fix the compose entry to not use variable substitution
sed -i "s|\${LIVEKIT_API_KEY}|clawboss-livekit|g" /root/clawd/voice-gateway/docker-compose.yml
sed -i "s|\${LIVEKIT_API_SECRET}|${SECRET}|g" /root/clawd/voice-gateway/docker-compose.yml

echo "=== Building clawboss-agent ==="
cd /root/clawd/voice-gateway
docker compose up -d --build clawboss-agent

echo "=== Waiting for startup ==="
sleep 10
docker logs clawboss-agent --tail 30
