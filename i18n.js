// ── i18n ──────────────────────────────────────────────────
// 国际化模块，自动检测浏览器语言，支持中英文手动切换

const I18N = (() => {

  const dict = {
    en: {
      // ── App ──
      'app.brand':         'AirMic',
      'app.subtitle':      'FPV AUDIO MODULE',

      // ── Connection ──
      'conn.connected':    'CONNECTED',
      'conn.notConnected': 'NOT CONNECTED',
      'conn.scanning':     'Scanning for AirMic...',
      'conn.connectedTo':  'Connected:',
      'conn.notifications':'Notifications ready',
      'conn.disconnected': 'Disconnected',
      'conn.error':        'Error:',
      'conn.notConnectedShort': 'Disconnected',

      // ── Tab Bar ──
      'tab.files':     'Files',
      'tab.settings':  'Settings',
      'tab.ota':       'OTA',
      'tab.about':     'About',

      // ── Log ──
      'log.title':     'Log',

      // ── Files Tab ──
      'files.refresh':        'Refresh',
      'files.deleteSelected': 'Delete Selected',
      'files.deleteAll':      'Delete All',
      'files.sortName':       'Name',
      'files.sortSize':       'Size',
      'files.empty':          'Connect BLE and WiFi to browse files',
      'files.emptyHint':      'File list loads automatically when connected',
      'files.noFiles':        'No files found',
      'files.loading':        'Loading...',
      'files.failed':         'Failed to load files',
      'files.noWifi':         'WiFi not connected',
      'files.noWifiHint':     'Cannot fetch file details',
      'files.failedList':     'Failed to get file list',
      'files.play':           'Play',
      'files.download':       'Download',
      'files.rename':         'Rename',
      'files.delete':         'Delete',

      // ── Settings Tab ──
      'settings.wifiSetup':   'WiFi Setup',
      'settings.ssid':        'SSID',
      'settings.password':    'Password',
      'settings.connectWifi': 'Connect WiFi',
      'settings.timeSync':    'Time Sync',
      'settings.syncTime':    'Sync Time',
      'settings.audioConfig': 'Audio Config',
      'settings.encoder':     'Encoder',
      'settings.channels':    'Channels',
      'settings.mono':        'Mono',
      'settings.stereo':      'Stereo',
      'settings.agcMode':     'AGC Mode',
      'settings.apply':       'Apply',
      'settings.deviceStatus':'Device Status',
      'settings.queryStatus': 'Query Status',
      'settings.language':    'Language / 语言',

      // ── OTA Tab ──
      'ota.firmwareUpgrade':  'Firmware Upgrade',
      'ota.desc':             'Select a .bin firmware file to upload and flash via WiFi. The device will reboot after completion.',
      'ota.uploadFlash':      'Upload & Flash',
      'ota.selectBin':        'Select a .bin file first',
      'ota.onlyBin':          'Only .bin files are supported',
      'ota.uploading':        'Uploading...',
      'ota.flashComplete':    'Flash complete, rebooting...',
      'ota.uploadFailed':     'Upload failed — check CORS or network',
      'ota.uploadTimeout':    'Upload timed out',
      'ota.uploadStarted':    'OTA upload started:',
      'ota.confirmTitle':     'Confirm Firmware Upgrade',
      'ota.confirmBody':      'The device will reboot after flashing. Continue?',
      'ota.cancel':           'Cancel',
      'ota.flash':            'Flash',

      // ── About Tab ──
      'about.title':      'AirMic',
      'about.device':     'Device',
      'about.bleStatus':  'BLE Status',
      'about.wifiIp':     'WiFi IP',
      'about.version':    'Version',
      'about.help':       'Help',
      'about.helpText1':  'Connect via BLE to configure your AirMic module. Use the Files tab to browse, play, download, rename, or delete recordings from the SD card.',
      'about.helpText2':  'WiFi is required for file transfers and OTA updates.',

      // ── Player ──
      'player.noFile':       'No file selected',
      'player.prevTrack':    'Previous track',
      'player.nextTrack':    'Next track',
      'player.stop':         'Stop',
      'player.volume':       'Volume',
      'player.stopped':        'Stopped',
      'player.playbackEnded':  'Playback ended:',
      'player.playbackError':  'Playback error:',
      'player.playFailed':     'Play failed',
      'player.playing':        'Playing:',

      // ── File operations ──
      'notify.deleting':       'Deleting:',
      'notify.ok':             'OK?',
      'notify.noSel':          'No files selected',
      'notify.noDel':          'No files to delete',
      'notify.batchDel':       'Batch delete:',
      'notify.delAll':         'Delete all:',
      'notify.files':          'files',
      'notify.deleteDone':     'Delete done',
      'notify.filesDeleted':   'Files deleted',
      'notify.deletedRemain':  'Deleted,',
      'notify.remaining':      'remaining',
      'notify.fileDeleted':    'File deleted',
      'notify.deleteFailed':   'Delete failed',
      'notify.fileRenamed':    'File renamed',
      'notify.renameFailed':   'Rename failed',
      'notify.renameSuccess':  'File renamed',
      'notify.renameFail':     'Rename failed',
      'notify.noWifi':         'WiFi not connected',

      // ── Status ──
      'stat.rec':   'REC',
      'stat.enc':   'ENC',
      'stat.time':  'TIME',

      // ── WiFi ──
      'wifi.ssidRequired':     'SSID is required',
      'wifi.connecting':       'Connecting...',
      'wifi.connected':        'Connected',
      'wifi.obtainingIp':      'Obtaining IP...',
      'wifi.notConnected':     'Not connected. Check SSID/password.',
      'wifi.failedStatus':     'Failed to get WiFi status',
      'wifi.configSaved':      'Config saved',
      'wifi.configError':      'Config ERROR',
      'wifi.timeout':          'Connection timeout',
      'wifi.connectingIp':     'Connecting...',

      // ── Time ──
      'time.synced':    'Time synced',
      'time.error':     'ERROR',

      // ── Encoder ──
      'enc.wav':   'WAV',
      'enc.aac':   'AAC',
      'enc.alac':  'ALAC',
      'enc.set':   'Rate set',
      'enc.chSet': 'Channels set',
      'agc.none':  'None',
      'agc.alc':   'ALC',
      'agc.drc':   'DRC (TODO)',

      // ── Download ──
      'dl.downloaded':  'Downloaded',
      'dl.error':       'Download error:',
      'dl.noWifi':      'WiFi not connected',

      // ── Misc ──
      'misc.found':   'found',
      'misc.file':    'file',
      'misc.files':   'files',
      'misc.error':   'ERROR:',
      'misc.fetchErr':'Fetch error:',
      'misc.otaReq':  'OTA requires WiFi connection',
      'misc.http':    'HTTP',

      // ── Log ──
      'log.tx':       'TX →',
      'log.rx':       'RX ←',
      'log.sendErr':  'send err',
      'log.fetched':  'Fetched',
      'log.viaHttp':  'files via HTTP',
      'files.found':  '%d file(s) found',
    },

    zh: {
      // ── App ──
      'app.brand':         'AirMic',
      'app.subtitle':      'FPV 音频模块',

      // ── Connection ──
      'conn.connected':    '已连接',
      'conn.notConnected': '未连接',
      'conn.scanning':     '正在扫描 AirMic...',
      'conn.connectedTo':  '已连接：',
      'conn.notifications':'通知已就绪',
      'conn.disconnected': '已断开',
      'conn.error':        '错误：',
      'conn.notConnectedShort': '已断开',

      // ── Tab Bar ──
      'tab.files':     '文件',
      'tab.settings':  '设置',
      'tab.ota':       '升级',
      'tab.about':     '关于',

      // ── Log ──
      'log.title':     '日志',

      // ── Files Tab ──
      'files.refresh':        '刷新',
      'files.deleteSelected': '删除选中',
      'files.deleteAll':      '全部删除',
      'files.sortName':       '名称',
      'files.sortSize':       '大小',
      'files.empty':          '连接 BLE 和 WiFi 后浏览文件',
      'files.emptyHint':      '连接后文件列表自动加载',
      'files.noFiles':        '没有文件',
      'files.loading':        '加载中...',
      'files.failed':         '文件加载失败',
      'files.noWifi':         'WiFi 未连接',
      'files.noWifiHint':     '无法获取文件信息',
      'files.failedList':     '获取文件列表失败',
      'files.play':           '播放',
      'files.download':       '下载',
      'files.rename':         '重命名',
      'files.delete':         '删除',

      // ── Settings Tab ──
      'settings.wifiSetup':   'WiFi 设置',
      'settings.ssid':        'SSID',
      'settings.password':    '密码',
      'settings.connectWifi': '连接 WiFi',
      'settings.timeSync':    '时间同步',
      'settings.syncTime':    '同步时间',
      'settings.audioConfig': '音频配置',
      'settings.encoder':     '编码器',
      'settings.channels':    '声道',
      'settings.mono':        '单声道',
      'settings.stereo':      '立体声',
      'settings.agcMode':     'AGC 模式',
      'settings.apply':       '应用',
      'settings.deviceStatus':'设备状态',
      'settings.queryStatus': '查询状态',
      'settings.language':    '语言 / Language',

      // ── OTA Tab ──
      'ota.firmwareUpgrade':  '固件升级',
      'ota.desc':             '选择 .bin 固件文件通过 WiFi 上传刷写，完成后设备将自动重启。',
      'ota.uploadFlash':      '上传并刷写',
      'ota.selectBin':        '请先选择 .bin 文件',
      'ota.onlyBin':          '仅支持 .bin 文件',
      'ota.uploading':        '上传中...',
      'ota.flashComplete':    '刷写完成，正在重启...',
      'ota.uploadFailed':     '上传失败 — 请检查网络或 CORS',
      'ota.uploadTimeout':    '上传超时',
      'ota.uploadStarted':    'OTA 上传开始：',
      'ota.confirmTitle':     '确认固件升级',
      'ota.confirmBody':      '设备将在刷写后重启，是否继续？',
      'ota.cancel':           '取消',
      'ota.flash':            '刷写',

      // ── About Tab ──
      'about.title':      'AirMic',
      'about.device':     '设备',
      'about.bleStatus':  'BLE 状态',
      'about.wifiIp':     'WiFi IP',
      'about.version':    '版本',
      'about.help':       '帮助',
      'about.helpText1':  '通过 BLE 连接配置 AirMic 模块。在文件标签页中浏览、播放、下载、重命名或删除 SD 卡中的录音。',
      'about.helpText2':  '文件传输和 OTA 升级需要 WiFi 连接。',

      // ── Player ──
      'player.noFile':       '未选择文件',
      'player.prevTrack':    '上一曲',
      'player.nextTrack':    '下一曲',
      'player.stop':         '停止',
      'player.volume':       '音量',
      'player.stopped':        '已停止',
      'player.playbackEnded':  '播放结束：',
      'player.playbackError':  '播放错误：',
      'player.playFailed':     '播放失败',
      'player.playing':        '正在播放：',

      // ── File operations ──
      'notify.deleting':       '正在删除：',
      'notify.ok':             '确定？',
      'notify.noSel':          '未选择文件',
      'notify.noDel':          '没有文件可删除',
      'notify.batchDel':       '批量删除：',
      'notify.delAll':         '全部删除：',
      'notify.files':          '个文件',
      'notify.deleteDone':     '删除完成',
      'notify.filesDeleted':   '文件已删除',
      'notify.deletedRemain':  '已删除，',
      'notify.remaining':      '个剩余',
      'notify.fileDeleted':    '文件已删除',
      'notify.deleteFailed':   '删除失败',
      'notify.fileRenamed':    '文件已重命名',
      'notify.renameFailed':   '重命名失败',
      'notify.renameSuccess':  '文件已重命名',
      'notify.renameFail':     '重命名失败',
      'notify.noWifi':         'WiFi 未连接',

      // ── Status ──
      'stat.rec':   '录音',
      'stat.enc':   '编码',
      'stat.time':  '时间',

      // ── WiFi ──
      'wifi.ssidRequired':     '请输入 SSID',
      'wifi.connecting':       '连接中...',
      'wifi.connected':        '已连接',
      'wifi.obtainingIp':      '获取 IP 中...',
      'wifi.notConnected':     '未连接。请检查 SSID/密码。',
      'wifi.failedStatus':     '获取 WiFi 状态失败',
      'wifi.configSaved':      '配置已保存',
      'wifi.configError':      '配置错误',
      'wifi.timeout':          '连接超时',
      'wifi.connectingIp':     '连接中...',

      // ── Time ──
      'time.synced':    '时间已同步',
      'time.error':     '错误',

      // ── Encoder ──
      'enc.wav':   'WAV',
      'enc.aac':   'AAC',
      'enc.alac':  'ALAC',
      'enc.set':   '码率已设置',
      'enc.chSet': '声道已设置',
      'agc.none':  '无',
      'agc.alc':   'ALC',
      'agc.drc':   'DRC (TODO)',

      // ── Download ──
      'dl.downloaded':  '已下载',
      'dl.error':       '下载错误：',
      'dl.noWifi':      'WiFi 未连接',

      // ── Misc ──
      'misc.found':   '个文件',
      'misc.file':    '个文件',
      'misc.files':   '个文件',
      'misc.error':   '错误：',
      'misc.fetchErr':'获取错误：',
      'misc.otaReq':  'OTA 需要 WiFi 连接',
      'misc.http':    'HTTP',

      // ── Log ──
      'log.tx':       'TX →',
      'log.rx':       'RX ←',
      'log.sendErr':  '发送错误',
      'log.fetched':  '已获取',
      'log.viaHttp':  '个文件 (HTTP)',
      'files.found':  '发现 %d 个文件',
    }
  }

  // ── Resolve language ──
  const lang = (() => {
    const stored = localStorage.getItem('airmic_lang')
    if (stored === 'en' || stored === 'zh') return stored
    return navigator.language.startsWith('zh') ? 'zh' : 'en'
  })()

  // ── Render data-i18n in HTML ──
  function render() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n')
      const text = dict[lang][key]
      if (text !== undefined) {
        if (el.hasAttribute('data-i18n-placeholder')) {
          el.setAttribute('placeholder', text)
        } else if (el.hasAttribute('data-i18n-title')) {
          el.setAttribute('title', text)
        } else {
          el.textContent = text
        }
      }
    })
    // Update html lang attribute
    document.documentElement.lang = lang
  }

  return {
    lang,
    t: (key) => dict[lang][key] ?? key,
    render,
    setLang: (l) => {
      localStorage.setItem('airmic_lang', l)
      location.reload()
    }
  }
})()

// Auto-render on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', I18N.render)
} else {
  I18N.render()
}
