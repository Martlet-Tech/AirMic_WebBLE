// ── Protocol ──────────────────────────────────────────────

const SVC_AIRMIC = '100f0e0d-0c0b-0a09-0807-060504030201'
const CHAR_CTRL = '120f0e0d-0c0b-0a09-0807-060504030201'
const CHAR_RESP = '130f0e0d-0c0b-0a09-0807-060504030201'

let device = null, ctrlChar = null

async function send(buf) {
  if (!ctrlChar) { log('not connected', 'err'); return }
  try {
    const hex = Array.from(new Uint8Array(buf))
      .map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ')
    await ctrlChar.writeValueWithoutResponse(buf)
    log('TX → ' + hex, 'tx')
  } catch (e) { log('send err: ' + e.message, 'err') }
}

// ── Commands ──

async function cmdTimeSync() {
  const ts = BigInt(Date.now())
  const b = new ArrayBuffer(10)
  const v = new DataView(b)
  v.setUint8(0, 0x01); v.setUint8(1, 0x08)
  v.setBigUint64(2, ts, true)
  await send(b)
}

async function cmdSampleRate() {
  const r = parseInt(document.getElementById('selRate').value)
  const b = new ArrayBuffer(6), v = new DataView(b)
  v.setUint8(0, 0x02); v.setUint8(1, 0x04); v.setUint32(2, r, true)
  await send(b)
}

async function cmdChannels() {
  const c = parseInt(document.getElementById('selCh').value)
  const b = new Uint8Array([0x03, 0x01, c])
  await send(b.buffer)
}

async function cmdGetStatus() {
  await send(new Uint8Array([0x04, 0x00]).buffer)
}

async function cmdGetFileList() {
  const container = document.getElementById('fileList')
  const empty = document.getElementById('fileEmpty')
  if (empty) { empty.textContent = 'Loading...' }
  else { container.innerHTML = '<div class="empty-state">Loading...</div>' }
  await send(new Uint8Array([0x06, 0x00]).buffer)
}

async function cmdGetWifiStatus() {
  await send(new Uint8Array([0x09, 0x00]).buffer)
}

// ── Generic Config Commands ──

async function cmdConfigList() {
  await send(new Uint8Array([0x0B, 0x00]).buffer)
}

async function cmdConfigSet(key, type, valueArr) {
  const keyB = new TextEncoder().encode(key)
  const total = 1 + keyB.length + 1 + valueArr.length
  const b = new ArrayBuffer(2 + total)
  const v = new DataView(b)
  v.setUint8(0, 0x0C); v.setUint8(1, total)
  let off = 2
  v.setUint8(off++, keyB.length)
  for (let i = 0; i < keyB.length; i++) v.setUint8(off++, keyB[i])
  v.setUint8(off++, type)
  for (let i = 0; i < valueArr.length; i++) v.setUint8(off++, valueArr[i])
  await send(b)
}

// Helper: set encoder format from the dropdown
function cmdSetEncoder() {
  const v = parseInt(document.getElementById('selEncoder').value)
  cmdConfigSet('encoder', 1, [v & 0xFF, (v >> 8) & 0xFF, (v >> 16) & 0xFF, (v >> 24) & 0xFF])
}

async function cmdDeleteFile(filename) {
  const b = new ArrayBuffer(2 + 1 + filename.length)
  const v = new DataView(b)
  const bytes = new TextEncoder().encode(filename)
  v.setUint8(0, 0x07)
  v.setUint8(1, 1 + bytes.length)
  v.setUint8(2, bytes.length)
  for (let i = 0; i < bytes.length; i++) v.setUint8(3 + i, bytes[i])
  await send(b)
}

