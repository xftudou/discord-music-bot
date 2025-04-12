# Discord Music Bot

A Discord music bot built with [discord.py](https://discordpy.readthedocs.io/) and [yt_dlp](https://github.com/yt-dlp/yt-dlp). This bot allows users to play, pause, resume, skip, stop, and loop music directly from YouTube in a voice channel. It supports both direct URLs and search queries.

## Installation

1. **Clone the repository:**

   git clone https://github.com/xftudou/discord-music-bot.git
   cd discord-music-bot
   
2. **Create a virtual environment:**

   python -m venv venv
   source venv/bin/activate

3. **Install dependencies:**

   pip install -r requirements.txt

## Configuration
**Environment Variables**
Before running the bot, set up the following environment variables:

- DISCORD_TOKEN
Your Discord bot token. Obtain this token from the Discord Developer Portal.

- YOUTUBE_COOKIES_BASE64 (Optional)
A Base64-encoded string of your YouTube cookies if you encounter issues accessing content on YouTube. If this is not provided, the bot will use a local cookies file (www.youtube.com_cookies.txt) as a fallback.

## Usage
1. Run the Bot:

   python bot.py
   
2. Inviitng the Bot:
   Use the OAuth2 URL generator from the Discord Developer Portal to invite your bot to your server with the required permissions (bot and application commands).

## Commands
The bot supports the following commands:

Play Music
-play <url or search>
Plays a song from a given URL or performs a YouTube search if a search term is provided.

Pause Playback
-pause
Pauses the current playback.

Resume Playback
-resume
Resumes playback if paused.

Skip Current Song
-skip
Skips the currently playing song.

Stop Music
-stop
Stops the music, clears the queue, and disconnects the bot from the voice channel.

Loop Mode
-loop [mode]
Turns loop mode on (default if no parameter is provided) or off using -loop off.

Help
-help
Displays a help message with a list of commands and usage instructions.
