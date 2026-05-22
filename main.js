// ── Main ──────────────────────────────────────────────────

window.onload = function() {
  loadWifiSettings()
}

// ── Tab Switching ──

document.getElementById('tabBar').addEventListener('click', (e) => {
  const tab = e.target.closest('.tab')
  if (!tab) return

  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'))
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'))
  tab.classList.add('active')
  const pane = document.getElementById('tab-' + tab.dataset.tab)
  if (pane) pane.classList.add('active')
})

// ── Log Toggle ──

function toggleLog() {
  document.getElementById('logBar').classList.toggle('open')
}

// ── Clock ──

setInterval(() => {
  const n = new Date()
  document.getElementById('clock').textContent = n.toTimeString().slice(0, 8)
  document.getElementById('cdate').textContent = n.toISOString().slice(0, 10)
}, 500)

// ── Logger ──

let logCount = 0

function log(msg, type = '') {
  const box = document.getElementById('logBox')
  const t = new Date().toTimeString().slice(0, 8)
  box.innerHTML += `<div class="log-row"><span class="log-time">${t}</span><span class="log-msg ${type}">${msg}</span></div>`
  box.scrollTop = box.scrollHeight
  logCount++
  document.getElementById('logBadge').textContent = logCount
  // Auto-open log on first error
  if (type === 'err') {
    document.getElementById('logBar').classList.add('open')
  }
}

// ── BLE Connection ──

async function toggleConnect() {
  if (device?.gatt?.connected) { device.gatt.disconnect(); return }

  try {
    log('Scanning for AirMic...', 'tx')
    topBarConnecting(true)
    device = await navigator.bluetooth.requestDevice({
      filters: [{ name: 'Martlet AirMic' }],
      optionalServices: [SVC_AIRMIC]
    })
    device.addEventListener('gattserverdisconnected', onDisc)

    const server = await device.gatt.connect()
    log('Connected: ' + device.name, 'ok')

    const svc = await server.getPrimaryService(SVC_AIRMIC)
    ctrlChar = await svc.getCharacteristic(CHAR_CTRL)
    const resp = await svc.getCharacteristic(CHAR_RESP)
    await resp.startNotifications()
    resp.addEventListener('characteristicvaluechanged', onNotify)
    log('Notifications ready', 'ok')
    setUI(true)
  } catch (e) {
    log('Error: ' + e.message, 'err')
    setUI(false)
  } finally {
    topBarConnecting(false)
  }
}

function topBarConnecting(connecting) {
  const el = document.getElementById('topConn')
  if (connecting) {
    el.style.pointerEvents = 'none'
    el.style.opacity = '0.5'
  } else {
    el.style.pointerEvents = ''
    el.style.opacity = ''
  }
}

function onDisc() {
  log('Disconnected', 'err')
  setUI(false)
}

// ── UI State ──

function setUI(on) {
  const led = document.getElementById('topLed')
  const st = document.getElementById('topStatus')
  const deviceEl = document.getElementById('topDevice')

  led.className = 'top-led' + (on ? ' connected' : '')
  st.className = 'top-status' + (on ? ' connected' : '')
  st.textContent = on ? 'CONNECTED' : 'NOT CONNECTED'
  deviceEl.textContent = on && device?.name ? device.name : ''

  // Enable/disable BLE-dependent buttons
  const ids = ['btnSync', 'btnRate', 'btnCh', 'btnEnc', 'btnStat', 'btnWifi', 'btnFileList']
  ids.forEach(id => { const el = document.getElementById(id); if (el) el.disabled = !on })

  // Reset file panel on disconnect
  if (!on) {
    document.getElementById('fileCount').textContent = ''
    document.getElementById('respFileList').innerHTML = '&mdash;'
    document.getElementById('respFileList').className = 'resp-msg'
    document.getElementById('fileList').innerHTML =
      '<div class="empty-state">Connect BLE and WiFi to browse files' +
      '<div class="hint">File list loads automatically when connected</div></div>'
  }

  // About tab
  document.getElementById('aboutBle').textContent = on ? 'Connected' : 'Disconnected'

  if (on) {
    setTimeout(cmdGetWifiStatus, 1000)
    setTimeout(cmdConfigList, 2000)
  } else {
    wifiReset()
  }
}

function wifiReset() {
  window.airmicWifiIp = null
  window.airmicWifiSsid = null
  stopWifiPoll()
  document.getElementById('topIp').textContent = '--'
  document.querySelector('.wifi-icon')?.setAttribute('class', 'wifi-icon')
  document.getElementById('aboutIp').textContent = '--'
  document.getElementById('btnOta').disabled = true
}

// ── Response Display ──

function setResp(id, msg, ok) {
  const el = document.getElementById(id)
  if (!el) return
  el.innerHTML = msg
  el.className = 'resp-msg' + (ok !== undefined ? (ok ? ' ok' : ' err') : '')
}

// ── OTA ──

function startOtaUpload() {
  if (!window.airmicWifiIp) { log('OTA requires WiFi connection', 'err'); return }

  const fileInput = document.getElementById('otaFile')
  const file = fileInput.files[0]
  if (!file) { setResp('respOta', 'Select a .bin file first', false); return }

  if (!file.name.endsWith('.bin')) { setResp('respOta', 'Only .bin files are supported', false); return }

  const progress = document.getElementById('otaProgress')
  const fill = document.getElementById('otaProgressFill')
  const text = document.getElementById('otaProgressText')
  const btn = document.getElementById('btnOta')

  progress.style.display = 'flex'
  fill.style.width = '0%'
  fill.className = 'ota-progress-fill'
  text.textContent = '0%'
  btn.disabled = true
  setResp('respOta', 'Uploading...', false)

  const xhr = new XMLHttpRequest()
  xhr.open('POST', `http://${window.airmicWifiIp}/ota`)
  xhr.timeout = 120000 // 2 min timeout for large firmware

  xhr.upload.onprogress = (e) => {
    if (e.lengthComputable) {
      const pct = Math.round((e.loaded / e.total) * 100)
      fill.style.width = pct + '%'
      text.textContent = pct + '%'
    }
  }

  xhr.onload = () => {
    fill.classList.add(xhr.status === 200 ? 'done' : 'error')
    fill.style.width = '100%'
    text.textContent = '100%'
    btn.disabled = false
    const msg = xhr.responseText || (xhr.status === 200 ? 'Flash complete, rebooting...' : 'HTTP ' + xhr.status)
    setResp('respOta', msg, xhr.status === 200)
    log('OTA: ' + msg, xhr.status === 200 ? 'ok' : 'err')
    fileInput.value = ''
    setTimeout(() => { progress.style.display = 'none' }, 5000)
  }

  xhr.onerror = () => {
    fill.classList.add('error')
    btn.disabled = false
    setResp('respOta', 'Upload failed - check CORS or network', false)
    log('OTA: network error (CORS or connection)', 'err')
    setTimeout(() => { progress.style.display = 'none' }, 3000)
  }

  xhr.ontimeout = () => {
    fill.classList.add('error')
    btn.disabled = false
    setResp('respOta', 'Upload timed out', false)
    log('OTA: upload timed out', 'err')
  }

  xhr.send(file)
  log('OTA upload started: ' + file.name, 'tx')
}
