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
    log(I18N.t('log.tx') + ' ' + hex, 'tx')
  } catch (e) { log(I18N.t('log.sendErr') + ': ' + e.message, 'err') }
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

async function cmdGetFileList() {
  const container = document.getElementById('fileList')
  const empty = document.getElementById('fileEmpty')
  if (empty) { empty.textContent = I18N.t('files.loading') }
  else { container.innerHTML = '<div class="empty-state">' + I18N.t('files.loading') + '</div>' }
  await send(new Uint8Array([0x06, 0x00]).buffer)
}

async function cmdGetVersion() {
  await send(new Uint8Array([0x04, 0x00]).buffer)
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

function cmdSetAgcMode() {
  const v = parseInt(document.getElementById('selAgcMode').value)
  cmdConfigSet('agc_mode', 1, [v & 0xFF, (v >> 8) & 0xFF, (v >> 16) & 0xFF, (v >> 24) & 0xFF])
}

function cmdSetBitrate() {
  const v = parseInt(document.getElementById('selBitrate').value)
  cmdConfigSet('bitrate', 1, [v & 0xFF, (v >> 8) & 0xFF, (v >> 16) & 0xFF, (v >> 24) & 0xFF])
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

async function _sendWifiSetup(ssid, password) {
  if (!ssid) return

  saveWifiSettings(ssid, password)
  window.airmicWifiSsid = ssid

  const icon = document.querySelector('.wifi-icon')
  if (icon) icon.setAttribute('class', 'wifi-icon connecting')
  document.getElementById('topIp').textContent = I18N.t('wifi.connecting')
  setResp('respWifiEdit', I18N.t('wifi.connecting'), false)

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

async function cmdWifiSetup() {
  const ssid = document.getElementById('wifiSsid').value
  const password = document.getElementById('wifiPassword').value
  if (!ssid) { setResp('respWifiEdit', I18N.t('wifi.ssidRequired'), false); return }
  _sendWifiSetup(ssid, password)
}

// ── GPS ──

async function cmdGetGps() {
  await send(new Uint8Array([0x0F, 0x00]).buffer)
}

// ── RID OTP ──

async function cmdGetRidStatus() {
  await send(new Uint8Array([0x0E, 0x00]).buffer)
}

async function cmdRidUnlock(confirmText) {
  const bytes = new TextEncoder().encode(confirmText)
  const b = new ArrayBuffer(2 + 1 + bytes.length)
  const v = new DataView(b)
  v.setUint8(0, 0x0D)
  v.setUint8(1, 1 + bytes.length)
  v.setUint8(2, bytes.length)
  for (let i = 0; i < bytes.length; i++) v.setUint8(3 + i, bytes[i])
  await send(b)
}

// ── WiFi Polling ──

let wifiPollInterval = null
let wifiPollAttempts = 0
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
    // 不再有 MAX_WIFI_POLL 硬截止
    // 60s 后提示检查密码，但继续轮询
    if (wifiPollAttempts === 30) {
      setResp('respWifiEdit', I18N.t('wifi.stillTrying'), false)
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
  log(I18N.t('log.rx') + ' ' + hex, 'rx')

  const cmd = d[0], ok = d[1] === 0

  if (cmd === 0x01)  setResp('respSync', ok ? I18N.t('time.synced') : I18N.t('time.error'), ok)
  if (cmd === 0x02)  setResp('respSync', ok ? I18N.t('enc.set') : I18N.t('time.error'), ok)
  if (cmd === 0x03)  setResp('respSync', ok ? I18N.t('enc.chSet') : I18N.t('time.error'), ok)

  if (cmd === 0x04 && ok && d.length >= 13) {
    // payload[8..10] = MAJOR / MINOR / PATCH
    const ver = d[10] + '.' + d[11] + '.' + d[12]
    log(I18N.t('log.ver') + ' ' + ver, 'ok')
    document.getElementById('aboutVer').textContent = ver
  }

  if (cmd === 0x05) {
    setResp('respWifiEdit', ok ? I18N.t('wifi.connecting') : I18N.t('time.error'), ok)
    if (ok) startWifiPoll()
  }

  if (cmd === 0x06) { handleFileNotify(cmd, ok, d); return }

  if (cmd === 0x07) { handleFileNotify(cmd, ok, d); return }

  if (cmd === 0x08) { handleFileNotify(cmd, ok, d); return }

  // ── Config List (0x0B) ──
  if (cmd === 0x0B && ok) {
    console.log('[0x0B] len=' + d.length + ' raw=' + Array.from(d).map(b => b.toString(16).padStart(2,'0')).join(' '))
	    console.log('[0x0B] config list count=' + d[2])
    let off = 2
    const count = d[off++]
    for (let i = 0; i < count; i++) {
      const keyLen = d[off++]
      const key = new TextDecoder().decode(d.slice(off, off + keyLen)); off += keyLen
      const type = d[off++]
      console.log('[0x0B] entry key="' + key + '" type=' + type + ' off=' + off)
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
      } else if (key === 'agc_mode' && type === 1) {
        const val = d[off] | (d[off+1]<<8) | (d[off+2]<<16) | (d[off+3]<<24)
        const sel = document.getElementById('selAgcMode')
        console.log('[0x0B] agc_mode=' + val + ' sel=' + (sel ? sel.value : 'null'))
        if (sel) sel.value = val
        off += 4
      } else if (key === 'bitrate' && type === 1) {
        const val = d[off] | (d[off+1]<<8) | (d[off+2]<<16) | (d[off+3]<<24)
        const sel = document.getElementById('selBitrate')
        if (sel) sel.value = val
        off += 4
      } else {
        console.warn('[0x0B] skip unknown key="' + key + '" type=' + type)
        off += 4  // assume int32 for unknown keys
      }
    }
  }

  // ── Config Set (0x0C) ──
  if (cmd === 0x0C) {
    setResp('respSync', ok ? I18N.t('wifi.configSaved') : I18N.t('wifi.configError'), ok)
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
        setResp('respWifiEdit', I18N.t('wifi.connected') + ' (' + ip + ')', true)
        stopWifiPoll()
        // Switch to Files tab on success
        document.querySelector('[data-tab="files"]')?.click()
        if (ip) setTimeout(cmdGetFileList, 800)
      } else if (status === 1) {
        setResp('respWifiEdit', I18N.t('wifi.obtainingIp'), false)
      } else {
        // status === 0 — 未连接
        // wifi_stop() 会触发 DISCONNECTED → 发 status=0
        // 如果正在自动连接中，不重置 UI 避免 icon 闪烁
        if (!window.airmicWifiSsid) {
          setWifiConnected(null)
          // 首次检查且无 saved SSID → 弹出 WiFi 配置引导
          if (window.airmicWifiFirstCheck) {
            window.airmicWifiFirstCheck = false
            document.getElementById('wifiGuide')?.classList.add('open')
          }
        }
        setResp('respWifiEdit', I18N.t('wifi.notConnected'), false)
      }
    } else {
      setWifiConnected(null)
      setResp('respWifiEdit', I18N.t('wifi.failedStatus'), false)
      stopWifiPoll()
    }
  }

  if (cmd === 0x0D) {
    if (ok) {
      updateRidUI(true)
      setResp('respRid', I18N.t('rid.unlocked'), true)
    } else {
      setResp('respRid', I18N.t('rid.unlockFailed'), false)
    }
  }

  if (cmd === 0x0E && ok && d.length >= 3) {
    updateRidUI(d[2] !== 0)
  }

  if (cmd === 0x0F && d.length >= 2) {
    if (ok && d.length >= 18) {
      const dv = new DataView(d.buffer, 2) // skip cmd+status
      updateGpsDisplay({
        lat: dv.getInt32(0, true),
        lon: dv.getInt32(4, true),
        alt: dv.getInt16(8, true),
        speed: dv.getUint16(10, true),
        heading: dv.getUint16(12, true),
        fix: dv.getUint8(14),
        numSat: dv.getUint8(15),
      })
    } else {
      updateGpsDisplay(null) // show error
    }
  }
}
