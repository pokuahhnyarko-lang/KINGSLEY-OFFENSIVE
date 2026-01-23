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
- package.json, .env.example, .gitignore

Pairing website HTML (this exact code is included in public/pairing.html)
```html
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Pair KINGSLEY-XD OFFENSIVE BOT</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 1rem; background: #f5f7fb; color:#222 }
    .qr { margin-top: 1rem; }
    pre { white-space: pre-wrap; word-break: break-word; background:#fff;padding:1rem;border-radius:6px; }
  </style>
</head>
<body>
  <h2>Pair KINGSLEY-XD OFFENSIVE BOT</h2>
  <p>Scan the QR code from your WhatsApp (use WhatsApp -> Linked Devices -> Link a Device).</p>
  <div id="qrContainer" class="qr">Waiting for QR...</div>
  <h3>Status</h3>
  <div id="status">connecting...</div>
  <script>
    const wsProtocol = (location.protocol === "https:") ? "wss" : "ws";
    const wsUrl = wsProtocol + "://" + location.host;
    const ws = new WebSocket(wsUrl);
    const qrContainer = document.getElementById("qrContainer");
    const status = document.getElementById("status");

    ws.addEventListener("open", () => {
      status.innerText = "Connected to bot server (ready to receive QR).";
    });

    ws.addEventListener("message", (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === "qr") {
          // msg.data is the raw QR string
          // show as text and as ASCII QR using canvas or external lib; for simplicity show text and link to google chart
          qrContainer.innerHTML = "";
          const pre = document.createElement("pre");
          pre.textContent = msg.data;
          qrContainer.appendChild(pre);
          // Create link to google charts API to render QR image
          const url = "https://chart.googleapis.com/chart?cht=qr&chs=300x300&chl=" + encodeURIComponent(msg.data);
          const img = document.createElement("img");
          img.src = url;
          img.alt = "QR Code";
          img.style.display = "block";
          img.style.marginTop = "0.5rem";
          qrContainer.appendChild(img);
        } else if (msg.type === "status") {
          status.innerText = msg.data;
        }
      } catch (e) {
        console.error(e);
      }
    });

    ws.addEventListener("close", () => {
      status.innerText = "WebSocket disconnected.";
    });
  </script>
</body>
</html>
