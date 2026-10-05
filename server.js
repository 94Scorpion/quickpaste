const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const QRCode = require('qrcode');
const path = require('path');

const PORT = process.env.PORT || 3000;

const app = express();
const server = http.createServer(app);

// Limite a 50MB per gestire immagini ad alta risoluzione
const wss = new WebSocket.Server({ server, maxPayload: 50 * 1024 * 1024 });

const rooms = new Map();

app.use(express.json({ limit: '50mb' }));

app.get('/manifest.json', (req, res) => {
  res.sendFile(path.join(__dirname, 'manifest.json'));
});

app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>QuickPaste - Trasferimento Sicuro & Privato</title>
  <link rel="manifest" href="/manifest.json">
  <meta name="theme-color" content="#2563eb">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="apple-mobile-web-app-title" content="QuickPaste">
  <link rel="apple-touch-icon" href="https://cdn-icons-png.flaticon.com/512/93/93634.png">
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; background: #f4f6f8; margin: 0; padding: 20px; display: flex; justify-content: center; }
    .card { background: white; max-width: 520px; width: 100%; padding: 25px; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.08); text-align: center; }
    h1 { margin-top: 0; color: #111827; font-size: 24px; }
    textarea { width: 100%; height: 100px; padding: 10px; border: 1px solid #d1d5db; border-radius: 8px; box-sizing: border-box; font-size: 15px; margin-bottom: 12px; resize: vertical; }
    input[type="text"] { width: 100%; padding: 12px; font-size: 18px; text-align: center; border: 1px solid #d1d5db; border-radius: 8px; box-sizing: border-box; letter-spacing: 4px; margin-bottom: 15px; }
    input[type="file"] { margin-bottom: 15px; width: 100%; font-size: 14px; }
    button { width: 100%; background: #2563eb; color: white; border: none; padding: 12px; font-size: 16px; font-weight: 600; border-radius: 8px; cursor: pointer; transition: background 0.2s; margin-top: 5px; }
    button:hover { background: #1d4ed8; }
    .code-display { font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #2563eb; margin: 15px 0; }
    .hidden { display: none; }
    .divider { margin: 25px 0; border-top: 1px solid #e5e7eb; position: relative; }
    .divider span { position: absolute; top: -10px; background: white; padding: 0 10px; left: 50%; transform: translateX(-50%); color: #6b7280; font-size: 13px; }
    #qrcode img { margin: 15px auto; display: block; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .url-hint { font-size: 12px; color: #6b7280; word-break: break-all; margin-top: 5px; }
    .download-btn { background: #059669; text-decoration: none; color: white; display: block; padding: 14px; border-radius: 8px; font-weight: 700; margin-top: 15px; font-size: 16px; }
    .info-box { background: #f3f4f6; border-radius: 8px; padding: 12px; margin-top: 10px; text-align: left; font-size: 13px; color: #374151; }
    
    /* Stili Sezione Privacy e Note Legali */
    .privacy-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 15px; margin-top: 25px; text-align: left; font-size: 12px; color: #475569; line-height: 1.5; }
    .privacy-card h3 { margin-top: 0; font-size: 14px; color: #1e293b; display: flex; align-items: center; gap: 6px; }
    .privacy-card ul { padding-left: 18px; margin: 8px 0; }
    .privacy-card li { margin-bottom: 6px; }
    .disclaimer { background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; padding: 10px; border-radius: 6px; margin-top: 10px; font-weight: 500; }
  </style>
</head>
<body>
  <div class="card">
    <h1>🚀 QuickPaste Transfer</h1>
    <p style="color: #6b7280; font-size: 14px; margin-top: -8px;">Trasferimento diretto, temporaneo e in alta qualità.</p>

    <!-- INVIA -->
    <div id="send-section">
      <textarea id="text-input" placeholder="Incolla qui il testo o un link..."></textarea>
      
      <div style="text-align: left; margin-bottom: 10px;">
        <label style="font-size: 13px; font-weight: 600; color: #374151;">Seleziona File / Foto Originale:</label>
        <input type="file" id="file-input" />
      </div>

      <button onclick="createRoom()">Genera Codice di Trasferimento</button>
    </div>

    <div id="result-section" class="hidden">
      <p style="margin-bottom: 5px;">Inserisci questo codice o inquadra il QR Code sull'altro dispositivo:</p>
      <div id="room-code" class="code-display">----</div>
      <div id="qrcode"></div>
      <div id="direct-link" class="url-hint"></div>
      <p style="color: #059669; font-size: 14px; font-weight: 600; margin-top: 15px;" id="status-msg">In attesa della connessione dell'altro dispositivo...</p>
    </div>

    <div class="divider"><span>OPPURE RICEVI</span></div>

    <!-- RICEVI -->
    <div id="receive-section">
      <input type="text" id="code-input" maxlength="4" placeholder="0000" />
      <button onclick="joinRoom()" style="background: #10b981;">Ricevi Contenuto</button>
    </div>

    <div id="received-content" class="hidden" style="margin-top: 20px;">
      <div id="received-text-box" class="hidden">
        <textarea id="received-text" readonly></textarea>
        <button onclick="copyToClipboard()" style="background: #4b5563;">Copia negli appunti</button>
      </div>

      <div id="received-file-box" class="hidden">
        <div class="info-box" id="file-info"></div>
        <a id="download-link" class="download-btn" download>💾 Scarica File Originale</a>
      </div>
    </div>

    <!-- SEZIONE PRIVACY E DISCLAIMER -->
    <div class="privacy-card">
      <h3>🔒 Privacy e Sicurezza dei Dati</h3>
      <ul>
        <li><strong>Nessun salvataggio:</strong> I file e i testi inviati non vengono salvati su disco o database. Risiedono temporaneamente nella memoria volatile (RAM) e vengono <strong>eliminati istantaneamente</strong> non appena completato il download o scadtuti i 5 minuti.</li>
        <li><strong>Accesso Riservato:</strong> I dati sono raggiungibili <strong>esclusivamente</strong> da chi possiede il PIN univoco a 4 cifre o scansiona il QR Code generato. Nessun altro utente o sistema esterno può consultarli.</li>
        <li><strong>Condivisione responsabile:</strong> Presta attenzione a chi fornisci il codice o il link di trasferimento.</li>
      </ul>
      <div class="disclaimer">
        ⚠️ <strong>Note di Responsabilità:</strong> Il servizio viene fornito "così com'è". L'utente si assume la piena responsabilità di conservare e salvare i propri dati. Se il destinatario non effettua il download prima dell'eliminazione del file o dello scadere del timer, il contenuto andrà perso definitivamente.
      </div>
    </div>

  </div>

  <script>
    let ws;
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';

    window.onload = () => {
      const urlParams = new URLSearchParams(window.location.search);
      const codeParam = urlParams.get('code');
      if (codeParam) {
        document.getElementById('code-input').value = codeParam;
        joinRoom();
      }
    };

    async function createRoom() {
      const text = document.getElementById('text-input').value.trim();
      const fileInput = document.getElementById('file-input');
      const file = fileInput.files[0];

      if (!text && !file) {
        return alert('Inserisci del testo oppure seleziona un file/foto!');
      }

      let payloadData = null;

      if (file) {
        const arrayBuffer = await file.arrayBuffer();
        const base64 = arrayBufferToBase64(arrayBuffer);
        payloadData = {
          type: 'FILE',
          fileName: file.name,
          fileType: file.type || 'application/octet-stream',
          fileSize: file.size,
          fileData: base64
        };
      } else {
        payloadData = {
          type: 'TEXT',
          content: text
        };
      }

      ws = new WebSocket(protocol + '//' + location.host);
      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'CREATE', payload: payloadData }));
      };

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'CREATED') {
          document.getElementById('send-section').classList.add('hidden');
          document.getElementById('result-section').classList.remove('hidden');
          document.getElementById('room-code').innerText = data.code;
          document.getElementById('qrcode').innerHTML = '<img src="' + data.qr + '" width="180" height="180" />';
          document.getElementById('direct-link').innerText = 'Link diretto: ' + data.targetUrl;
        } else if (data.type === 'CONNECTED') {
          document.getElementById('status-msg').innerText = '✅ Dispositivo connesso! File inviato.';
        }
      };
    }

    function joinRoom() {
      const code = document.getElementById('code-input').value.trim();
      if (code.length !== 4) return alert('Inserisci un codice valido di 4 cifre.');

      ws = new WebSocket(protocol + '//' + location.host);
      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'JOIN', code: code }));
      };

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'PAYLOAD') {
          document.getElementById('receive-section').classList.add('hidden');
          document.getElementById('received-content').classList.remove('hidden');

          const payload = data.payload;

          if (payload.type === 'TEXT') {
            document.getElementById('received-text-box').classList.remove('hidden');
            document.getElementById('received-text').value = payload.content;
          } else if (payload.type === 'FILE') {
            document.getElementById('received-file-box').classList.remove('hidden');
            
            const blob = base64ToBlob(payload.fileData, payload.fileType);
            const blobUrl = URL.createObjectURL(blob);

            document.getElementById('file-info').innerHTML = \`
              <strong>Nome File:</strong> \${payload.fileName}<br>
              <strong>Dimensione:</strong> \${formatBytes(blob.size)}<br>
              <strong>Tipo:</strong> \${payload.fileType || 'Generico'}
            \`;

            const downloadBtn = document.getElementById('download-link');
            downloadBtn.href = blobUrl;
            downloadBtn.download = payload.fileName;
          }
        } else if (data.type === 'ERROR') {
          alert(data.message);
        }
      };
    }

    function arrayBufferToBase64(buffer) {
      let binary = '';
      const bytes = new Uint8Array(buffer);
      const len = bytes.byteLength;
      for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      return window.btoa(binary);
    }

    function base64ToBlob(base64, type) {
      const binaryString = window.atob(base64);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return new Blob([bytes], { type: type });
    }

    function formatBytes(bytes) {
      if (bytes === 0) return '0 Bytes';
      const k = 1024;
      const sizes = ['Bytes', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    function copyToClipboard() {
      const copyText = document.getElementById('received-text');
      copyText.select();
      navigator.clipboard.writeText(copyText.value);
      alert('Testo copiato negli appunti!');
    }
  </script>
</body>
</html>
  `);
});

