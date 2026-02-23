import os
import json
import logging
from dotenv import load_dotenv
from livekit.agents import AutoSubscribe, JobContext, WorkerOptions, cli, AgentSession, Agent, RoomInputOptions
from livekit.plugins import deepgram, elevenlabs, openai, silero

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("clawboss-agent")

OPENAI_KEY = os.getenv("OPENAI_API_KEY", "")

SYSTEM_PROMPTS = {
    "braindump": (
        "You are ClawBoss, an AI thought capture assistant. "
        "The user is doing a brain dump — unstructured solo thinking. "
        "Listen actively, ask clarifying questions to draw out more detail, "
        "and help them organize their thoughts. Do not filter or judge. "
        "Encourage them to keep going."
    ),
    "voicenote": (
        "You are ClawBoss, an AI voice note assistant. "
        "The user is recording a quick memo or reminder. "
        "Be minimal — acknowledge, confirm key details if needed, stay out of the way."
    ),
    "1on1": (
        "You are ClawBoss, an AI meeting assistant observing a 1:1 meeting. "
        "Listen for decisions, action items, and blockers. "
        "Summarize key points when asked. Be professional and neutral."
    ),
    "conference": (
        "You are ClawBoss, an AI meeting assistant observing a conference call. "
        "Track who said what, decisions made, and action items assigned. "
        "Summarize on request. Be concise and professional."
    ),
    "interview": (
        "You are ClawBoss, an AI interview assistant. "
        "You are observing a structured interview. Track questions asked, "
        "responses given, and key themes. Summarize on request."
    ),
}

CONSENT_ANNOUNCEMENT = (
    "Hello. This session is being recorded and transcribed by an AI assistant. "
    "By continuing, all participants acknowledge and consent to this recording. "
    "You may disconnect at any time if you do not consent."
)

CONSENT_MODES = {"1on1", "conference", "interview"}

async def entrypoint(ctx: JobContext):
    await ctx.connect(auto_subscribe=AutoSubscribe.AUDIO_ONLY)

    # Read session mode from room metadata
    mode = "braindump"
    try:
        metadata = ctx.room.metadata
        if metadata:
            data = json.loads(metadata)
            mode = data.get("mode", "braindump")
    except Exception:
        pass

    logger.info(f"ClawBoss starting | room={ctx.room.name} | mode={mode}")

    system_prompt = SYSTEM_PROMPTS.get(mode, SYSTEM_PROMPTS["braindump"])

    session = AgentSession(
        vad=silero.VAD.load(),
        stt=deepgram.STT(api_key=os.getenv("DEEPGRAM_API_KEY"), model="nova-2"),
        llm=openai.LLM(model="gpt-4o-mini", api_key=OPENAI_KEY),
        tts=elevenlabs.TTS(
            api_key=os.getenv("ELEVENLABS_API_KEY"),
            voice_id=os.getenv("ELEVENLABS_VOICE_ID", "21m00Tcm4TlvDq8ikWAM"),
            model="eleven_turbo_v2_5",
            sync_alignment=False,
        ),
    )

    await session.start(
        room=ctx.room,
        agent=Agent(instructions=system_prompt),
        room_input_options=RoomInputOptions(),
    )

    # Announce consent for applicable session types
    if mode in CONSENT_MODES:
        await session.say(CONSENT_ANNOUNCEMENT)
    else:
        await session.say(f"ClawBoss ready. {mode.replace('braindump', 'Brain dump').replace('voicenote', 'Voice note')} session started.")

    logger.info(f"ClawBoss session active | mode={mode}")

if __name__ == "__main__":
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint))
