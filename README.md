# KINGSLEY-XD OFFENSIVE BOT

A Baileys-based WhatsApp bot with pairing website, designed to run on Android (Termux) or any Node.js environment.

Features
- Pair via QR / pairing website
- Auto replies, auto react, auto typing, auto voice record presence
- Anti-delete: re-posts deleted messages
- APK downloader: accepts a direct download URL and forwards the APK to chat
- Image generation using configurable AI providers (Hugging Face recommended)
- Simple AI text replies (configurable)
- Bot menu and commands
- Uses: @adiwajshing/baileys, qrcode-terminal, pino, express, ws
- Does NOT use axios, colors, or fs-extra

Files included
- bot.js — main bot file
- public/pairing.html — pairing website to scan QR from WhatsApp
- package.json, .env.example, gitignore 
