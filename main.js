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
  const el = document.getElementById('aboutClock')
  if (el) el.textContent = n.toTimeString().slice(0, 8)
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
  document.getElementById('topLogBtn').classList.toggle('has-entries', logCount > 0)
  // Auto-open log on first error
  if (type === 'err') {
    document.getElementById('logBar').classList.add('open')
  }
}

// ── BLE Connection ──

async function toggleConnect() {
  if (device?.gatt?.connected) { device.gatt.disconnect(); return }

  try {
    log(I18N.t('conn.scanning'), 'tx')
    topBarConnecting(true)
    device = await navigator.bluetooth.requestDevice({
      filters: [{ name: 'Martlet AirMic' }],
      optionalServices: [SVC_AIRMIC]
    })
    device.addEventListener('gattserverdisconnected', onDisc)

    const server = await device.gatt.connect()
    log(I18N.t('conn.connectedTo') + ' ' + device.name, 'ok')

    const svc = await server.getPrimaryService(SVC_AIRMIC)
    ctrlChar = await svc.getCharacteristic(CHAR_CTRL)
    const resp = await svc.getCharacteristic(CHAR_RESP)
    await resp.startNotifications()
    resp.addEventListener('characteristicvaluechanged', onNotify)
    log(I18N.t('conn.notifications'), 'ok')
    setUI(true)
  } catch (e) {
    log(I18N.t('conn.error') + ' ' + e.message, 'err')
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
  log(I18N.t('conn.disconnected'))
  setUI(false)
}

// ── UI State ──

function setUI(on) {
  const icon = document.getElementById('topBtIcon')
  const st = document.getElementById('topStatus')
  const deviceEl = document.getElementById('topDevice')

  if (icon) icon.classList.toggle('connected', on)
  st.className = 'top-status' + (on ? ' connected' : '')
  st.textContent = on ? I18N.t('conn.connected') : I18N.t('conn.notConnected')
  deviceEl.textContent = on && device?.name ? device.name : ''

  // Enable/disable BLE-dependent buttons
  const ids = ['btnRate', 'btnCh', 'btnEnc', 'btnAgcMode', 'btnWifi', 'btnFileList']
  ids.forEach(id => { const el = document.getElementById(id); if (el) el.disabled = !on })

  // Reset file panel on disconnect
  if (!on) {
    // fileCount removed
    document.getElementById('respFileList').innerHTML = '&mdash;'
    document.getElementById('respFileList').className = 'resp-msg'
    document.getElementById('fileList').innerHTML =
      '<div class="empty-state">' + I18N.t('files.empty') +
      '<div class="hint">' + I18N.t('files.emptyHint') + '</div></div>'
  }

  // About tab
  document.getElementById('aboutBle').textContent = on ? I18N.t('conn.connected') : I18N.t('conn.notConnectedShort')

  if (on) {
    // Show brief warning that recording is disabled while connected
    showToast(I18N.t('notify.recBlocked'), 500)
    window.airmicWifiFirstCheck = true  // 标记首次 WiFi 状态检查
    if (!autoConnectWifi()) {
      setTimeout(cmdGetWifiStatus, 1000)
    } else {
      showToast(I18N.t('wifi.autoConnecting'), 1500)
    }
    setTimeout(cmdConfigList, 2000)
    setTimeout(cmdTimeSync, 2500)  // 自动同步设备时间
  } else {
    wifiReset()
  }
}

function hideWifiGuide() {
  document.getElementById('wifiGuide')?.classList.remove('open')
}

function goWifiSettings() {
  hideWifiGuide()
  document.querySelector('[data-tab="settings"]')?.click()
}

function autoConnectWifi() {
  const raw = localStorage.getItem('airmic_wifi_settings')
  if (!raw) return false
  try {
    const s = JSON.parse(raw)
    if (!s.ssid) return false
    // 不碰表单字段，直接从 localStorage 取值发送
    _sendWifiSetup(s.ssid, s.password || '')
    return true
  } catch (_) { return false }
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

let s_otaFile = null

function startOtaUpload() {
  if (!window.airmicWifiIp) { log(I18N.t('misc.otaReq'), 'err'); return }

  const fileInput = document.getElementById('otaFile')
  const file = fileInput.files[0]
  if (!file) { setResp('respOta', I18N.t('ota.selectBin'), false); return }

  if (!file.name.endsWith('.bin')) { setResp('respOta', I18N.t('ota.onlyBin'), false); return }

  s_otaFile = file
  document.getElementById('otaConfirm').classList.add('open')
}

function cancelOta() {
  document.getElementById('otaConfirm').classList.remove('open')
  s_otaFile = null
}

function confirmOta() {
  document.getElementById('otaConfirm').classList.remove('open')
  const file = s_otaFile
  s_otaFile = null
  if (!file) return

  const fileInput = document.getElementById('otaFile')
  const progress = document.getElementById('otaProgress')
  const fill = document.getElementById('otaProgressFill')
  const text = document.getElementById('otaProgressText')
  const btn = document.getElementById('btnOta')

  progress.style.display = 'flex'
  fill.style.width = '0%'
  fill.className = 'ota-progress-fill'
  text.textContent = '0%'
  btn.disabled = true
  setResp('respOta', I18N.t('ota.uploading'), false)

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
    const msg = xhr.responseText || (xhr.status === 200 ? I18N.t('ota.flashComplete') : I18N.t('misc.http') + ' ' + xhr.status)
    setResp('respOta', msg, xhr.status === 200)
    log('OTA: ' + msg, xhr.status === 200 ? 'ok' : 'err')
    fileInput.value = ''
    setTimeout(() => { progress.style.display = 'none' }, 5000)
  }

  xhr.onerror = () => {
    fill.classList.add('error')
    btn.disabled = false
    setResp('respOta', I18N.t('ota.uploadFailed'), false)
    log('OTA: ' + I18N.t('ota.uploadFailed'), 'err')
    setTimeout(() => { progress.style.display = 'none' }, 3000)
  }

  xhr.ontimeout = () => {
    fill.classList.add('error')
    btn.disabled = false
    setResp('respOta', I18N.t('ota.uploadTimeout'), false)
    log('OTA: ' + I18N.t('ota.uploadTimeout'), 'err')
  }

  xhr.send(file)
  log(I18N.t('ota.uploadStarted') + ' ' + file.name, 'tx')
}
