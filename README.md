# ClawBoss Voice Agent

A real-time AI voice assistant built on LiveKit, using Deepgram STT, OpenAI LLM, and ElevenLabs TTS.

## Architecture
```
Browser/Client → LiveKit WebRTC → clawboss-agent
                                      ├── Deepgram (STT)
                                      ├── GPT-4o-mini (LLM)
                                      └── ElevenLabs (TTS)
```

## Stack

- **LiveKit** — WebRTC room server
- **livekit-agents 1.4.3** — Python agent framework
- **Deepgram nova-2** — Speech-to-text
- **GPT-4o-mini** — Language model
- **ElevenLabs eleven_turbo_v2_5** — Text-to-speech
- **Silero VAD** — Voice activity detection
- **Resemblyzer** — Speaker embedding service (future: voice enrollment)

## Quick Start

### 1. Clone the repo
```bash
git clone https://github.com/Millerderek/ClawBoss-Management_Tools.git
cd ClawBoss-Management_Tools
```

### 2. Configure secrets
```bash
cp agent/.env.example agent/.env
# Edit agent/.env with your API keys
```

### 3. Start the stack
```bash
docker compose up -d
```

### 4. Get a connection token
```bash
curl "http://localhost:8090/token?room=clawboss&identity=manager"
```

### 5. Connect

Use [meet.livekit.io](https://meet.livekit.io) with your LiveKit server URL and the token above.

## Services

| Service | Port | Description |
|---|---|---|
| LiveKit server | 7880 | WebRTC room server |
| Token server | 8090 | JWT token generation |
| ClawBoss agent | 8081 | Voice agent worker |
| Resemblyzer | 5001 | Speaker embeddings |

## Session Modes

Set `SPRING_SESSION_MODE` in `agent/.env`:

- `conversational` — General assistant (default)
- `clawboss` — Meeting note-taker focused on decisions, action items, blockers

## Required API Keys

- `OPENAI_API_KEY` — [platform.openai.com](https://platform.openai.com/api-keys)
- `ELEVENLABS_API_KEY` — [elevenlabs.io](https://elevenlabs.io/app/settings/api-keys)
- `DEEPGRAM_API_KEY` — [deepgram.com](https://console.deepgram.com)
- `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` — generated during setup

## Notes

- `agent/.env` is gitignored — never commit live API keys
- ElevenLabs requires `sync_alignment=False` in livekit-agents 1.4.x
- Default voice: Rachel (`21m00Tcm4TlvDq8ikWAM`) — change via `ELEVENLABS_VOICE_ID`