wss.on('connection', (ws, req) => {
  let currentRoom = null;

  const host = req.headers.host;
  const protocol = req.headers['x-forwarded-proto'] || 'http';
  const currentPublicUrl = `${protocol}://${host}`;

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);

      if (data.type === 'CREATE') {
        const code = Math.floor(1000 + Math.random() * 9000).toString();
        
        const targetUrl = `${currentPublicUrl}?code=${code}`;
        const qrUrl = await QRCode.toDataURL(targetUrl);
        
        rooms.set(code, {
          payload: data.payload,
          senderWs: ws,
          timer: setTimeout(() => rooms.delete(code), 300000)
        });

        currentRoom = code;
        ws.send(JSON.stringify({ type: 'CREATED', code, qr: qrUrl, targetUrl }));
      } 
      
      else if (data.type === 'JOIN') {
        const room = rooms.get(data.code);
        if (room) {
          ws.send(JSON.stringify({ type: 'PAYLOAD', payload: room.payload }));
          if (room.senderWs.readyState === WebSocket.OPEN) {
            room.senderWs.send(JSON.stringify({ type: 'CONNECTED' }));
          }
          clearTimeout(room.timer);
          rooms.delete(data.code);
        } else {
          ws.send(JSON.stringify({ type: 'ERROR', message: 'Codice errato o scaduto.' }));
        }
      }
    } catch (e) {
      console.error(e);
    }
  });

  ws.on('close', () => {
    if (currentRoom && rooms.has(currentRoom)) {
      clearTimeout(rooms.get(currentRoom).timer);
      rooms.delete(currentRoom);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server attivo sulla porta ${PORT}`);
});
