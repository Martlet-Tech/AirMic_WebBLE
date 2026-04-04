// ── 应用层协议 ────────────────────────────────────────────

// UUID 配置
const SVC_AIRMIC = '100f0e0d-0c0b-0a09-0807-060504030201'
const CHAR_CTRL = '120f0e0d-0c0b-0a09-0807-060504030201'
const CHAR_RESP = '130f0e0d-0c0b-0a09-0807-060504030201'

let device = null, ctrlChar = null

// 发送命令
async function send(buf) {
  if (!ctrlChar) { log('not connected', 'err'); return }
  try {
    const hex = Array.from(new Uint8Array(buf))
      .map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ')
    await ctrlChar.writeValueWithoutResponse(buf)
    log('→ ' + hex, 'tx')
  } catch (e) { log('send err: ' + e.message, 'err') }
}

// 时间同步命令
async function cmdTimeSync() {
  const ts = BigInt(Date.now())
  const b = new ArrayBuffer(10)
  const v = new DataView(b)
  v.setUint8(0, 0x01); v.setUint8(1, 0x08)
  v.setBigUint64(2, ts, true)
  await send(b)
}

// 采样率设置命令
async function cmdSampleRate() {
  const r = parseInt(document.getElementById('selRate').value)
  const b = new ArrayBuffer(6), v = new DataView(b)
  v.setUint8(0, 0x02); v.setUint8(1, 0x04); v.setUint32(2, r, true)
  await send(b)
}

// 声道设置命令
async function cmdChannels() {
  const c = parseInt(document.getElementById('selCh').value)
  const b = new Uint8Array([0x03, 0x01, c])
  await send(b.buffer)
}

// 状态查询命令
async function cmdGetStatus() {
  await send(new Uint8Array([0x04, 0x00]).buffer)
}

// 密码显示/隐藏功能
function togglePassword() {
  const passwordInput = document.getElementById('wifiPassword')
  const toggleButton = document.getElementById('togglePassword')
  if (passwordInput.type === 'password') {
    passwordInput.type = 'text'
    toggleButton.textContent = '👁️‍🗨️'
  } else {
    passwordInput.type = 'password'
    toggleButton.textContent = '👁️'
  }
}

// 保存WiFi设置到本地缓存
function saveWifiSettings(ssid, password) {
  try {
    const settings = { ssid, password, timestamp: Date.now() }
    localStorage.setItem('airmic_wifi_settings', JSON.stringify(settings))
  } catch (e) {
    console.error('Failed to save WiFi settings:', e)
  }
}

// 从本地缓存加载WiFi设置
function loadWifiSettings() {
  try {
    const settingsStr = localStorage.getItem('airmic_wifi_settings')
    if (settingsStr) {
      const settings = JSON.parse(settingsStr)
      document.getElementById('wifiSsid').value = settings.ssid || ''
      document.getElementById('wifiPassword').value = settings.password || ''
    }
  } catch (e) {
    console.error('Failed to load WiFi settings:', e)
  }
}

// WiFi设置命令
async function cmdWifiSetup() {
  const ssid = document.getElementById('wifiSsid').value
  const password = document.getElementById('wifiPassword').value
  
  if (!ssid) {
    setResp('respWifi', 'ERROR: SSID is required', false)
    return
  }
  
  // 保存到本地缓存
  saveWifiSettings(ssid, password)
  
  // 构建WiFi设置命令
  // 格式: [0x05, payload_len, ssid_len, ssid, password_len, password]
  const ssidBytes = new TextEncoder().encode(ssid)
  const passwordBytes = new TextEncoder().encode(password)
  const totalLen = 1 + ssidBytes.length + 1 + passwordBytes.length
  
  const b = new ArrayBuffer(2 + totalLen)
  const v = new DataView(b)
  v.setUint8(0, 0x05)
  v.setUint8(1, totalLen)
  
  let offset = 2
  v.setUint8(offset++, ssidBytes.length)
  for (let i = 0; i < ssidBytes.length; i++) {
    v.setUint8(offset++, ssidBytes[i])
  }
  v.setUint8(offset++, passwordBytes.length)
  for (let i = 0; i < passwordBytes.length; i++) {
    v.setUint8(offset++, passwordBytes[i])
  }
  
  await send(b)
}

// 收到通知处理
function onNotify(e) {
  const d = new Uint8Array(e.target.value.buffer)
  const hex = Array.from(d).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ')
  log('← ' + hex, 'rx')

  const cmd = d[0], ok = d[1] === 0

  if (cmd === 0x01) {
    setResp('respSync', ok ? 'OK - TIME SYNCED' : 'ERROR', ok)
  }
  if (cmd === 0x02) setResp('respSync', ok ? 'OK - RATE SET' : 'ERROR', ok)
  if (cmd === 0x03) setResp('respSync', ok ? 'OK - CH SET' : 'ERROR', ok)
  if (cmd === 0x04 && ok) {
    const ts = d[2] | (d[3] << 8) | (d[4] << 16) | (d[5] << 24)
    setResp('respStat', 'REC=' + d[1] + '  TIME=' + new Date(ts * 1000).toISOString(), true)
  }
  if (cmd === 0x05) {
    setResp('respWifi', ok ? 'OK - WIFI SETUP STARTED' : 'ERROR', ok)
  }
}