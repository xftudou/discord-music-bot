const { Client, GatewayIntentBits } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');
const ytdl = require("@distube/ytdl-core");
const fs = require("fs");
const ytSearch = require('yt-search');
require('dotenv').config();

// Global map to store the queue for each guild
const queues = new Map();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent,
  ]
});

const PREFIX = '/';

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}`);
});

/**
 * Tries to open a stream and waits for a short data event.
 * If a chunk is received, the candidate video is considered streamable.
 */
function testStream(videoUrl, agent) {
  return new Promise((resolve, reject) => {
    const stream = ytdl(videoUrl, {
      filter: 'audioonly',
      quality: 'highestaudio',
      highWaterMark: 1 << 25,
      dlChunkSize: 0,
      requestOptions: {
        client: agent,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
          'Referer': 'https://www.youtube.com/'
        }
      }
    });

    const timeout = setTimeout(() => {
      stream.destroy();
      reject(new Error('Timeout while testing stream'));
    }, 3000);

    stream.once('data', () => {
      clearTimeout(timeout);
      stream.destroy();
      resolve();
    });
    stream.once('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

/**
 * Searches YouTube for the given query and iterates through results.
 * For each candidate, it tests if a stream can be opened. If the test fails,
 * the candidate is skipped.
 */
async function searchYoutubeWorking(query) {
  const results = await ytSearch(query);

  // let cookies;
  // try {
  //   cookies = process.env.YOUTUBE_COOKIES ? JSON.parse(process.env.YOUTUBE_COOKIES) : [];
  //   if (!Array.isArray(cookies)) throw new Error("Cookies must be an array");
  // } catch (error) {
  //   console.error("Failed to parse YOUTUBE_COOKIES:", error.message);
  //   cookies = [];
  // }

  const agentOptions = {
    pipelining: 5,
    maxRedirections: 0,
    localAddress: "127.0.0.1",
  };

  const agent = ytdl.createAgent(process.env.YOUTUBE_COOKIES, agentOptions);

  for (const video of results.videos) {
    try {
      await testStream(video.url, agent);
      // If the stream test succeeds, return this candidate.
      return video;
    } catch (error) {
      console.warn(`Skipping video ${video.url} due to error: ${error.message}`);
      continue;
    }
  }
  return null;
}

async function playNext(guildId) {
  const queue = queues.get(guildId);
  if (!queue) return;

  if (queue.songs.length === 0) {
    if (queue.connection) queue.connection.destroy();
    queues.delete(guildId);
    return;
  }

  const { videoUrl, title } = queue.songs.shift();
  console.log("Attempting to stream URL:", videoUrl);

  // let cookies;
  // try {
  //   cookies = process.env.YOUTUBE_COOKIES ? JSON.parse(process.env.YOUTUBE_COOKIES) : [];
  //   if (!Array.isArray(cookies)) throw new Error("Cookies must be an array");
  // } catch (error) {
  //   console.error("Failed to parse YOUTUBE_COOKIES:", error.message);
  //   return;
  // }

  const agent = ytdl.createAgent(JSON.parse(fs.readFileSync("cookies.json")));

  try {
    const stream = ytdl(videoUrl, {
      filter: 'audioonly',
      quality: 'highestaudio',
      highWaterMark: 1 << 25,
      dlChunkSize: 0,
      requestOptions: {
        client: agent,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
          'Referer': 'https://www.youtube.com/'
        }
      }
    });
    
    const resource = createAudioResource(stream);
    queue.player.play(resource);

    queue.player.once(AudioPlayerStatus.Idle, () => {
      playNext(guildId);
    });
  } catch (error) {
    console.error('Error playing song:', error.message);
    playNext(guildId);
  }
}

/**
 * Enqueues a song in the guild's queue.
 * If nothing is playing, creates a new queue and starts playback.
 */
async function enqueueSong(voiceChannel, videoUrl, title) {
  const guildId = voiceChannel.guild.id;
  let queue = queues.get(guildId);

  if (!queue) {
    const connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: voiceChannel.guild.id,
      adapterCreator: voiceChannel.guild.voiceAdapterCreator,
      selfMute: false,
      selfDeaf: true,
    });
    const player = createAudioPlayer();

    // Attach an error listener to skip tracks during playback.
    player.on('error', (error) => {
      console.error('AudioPlayer error:', error.message);
      if (error.message.includes('Status code: 403')) {
        console.warn('Skipping track due to 403 error during playback.');
        playNext(guildId);
      }
    });

    queue = {
      connection,
      player,
      songs: [],
    };

    queues.set(guildId, queue);
    connection.subscribe(player);
  }

  queue.songs.push({ videoUrl, title });
}

/**
 * Handles playing a song by enqueuing it and, if nothing is playing, starting playback.
 */
async function handlePlay(voiceChannel, videoUrl, title) {
  const guildId = voiceChannel.guild.id;
  await enqueueSong(voiceChannel, videoUrl, title);

  const queue = queues.get(guildId);
  if (queue.player.state.status === AudioPlayerStatus.Idle) {
    playNext(guildId);
  }
}

// Command handling
client.on('messageCreate', async (message) => {
  if (!message.content.startsWith(PREFIX) || message.author.bot) return;
  
  const args = message.content.slice(PREFIX.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();
  
  if (command === 'play') {
    if (!message.member.voice.channel) {
      return message.reply('You need to join a voice channel first!');
    }
    const query = args.join(' ');
    if (!query) return message.reply('Please provide a song name or YouTube URL.');
    
    // If the query starts with a URL, use it directly.
    if (query.startsWith('http')) {
      await handlePlay(message.member.voice.channel, query, query);
      message.channel.send(`Enqueued: ${query}`);
    } else {
      // Search YouTube and only enqueue a video that passes our stream test.
      const video = await searchYoutubeWorking(query);
      if (video) {
        console.log("Selected YouTube video:", video.url);
        await handlePlay(message.member.voice.channel, video.url, video.title);
        message.channel.send(`Enqueued: ${video.title}`);
      } else {
        message.channel.send('No suitable video found on YouTube.');
      }
    }
  }
  
  // /skip command: stops the current track and plays the next song.
  if (command === 'skip') {
    const guildId = message.guild.id;
    const queue = queues.get(guildId);
    if (queue) {
      queue.player.stop();
      message.channel.send("Skipped the current song.");
    } else {
      message.channel.send("There is no song playing right now.");
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
