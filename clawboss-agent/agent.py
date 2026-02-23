import os
import logging
from dotenv import load_dotenv
from livekit.agents import AutoSubscribe, JobContext, WorkerOptions, cli, AgentSession, Agent, RoomInputOptions
from livekit.plugins import deepgram, elevenlabs, openai, silero

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("clawboss-agent")

SESSION_MODE = os.getenv("SPRING_SESSION_MODE", "conversational")
API_KEY = os.getenv("OPENAI_API_KEY", "")

SYSTEM_PROMPTS = {
    "clawboss": "You are ClawBoss, an AI manager assistant. Be concise and professional.",
    "conversational": "You are ClawBoss, a helpful AI voice assistant. Respond naturally and conversationally.",
}

async def entrypoint(ctx: JobContext):
    logger.info(f"ClawBoss agent starting | room={ctx.room.name}")
    await ctx.connect(auto_subscribe=AutoSubscribe.AUDIO_ONLY)
    session = AgentSession(
        vad=silero.VAD.load(),
        stt=deepgram.STT(api_key=os.getenv("DEEPGRAM_API_KEY"), model="nova-2"),
        llm=openai.LLM(model="gpt-4o-mini", api_key=API_KEY),
        tts=elevenlabs.TTS(
            api_key=os.getenv("ELEVENLABS_API_KEY"),
            voice_id=os.getenv("ELEVENLABS_VOICE_ID", "21m00Tcm4TlvDq8ikWAM"),
            model="eleven_turbo_v2_5",
            sync_alignment=False,
        ),
    )
    await session.start(
        room=ctx.room,
        agent=Agent(instructions=SYSTEM_PROMPTS.get(SESSION_MODE, SYSTEM_PROMPTS["conversational"])),
        room_input_options=RoomInputOptions(),
    )
    logger.info("ClawBoss session started")

if __name__ == "__main__":
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint))
