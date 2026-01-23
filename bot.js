// bot.js - KINGSLEY-XD OFFENSIVE BOT
// Main WhatsApp bot using Baileys, qrcode-terminal and pino
// No axios, colors, or fs-extra used.

import express from "express";
import http from "http";
import { WebSocketServer } from "ws";
import qrcode from "qrcode-terminal";
import pino from "pino";
import { readFile, writeFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import {
  default: makeWASocket,
  useSingleFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} from "@adiwajshing/baileys";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env
const dotenv = await import("dotenv");
dotenv.config();

const PORT = process.env.PORT || 3000;
const PAIRING_SITE_PATH = process.env.PAIRING_SITE_PATH || "/pair";
const AUTH_FILE = "./auth_info.json"; // keep out of repo
const logger = pino({ level: "info" });

// Save message history for anti-delete
const messageStore = new Map();

// Simple helper: fetch wrapper using global fetch (Node 18+)
async function fetchJson(url, opts) {
  const res = await fetch(url, opts);
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

// Create express app and static pairing site serving
const app = express();
const server = http.createServer(app);

// Serve pairing page and static files
app.use(express.static(path.join(__dirname, "public")));
app.get("/", (req, res) => {
  res.send(
    `<h3>KINGSLEY-XD OFFENSIVE BOT</h3><p>Open <a href="${PAIRING_SITE_PATH}">pairing page</a> to scan QR / pairing code.</p>`
  );
});

// WebSocket server for pairing QR updates
const wss = new WebSocketServer({ server });

function broadcastPairingData(payload) {
  const msg = JSON.stringify(payload);
  wss.clients.forEach((c) => {
    if (c.readyState === 1) c.send(msg);
  });
}

// Initialize WhatsApp connection with Baileys
const { state, saveState } = await useSingleFileAuthState(AUTH_FILE);

async function startSock() {
  const { version } = await fetchLatestBaileysVersion();
  logger.info(`Using WA Version: ${version.join(".")}`);

  const sock = makeWASocket({
    logger,
    printQRInTerminal: false,
    auth: state,
    version,
  });

  // Save credentials on update
  sock.ev.on("creds.update", saveState);

  // Connection updates
  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      // broadcast QR to pairing website
      broadcastPairingData({ type: "qr", data: qr });
      // Also show QR in terminal
      qrcode.generate(qr, { small: true });
      logger.info("QR generated (scan from pairing page or terminal).");
    }

    if (connection === "close") {
      const reason = lastDisconnect?.error?.output?.statusCode || lastDisconnect?.error?.message;
      logger.info("connection closed:", reason);
      // Try to restart unless it was manual logout
      if ((lastDisconnect?.error?.output?.statusCode ?? 0) !== DisconnectReason.loggedOut) {
        logger.info("Reconnecting...");
        startSock();
      } else {
        logger.info("Logged out. Remove auth file and restart to re-pair.");
      }
    }

    if (connection === "open") {
      logger.info("Connected to WhatsApp.");
      broadcastPairingData({ type: "status", data: "connected" });
    }
  });

  // Store incoming messages (for anti-delete)
  sock.ev.on("messages.upsert", async (m) => {
    if (m.type !== "notify") return;
    for (const msg of m.messages) {
      try {
        const id = msg.key.id;
        // Save message content (simple)
        messageStore.set(id, msg);

        // Auto reply rules
        if (!msg.key.fromMe && msg.message) {
          const sender = msg.key.remoteJid;
          const text = (msg.message.conversation || msg.message?.extendedTextMessage?.text || "").toString().toLowerCase();

          // Auto react: if message contains 'nice', react with ❤️
          if (text.includes("nice")) {
            try {
              await sock.sendMessage(sender, {
                react: { text: "❤️", key: msg.key },
              });
            } catch (e) {
              // some Baileys versions may have different react API - fallback to sending emoji
              await sock.sendMessage(sender, { text: "❤️" });
            }
          }

          // Auto typing + recording when processing
          await sock.sendPresenceUpdate("composing", sender);

          // AI auto-reply: if contains "ai:" prefix then call AI provider
          if (text.startsWith("ai:")) {
            const prompt = msg.message.conversation.substring(3).trim();
            const aiReply = await callAI(prompt);
            await sock.sendMessage(sender, { text: `AI: ${aiReply}` });
            await sock.sendPresenceUpdate("paused", sender);
            continue;
          }

          // Simple keyword replies
          if (text.includes("hi") || text.includes("hello")) {
            await sock.sendMessage(sender, { text: `Hello! I'm KINGSLEY-XD OFFENSIVE BOT. Send "menu" to see commands.` });
          } else if (text === "menu" || text === "help") {
            await sock.sendMessage(sender, { text: menuText() });
          }

          // command-style messages starting with '!'
          if (text.startsWith("!apk ")) {
            const url = msg.message.conversation.split(" ")[1];
            if (url) {
              await sock.sendMessage(sender, { text: "Downloading APK..." });
              await sendUrlFile(sock, sender, url, "app.apk");
            } else {
              await sock.sendMessage(sender, { text: "Usage: !apk <direct-download-url>" });
            }
          }

          if (text.startsWith("!genimg ")) {
            const prompt = msg.message.conversation.substring(8).trim();
            await sock.sendMessage(sender, { text: "Generating image, please wait..." });
            const imgBuf = await generateImage(prompt);
            if (imgBuf) {
              await sock.sendMessage(sender, {
                image: imgBuf,
                caption: `Image for: ${prompt}`,
              });
            } else {
              await sock.sendMessage(sender, { text: "Image generation failed or API not configured." });
            }
          }

          if (text.startsWith("!ai ")) {
            const prompt = msg.message.conversation.substring(4).trim();
            const ai = await callAI(prompt);
            await sock.sendMessage(sender, { text: `AI Reply:\n${ai}` });
          }

          if (text === "!typing") {
            await sock.sendPresenceUpdate("composing", sender);
            await new Promise((r) => setTimeout(r, 3000));
            await sock.sendPresenceUpdate("paused", sender);
            await sock.sendMessage(sender, { text: "Done typing simulation." });
          }

          if (text === "!record") {
            await sock.sendPresenceUpdate("recording", sender);
            await new Promise((r) => setTimeout(r, 4000));
            await sock.sendPresenceUpdate("paused", sender);
            await sock.sendMessage(sender, { text: "Done voice-record simulation." });
          }
        }
      } catch (err) {
        logger.error(err);
      }
    }
  });

  // Anti-delete: listen to event where messages are deleted and re-post them
  // Baileys can emit 'messages.delete' depending on version. We'll listen generically.
  sock.ev.on("messages.delete", async (deletes) => {
    try {
      for (const d of deletes) {
        const id = d.id;
        const stored = messageStore.get(id);
        if (stored) {
          const chat = stored.key.remoteJid;
          const body = stored.message?.conversation || stored.message?.extendedTextMessage?.text || "<non-text message>";
          await sock.sendMessage(chat, { text: `Anti-delete: message by ${stored.key.participant || stored.key.remoteJid}\nContent: ${body}` });
        }
      }
    } catch (e) {
      logger.error("Anti-delete error", e);
    }
  });

  // Generic error logging
  sock.ev.on("error", (e) => logger.error("EVENT ERROR", e));

  return sock;
}

