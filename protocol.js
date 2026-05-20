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
  if (icon) icon.className = 'wifi-icon connecting'
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

// ── File UI Operations ──

function startRename(filename) {
  const row = document.querySelector(`[data-filename="${CSS.escape(filename)}"]`)
  if (!row) return
  const nameEl = row.querySelector('.file-name')
  const input = document.createElement('input')
  input.type = 'text'; input.className = 'rename-input'; input.value = filename
  nameEl.replaceWith(input)
  input.focus(); input.select()

  const done = (save) => {
    if (save && input.value.trim() && input.value !== filename) {
      row.dataset.renaming = '1'
      cmdRenameFile(filename, input.value.trim())
    } else {
      const span = document.createElement('span')
      span.className = 'file-name'; span.textContent = filename
      span.onclick = () => startRename(filename)
      input.replaceWith(span)
    }
  }
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); done(true) }
    if (e.key === 'Escape') { done(false) }
  })
  input.addEventListener('blur', () => done(true))
}

function startDelete(filename, btnEl) {
  if (btnEl.dataset.confirming === 'true') {
    btnEl.dataset.confirming = ''; btnEl.classList.remove('confirming')
    btnEl.textContent = '✕'
    log('Deleting: ' + filename, 'tx')
    cmdDeleteFile(filename)
    return
  }
  btnEl.dataset.confirming = 'true'; btnEl.classList.add('confirming')
  btnEl.textContent = 'OK?'
  setTimeout(() => {
    btnEl.dataset.confirming = ''; btnEl.classList.remove('confirming')
    btnEl.textContent = '✕'
  }, 3000)
}

// ── Play ──

function playFile(filename) {
  if (!window.airmicWifiIp) { setResp('respFileList', 'WiFi not connected', false); return }
  new Audio(`http://${window.airmicWifiIp}/play?${encodeURIComponent(filename)}`).play()
    .catch(() => setResp('respFileList', 'Play failed', false))
  log('Playing: ' + filename, 'ok')
}

// ── Download with Progress ──

async function downloadFile(filename, size) {
  if (!window.airmicWifiIp) { setResp('respFileList', 'WiFi not connected', false); return }

  const row = document.querySelector(`[data-filename="${CSS.escape(filename)}"]`)
  if (!row) return

  const progressBar = row.querySelector('.progress-bar')
  const progressFill = row.querySelector('.progress-fill')
  const dlBtn = row.querySelector('.action-btn.download')
  if (!progressBar || !dlBtn) return

  dlBtn.disabled = true
  progressBar.style.display = 'block'
  progressFill.style.width = '0%'
  progressFill.className = 'progress-fill'

  const startTime = Date.now()
  try {
    const resp = await fetch(`http://${window.airmicWifiIp}/dl?${encodeURIComponent(filename)}`)
    if (!resp.ok) throw new Error('HTTP ' + resp.status)
    if (!resp.body) throw new Error('No stream')

    const reader = resp.body.getReader()
    const total = size || 0
    let received = 0
    const chunks = []

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) {
        chunks.push(value); received += value.length
        progressFill.style.width = (total > 0 ? Math.min(100, (received / total) * 100) : Math.min(95, (received / (received + 65536)) * 100)) + '%'
      }
    }

    progressFill.style.width = '100%'; progressFill.classList.add('done')
    const blob = new Blob(chunks)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = filename
    document.body.appendChild(a); a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 10000)

    const elapsed = (Date.now() - startTime) / 1000
    log(`Downloaded ${filename} (${(received/1048576).toFixed(2)} MB, ${(received/1048576/elapsed).toFixed(2)} MB/s)`, 'ok')

    setTimeout(() => { progressBar.style.display = 'none'; progressFill.style.width = '0%'; progressFill.classList.remove('done'); dlBtn.disabled = false }, 2000)
  } catch (e) {
    progressFill.classList.add('error')
    log('Download error: ' + e.message, 'err')
    dlBtn.disabled = false
    setTimeout(() => { progressBar.style.display = 'none'; progressFill.className = 'progress-fill' }, 3000)
  }
}

// ── Helpers ──

