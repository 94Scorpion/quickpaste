const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const QRCode = require('qrcode');
const path = require('path');
const crypto = require('crypto');

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
  
  <script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>
  
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background: #f1f5f9; margin: 0; padding: 20px; display: flex; justify-content: center; min-height: 100vh; box-sizing: border-box; }
    .card { background: #ffffff; max-width: 500px; width: 100%; padding: 28px; border-radius: 16px; box-shadow: 0 10px 25px -5px rgba(15, 23, 42, 0.08), 0 8px 10px -6px rgba(15, 23, 42, 0.04); text-align: center; margin: auto; }
    
    .brand-header { display: flex; align-items: center; justify-content: center; gap: 10px; margin-bottom: 6px; }
    .logo-icon { width: 38px; height: 38px; background: linear-gradient(135deg, #2563eb, #3b82f6); border-radius: 10px; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3); }
    .logo-icon svg { width: 22px; height: 22px; stroke: #ffffff; fill: none; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }
    h1 { margin: 0; color: #0f172a; font-size: 24px; font-weight: 700; letter-spacing: -0.5px; }
    
    .subtitle { color: #64748b; font-size: 14px; margin-top: 0; margin-bottom: 20px; }
    textarea { width: 100%; height: 95px; padding: 12px; border: 1px solid #cbd5e1; border-radius: 10px; box-sizing: border-box; font-size: 14px; margin-bottom: 14px; resize: vertical; font-family: inherit; transition: border-color 0.2s; }
    textarea:focus, input[type="text"]:focus, select:focus { outline: none; border-color: #2563eb; }
    input[type="text"] { width: 100%; padding: 12px; font-size: 20px; text-align: center; border: 1px solid #cbd5e1; border-radius: 10px; box-sizing: border-box; letter-spacing: 6px; margin-bottom: 15px; font-weight: 600; font-family: monospace; }
    select { width: 100%; padding: 12px; font-size: 14px; border: 1px solid #cbd5e1; border-radius: 10px; box-sizing: border-box; margin-bottom: 15px; background: #ffffff; color: #334155; font-family: inherit; cursor: pointer; appearance: none; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 12px center; background-size: 16px; padding-right: 36px; transition: border-color 0.2s; }
    
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
    .download-zip-btn { background: #7c3aed; color: white; border: none; padding: 10px; font-size: 13px; font-weight: 600; border-radius: 8px; cursor: pointer; margin-bottom: 12px; width: 100%; }
    .download-zip-btn:hover { background: #6d28d9; }
    
    /* Countdown Timer */
    .timer-badge { display: inline-block; background: #fef3c7; color: #92400e; font-size: 12px; font-weight: 700; padding: 4px 10px; border-radius: 20px; margin-bottom: 10px; }

    .privacy-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px; margin-top: 25px; text-align: left; font-size: 12px; color: #475569; line-height: 1.5; }
    .privacy-card h3 { margin-top: 0; font-size: 13px; color: #0f172a; display: flex; align-items: center; gap: 6px; font-weight: 700; }
    .privacy-card ul { padding-left: 18px; margin: 8px 0; }
    .privacy-card li { margin-bottom: 6px; }
    .disclaimer { background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; padding: 10px; border-radius: 8px; margin-top: 12px; font-size: 11px; }
    
    .btn-secondary { background: #e2e8f0; color: #334155; padding: 4px 8px; border-radius: 6px; font-size: 11px; font-weight: 600; border: none; cursor: pointer; margin-left: 5px; }
    .btn-secondary:hover { background: #cbd5e1; }

    /* Overlay di caricamento */
    #loading-overlay {
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(15, 23, 42, 0.78);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      z-index: 9999;
      color: white;
      padding: 20px;
      text-align: center;
      box-sizing: border-box;
      backdrop-filter: blur(2px);
    }
    #loading-overlay.hidden { display: none; }
    .spinner {
      width: 56px;
      height: 56px;
      border: 5px solid rgba(255,255,255,0.2);
      border-top-color: #3b82f6;
      border-radius: 50%;
      animation: qp-spin 0.9s linear infinite;
      margin-bottom: 18px;
    }
    @keyframes qp-spin { to { transform: rotate(360deg); } }
    #loading-text { font-size: 16px; font-weight: 700; margin-bottom: 6px; }
    #loading-subtext { font-size: 12px; color: #cbd5e1; max-width: 340px; line-height: 1.5; }
    #loading-progress {
      width: 260px;
      max-width: 80vw;
      height: 6px;
      background: rgba(255,255,255,0.15);
      border-radius: 4px;
      margin-top: 18px;
      overflow: hidden;
    }
    #loading-progress-bar {
      height: 100%;
      width: 0%;
      background: linear-gradient(90deg, #2563eb, #3b82f6);
      transition: width 0.3s ease;
    }
    #cancel-loading-btn {
      margin-top: 20px;
      background: #ef4444;
      max-width: 200px;
    }
    #cancel-loading-btn:hover { background: #dc2626; }

    /* Log download mittente */
    #download-log {
      margin-top: 12px;
      text-align: left;
      font-size: 12px;
      color: #059669;
      max-height: 150px;
      overflow-y: auto;
      padding: 8px;
      background: #f0fdf4;
      border: 1px solid #bbf7d0;
      border-radius: 8px;
      line-height: 1.5;
    }
    #download-log:empty { display: none; }
    #download-log .dl-entry { margin-bottom: 4px; }

    /* Banner stato riconnessione */
    #reconnect-banner {
      background: #dbeafe;
      border: 1px solid #93c5fd;
      color: #1e40af;
      padding: 8px 12px;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 600;
      margin-bottom: 12px;
      text-align: center;
    }
    #reconnect-banner.hidden { display: none; }
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
      <textarea id="text-input" placeholder="Incolla qui testo, link o note..." oninput="updateCharCounter()" maxlength="100000"></textarea>
      <div id="char-counter" style="font-size: 11px; color: #94a3b8; text-align: right; margin-top: -8px; margin-bottom: 10px;">0 / 100000 caratteri</div>
      
      <div style="text-align: left; margin-bottom: 5px;">
        <label style="font-size: 12px; font-weight: 600; color: #475569; text-transform: uppercase; letter-spacing: 0.5px;">Seleziona Foto / File (Multipli):</label>
      </div>

      <!-- Area Drag & Drop e Input File -->
      <div class="drop-zone" id="drop-zone" onclick="document.getElementById('file-input').click()">
        <p id="drop-zone-text">📁 Trascina qui i tuoi file oppure <span style="color: #2563eb; text-decoration: underline;">sfoglia</span></p>
      </div>
      <input type="file" id="file-input" multiple style="display: none;" onchange="updateFileLabel()" />

      <!-- Selettore tempo di scadenza -->
      <div style="text-align: left; margin-bottom: 5px;">
        <label style="font-size: 12px; font-weight: 600; color: #475569; text-transform: uppercase; letter-spacing: 0.5px;">Tempo di scadenza:</label>
      </div>
      <select id="expiry-select">
        <option value="5" selected>5 minuti (predefinito)</option>
        <option value="15">15 minuti</option>
        <option value="30">30 minuti</option>
        <option value="60">1 ora</option>
        <option value="180">3 ore</option>
        <option value="360">6 ore</option>
        <option value="720">12 ore</option>
        <option value="1440">24 ore</option>
      </select>

      <button onclick="createRoom()">Genera Codice di Trasferimento</button>
    </div>

    <div id="result-section" class="hidden">
      <div id="reconnect-banner" class="hidden">🔄 Sessione ripristinata</div>
      <div id="countdown" class="timer-badge">⏱️ Scade tra: 05:00</div>
      <p style="margin-bottom: 5px; font-size: 14px; color: #475569;">Inserisci questo codice o inquadra il QR Code:</p>
      <div id="room-code" class="code-display">----</div>
      <div id="qrcode"></div>
      <div class="url-hint">
        <span id="direct-link-text"></span>
        <button class="btn-secondary" onclick="copyLink()">📋 Copia Link</button>
      </div>
      <p style="color: #059669; font-size: 14px; font-weight: 600; margin-top: 15px;" id="status-msg">In attesa del dispositivo ricevente...</p>
      
      <!-- Log notifiche download ricevute dal mittente -->
      <div id="download-log"></div>

      <!-- Pulsante nuovo trasferimento -->
      <button onclick="resetApp()" style="background: #64748b; margin-top: 12px;">↩️ Nuovo Trasferimento</button>
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
        <button id="download-zip-btn" class="download-zip-btn hidden" onclick="downloadAllAsZip()">📦 Scarica Tutti come ZIP</button>
        <button id="download-all-btn" class="download-all-btn" onclick="downloadAllFiles()">💾 Scarica Tutti i File</button>
        <div id="files-list"></div>
      </div>
    </div>

    <!-- PRIVACY E NOTE -->
    <div class="privacy-card">
      <h3>🔒 Privacy e Sicurezza</h3>
      <ul>
        <li><strong>Memoria volatile:</strong> Dati e file rimangono temporaneamente nella RAM e vengono <strong>distrutti subito</strong> dopo il download o allo scadere del tempo scelto.</li>
        <li><strong>Protezione PIN:</strong> Il contenuto è accessibile solo a chi dispone del PIN di 4 cifre o scansiona il QR Code.</li>
        <li><strong>Nessun Tracciamento:</strong> Nessun file viene salvato su disco né associato al tuo profilo.</li>
      </ul>
      <div class="disclaimer">
        ⚠️ <strong>Note di Responsabilità:</strong> Il servizio viene fornito "così com'è". L'utente è responsabile del salvataggio dei propri dati prima della scadenza del timer o della chiusura della sessione.
      </div>
    </div>

  </div>

  <!-- Overlay di caricamento -->
  <div id="loading-overlay" class="hidden">
    <div class="spinner"></div>
    <div id="loading-text">Preparazione in corso...</div>
    <div id="loading-subtext">Sto leggendo i file selezionati.</div>
    <div id="loading-progress"><div id="loading-progress-bar"></div></div>
    <button id="cancel-loading-btn" onclick="cancelLoading()">❌ Annulla</button>
  </div>

  <script>
  // ============================================================
  // NOTA IMPORTANTE: questo script è dentro un template literal di Node.
  // Evitiamo regex con slash problematici.
  // ============================================================

  console.log('[SCRIPT] QuickPaste caricato correttamente');

  let ws;
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  let generatedTargetUrl = '';
  let countdownInterval = null;
  let receivedFiles = [];
  let selectedFilesArray = [];
  let cancelRequested = false;

  // === Utility localStorage per token mittente ===
  function getStoredToken(code) {
    try {
      return localStorage.getItem('qp_token_' + code) || null;
    } catch (e) {
      return null;
    }
  }

  function storeToken(code, token) {
    try {
      localStorage.setItem('qp_token_' + code, token);
    } catch (e) {}
  }

  function clearToken(code) {
    try {
      localStorage.removeItem('qp_token_' + code);
    } catch (e) {}
  }

  window.onload = () => {
    console.log('[INIT] window.onload');
    const urlParams = new URLSearchParams(window.location.search);
    const codeParam = urlParams.get('code');
    if (codeParam) {
      document.getElementById('code-input').value = codeParam;
      // Se abbiamo un token salvato per questo codice, siamo il mittente originale
      const storedToken = getStoredToken(codeParam);
      if (storedToken) {
        console.log('[INIT] trovato token per codice', codeParam, '- riconnessione come mittente');
        reconnectAsSender(codeParam, storedToken);
      } else {
        joinRoom();
      }
    }
    setupDragAndDropGlobal();
    updateCharCounter();
  };

  // === Utility: escape HTML ===
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // === Contatore caratteri textarea ===
  function updateCharCounter() {
    const el = document.getElementById('text-input');
    const counter = document.getElementById('char-counter');
    if (!el || !counter) return;
    const len = el.value.length;
    counter.innerText = len + ' / 100000 caratteri';
    if (len > 90000) {
      counter.style.color = '#dc2626';
    } else if (len > 70000) {
      counter.style.color = '#d97706';
    } else {
      counter.style.color = '#94a3b8';
    }
  }

  function setupDragAndDropGlobal() {
    console.log('[INIT] setupDragAndDropGlobal');
    const dropZone = document.getElementById('drop-zone');

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
        console.log('[DROP] file selezionati:', selectedFilesArray.length);
        updateFileLabelText(selectedFilesArray.length);
      }
    });
  }

  function updateFileLabel() {
    const input = document.getElementById('file-input');
    if (input.files.length > 0) {
      selectedFilesArray = Array.from(input.files);
      console.log('[INPUT] file selezionati:', selectedFilesArray.length);
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
      osc.frequency.value = 587.33;
      gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.15);
    } catch (e) {}
  }

  function formatDuration(totalSeconds) {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const pad = (n) => (n < 10 ? '0' + n : '' + n);
    if (hours > 0) {
      return pad(hours) + ':' + pad(minutes) + ':' + pad(seconds);
    }
    return pad(minutes) + ':' + pad(seconds);
  }

  function startCountdown(totalSeconds) {
    let duration = (typeof totalSeconds === 'number' && totalSeconds > 0) ? totalSeconds : 300;
    const display = document.getElementById('countdown');
    display.style.background = '#fef3c7';
    display.style.color = '#92400e';
    display.innerText = '⏱️ Scade tra: ' + formatDuration(duration);
    clearInterval(countdownInterval);
    countdownInterval = setInterval(() => {
      if (--duration < 0) {
        clearInterval(countdownInterval);
        display.innerText = '❌ Codice Scaduto';
        display.style.background = '#fef2f2';
        display.style.color = '#991b1b';
        return;
      }
      display.innerText = '⏱️ Scade tra: ' + formatDuration(duration);
    }, 1000);
  }

  // === Funzioni overlay di caricamento ===
  function showLoading(text, subtext, percent) {
    document.getElementById('loading-text').innerText = text || 'Attendere...';
    document.getElementById('loading-subtext').innerText = subtext || '';
    document.getElementById('loading-progress-bar').style.width = (percent || 0) + '%';
    document.getElementById('cancel-loading-btn').classList.remove('hidden');
    document.getElementById('loading-overlay').classList.remove('hidden');
  }

  function updateLoading(text, subtext, percent) {
    if (text) document.getElementById('loading-text').innerText = text;
    if (subtext) document.getElementById('loading-subtext').innerText = subtext;
    if (typeof percent === 'number') {
      document.getElementById('loading-progress-bar').style.width = percent + '%';
    }
  }

  function hideLoading() {
    document.getElementById('loading-overlay').classList.add('hidden');
    document.getElementById('loading-progress-bar').style.width = '0%';
  }

  function showReceiveLoading(text, subtext, percent) {
    showLoading(text, subtext, percent);
    document.getElementById('cancel-loading-btn').classList.add('hidden');
  }

  function hideReceiveLoading() {
    hideLoading();
  }

  function cancelLoading() {
    console.log('[CANCEL] richiesto annullamento');
    cancelRequested = true;
    try {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    } catch (e) {}
    hideLoading();
    updateLoading('Annullato', '', 0);
  }

  // === Reset completo (Nuovo trasferimento) ===
  function resetApp() {
    console.log('[RESET] nuovo trasferimento');
    try {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    } catch (e) {}
    clearInterval(countdownInterval);
    cancelRequested = false;

    // Rimuove ?code dall'URL se presente
    try {
      if (window.history && window.history.replaceState) {
        window.history.replaceState(null, '', window.location.pathname);
      }
    } catch (e) {}

    document.getElementById('send-section').classList.remove('hidden');
    document.getElementById('result-section').classList.add('hidden');
    document.getElementById('reconnect-banner').classList.add('hidden');

    document.getElementById('text-input').value = '';
    document.getElementById('file-input').value = '';
    document.getElementById('direct-link-text').innerText = '';
    document.getElementById('room-code').innerText = '----';
    document.getElementById('qrcode').innerHTML = '';
    document.getElementById('status-msg').innerText = 'In attesa del dispositivo ricevente...';
    document.getElementById('download-log').innerHTML = '';
    document.getElementById('countdown').style.background = '#fef3c7';
    document.getElementById('countdown').style.color = '#92400e';
    document.getElementById('countdown').innerText = '⏱️ Scade tra: 05:00';

    selectedFilesArray = [];
    receivedFiles = [];
    generatedTargetUrl = '';
    updateFileLabelText(0);
    updateCharCounter();
  }

  // === Log notifiche download (lato mittente) ===
  function appendDownloadLog(fileName) {
    const log = document.getElementById('download-log');
    if (!log) return;
    const now = new Date();
    const pad = (n) => (n < 10 ? '0' + n : '' + n);
    const time = pad(now.getHours()) + ':' + pad(now.getMinutes()) + ':' + pad(now.getSeconds());
    const entry = document.createElement('div');
    entry.className = 'dl-entry';
    entry.innerHTML = '📥 <strong>' + time + '</strong> — ' + (fileName ? 'Scaricato: <em>' + escapeHtml(fileName) + '</em>' : 'Un file scaricato');
    log.appendChild(entry);
    log.scrollTop = log.scrollHeight;
  }

  async function createRoom() {
    console.log('[CREATE] avviato');
    cancelRequested = false;
    const text = document.getElementById('text-input').value.trim();

    if (!text && selectedFilesArray.length === 0) {
      return alert('Inserisci del testo oppure seleziona almeno un file/foto!');
    }

    const expiryMinutes = parseInt(document.getElementById('expiry-select').value, 10) || 5;

    let payloadData = {
      text: text || null,
      files: []
    };

    showLoading(
      'Preparazione in corso...',
      selectedFilesArray.length > 0
        ? 'Lettura di ' + selectedFilesArray.length + ' file...'
        : 'Preparazione del testo...',
      5
    );

    try {
      if (selectedFilesArray.length > 0) {
        for (let i = 0; i < selectedFilesArray.length; i++) {
          if (cancelRequested) {
            cancelRequested = false;
            hideLoading();
            return;
          }

          const file = selectedFilesArray[i];
          const pct = 5 + Math.round((i / selectedFilesArray.length) * 65);
          updateLoading(
            'Lettura file ' + (i + 1) + ' di ' + selectedFilesArray.length,
            file.name + ' (' + formatBytes(file.size) + ')',
            pct
          );
          console.log('[CREATE] leggo file:', file.name, file.size);
          const arrayBuffer = await file.arrayBuffer();

          if (cancelRequested) {
            cancelRequested = false;
            hideLoading();
            return;
          }

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
      console.error('[CREATE] errore lettura file:', err);
      hideLoading();
      return alert('Errore nella lettura dei file: ' + err.message);
    }

    if (cancelRequested) {
      cancelRequested = false;
      hideLoading();
      return;
    }

    updateLoading('Connessione al server...', 'Sto aprendo il canale di trasferimento.', 75);

    ws = new WebSocket(protocol + '//' + location.host);

    ws.onopen = () => {
      if (cancelRequested) {
        try { ws.close(); } catch (e) {}
        return;
      }
      updateLoading('Invio in corso...', 'Trasferimento dei dati al server, attendere prego.', 88);
      console.log('[WS] onopen, invio CREATE con scadenza', expiryMinutes, 'minuti');
      try {
        ws.send(JSON.stringify({ type: 'CREATE', payload: payloadData, expiryMinutes: expiryMinutes }));
      } catch (e) {
        console.error('[WS] errore send:', e);
        hideLoading();
        alert('Errore invio: ' + e.message);
      }
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'CREATED') {
        updateLoading('Completato!', 'Codice generato con successo.', 100);
        setTimeout(hideLoading, 300);

        // Salva il token per riconnessioni future
        if (data.senderToken) {
          storeToken(data.code, data.senderToken);
          console.log('[TOKEN] salvato per codice', data.code);
        }

        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(data.code).catch(() => {});
            console.log('[CLIPBOARD] codice copiato:', data.code);
          }
        } catch (e) {}

        // Aggiorna l'URL con ?code=XXXX per permettere refresh/riconnessione
        try {
          if (window.history && window.history.replaceState) {
            window.history.replaceState(null, '', '?code=' + data.code);
          }
        } catch (e) {}

        document.getElementById('send-section').classList.add('hidden');
        document.getElementById('result-section').classList.remove('hidden');
        document.getElementById('room-code').innerText = data.code;
        document.getElementById('qrcode').innerHTML = '<img src="' + data.qr + '" width="180" height="180" />';
        generatedTargetUrl = data.targetUrl;

        var displayUrl = data.targetUrl;
        var sepIdx = displayUrl.indexOf('://');
        if (sepIdx !== -1) {
          displayUrl = displayUrl.substring(sepIdx + 3);
        }
        document.getElementById('direct-link-text').innerText = 'Link: ' + displayUrl;

        var serverExpiryMinutes = (typeof data.expiryMinutes === 'number' && data.expiryMinutes > 0)
          ? data.expiryMinutes
          : expiryMinutes;
        startCountdown(serverExpiryMinutes * 60);
      } else if (data.type === 'CONNECTED') {
        document.getElementById('status-msg').innerText = '✅ Dispositivo connesso! Trasferimento completato.';
        triggerFeedback();
      } else if (data.type === 'DOWNLOADED') {
        appendDownloadLog(data.fileName || null);
        triggerFeedback();
      }
    };

    ws.onerror = (err) => {
      console.error('[WS] onerror:', err);
      hideLoading();
    };

    ws.onclose = (e) => {
      console.log('[WS] onclose. Code:', e.code);
      if (e.code === 1009) {
        hideLoading();
        alert('Payload troppo grande! Il server ha rifiutato il messaggio. Riduci i file.');
      } else if (e.code !== 1000) {
        hideLoading();
      }
    };
  }

  // === Riconnessione come mittente originale ===
  function reconnectAsSender(code, token) {
    console.log('[RECONNECT] tentativo per codice', code);

    showLoading(
      'Riconnessione in corso...',
      'Recupero della sessione ' + code + '...',
      30
    );

    ws = new WebSocket(protocol + '//' + location.host);

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'RECONNECT_SENDER', code: code, token: token }));
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === 'RECONNECTED') {
        updateLoading('Sessione ripristinata!', 'Preparazione interfaccia...', 100);
        setTimeout(hideLoading, 300);

        document.getElementById('send-section').classList.add('hidden');
        document.getElementById('result-section').classList.remove('hidden');
        document.getElementById('reconnect-banner').classList.remove('hidden');

        document.getElementById('room-code').innerText = data.code;
        document.getElementById('qrcode').innerHTML = '<img src="' + data.qr + '" width="180" height="180" />';
        generatedTargetUrl = data.targetUrl;

        var displayUrl = data.targetUrl;
        var sepIdx = displayUrl.indexOf('://');
        if (sepIdx !== -1) {
          displayUrl = displayUrl.substring(sepIdx + 3);
        }
        document.getElementById('direct-link-text').innerText = 'Link: ' + displayUrl;

        // Ripristina il log dei download ricevuti finora
        if (data.downloadLog && data.downloadLog.length > 0) {
          data.downloadLog.forEach(function(entry) {
            appendDownloadLog(entry.fileName || null);
          });
        }

        // Avvia il countdown con il tempo rimanente
        startCountdown(data.remainingSeconds);

        if (data.receiverConnected) {
          document.getElementById('status-msg').innerText = '✅ Dispositivo connesso! Trasferimento completato.';
        } else {
          document.getElementById('status-msg').innerText = 'In attesa del dispositivo ricevente...';
        }

        // Rimuove ?code dall'URL per pulizia (l'utente può comunque ricaricare e ritorna qui)
        try {
          if (window.history && window.history.replaceState) {
            window.history.replaceState(null, '', '?code=' + data.code);
          }
        } catch (e) {}

      } else if (data.type === 'RECONNECT_FAILED') {
        // Token non valido o room scaduta: passa al flusso normale di JOIN
        console.log('[RECONNECT] fallito, provo JOIN normale');
        clearToken(code);
        hideLoading();
        joinRoom();

      } else if (data.type === 'ERROR') {
        hideLoading();
        alert(data.message);
      }
    };

    ws.onerror = (err) => {
      console.error('[RECONNECT] errore:', err);
      hideLoading();
    };

    ws.onclose = (e) => {
      console.log('[RECONNECT] onclose. Code:', e.code);
    };
  }

  async function processReceivedPayload(payload) {
    updateLoading('Recupero file dalla memoria volatile...', 'Preparazione del contenuto...', 45);
    await new Promise(r => setTimeout(r, 40));

    if (payload.text) {
      document.getElementById('received-text-box').classList.remove('hidden');
      document.getElementById('received-text').value = payload.text;

      if (payload.text.startsWith('http://') || payload.text.startsWith('https://')) {
        const openBtn = document.getElementById('open-link-btn');
        openBtn.href = payload.text;
        openBtn.classList.remove('hidden');
      }
    }

    if (payload.files && payload.files.length > 0) {
      receivedFiles = payload.files;
      const filesBox = document.getElementById('received-files-box');
      const filesList = document.getElementById('files-list');
      filesBox.classList.remove('hidden');
      filesList.innerHTML = '';

      const zipBtn = document.getElementById('download-zip-btn');
      if (payload.files.length >= 2) {
        zipBtn.classList.remove('hidden');
      } else {
        zipBtn.classList.add('hidden');
      }

      const total = payload.files.length;
      for (let i = 0; i < total; i++) {
        const fileObj = payload.files[i];
        const pct = 50 + Math.round(((i + 1) / total) * 45);
        updateLoading(
          'Recupero file dalla memoria volatile...',
          'Elaborazione file ' + (i + 1) + ' di ' + total + ': ' + fileObj.fileName,
          pct
        );
        await new Promise(r => setTimeout(r, 0));

        const blob = base64ToBlob(fileObj.fileData, fileObj.fileType);
        const blobUrl = URL.createObjectURL(blob);
        fileObj.blobUrl = blobUrl;

        const safeFileName = escapeHtml(fileObj.fileName);

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
            '<strong>' + safeFileName + '</strong><br>' +
            '<span style="color: #64748b; font-size: 11px;">' + formatBytes(blob.size) + '</span>' +
            '<div id="status-' + i + '" style="color: #059669; font-size: 11px; font-weight: bold; margin-top: 3px; display: none;">✅ Salvato nei download!</div>' +
          '</div>' +
          '<a href="' + blobUrl + '" download="' + safeFileName + '" id="dl-btn-' + i + '" class="download-btn" onclick="handleDownload(this, &quot;status-' + i + '&quot;, &quot;' + safeFileName + '&quot;)">💾 Scarica</a>';
        
        filesList.appendChild(itemDiv);
      }
    }

    updateLoading('Completato!', 'Contenuto pronto per il download.', 100);
    await new Promise(r => setTimeout(r, 300));
    hideReceiveLoading();
    triggerFeedback();

    document.getElementById('receive-section').classList.add('hidden');
    document.getElementById('received-content').classList.remove('hidden');
  }

  function joinRoom() {
    const code = document.getElementById('code-input').value.trim();
    if (code.length !== 4) return alert('Inserisci un codice valido di 4 cifre.');

    showReceiveLoading(
      'Verifica del codice...',
      'Controllo del codice ' + code + ' in corso...',
      10
    );

    ws = new WebSocket(protocol + '//' + location.host);

    ws.onopen = () => {
      updateLoading('Connessione al server...', 'Recupero dati dalla memoria volatile...', 30);
      ws.send(JSON.stringify({ type: 'JOIN', code: code }));
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'PAYLOAD') {
        processReceivedPayload(data.payload).catch(err => {
          console.error('[RECEIVE] errore processing:', err);
          hideReceiveLoading();
          alert('Errore nel recupero del contenuto: ' + err.message);
        });
      } else if (data.type === 'ERROR') {
        hideReceiveLoading();
        alert(data.message);
      }
    };

    ws.onerror = (err) => {
      console.error('[WS] errore ricezione:', err);
      hideReceiveLoading();
      alert('Errore di connessione al server.');
    };

    ws.onclose = (e) => {
      console.log('[WS] ricevente onclose. Code:', e.code);
      hideReceiveLoading();
    };
  }

  function notifyDownload(fileName) {
    try {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'DOWNLOADED', fileName: fileName || null }));
        console.log('[DOWNLOAD] notifica inviata:', fileName);
      }
    } catch (e) {
      console.error('[DOWNLOAD] errore notifica:', e);
    }
  }

  function downloadAllFiles() {
    receivedFiles.forEach((fileObj, index) => {
      setTimeout(() => {
        const btn = document.getElementById('dl-btn-' + index);
        if (btn) btn.click();
      }, index * 400);
    });
  }

  async function downloadAllAsZip() {
    if (!receivedFiles || receivedFiles.length === 0) {
      return alert('Nessun file da comprimere.');
    }
    if (typeof JSZip === 'undefined') {
      return alert('Libreria ZIP non disponibile (sei offline?). Usa "Scarica Tutti i File".');
    }

    const zipBtn = document.getElementById('download-zip-btn');
    const originalText = zipBtn.innerText;
    zipBtn.disabled = true;

    try {
      const zip = new JSZip();

      receivedFiles.forEach((fileObj) => {
        zip.file(fileObj.fileName, fileObj.fileData, { base64: true });
      });

      const content = await zip.generateAsync(
        { type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } },
        (metadata) => {
          const pct = Math.round(metadata.percent);
          zipBtn.innerText = '📦 Compressione... ' + pct + '%';
        }
      );

      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      const now = new Date();
      const pad = (n) => (n < 10 ? '0' + n : '' + n);
      const stamp = now.getFullYear() + pad(now.getMonth() + 1) + pad(now.getDate()) + '_' +
                    pad(now.getHours()) + pad(now.getMinutes()) + pad(now.getSeconds());
      a.href = url;
      a.download = 'QuickPaste_' + stamp + '.zip';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 8000);

      notifyDownload('ZIP (' + receivedFiles.length + ' file)');
      triggerFeedback();
    } catch (err) {
      console.error('[ZIP] errore:', err);
      alert('Errore nella creazione dello ZIP: ' + err.message);
    } finally {
      zipBtn.innerText = originalText;
      zipBtn.disabled = false;
    }
  }

  function handleDownload(element, statusId, fileName) {
    element.innerText = '✅ Scaricato';
    element.style.background = '#0284c7';
    const statusEl = document.getElementById(statusId);
    if (statusEl) statusEl.style.display = 'block';
    notifyDownload(fileName || null);
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
  let currentRole = null; // 'sender' | 'receiver'

  const host = req.headers.host;
  const protocol = req.headers['x-forwarded-proto'] || 'http';
  const currentPublicUrl = `${protocol}://${host}`;

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);

      if (data.type === 'CREATE') {
        const code = Math.floor(1000 + Math.random() * 9000).toString();

        const expiryMinutes = (typeof data.expiryMinutes === 'number' && data.expiryMinutes > 0)
          ? data.expiryMinutes
          : 5;
        const expiryMs = expiryMinutes * 60 * 1000;
        
        const targetUrl = `${currentPublicUrl}?code=${code}`;
        const qrUrl = await QRCode.toDataURL(targetUrl);

        // Token segreto noto solo al mittente (mai condiviso nel link/QR)
        const senderToken = crypto.randomBytes(16).toString('hex');
        
        rooms.set(code, {
          payload: data.payload,
          senderWs: ws,
          senderToken: senderToken,
          receiverWs: null,
          receiverConnected: false,
          downloadLog: [],
          createdAt: Date.now(),
          expiryMs: expiryMs,
          qrUrl: qrUrl,
          targetUrl: targetUrl,
          expiryMinutes: expiryMinutes,
          timer: setTimeout(() => rooms.delete(code), expiryMs)
        });

        currentRoom = code;
        currentRole = 'sender';

        ws.send(JSON.stringify({
          type: 'CREATED',
          code,
          qr: qrUrl,
          targetUrl,
          expiryMinutes: expiryMinutes,
          senderToken: senderToken
        }));
      } 
      
      else if (data.type === 'JOIN') {
        const room = rooms.get(data.code);
        if (!room) {
          ws.send(JSON.stringify({ type: 'ERROR', message: 'Codice errato o scaduto.' }));
          return;
        }
        if (!room.payload) {
          ws.send(JSON.stringify({ type: 'ERROR', message: 'Contenuto già scaricato o non più disponibile.' }));
          return;
        }

        ws.send(JSON.stringify({ type: 'PAYLOAD', payload: room.payload }));
        if (room.senderWs && room.senderWs.readyState === WebSocket.OPEN) {
          room.senderWs.send(JSON.stringify({ type: 'CONNECTED' }));
        }
        // Il payload può essere liberato dopo la consegna, ma la room resta
        // fino alla scadenza per permettere notifiche di download e riconnessione mittente.
        room.payload = null;
        room.receiverWs = ws;
        room.receiverConnected = true;
        currentRoom = data.code;
        currentRole = 'receiver';
      }

      else if (data.type === 'RECONNECT_SENDER') {
        const room = rooms.get(data.code);
        if (!room) {
          ws.send(JSON.stringify({ type: 'RECONNECT_FAILED', reason: 'expired' }));
          return;
        }
        if (!data.token || data.token !== room.senderToken) {
          ws.send(JSON.stringify({ type: 'RECONNECT_FAILED', reason: 'invalid_token' }));
          return;
        }

        // Ripristina il mittente
        room.senderWs = ws;
        currentRoom = data.code;
        currentRole = 'sender';

        const elapsed = Date.now() - room.createdAt;
        const remainingMs = Math.max(0, room.expiryMs - elapsed);
        const remainingSeconds = Math.floor(remainingMs / 1000);

        ws.send(JSON.stringify({
          type: 'RECONNECTED',
          code: data.code,
          qr: room.qrUrl,
          targetUrl: room.targetUrl,
          expiryMinutes: room.expiryMinutes,
          remainingSeconds: remainingSeconds,
          receiverConnected: room.receiverConnected,
          downloadLog: room.downloadLog
        }));
      }

      else if (data.type === 'DOWNLOADED') {
        const room = rooms.get(currentRoom);
        if (!room) return;

        // Salva nel log della room
        const logEntry = {
          fileName: data.fileName || null,
          timestamp: Date.now()
        };
        room.downloadLog.push(logEntry);

        // Inoltra al mittente se connesso
        if (room.senderWs && room.senderWs.readyState === WebSocket.OPEN) {
          room.senderWs.send(JSON.stringify({
            type: 'DOWNLOADED',
            fileName: data.fileName || null
          }));
        }
      }
    } catch (e) {
      console.error(e);
    }
  });

  ws.onclose = () => {
    // IMPORTANTE: NON cancelliamo la room alla disconnessione.
    // La room vive fino alla scadenza del timer, indipendentemente da chi si disconnette.
    // Se il mittente si disconnette, azzeriamo solo il riferimento per evitare
    // errori nell'inoltro delle notifiche download.
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (!room) return;

    if (currentRole === 'sender') {
      if (room.senderWs === ws) {
        room.senderWs = null;
      }
    } else if (currentRole === 'receiver') {
      if (room.receiverWs === ws) {
        room.receiverWs = null;
      }
    }
  };
});

server.listen(PORT, () => {
  console.log(`Server attivo sulla porta ${PORT}`);
});
