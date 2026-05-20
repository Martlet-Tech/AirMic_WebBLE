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

// 获取文件列表命令
async function cmdGetFileList() {
  await send(new Uint8Array([0x06, 0x00]).buffer)
}

// 获取WiFi状态命令
async function cmdGetWifiStatus() {
  await send(new Uint8Array([0x09, 0x00]).buffer)
}

// 删除文件命令
async function cmdDeleteFile() {
  const filename = document.getElementById('selectedFile').value
  if (!filename) {
    setResp('respFileAction', 'ERROR: No file selected', false)
    return
  }
  
  // 构建删除文件命令
  const filenameBytes = new TextEncoder().encode(filename)
  const b = new ArrayBuffer(2 + 1 + filenameBytes.length)
  const v = new DataView(b)
  v.setUint8(0, 0x07)
  v.setUint8(1, 1 + filenameBytes.length)
  v.setUint8(2, filenameBytes.length)
  
  for (let i = 0; i < filenameBytes.length; i++) {
    v.setUint8(3 + i, filenameBytes[i])
  }
  
  await send(b)
}

// 重命名文件命令
async function cmdRenameFile() {
  const oldFilename = document.getElementById('selectedFile').value
  const newFilename = document.getElementById('newFileName').value
  
  if (!oldFilename) {
    setResp('respFileAction', 'ERROR: No file selected', false)
    return
  }
  
  if (!newFilename) {
    setResp('respFileAction', 'ERROR: New filename is required', false)
    return
  }
  
  // 构建重命名文件命令
  const oldFilenameBytes = new TextEncoder().encode(oldFilename)
  const newFilenameBytes = new TextEncoder().encode(newFilename)
  const totalLen = 1 + oldFilenameBytes.length + 1 + newFilenameBytes.length
  
  const b = new ArrayBuffer(2 + totalLen)
  const v = new DataView(b)
  v.setUint8(0, 0x08)
  v.setUint8(1, totalLen)
  
  let offset = 2
  v.setUint8(offset++, oldFilenameBytes.length)
  for (let i = 0; i < oldFilenameBytes.length; i++) {
    v.setUint8(offset++, oldFilenameBytes[i])
  }
  v.setUint8(offset++, newFilenameBytes.length)
  for (let i = 0; i < newFilenameBytes.length; i++) {
    v.setUint8(offset++, newFilenameBytes[i])
  }
  
  await send(b)
}

// 选择文件
function selectFile(filename) {
  document.getElementById('selectedFile').value = filename
  document.getElementById('newFileName').value = filename
  // 启用删除和重命名按钮
  document.getElementById('btnDeleteFile').disabled = false
  document.getElementById('btnRenameFile').disabled = false
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

// 播放文件
function playFile(filename) {
  if (!window.airmicWifiIp) {
    setResp('respFileAction', 'ERROR: WiFi not connected', false);
    return;
  }
  
  const url = `http://${window.airmicWifiIp}/play?${encodeURIComponent(filename)}`
  const audio = new Audio(url)
  audio.play().catch(e => {
    setResp('respFileAction', 'ERROR: Failed to play file', false)
  })
  setResp('respFileAction', `Playing: ${filename}`, true)
}

// 单请求流式下载：fetch 整个文件，服务端 chunked streaming
async function downloadFile(filename) {
  if (!window.airmicWifiIp) {
    setResp('respFileAction', 'ERROR: WiFi not connected', false);
    return;
  }

  const startTime = Date.now();
  const url = `http://${window.airmicWifiIp}/dl?${encodeURIComponent(filename)}`;

  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const blob = await resp.blob();
    if (blob.size === 0) throw new Error('empty response');

    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);

    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;
    const avgSpeed = (blob.size / (1024 * 1024)) / duration;
    setResp('respFileAction', `✓ 下载完成: ${filename} (${duration.toFixed(2)}s, ${avgSpeed.toFixed(2)} MB/s)`, true);
  } catch (e) {
    setResp('respFileAction', `ERROR: ${e.message}`, false);
  }
}

