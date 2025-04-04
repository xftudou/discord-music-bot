import env_setup  # noqa: F401
import asyncio
from collections import deque
import yt_dlp
from discord import app_commands
from discord.ext import commands
import discord
import os

# Create the structure for queueing songs
SONG_QUEUES = {}


async def search_ytdlp_async(query, ydl_opts):
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, lambda: _extract(query, ydl_opts))


def _extract(query, ydl_opts):
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        return ydl.extract_info(query, download=False)


# Setup of intents. Intents are permissions the bot has on the server
intents = discord.Intents.default()
intents.message_content = True

# Bot setup
bot = commands.Bot(command_prefix="-", intents=intents, help_command=None)


@bot.event
async def on_ready():
    await bot.tree.sync()
    print(f"{bot.user} is online!")


@bot.command(name="skip")
async def skip_cmd(ctx):
    voice_client = ctx.guild.voice_client
    if voice_client and (voice_client.is_playing() or voice_client.is_paused()):
        voice_client.stop()
        await ctx.send("Skipped the current song.")
    else:
        await ctx.send("Not playing anything to skip.")


@bot.command(name="pause")
async def pause_cmd(ctx):
    voice_client = ctx.guild.voice_client
    if voice_client is None:
        return await ctx.send("I'm not in a voice channel.")

    if not voice_client.is_playing():
        return await ctx.send("Nothing is currently playing.")

    voice_client.pause()
    await ctx.send("Playback paused!")


@bot.command(name="help")
async def help_cmd(ctx):
    help_text = """
🎶 **🥔点歌台指令** 🎶

`-play <url or search>` - Play a song  
`-pause` - Pause playback  
`-resume` - Resume playback  
`-skip` - Skip the current song  
`-stop` - Leave the voice channel
"""
    await ctx.send(help_text)


@bot.command(name="resume")
async def resume_cmd(ctx):
    voice_client = ctx.guild.voice_client
    if voice_client is None:
        return await ctx.send("I'm not in a voice channel.")

    if not voice_client.is_paused():
        return await ctx.send("I'm not paused right now.")

    voice_client.resume()
    await ctx.send("Playback resumed!")


@bot.command(name="stop")
async def stop_cmd(ctx):
    voice_client = ctx.guild.voice_client
    if not voice_client or not voice_client.is_connected():
        return await ctx.send("I'm not connected to any voice channel.")

    guild_id_str = str(ctx.guild.id)
    if guild_id_str in SONG_QUEUES:
        SONG_QUEUES[guild_id_str].clear()

    if voice_client.is_playing() or voice_client.is_paused():
        voice_client.stop()

    await voice_client.disconnect()
    await ctx.send("Stopped playback and disconnected!")


@bot.command(name="play")
async def play(ctx, *, song_query: str):
    voice_channel = ctx.author.voice.channel if ctx.author.voice else None
    if voice_channel is None:
        await ctx.send("You must be in a voice channel.")
        return

    voice_client = ctx.guild.voice_client
    if voice_client is None:
        voice_client = await voice_channel.connect()
    elif voice_channel != voice_client.channel:
        await voice_client.move_to(voice_channel)

    ydl_options = {
        "format": "bestaudio[abr<=96]/bestaudio",
        "noplaylist": True,
        "youtube_include_dash_manifest": False,
        "youtube_include_hls_manifest": False,
    }

    query = "ytsearch1: " + song_query
    results = await search_ytdlp_async(query, ydl_options)
    tracks = results.get("entries", [])

    if not tracks:
        await ctx.send("No results found.")
        return

    first_track = tracks[0]
    audio_url = first_track["url"]
    title = first_track.get("title", "Untitled")

    guild_id = str(ctx.guild.id)
    if SONG_QUEUES.get(guild_id) is None:
        SONG_QUEUES[guild_id] = deque()

    SONG_QUEUES[guild_id].append((audio_url, title))

    if voice_client.is_playing() or voice_client.is_paused():
        await ctx.send(f"Added to queue: **{title}**")
    else:
        # await ctx.send(f"Now playing: **{title}**")
        await play_next_song(voice_client, guild_id, ctx.channel)


async def play_next_song(voice_client, guild_id, channel):
    if SONG_QUEUES[guild_id]:
        audio_url, title = SONG_QUEUES[guild_id].popleft()

        ffmpeg_options = {
            "before_options": "-reconnect 1 -reconnect_streamed 1 -reconnect_delay_max 5",
            "options": "-vn -b:a 96k",
        }

        source = discord.FFmpegOpusAudio(
            audio_url, **ffmpeg_options)

        def after_play(error):
            if error:
                print(f"Error playing {title}: {error}")
            asyncio.run_coroutine_threadsafe(play_next_song(
                voice_client, guild_id, channel), bot.loop)

        voice_client.play(source, after=after_play)
        asyncio.create_task(channel.send(f"Now playing: **{title}**"))
    else:
        await voice_client.disconnect()
        SONG_QUEUES[guild_id] = deque()


# Run the bot
bot.run(os.getenv("DISCORD_TOKEN"))