// Helper: send a file downloaded from a URL to a chat
async function sendUrlFile(sock, jid, url, filename = "file.dat") {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      await sock.sendMessage(jid, { text: `Failed to download: ${res.statusText}` });
      return;
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    await sock.sendMessage(jid, { document: buffer, fileName: filename, mimetype: res.headers.get("content-type") || "application/octet-stream" });
  } catch (e) {
    logger.error(e);
    await sock.sendMessage(jid, { text: `Error downloading file: ${e.message}` });
  }
}

// Simple image generation via Hugging Face inference (if configured)
async function generateImage(prompt) {
  try {
    const provider = (process.env.AI_PROVIDER || "huggingface").toLowerCase();
    if (provider === "huggingface" && process.env.HUGGINGFACE_API_KEY) {
      // using the "stabilityai/stable-diffusion" or other model (example). Adjust model name if required.
      const model = "stabilityai/stable-diffusion-2"; // may need a different model slug or use stability.ai endpoints
      const res = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.HUGGINGFACE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ inputs: prompt }),
      });
      if (!res.ok) return null;
      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        // Some HF endpoints return base64 in JSON
        const json = await res.json();
        if (json && json[0]?.image) {
          const buf = Buffer.from(json[0].image, "base64");
          return buf;
        }
        return null;
      } else {
        // binary image
        const arr = await res.arrayBuffer();
        return Buffer.from(arr);
      }
    } else {
      // No provider configured
      return null;
    }
  } catch (e) {
    logger.error("generateImage error", e);
    return null;
  }
}

// Simple AI text call using Hugging Face or OpenAI (free-tier options depend on provider)
async function callAI(prompt) {
  try {
    const provider = (process.env.AI_PROVIDER || "huggingface").toLowerCase();
    if (provider === "huggingface" && process.env.HUGGINGFACE_API_KEY) {
      const model = "gpt2"; // small model example; HF models vary and may be limited
      const res = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.HUGGINGFACE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ inputs: prompt }),
      });
      const json = await res.json();
      if (Array.isArray(json) && typeof json[0] === "string") return json[0];
      if (json && json.generated_text) return json.generated_text;
      return JSON.stringify(json);
    } else if (provider === "openai" && process.env.OPENAI_API_KEY) {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-3.5-turbo",
          messages: [{ role: "user", content: prompt }],
          max_tokens: 300,
        }),
      });
      const j = await res.json();
      return j?.choices?.[0]?.message?.content || JSON.stringify(j);
    } else {
      return "No AI API configured. Set HUGGINGFACE_API_KEY or OPENAI_API_KEY in .env";
    }
  } catch (e) {
    logger.error("callAI error", e);
    return `AI error: ${e.message}`;
  }
}

function menuText() {
  return `KINGSLEY-XD OFFENSIVE BOT - Menu
Commands:
- menu / help : show this menu
- ai: <prompt> or !ai <prompt> : AI reply (requires API)
- !genimg <prompt> : Generate image (Hugging Face configured)
- !apk <direct-url> : Download APK from a direct download URL and forward
- !typing : simulate typing
- !record : simulate voice recording presence
Auto features:
- Auto reply for hi/hello
- Auto react on "nice"
- Anti-delete: reposts deleted messages
`;
}

// Start server and bot
server.listen(PORT, async () => {
  logger.info(`HTTP server running on http://localhost:${PORT}`);
});

const sock = await startSock();

// Graceful exit
process.on("SIGINT", async () => {
  logger.info("Shutting down...");
  try {
    await writeFile("./last_shutdown_time.txt", new Date().toISOString());
  } catch {}
  process.exit(0);
});