// 格式化文件大小
function formatFileSize(bytes) {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

// 通过HTTP请求获取文件列表
async function fetchFileList() {
  if (!window.airmicWifiIp) {
    setResp('respFileList', 'WiFi not connected', false)
    return
  }
  
  try {
    const url = `http://${window.airmicWifiIp}/files`
    const response = await fetch(url)
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    
    const data = await response.json()
    
    // 显示文件列表
    const fileList = document.getElementById('fileList')
    fileList.innerHTML = ''
    
    if (data.files && data.files.length > 0) {
      data.files.forEach(file => {
        // 创建文件项
        const fileItem = document.createElement('div')
        fileItem.className = 'file-item'
        fileItem.innerHTML = `
          <span class="file-name">${file.name}</span>
          <span class="file-size">${formatFileSize(file.size)}</span>
          <div class="file-item-actions">
            <button class="play-btn" onclick="playFile('${file.name}')">播放</button>
            <button class="download-btn" onclick="downloadFile('${file.name}')">下载</button>
          </div>
        `
        // 添加点击事件
        fileItem.addEventListener('click', () => selectFile(file.name))
        fileList.appendChild(fileItem)
      })
    } else {
      fileList.innerHTML = '<div class="no-files">No files found</div>'
    }
    
    log(`Fetched ${data.count} files via HTTP`, 'ok')
  } catch (error) {
    setResp('respFileList', `ERROR: ${error.message}`, false)
    log(`Error fetching file list: ${error.message}`, 'err')
  }
}

// 全局变量用于跟踪WiFi状态轮询
let wifiPollInterval = null;
let wifiPollAttempts = 0;
const MAX_WIFI_POLL_ATTEMPTS = 15; // 最多15次，每次2秒，总共30秒
const WIFI_POLL_INTERVAL = 2000; // 每2秒检查一次

// 停止WiFi状态轮询
function stopWifiPolling() {
  if (wifiPollInterval) {
    clearInterval(wifiPollInterval);
    wifiPollInterval = null;
    wifiPollAttempts = 0;
  }
}

// 开始WiFi状态轮询
function startWifiPolling() {
  stopWifiPolling(); // 确保没有重复的轮询
  wifiPollAttempts = 0;
  
  wifiPollInterval = setInterval(async () => {
    wifiPollAttempts++;
    
    try {
      await cmdGetWifiStatus();
    } catch (e) {
      console.error('WiFi status poll error:', e);
    }
    
    // 如果达到最大尝试次数，停止轮询
    if (wifiPollAttempts >= MAX_WIFI_POLL_ATTEMPTS) {
      stopWifiPolling();
      setResp('respWifi', 'ERROR - WiFi connection timeout', false);
    }
  }, WIFI_POLL_INTERVAL);
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
    const ts = d[3] | (d[4] << 8) | (d[5] << 16) | (d[6] << 24)
    setResp('respStat', 'REC=' + d[2] + '  TIME=' + new Date(ts * 1000).toISOString(), true)
  }
  if (cmd === 0x05) {
    setResp('respWifi', ok ? 'OK - WIFI SETUP STARTED' : 'ERROR', ok)
    // WiFi设置成功后，开始轮询WiFi状态直到连接成功或超时
    if (ok) {
      startWifiPolling();
    }
  }
  if (cmd === 0x06) {
    if (ok) {
      // 解析文件总数
      let offset = 2 // 跳过命令码和状态码
      const fileCount = d[offset++] | (d[offset++] << 8)
      
      setResp('respFileList', `OK - ${fileCount} files found`, true)
      
      // 通过HTTP请求获取详细文件列表
      if (window.airmicWifiIp) {
        fetchFileList()
      } else {
        setResp('respFileList', 'WiFi not connected, cannot get file details', false)
      }
    } else {
      setResp('respFileList', 'ERROR - Failed to get file count', false)
      document.getElementById('fileList').innerHTML = ''
    }
  }
  if (cmd === 0x07) {
    if (ok) {
      setResp('respFileAction', 'OK - File deleted successfully', true)
      // 重新获取文件列表
      setTimeout(cmdGetFileList, 500)
    } else {
      setResp('respFileAction', 'ERROR - Failed to delete file', false)
    }
  }
  if (cmd === 0x08) {
    if (ok) {
      setResp('respFileAction', 'OK - File renamed successfully', true)
      // 重新获取文件列表
      setTimeout(cmdGetFileList, 500)
    } else {
      setResp('respFileAction', 'ERROR - Failed to rename file', false)
    }
  }
  if (cmd === 0x09) {
    if (ok) {
      let offset = 2 // 跳过命令码和状态码
      const status = d[offset++]
      const ipLen = d[offset++]
      let ip = ''
      if (ipLen > 0) {
        ip = new TextDecoder().decode(d.slice(offset, offset + ipLen))
      }
      
      // 状态值: 0=未连接, 1=已连接但无IP, 2=已连接且有IP
      let statusText, isConnected;
      if (status === 2) {
        statusText = `OK - Connected, IP: ${ip}`;
        isConnected = true;
        // WiFi连接成功，停止轮询
        stopWifiPolling();
      } else if (status === 1) {
        statusText = 'WARNING - WiFi Connected but No IP Address';
        isConnected = false;
        // 继续轮询，可能还在获取IP
      } else {
        statusText = 'ERROR - Not connected';
        isConnected = false;
        // 继续轮询，可能还在连接中
      }
      
      setResp('respWifi', statusText, status === 2);
      // 只有当WiFi连接且有IP地址时，才设置全局变量
      if (status === 2 && ipLen > 0) {
        window.airmicWifiIp = ip;
      } else {
        window.airmicWifiIp = null;
      }
    } else {
      setResp('respWifi', 'ERROR - Failed to get WiFi status', false);
      window.airmicWifiIp = null;
      // 出错时也停止轮询
      stopWifiPolling();
    }
  }
}