function formatFileSize(bytes) {
  if (bytes === 0) return '0 B'
  const k = 1024, sizes = ['B','KB','MB','GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

function escapeHtml(s) {
  const d = document.createElement('div')
  d.textContent = s; return d.innerHTML
}

// ── Fetch file list via HTTP ──

async function fetchFileList() {
  if (!window.airmicWifiIp) { setResp('respFileList', 'WiFi not connected', false); return }
  try {
    const resp = await fetch(`http://${window.airmicWifiIp}/files`)
    if (!resp.ok) throw new Error('HTTP ' + resp.status)
    const data = await resp.json()
    const container = document.getElementById('fileList')
    container.innerHTML = ''

    if (data.files && data.files.length > 0) {
      data.files.forEach(file => {
        const row = document.createElement('div')
        row.className = 'file-row'; row.dataset.filename = file.name
        row.innerHTML = `
          <div class="file-info">
            <span class="file-name">${escapeHtml(file.name)}</span>
            <span class="file-size">${formatFileSize(file.size)}</span>
          </div>
          <div class="file-actions">
            <button class="action-btn play" title="Play">▶</button>
            <button class="action-btn download" title="Download">↓</button>
            <button class="action-btn rename" title="Rename">✎</button>
            <button class="action-btn delete" title="Delete">✕</button>
          </div>
          <div class="progress-bar"><div class="progress-fill"></div></div>`
        row.querySelector('.play').onclick = () => playFile(file.name)
        row.querySelector('.download').onclick = () => downloadFile(file.name, file.size)
        row.querySelector('.rename').onclick = () => startRename(file.name)
        row.querySelector('.delete').onclick = (e) => startDelete(file.name, e.currentTarget)
        row.querySelector('.file-name').onclick = () => startRename(file.name)
        container.appendChild(row)
      })
      document.getElementById('fileCount').textContent = data.files.length + ' file' + (data.files.length !== 1 ? 's' : '')
    } else {
      container.innerHTML = '<div class="empty-state">No files found</div>'
      document.getElementById('fileCount').textContent = '0 files'
    }
    log('Fetched ' + (data.count || data.files?.length || 0) + ' files via HTTP', 'ok')
  } catch (e) {
    setResp('respFileList', 'ERROR: ' + e.message, false)
    log('Fetch error: ' + e.message, 'err')
  }
}

// ── BLE Notification Handler ──

function setWifiConnected(ip) {
  window.airmicWifiIp = ip || null
  const icon = document.querySelector('.wifi-icon')
  if (icon) icon.className = 'wifi-icon' + (ip ? ' connected' : '')
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
    setResp('respStat', 'REC=' + d[2] + '  TIME=' + new Date(ts * 1000).toISOString(), true)
  }

  if (cmd === 0x05) {
    setResp('respWifiEdit', ok ? 'Connecting...' : 'ERROR', ok)
    if (ok) startWifiPoll()
  }

  if (cmd === 0x06) {
    if (ok) {
      let offset = 2
      const count = d[offset++] | (d[offset++] << 8)
      setResp('respFileList', count + ' file' + (count !== 1 ? 's' : '') + ' found', true)
      if (window.airmicWifiIp) { fetchFileList() }
      else {
        document.getElementById('fileList').innerHTML = '<div class="empty-state">WiFi not connected<br><span class="hint">Cannot fetch file details</span></div>'
      }
    } else {
      setResp('respFileList', 'Failed to get file list', false)
      document.getElementById('fileList').innerHTML = '<div class="empty-state">Failed to load files</div>'
      document.getElementById('fileCount').textContent = ''
    }
  }

  if (cmd === 0x07) {
    if (ok) { setResp('respFileList', 'File deleted', true); setTimeout(cmdGetFileList, 500) }
    else { setResp('respFileList', 'Delete failed', false) }
    document.querySelectorAll('.file-row[data-renaming]').forEach(el => delete el.dataset.renaming)
  }

  if (cmd === 0x08) {
    if (ok) { setResp('respFileList', 'File renamed', true); setTimeout(cmdGetFileList, 500) }
    else { setResp('respFileList', 'Rename failed', false) }
    document.querySelectorAll('.file-row[data-renaming]').forEach(el => delete el.dataset.renaming)
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
