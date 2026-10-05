const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const QRCode = require('qrcode');
const path = require('path');

const PORT = process.env.PORT || 3000;

const app = express();
const server = http.createServer(app);

// Limite a 100MB per gestire più file contemporaneamente
const wss = new WebSocket.Server({ server, maxPayload: 100 * 1024 * 1024 });

const rooms = new Map();

app.use(express.json({ limit: '100mb' }));

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
  <title>QuickPaste - Trasferimento Multiplo Sicuro</title>
  <link rel="manifest" href="/manifest.json">
  <meta name="theme-color" content="#2563eb">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="apple-mobile-web-app-title" content="QuickPaste">
  
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%232563eb' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M13 2L3 14h9l-1 8 10-12h-9l1-8z'/></svg>">
  
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background: #f1f5f9; margin: 0; padding: 20px; display: flex; justify-content: center; min-height: 100vh; box-sizing: border-box; }
    .card { background: #ffffff; max-width: 500px; width: 100%; padding: 28px; border-radius: 16px; box-shadow: 0 10px 25px -5px rgba(15, 23, 42, 0.08), 0 8px 10px -6px rgba(15, 23, 42, 0.04); text-align: center; margin: auto; }
    
    .brand-header { display: flex; align-items: center; justify-content: center; gap: 10px; margin-bottom: 6px; }
    .logo-icon { width: 38px; height: 38px; background: linear-gradient(135deg, #2563eb, #3b82f6); border-radius: 10px; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3); }
    .logo-icon svg { width: 22px; height: 22px; stroke: #ffffff; fill: none; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }
    h1 { margin: 0; color: #0f172a; font-size: 24px; font-weight: 700; letter-spacing: -0.5px; }
    
    .subtitle { color: #64748b; font-size: 14px; margin-top: 0; margin-bottom: 20px; }
    textarea { width: 100%; height: 95px; padding: 12px; border: 1px solid #cbd5e1; border-radius: 10px; box-sizing: border-box; font-size: 14px; margin-bottom: 14px; resize: vertical; font-family: inherit; transition: border-color 0.2s; }
    textarea:focus, input[type="text"]:focus { outline: none; border-color: #2563eb; }
    input[type="text"] { width: 100%; padding: 12px; font-size: 20px; text-align: center; border: 1px solid #cbd5e1; border-radius: 10px; box-sizing: border-box; letter-spacing: 6px; margin-bottom: 15px; font-weight: 600; font-family: monospace; }
    
    /* Area Drag & Drop */
    .drop-zone { border: 2px dashed #cbd5e1; border-radius: 10px; padding: 18px; text-align: center; background: #f8fafc; cursor: pointer; transition: background 0.2s, border-color 0.2s; margin-bottom: 15px; }
    .drop-zone.dragover { background: #eff6ff; border-color: #2563eb; }
    .drop-zone p { margin: 0; font-size: 13px; color: #64748b; font-weight: 500; pointer-events: none; }
    
    button { width: 100%; background: #2563eb; color: white; border: none; padding: 13px; font-size: 15px; font-weight: 600; border-radius: 10px; cursor: pointer; transition: background 0.2s, transform 0.1s; margin-top: 5px; }
    button:hover { background: #1d4ed8; }
    button:active { transform: scale(0.99); }
    .code-display { font-size: 34px; font-weight: 800; letter-spacing: 6px; color: #2563eb; margin: 10px 0 5px 0; font-family: monospace; }
    .hidden { display: none; }
    .divider { margin: 24px 0; border-top: 1px solid #e2e8f0; position: relative; }
    .divider span { position: absolute; top: -10px; background: white; padding: 0 12px; left: 50%; transform: translateX(-50%); color: #94a3b8; font-size: 12px; font-weight: 600; letter-spacing: 0.5px; }
    #qrcode img { margin: 15px auto; display: block; border-radius: 10px; box-shadow: 0 4px 12px rgba(0,0,0,0.08); }
    .url-hint { font-size: 12px; color: #64748b; word-break: break-all; margin-top: 5px; display: flex; align-items: center; justify-content: center; gap: 8px; }
    
    /* Gestione Anteprima e Lista File */
    .file-item { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 12px; margin-bottom: 8px; text-align: left; display: flex; justify-content: space-between; align-items: center; font-size: 13px; color: #334155; gap: 10px; }
    .file-preview { width: 48px; height: 48px; border-radius: 6px; object-fit: cover; border: 1px solid #cbd5e1; background: #e2e8f0; flex-shrink: 0; }
    .file-info { flex-grow: 1; overflow: hidden; text-overflow: ellipsis; }
    .download-btn { background: #059669; text-decoration: none; color: white; padding: 8px 12px; border-radius: 6px; font-weight: 600; font-size: 12px; display: inline-block; white-space: nowrap; border: none; cursor: pointer; }
    .download-all-btn { background: #0284c7; color: white; border: none; padding: 10px; font-size: 13px; font-weight: 600; border-radius: 8px; cursor: pointer; margin-bottom: 12px; width: 100%; }
    
    /* Countdown Timer */
    .timer-badge { display: inline-block; background: #fef3c7; color: #92400e; font-size: 12px; font-weight: 700; padding: 4px 10px; border-radius: 20px; margin-bottom: 10px; }

    .privacy-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px; margin-top: 25px; text-align: left; font-size: 12px; color: #475569; line-height: 1.5; }
    .privacy-card h3 { margin-top: 0; font-size: 13px; color: #0f172a; display: flex; align-items: center; gap: 6px; font-weight: 700; }
    .privacy-card ul { padding-left: 18px; margin: 8px 0; }
    .privacy-card li { margin-bottom: 6px; }
    .disclaimer { background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; padding: 10px; border-radius: 8px; margin-top: 12px; font-size: 11px; }
    
    .btn-secondary { background: #e2e8f0; color: #334155; padding: 4px 8px; border-radius: 6px; font-size: 11px; font-weight: 600; border: none; cursor: pointer; margin-left: 5px; }
    .btn-secondary:hover { background: #cbd5e1; }
  </style>
</head>
<body>
  <div class="card">
    
    <div class="brand-header">
      <div class="logo-icon">
        <svg viewBox="0 0 24 24">
          <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
        </svg>
      </div>
      <h1>QuickPaste</h1>
    </div>
    <p class="subtitle">Trasferimento dati ultra-veloce e privato</p>

    <!-- INVIA -->
    <div id="send-section">
      <textarea id="text-input" placeholder="Incolla qui testo, link o note..."></textarea>
      
      <div style="text-align: left; margin-bottom: 5px;">
        <label style="font-size: 12px; font-weight: 600; color: #475569; text-transform: uppercase; letter-spacing: 0.5px;">Seleziona Foto / File (Multipli):</label>
      </div>

      <!-- Area Drag & Drop e Input File -->
      <div class="drop-zone" id="drop-zone" onclick="document.getElementById('file-input').click()">
        <p id="drop-zone-text">📁 Trascina qui i tuoi file oppure <span style="color: #2563eb; text-decoration: underline;">sfoglia</span></p>
      </div>
      <input type="file" id="file-input" multiple style="display: none;" onchange="updateFileLabel()" />

      <button onclick="createRoom()">Genera Codice di Trasferimento</button>
    </div>

    <div id="result-section" class="hidden">
      <div id="countdown" class="timer-badge">⏱️ Scade tra: 05:00</div>
      <p style="margin-bottom: 5px; font-size: 14px; color: #475569;">Inserisci questo codice o inquadra il QR Code:</p>
      <div id="room-code" class="code-display">----</div>
      <div id="qrcode"></div>
      <div class="url-hint">
        <span id="direct-link-text"></span>
        <button class="btn-secondary" onclick="copyLink()">📋 Copia Link</button>
      </div>
      <p style="color: #059669; font-size: 14px; font-weight: 600; margin-top: 15px;" id="status-msg">In attesa del dispositivo ricevente...</p>
    </div>

    <div class="divider"><span>OPPURE RICEVI</span></div>

    <!-- RICEVI -->
    <div id="receive-section">
      <input type="text" id="code-input" maxlength="4" placeholder="0000" />
      <button onclick="joinRoom()" style="background: #10b981;">Ricevi Contenuto</button>
    </div>

    <div id="received-content" class="hidden" style="margin-top: 20px;">
      <!-- Sezione Testo Ricevuto -->
      <div id="received-text-box" class="hidden" style="margin-bottom: 15px;">
        <textarea id="received-text" readonly></textarea>
        <div style="display: flex; gap: 8px;">
          <button onclick="copyToClipboard()" style="background: #475569; flex: 1;">Copia negli appunti</button>
          <a id="open-link-btn" href="#" target="_blank" class="hidden" style="background: #2563eb; color: white; text-decoration: none; padding: 13px; font-size: 15px; font-weight: 600; border-radius: 10px; text-align: center; flex: 1;">🔗 Apri Link</a>
        </div>
      </div>

      <!-- Lista File Ricevuti -->
      <div id="received-files-box" class="hidden">
        <button id="download-all-btn" class="download-all-btn" onclick="downloadAllFiles()">💾 Scarica Tutti i File</button>
        <div id="files-list"></div>
      </div>
    </div>

    <!-- PRIVACY E NOTE -->
    <div class="privacy-card">
      <h3>🔒 Privacy e Sicurezza</h3>
      <ul>
        <li><strong>Memoria volatile:</strong> Dati e file rimangono temporaneamente nella RAM e vengono <strong>distrutti subito</strong> dopo il download o allo scadere di 5 minuti.</li>
        <li><strong>Protezione PIN:</strong> Il contenuto è accessibile solo a chi dispone del PIN di 4 cifre o scansiona il QR Code.</li>
        <li><strong>Nessun Tracciamento:</strong> Nessun file viene salvato su disco né associato al tuo profilo.</li>
      </ul>
      <div class="disclaimer">
        ⚠️ <strong>Note di Responsabilità:</strong> Il servizio viene fornito "così com'è". L'utente è responsabile del salvataggio dei propri dati prima della scadenza del timer o della chiusura della sessione.
      </div>
    </div>

  </div>

  <script>
    let ws;
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    let generatedTargetUrl = '';
    let countdownInterval = null;
    let receivedFiles = [];
    let selectedFilesArray = []; // Memorizza i file sia da click che da Drag&Drop

    window.onload = () => {
      const urlParams = new URLSearchParams(window.location.search);
      const codeParam = urlParams.get('code');
      if (codeParam) {
        document.getElementById('code-input').value = codeParam;
        joinRoom();
      }
      setupDragAndDropGlobal();
    };

    // Blocco completo dell'apertura file su tutto il browser
    function setupDragAndDropGlobal() {
      const dropZone = document.getElementById('drop-zone');

      // Blocca il comportamento di default su tutto il window per drag&drop
      ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        window.addEventListener(eventName, (e) => {
          e.preventDefault();
          e.stopPropagation();
        }, false);
      });

      dropZone.addEventListener('dragenter', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.add('dragover');
      });

      dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.add('dragover');
      });

      dropZone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.remove('dragover');
      });

      dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.remove('dragover');

        if (e.dataTransfer && e.dataTransfer.files.length > 0) {
          selectedFilesArray = Array.from(e.dataTransfer.files);
          updateFileLabelText(selectedFilesArray.length);
        }
      });
    }

    function updateFileLabel() {
      const input = document.getElementById('file-input');
      if (input.files.length > 0) {
        selectedFilesArray = Array.from(input.files);
        updateFileLabelText(selectedFilesArray.length);
      } else {
        selectedFilesArray = [];
        updateFileLabelText(0);
      }
    }

    function updateFileLabelText(count) {
      const text = document.getElementById('drop-zone-text');
      if (count > 0) {
        text.innerHTML = '✅ <strong>' + count + ' file</strong> selezionati';
      } else {
        text.innerHTML = '📁 Trascina qui i tuoi file oppure <span style="color: #2563eb; text-decoration: underline;">sfoglia</span>';
      }
    }

    // Suono e Vibrazione di conferma
    function triggerFeedback() {
      if ('vibrate' in navigator) {
        navigator.vibrate([100, 50, 100]);
      }
      try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.frequency.value = 587.33; // Nota D5
        gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.15);
      } catch (e) {
        // AudioContext non supportato o bloccato
      }
    }

    // Countdown 5 minuti
    function startCountdown() {
      let duration = 300;
      const display = document.getElementById('countdown');
      clearInterval(countdownInterval);
      countdownInterval = setInterval(() => {
        const minutes = Math.floor(duration / 60);
        const seconds = duration % 60;
        const minStr = minutes < 10 ? '0' + minutes : minutes;
        const secStr = seconds < 10 ? '0' + seconds : seconds;
        display.innerText = '⏱️ Scade tra: ' + minStr + ':' + secStr;
        if (--duration < 0) {
          clearInterval(countdownInterval);
          display.innerText = '❌ Codice Scaduto';
          display.style.background = '#fef2f2';
          display.style.color = '#991b1b';
        }
      }, 1000);
    }

    async function createRoom() {
      const text = document.getElementById('text-input').value.trim();

      if (!text && selectedFilesArray.length === 0) {
        return alert('Inserisci del testo oppure seleziona almeno un file/foto!');
      }

      let payloadData = {
        text: text || null,
        files: []
      };

      try {
        if (selectedFilesArray.length > 0) {
          for (let i = 0; i < selectedFilesArray.length; i++) {
            const file = selectedFilesArray[i];
            const arrayBuffer = await file.arrayBuffer();
            const base64 = arrayBufferToBase64(arrayBuffer);
            payloadData.files.push({
              fileName: file.name,
              fileType: file.type || 'application/octet-stream',
              fileSize: file.size,
              fileData: base64
            });
          }
        }
      } catch (err) {
        console.error('Errore nella lettura dei file:', err);
        return alert('Errore nella lettura dei file: ' + err.message);
      }

      ws = new WebSocket(protocol + '//' + location.host);

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'CREATED') {
          document.getElementById('send-section').classList.add('hidden');
          document.getElementById('result-section').classList.remove('hidden');
          document.getElementById('room-code').innerText = data.code;
          document.getElementById('qrcode').innerHTML = '<img src="' + data.qr + '" width="180" height="180" />';
          
          generatedTargetUrl = data.targetUrl;
          document.getElementById('direct-link-text').innerText = 'Link: ' + data.targetUrl.replace(/^https?:\\/\\//, '');
          startCountdown();
        } else if (data.type === 'CONNECTED') {
          document.getElementById('status-msg').innerText = '✅ Dispositivo connesso! Trasferimento completato.';
          triggerFeedback();
        }
      };

      ws.onerror = (err) => {
        console.error('WebSocket error:', err);
        alert('Errore di connessione. Riprova.');
      };

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'CREATE', payload: payloadData }));
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
          triggerFeedback();
          document.getElementById('receive-section').classList.add('hidden');
          document.getElementById('received-content').classList.remove('hidden');

          const payload = data.payload;

          // Gestione Testo e Riconoscimento Link
          if (payload.text) {
            document.getElementById('received-text-box').classList.remove('hidden');
            document.getElementById('received-text').value = payload.text;

            if (payload.text.startsWith('http://') || payload.text.startsWith('https://')) {
              const openBtn = document.getElementById('open-link-btn');
              openBtn.href = payload.text;
              openBtn.classList.remove('hidden');
            }
          }

          // Gestione File Multipli e Anteprime Media
          if (payload.files && payload.files.length > 0) {
            receivedFiles = payload.files;
            const filesBox = document.getElementById('received-files-box');
            const filesList = document.getElementById('files-list');
            filesBox.classList.remove('hidden');
            filesList.innerHTML = '';

            payload.files.forEach((fileObj, index) => {
              const blob = base64ToBlob(fileObj.fileData, fileObj.fileType);
              const blobUrl = URL.createObjectURL(blob);
              fileObj.blobUrl = blobUrl;

              // Riconoscimento e creazione anteprima media (immagini/video)
              let previewHtml = '<div class="file-preview" style="display:flex;align-items:center;justify-content:center;font-size:20px;">📄</div>';
              if (fileObj.fileType.startsWith('image/')) {
                previewHtml = '<img src="' + blobUrl + '" class="file-preview" alt="preview" />';
              } else if (fileObj.fileType.startsWith('video/')) {
                previewHtml = '<video src="' + blobUrl + '" class="file-preview"></video>';
              }

              const itemDiv = document.createElement('div');
              itemDiv.className = 'file-item';
              itemDiv.innerHTML = previewHtml +
                '<div class="file-info">' +
                  '<strong>' + fileObj.fileName + '</strong><br>' +
                  '<span style="color: #64748b; font-size: 11px;">' + formatBytes(blob.size) + '</span>' +
                  '<div id="status-' + index + '" style="color: #059669; font-size: 11px; font-weight: bold; margin-top: 3px; display: none;">✅ Salvato nei download!</div>' +
                '</div>' +
                '<a href="' + blobUrl + '" download="' + fileObj.fileName + '" id="dl-btn-' + index + '" class="download-btn" onclick="handleDownload(this, \'status-' + index + '\')">💾 Scarica</a>';
              
              filesList.appendChild(itemDiv);
            });
          }
        } else if (data.type === 'ERROR') {
          alert(data.message);
        }
      };
    }

    // Scarica Tutti i file in sequenza
    function downloadAllFiles() {
      receivedFiles.forEach((fileObj, index) => {
        setTimeout(() => {
          const btn = document.getElementById('dl-btn-' + index);
          if (btn) btn.click();
        }, index * 400);
      });
    }

    function handleDownload(element, statusId) {
      element.innerText = '✅ Scaricato';
      element.style.background = '#0284c7';
      
      const statusEl = document.getElementById(statusId);
      if (statusEl) {
        statusEl.style.display = 'block';
      }
    }

    function copyLink() {
      if (generatedTargetUrl) {
        navigator.clipboard.writeText(generatedTargetUrl);
        alert('Link copiato negli appunti!');
      }
    }

    function arrayBufferToBase64(buffer) {
      let binary = '';
      const bytes = new Uint8Array(buffer);
      const len = bytes.byteLength;
      const chunkSize = 0x8000;
      for (let i = 0; i < len; i += chunkSize) {
        const chunk = bytes.subarray(i, Math.min(i + chunkSize, len));
        binary += String.fromCharCode.apply(null, chunk);
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

  ws.onclose = () => {
    if (currentRoom && rooms.has(currentRoom)) {
      clearTimeout(rooms.get(currentRoom).timer);
      rooms.delete(currentRoom);
    }
  };
});

server.listen(PORT, () => {
  console.log(`Server attivo sulla porta ${PORT}`);
});