async function cmdRenameFile(oldName, newName) {
  const oldB = new TextEncoder().encode(oldName)
  const newB = new TextEncoder().encode(newName)
  const total = 1 + oldB.length + 1 + newB.length
  const b = new ArrayBuffer(2 + total)
  const v = new DataView(b)
  v.setUint8(0, 0x08); v.setUint8(1, total)
  let off = 2
  v.setUint8(off++, oldB.length)
  for (let i = 0; i < oldB.length; i++) v.setUint8(off++, oldB[i])
  v.setUint8(off++, newB.length)
  for (let i = 0; i < newB.length; i++) v.setUint8(off++, newB[i])
  await send(b)
}

// ── WiFi ──

function togglePassword() {
  const input = document.getElementById('wifiPassword')
  const btn = document.querySelector('.toggle-vis')
  if (!input || !btn) return
  if (input.type === 'password') { input.type = 'text'; btn.textContent = '👁‍🗨' }
  else { input.type = 'password'; btn.textContent = '👁' }
}

function saveWifiSettings(ssid, password) {
  try { localStorage.setItem('airmic_wifi_settings', JSON.stringify({ ssid, password })) } catch (_) {}
}

function loadWifiSettings() {
  try {
    const raw = localStorage.getItem('airmic_wifi_settings')
    if (raw) {
      const s = JSON.parse(raw)
      document.getElementById('wifiSsid').value = s.ssid || ''
      document.getElementById('wifiPassword').value = s.password || ''
    }
  } catch (_) {}
}

async function cmdWifiSetup() {
  const ssid = document.getElementById('wifiSsid').value
  const password = document.getElementById('wifiPassword').value
  if (!ssid) { setResp('respWifiEdit', 'SSID is required', false); return }

  saveWifiSettings(ssid, password)
  window.airmicWifiSsid = ssid

  const icon = document.querySelector('.wifi-icon')
  if (icon) icon.setAttribute('class', 'wifi-icon connecting')
  document.getElementById('topIp').textContent = 'Connecting...'
  setResp('respWifiEdit', 'Connecting...', false)

  const ssidBytes = new TextEncoder().encode(ssid)
  const pwBytes = new TextEncoder().encode(password)
  const totalLen = 1 + ssidBytes.length + 1 + pwBytes.length
  const b = new ArrayBuffer(2 + totalLen)
  const v = new DataView(b)
  v.setUint8(0, 0x05); v.setUint8(1, totalLen)
  let off = 2
  v.setUint8(off++, ssidBytes.length)
  for (let i = 0; i < ssidBytes.length; i++) v.setUint8(off++, ssidBytes[i])
  v.setUint8(off++, pwBytes.length)
  for (let i = 0; i < pwBytes.length; i++) v.setUint8(off++, pwBytes[i])
  await send(b)
}

// ── WiFi Polling ──

let wifiPollInterval = null
let wifiPollAttempts = 0
const MAX_WIFI_POLL = 15
const WIFI_POLL_MS = 2000

function stopWifiPoll() {
  if (wifiPollInterval) { clearInterval(wifiPollInterval); wifiPollInterval = null; wifiPollAttempts = 0 }
}

function startWifiPoll() {
  stopWifiPoll()
  wifiPollAttempts = 0
  wifiPollInterval = setInterval(() => {
    wifiPollAttempts++
    cmdGetWifiStatus().catch(() => {})
    if (wifiPollAttempts >= MAX_WIFI_POLL) {
      stopWifiPoll()
      setResp('respWifiEdit', 'Connection timeout', false)
      document.querySelector('.wifi-icon')?.classList.remove('connecting')
    }
  }, WIFI_POLL_MS)
}

// ── BLE Notification Handler ──

function setWifiConnected(ip) {
  window.airmicWifiIp = ip || null
  const icon = document.querySelector('.wifi-icon')
  if (icon) icon.setAttribute('class', 'wifi-icon' + (ip ? ' connected' : ''))
  document.getElementById('topIp').textContent = ip || '--'
  document.getElementById('aboutIp').textContent = ip || '--'
  document.getElementById('btnOta').disabled = !ip
}

