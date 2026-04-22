// ── 主逻辑 ────────────────────────────────────────────────

// 页面加载时加载WiFi设置
window.onload = function() {
  loadWifiSettings()
}

// 时钟
setInterval(() => {
  const n = new Date()
  document.getElementById('clock').textContent = n.toTimeString().slice(0, 8)
  document.getElementById('cdate').textContent = n.toISOString().slice(0, 10)
}, 500)

// 日志
function log(msg, type = '') {
  const box = document.getElementById('logBox')
  const t = new Date().toTimeString().slice(0, 8)
  box.innerHTML += `<div class="log-row"><span class="lt">${t}</span><span class="lm ${type}">${msg}</span></div>`
  box.scrollTop = box.scrollHeight
}

// 连接管理
async function toggleConnect() {
  if (device?.gatt.connected) { device.gatt.disconnect(); return }

  try {
    log('scanning for AirMic...', 'tx')
    device = await navigator.bluetooth.requestDevice({
      filters: [{ name: 'Martlet AirMic' }],
      optionalServices: [SVC_AIRMIC]
    })
    device.addEventListener('gattserverdisconnected', onDisc)

    const server = await device.gatt.connect()
    log('connected: ' + device.name, 'ok')

    const svc = await server.getPrimaryService(SVC_AIRMIC)
    ctrlChar = await svc.getCharacteristic(CHAR_CTRL)
    const resp = await svc.getCharacteristic(CHAR_RESP)
    await resp.startNotifications()
    resp.addEventListener('characteristicvaluechanged', onNotify)
    log('notifications ready', 'ok')
    setUI(true)
  } catch (e) {
    log('error: ' + e.message, 'err')
    setUI(false)
  }
}

function onDisc() {
  log('disconnected', 'err')
  setUI(false)
}

// UI控制
function setUI(on) {
  document.getElementById('led').className = 'pixel-led' + (on ? ' on' : '')
  document.getElementById('stText').className = 'status-text' + (on ? ' on' : '')
  document.getElementById('stText').textContent = on ? 'CONNECTED' : 'NOT CONNECTED'
  document.getElementById('btnConn').className = on ? 'px-btn red' : 'px-btn'
  document.getElementById('btnConn').textContent = on ? '[ DISCONNECT ]' : '[ SCAN & CONNECT ]'
    ;['btnSync', 'btnRate', 'btnCh', 'btnStat', 'btnWifi', 'btnFileList', 'btnOta'].forEach(id => {
      document.getElementById(id).disabled = !on
    })
  // 重置文件操作按钮状态
  document.getElementById('selectedFile').value = ''
  document.getElementById('newFileName').value = ''
  document.getElementById('btnDeleteFile').disabled = true
  document.getElementById('btnRenameFile').disabled = true
  document.getElementById('respFileAction').textContent = '—'
  document.getElementById('respFileAction').className = 'resp'
  
  // 连接成功后获取WiFi状态
  if (on) {
    setTimeout(cmdGetWifiStatus, 1000)
  }
}

// 响应显示
function setResp(id, msg, ok) {
  const el = document.getElementById(id)
  el.textContent = msg
  el.className = 'resp ' + (ok ? 'ok' : 'err')
}

function openOta() {
  if (!window.airmicWifiIp) {
    log('OTA requires WiFi connection', 'err')
    return
  }
  window.open(`http://${window.airmicWifiIp}/ota`, '_blank')
  log('opened OTA page: ' + window.airmicWifiIp, 'ok')
}