function onNotify(e) {
  const d = new Uint8Array(e.target.value.buffer)
  const hex = Array.from(d).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ')
  log('RX ← ' + hex, 'rx')

  const cmd = d[0], ok = d[1] === 0

  if (cmd === 0x01)  setResp('respSync', ok ? 'Time synced' : 'ERROR', ok)
  if (cmd === 0x02)  setResp('respSync', ok ? 'Rate set' : 'ERROR', ok)
  if (cmd === 0x03)  setResp('respSync', ok ? 'Channels set' : 'ERROR', ok)

  if (cmd === 0x04 && ok) {
    const ts = d[3] | (d[4] << 8) | (d[5] << 16) | (d[6] << 24)
    const encNames = ['WAV','AAC','ALAC']
    const enc = d[7] || 1
    setResp('respStat', 'REC=' + d[2] + '  ENC=' + (encNames[enc] || '?') + '  TIME=' + new Date(ts * 1000).toISOString(), true)
  }

  if (cmd === 0x05) {
    setResp('respWifiEdit', ok ? 'Connecting...' : 'ERROR', ok)
    if (ok) startWifiPoll()
  }

  if (cmd === 0x06) { handleFileNotify(cmd, ok, d); return }

  if (cmd === 0x07) { handleFileNotify(cmd, ok, d); return }

  if (cmd === 0x08) { handleFileNotify(cmd, ok, d); return }

  // ── Config List (0x0B) ──
  if (cmd === 0x0B && ok) {
    let off = 2
    const count = d[off++]
    for (let i = 0; i < count; i++) {
      const keyLen = d[off++]
      const key = new TextDecoder().decode(d.slice(off, off + keyLen)); off += keyLen
      const type = d[off++]
      if (key === 'encoder' && type === 1) {
        const val = d[off] | (d[off+1]<<8) | (d[off+2]<<16) | (d[off+3]<<24)
        document.getElementById('selEncoder').value = val
        off += 4
      } else if (key === 'samplerate' && type === 1) {
        const val = d[off] | (d[off+1]<<8) | (d[off+2]<<16) | (d[off+3]<<24)
        const sel = document.getElementById('selRate')
        if (sel) sel.value = String(val)
        off += 4
      } else if (key === 'channels' && type === 1) {
        const val = d[off] | (d[off+1]<<8) | (d[off+2]<<16) | (d[off+3]<<24)
        const sel = document.getElementById('selCh')
        if (sel) sel.value = String(val)
        off += 4
      }
    }
  }

  // ── Config Set (0x0C) ──
  if (cmd === 0x0C) {
    setResp('respSync', ok ? 'Config saved' : 'Config ERROR', ok)
    if (ok) setTimeout(cmdConfigList, 500)  // refresh
  }

  if (cmd === 0x09) {
    if (ok) {
      let offset = 2
      const status = d[offset++]
      const ipLen = d[offset++]
      let ip = ''
      if (ipLen > 0) ip = new TextDecoder().decode(d.slice(offset, offset + ipLen))

      if (status === 2) {
        if (!window.airmicWifiSsid) {
          try { const s = JSON.parse(localStorage.getItem('airmic_wifi_settings')); if (s?.ssid) window.airmicWifiSsid = s.ssid } catch(_) {}
        }
        setWifiConnected(ip)
        setResp('respWifiEdit', 'Connected (' + ip + ')', true)
        stopWifiPoll()
        // Switch to Files tab on success
        document.querySelector('[data-tab="files"]')?.click()
        if (ip) setTimeout(cmdGetFileList, 800)
      } else if (status === 1) {
        setResp('respWifiEdit', 'Obtaining IP...', false)
      } else {
        setWifiConnected(null)
        setResp('respWifiEdit', 'Not connected. Check SSID/password.', false)
      }
    } else {
      setWifiConnected(null)
      setResp('respWifiEdit', 'Failed to get WiFi status', false)
      stopWifiPoll()
    }
  }
}
