// ── File Operations ──────────────────────────────────────

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

// ── Toast ──

let s_toastTimer = null

function showToast(msg, duration) {
  const el = document.getElementById('toast')
  if (!el) return
  el.textContent = msg
  el.classList.add('show')
  clearTimeout(s_toastTimer)
  s_toastTimer = setTimeout(() => el.classList.remove('show'), duration || 2500)
}

// ── Batch Delete State ──

let s_batchDeleteQueue = null  // null = not in batch mode
let s_batchDeletePending = 0

// ── Sort State ──

let s_sortBy = 'name'
let s_sortAsc = true

function setSort(mode) {
  if (s_sortBy === mode) {
    s_sortAsc = !s_sortAsc
  } else {
    s_sortBy = mode
    s_sortAsc = mode === 'name'
  }
  fetchFileList()
}

// ── Fetch file list via HTTP ──

async function fetchFileList() {
  if (!window.airmicWifiIp) { setResp('respFileList', I18N.t('files.noWifi'), false); return }
  // Sync sort button UI
  const btnN = document.getElementById('btnSortName')
  const btnS = document.getElementById('btnSortSize')
  if (btnN) {
    btnN.className = 'btn btn-sm btn-sort' + (s_sortBy === 'name' ? ' active' : '')
    btnN.innerHTML = I18N.t('files.sortName') + ' ' + (s_sortBy === 'name' ? (s_sortAsc ? '▴' : '▾') : '')
  }
  if (btnS) {
    btnS.className = 'btn btn-sm btn-sort' + (s_sortBy === 'size' ? ' active' : '')
    btnS.innerHTML = I18N.t('files.sortSize') + ' ' + (s_sortBy === 'size' ? (s_sortAsc ? '▴' : '▾') : '')
  }
  try {
    const resp = await fetch(`http://${window.airmicWifiIp}/files`)
    if (!resp.ok) throw new Error('HTTP ' + resp.status)
    const data = await resp.json()
    const container = document.getElementById('fileList')
    container.innerHTML = ''

    // Update storage info bar — show used / total
    const storageEl = document.getElementById('storageInfo')
    if (storageEl && data.free_bytes !== undefined) {
      const used = formatFileSize(data.total_bytes - data.free_bytes)
      const total = formatFileSize(data.total_bytes)
      storageEl.textContent = I18N.t('storage.used') + ' ' + used + ' / ' + total
    }

    if (data.files && data.files.length > 0) {
      const sorted = [...data.files].sort((a, b) => {
        let cmp = s_sortBy === 'size' ? a.size - b.size : a.name.localeCompare(b.name)
        return s_sortAsc ? cmp : -cmp
      })
      sorted.forEach(file => {
        const row = document.createElement('div')
        row.className = 'file-row'; row.dataset.filename = file.name
        row.innerHTML = `
          <input type="checkbox" class="file-check" data-filename="${escapeHtml(file.name)}">
          <div class="file-info">
            <span class="file-name">${escapeHtml(file.name)}</span>
            <span class="file-size">${formatFileSize(file.size)}</span>
          </div>
          <div class="file-actions">
            <button class="action-btn play" title="${I18N.t('files.play')}">▶</button>
            <button class="action-btn download" title="${I18N.t('files.download')}">↓</button>
            <button class="action-btn rename" title="${I18N.t('files.rename')}">✎</button>
            <button class="action-btn delete" title="${I18N.t('files.delete')}">✕</button>
          </div>
          <div class="progress-bar"><div class="progress-fill"></div></div>`
        row.querySelector('.play').onclick = () => playFile(file.name)
        row.querySelector('.download').onclick = () => downloadFile(file.name, file.size)
        row.querySelector('.rename').onclick = () => startRename(file.name)
        row.querySelector('.delete').onclick = (e) => startDelete(file.name, e.currentTarget)
        container.appendChild(row)
      })
      // Restore playing state after re-render
      if (s_playingFile) {
        const activeRow = container.querySelector(`[data-filename="${CSS.escape(s_playingFile)}"]`)
        if (activeRow) {
          const activeBtn = activeRow.querySelector('.action-btn.play')
          if (activeBtn) { activeBtn.textContent = '⏹'; activeBtn.classList.add('playing') }
          activeRow.classList.add('playing')
          s_playingRow = activeRow
        } else {
          // Playing file was deleted or disappeared
          playerStop()
        }
      }
      // fileCount removed
    } else {
      container.innerHTML = '<div class="empty-state">' + I18N.t('files.noFiles') + '</div>'
      // fileCount removed
    }
    log(I18N.t('log.fetched') + ' ' + (data.count || data.files?.length || 0) + ' ' + I18N.t('log.viaHttp'), 'ok')
  } catch (e) {
    setResp('respFileList', I18N.t('misc.error') + ' ' + e.message, false)
    log(I18N.t('misc.fetchErr') + ' ' + e.message, 'err')
  }
}

// ── Rename ──

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

// ── Single Delete ──

function startDelete(filename, btnEl) {
  if (btnEl.dataset.confirming === 'true') {
    btnEl.dataset.confirming = ''; btnEl.classList.remove('confirming')
    btnEl.textContent = '✕'
    log(I18N.t('notify.deleting') + ' ' + filename, 'tx')
    cmdDeleteFile(filename)
    return
  }
  btnEl.dataset.confirming = 'true'; btnEl.classList.add('confirming')
  btnEl.textContent = I18N.t('notify.ok')
  setTimeout(() => {
    btnEl.dataset.confirming = ''; btnEl.classList.remove('confirming')
    btnEl.textContent = '✕'
  }, 3000)
}

// ── Batch Delete ──

function deleteSelectedFiles(btnEl) {
  if (btnEl.dataset.confirming === 'true') {
    btnEl.dataset.confirming = ''; btnEl.classList.remove('confirming')
    btnEl.textContent = I18N.t('files.deleteSelected')
    const checked = document.querySelectorAll('.file-check:checked')
    if (checked.length === 0) { log(I18N.t('notify.noSel'), ''); return }
    s_batchDeleteQueue = Array.from(checked).map(cb => cb.dataset.filename)
    s_batchDeletePending = s_batchDeleteQueue.length
    log(I18N.t('notify.batchDel') + ' ' + s_batchDeleteQueue.join(', '), 'tx')
    cmdDeleteFile(s_batchDeleteQueue.shift())
    return
  }
  btnEl.dataset.confirming = 'true'; btnEl.classList.add('confirming')
  btnEl.textContent = I18N.t('notify.ok')
  setTimeout(() => {
    btnEl.dataset.confirming = ''; btnEl.classList.remove('confirming')
    btnEl.textContent = I18N.t('files.deleteSelected')
  }, 3000)
}

function deleteAllFiles(btnEl) {
  const rows = document.querySelectorAll('#fileList .file-row')
  if (rows.length === 0) { log(I18N.t('notify.noDel'), ''); return }
  if (btnEl.dataset.confirming === 'true') {
    btnEl.dataset.confirming = ''; btnEl.classList.remove('confirming')
    btnEl.textContent = I18N.t('files.deleteAll')
    // Check all checkboxes first so UI reflects the operation
    rows.forEach(row => { const cb = row.querySelector('.file-check'); if (cb) cb.checked = true })
    s_batchDeleteQueue = Array.from(rows).map(row => row.dataset.filename)
    s_batchDeletePending = s_batchDeleteQueue.length
    log(I18N.t('notify.delAll') + ' ' + s_batchDeleteQueue.length + ' ' + I18N.t('notify.files'), 'tx')
    cmdDeleteFile(s_batchDeleteQueue.shift())
    return
  }
  btnEl.dataset.confirming = 'true'; btnEl.classList.add('confirming')
  btnEl.textContent = I18N.t('notify.ok')
  setTimeout(() => {
    btnEl.dataset.confirming = ''; btnEl.classList.remove('confirming')
    btnEl.textContent = I18N.t('files.deleteAll')
  }, 3000)
}

// ── Player Singleton ──

let s_player = null
let s_playingFile = null
let s_playingRow = null
let s_audioCtx = null
let s_analyser = null
let s_animFrame = null

function formatTime(sec) {
  if (isNaN(sec) || sec < 0) return '00:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0')
}

function clearPlayerState() {
  if (s_playingRow) {
    const btn = s_playingRow.querySelector('.action-btn.play')
    if (btn) { btn.textContent = '▶'; btn.classList.remove('playing') }
    s_playingRow.classList.remove('playing')
    s_playingRow = null
  }
  s_playingFile = null
}

function suspendVUMeter() {
  if (s_animFrame) { cancelAnimationFrame(s_animFrame); s_animFrame = null }
  if (s_audioCtx && s_audioCtx.state === 'suspended') return
  if (s_audioCtx && s_audioCtx.state !== 'closed') {
    s_audioCtx.suspend()
  }
}

function resumeVUMeter() {
  if (s_audioCtx && s_audioCtx.state === 'suspended') {
    s_audioCtx.resume()
  }
  startVUMeter()
}

function stopVUMeter() {
  if (s_animFrame) { cancelAnimationFrame(s_animFrame); s_animFrame = null }
  if (s_audioCtx) {
    s_audioCtx.close().catch(() => {})
    s_audioCtx = null
    s_analyser = null
  }
  const canvas = document.getElementById('pVU')
  if (canvas) {
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
  }
}

function initVUCanvas() {
  const canvas = document.getElementById('pVU')
  if (!canvas) return
  const rect = canvas.getBoundingClientRect()
  const dpr = window.devicePixelRatio || 1
  const w = rect.width || canvas.parentElement.clientWidth || 400
  const h = rect.height || canvas.parentElement.clientHeight || 28
  canvas.width = w * dpr
  canvas.height = h * dpr
  canvas.style.width = w + 'px'
  canvas.style.height = h + 'px'
  return { canvas, ctx: canvas.getContext('2d'), w, h, dpr }
}

function drawVUMeterIdle() {
  const c = initVUCanvas()
  if (!c) return
  const { canvas, ctx, w, h, dpr } = c
  ctx.scale(dpr, dpr)
  ctx.clearRect(0, 0, w, h)

  const barCount = 28, gap = 2
  const barW = (w - gap * (barCount - 1)) / barCount

  ctx.fillStyle = 'rgba(245,166,35,0.04)'
  for (let i = 0; i < barCount; i++) {
    const x = i * (barW + gap)
    ctx.fillRect(x, h - 3, barW, 3)
  }
}

function startVUMeter() {
  const c = initVUCanvas()
  if (!c) return
  const { canvas, ctx, w, h, dpr } = c

  if (!s_analyser) {
    drawVUMeterIdle()
    return
  }

  const data = new Uint8Array(s_analyser.frequencyBinCount)
  const barCount = 28
  const gap = 2
  const barW = (w - gap * (barCount - 1)) / barCount

  function render() {
    ctx.save()
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, w, h)

    s_analyser.getByteFrequencyData(data)

    for (let i = 0; i < barCount; i++) {
      const binStart = Math.floor(i * data.length / barCount)
      const binEnd = Math.floor((i + 1) * data.length / barCount)
      let sum = 0
      for (let j = binStart; j < binEnd; j++) sum += data[j]
      const pct = Math.min(1, (sum / (binEnd - binStart)) / 255 * 1.8)

      const barH = Math.max(1, Math.round(pct * h))
      const x = i * (barW + gap)
      const y = h - barH

      if (pct > 0.75)      ctx.fillStyle = '#ef4444'
      else if (pct > 0.5)  ctx.fillStyle = '#f5a623'
      else if (pct > 0.12) ctx.fillStyle = '#2dd4bf'
      else                  ctx.fillStyle = 'rgba(45,212,191,0.15)'

      ctx.fillRect(x, y, barW, barH)
    }

    ctx.restore()
    s_animFrame = requestAnimationFrame(render)
  }

  render()
}

function updatePlayerUI() {
  const bar = document.getElementById('playerBar')
  const fill = document.getElementById('pFill')
  const thumb = document.getElementById('pThumb')
  const timeEl = document.getElementById('pTime')
  const playBtn = document.getElementById('pBtnPlay')
  const vuCanvas = document.getElementById('pVU')
  if (!bar || !fill || !timeEl || !playBtn) return

  const idle = !s_player || !s_playingFile

  bar.classList.toggle('idle', idle)
  fill.style.opacity = ''
  thumb.style.left = idle ? '-999px' : thumb.style.left

  if (idle) {
    document.getElementById('pFilename').textContent = I18N.t('player.noFile')
    timeEl.textContent = '--:-- / --:--'
    fill.style.width = '0%'
    playBtn.textContent = '▶'
    playBtn.classList.add('idle')
    if (vuCanvas) vuCanvas.style.opacity = '0.12'
    stopVUMeter()
    return
  }

  playBtn.classList.remove('idle')
  if (vuCanvas) vuCanvas.style.opacity = ''
  document.getElementById('pFilename').textContent = s_playingFile

  const cur = s_player.currentTime || 0
  const dur = s_player.duration
  const hasDur = isFinite(dur) && dur > 0

  if (hasDur) {
    timeEl.textContent = formatTime(cur) + ' / ' + formatTime(dur)
    const pct = (cur / dur) * 100
    fill.style.width = pct + '%'
    thumb.style.left = pct + '%'
  } else {
    // Duration unknown (AAC streaming without Content-Length)
    timeEl.textContent = formatTime(cur) + ' / --:--'
    fill.style.width = '100%'
    fill.style.opacity = '0.15'
    thumb.style.left = '-999px'
  }

  playBtn.textContent = s_player.paused ? '▶' : '⏸'
}

function playerStop() {
  stopVUMeter()
  if (s_player) {
    s_player.pause()
    s_player.src = ''
    s_player.load()
    s_player = null
  }
  clearPlayerState()
  updatePlayerUI()
  log(I18N.t('player.stopped'), '')
}

function playerTogglePause() {
  if (!s_player || !s_playingFile) return
  if (s_player.paused) {
    s_player.play().catch(() => playerStop())
    resumeVUMeter()
  } else {
    s_player.pause()
    suspendVUMeter()
  }
  updatePlayerUI()
}

function playerSeek(e) {
  if (!s_player) return
  const wrap = document.getElementById('pProgWrap')
  if (!wrap) return
  const rect = wrap.getBoundingClientRect()
  const x = (e.clientX || (e.touches && e.touches[0].clientX)) - rect.left
  const pct = Math.max(0, Math.min(1, x / rect.width))
  if (!isNaN(s_player.duration)) {
    s_player.currentTime = pct * s_player.duration
  }
}

function playerSetVolume(v) {
  if (s_player) s_player.volume = v
}

function getFileNames() {
  return Array.from(document.querySelectorAll('#fileList .file-row'))
    .map(r => r.dataset.filename)
    .filter(Boolean)
}

function playerPrev() {
  if (!s_playingFile) return
  const names = getFileNames()
  const idx = names.indexOf(s_playingFile)
  if (idx > 0) playFile(names[idx - 1])
}

function playerNext() {
  if (!s_playingFile) return
  const names = getFileNames()
  const idx = names.indexOf(s_playingFile)
  if (idx < names.length - 1) playFile(names[idx + 1])
}

function playFile(filename) {
  if (!window.airmicWifiIp) { setResp('respFileList', I18N.t('files.noWifi'), false); return }

  // Same file → stop (row button shows ⏹ = stop, not pause toggle)
  if (s_playingFile === filename) { playerStop(); return }

  // Different file → stop current, start new
  playerStop()

  const row = document.querySelector(`[data-filename="${CSS.escape(filename)}"]`)
  if (!row) return

  const btn = row.querySelector('.action-btn.play')
  if (btn) { btn.textContent = '⏹'; btn.classList.add('playing') }
  row.classList.add('playing')

  s_playingFile = filename
  s_playingRow = row

  const url = `http://${window.airmicWifiIp}/play?${encodeURIComponent(filename)}`
  const audio = new Audio()
  audio.crossOrigin = 'anonymous'
  audio.src = url
  s_player = audio
  audio.volume = parseInt(document.getElementById('pVol')?.value || '80') / 100

  audio.addEventListener('timeupdate', updatePlayerUI)
  audio.addEventListener('loadedmetadata', updatePlayerUI)
  audio.addEventListener('durationchange', updatePlayerUI)
  audio.addEventListener('progress', () => {
    const loaded = document.getElementById('pLoaded')
    if (!loaded || !audio.buffered || !audio.buffered.length) return
    const end = audio.buffered.end(audio.buffered.length - 1)
    const dur = audio.duration
    loaded.style.width = (isFinite(dur) && dur > 0 ? (end / dur) * 100 : 0) + '%'
  })
  audio.addEventListener('ended', () => {
    log(I18N.t('player.playbackEnded') + ' ' + filename, 'ok')
    playerStop()
  })
  audio.addEventListener('error', () => {
    // Guard: this audio element was already replaced by a new playFile() call
    if (s_player !== audio) return
    log(I18N.t('player.playbackError') + ' ' + filename, 'err')
    setResp('respFileList', I18N.t('player.playFailed'), false)
    playerStop()
  })

  // Set up VU meter via Web Audio API
  try {
    const actx = new (window.AudioContext || window.webkitAudioContext)()
    // Mobile browsers may start AudioContext suspended; resume right away
    if (actx.state === 'suspended') actx.resume()
    const source = actx.createMediaElementSource(audio)
    const analyser = actx.createAnalyser()
    analyser.fftSize = 128
    source.connect(analyser)
    analyser.connect(actx.destination)
    s_audioCtx = actx
    s_analyser = analyser
  } catch (e) {
    // VU meter unavailable — play without it; audio still plays through element
  }

  audio.play().catch(() => {
    log(I18N.t('player.playFailed') + ': ' + filename, 'err')
    setResp('respFileList', I18N.t('player.playFailed'), false)
    playerStop()
    return
  })
  log(I18N.t('player.playing') + ' ' + filename, 'ok')
  updatePlayerUI()
  startVUMeter()
}

// ── Progress bar click-to-seek ──

document.getElementById('pProgWrap')?.addEventListener('click', playerSeek)
document.getElementById('pProgWrap')?.addEventListener('touchstart', (e) => {
  // Only prevent default if it's a single touch on the progress bar, not scrolling
  if (!e.target.closest('.p-row-prog')) return
  playerSeek(e)
  e.preventDefault()
}, { passive: false })

// ── Download with Progress ──

async function downloadFile(filename, size) {
  if (!window.airmicWifiIp) { setResp('respFileList', I18N.t('files.noWifi'), false); return }

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
    log(`${I18N.t('dl.downloaded')} ${filename} (${(received/1048576).toFixed(2)} MB, ${(received/1048576/elapsed).toFixed(2)} MB/s)`, 'ok')

    setTimeout(() => { progressBar.style.display = 'none'; progressFill.style.width = '0%'; progressFill.classList.remove('done'); dlBtn.disabled = false }, 2000)
  } catch (e) {
    progressFill.classList.add('error')
    log(I18N.t('dl.error') + ' ' + e.message, 'err')
    dlBtn.disabled = false
    setTimeout(() => { progressBar.style.display = 'none'; progressFill.className = 'progress-fill' }, 3000)
  }
}

// ── Notification Handler (called from protocol.js onNotify) ──

function handleFileNotify(cmd, ok, d) {
  // 0x06: File list count response
  if (cmd === 0x06) {
    if (ok) {
      let offset = 2
      const count = d[offset++] | (d[offset++] << 8)
      setResp('respFileList', I18N.t('files.found').replace('%d', count), true)
      if (window.airmicWifiIp) { fetchFileList() }
      else {
        document.getElementById('fileList').innerHTML = '<div class="empty-state">' + I18N.t('files.noWifi') + '<br><span class="hint">' + I18N.t('files.noWifiHint') + '</span></div>'
      }
    } else {
      setResp('respFileList', I18N.t('files.failedList'), false)
      document.getElementById('fileList').innerHTML = '<div class="empty-state">' + I18N.t('files.failed') + '</div>'
      // fileCount removed
    }
    return
  }

  // 0x07: Delete response
  if (cmd === 0x07) {
    if (ok) {
      if (s_batchDeleteQueue !== null) {
        s_batchDeletePending--
        if (s_batchDeletePending <= 0 || s_batchDeleteQueue.length === 0) {
          // Batch complete
          s_batchDeleteQueue = null
          setResp('respFileList', I18N.t('notify.deleteDone'), true)
          showToast(I18N.t('notify.filesDeleted'))
          setTimeout(cmdGetFileList, 500)
        } else {
          setResp('respFileList', I18N.t('notify.deletedRemain') + ' ' + s_batchDeletePending + ' ' + I18N.t('notify.remaining'), true)
          cmdDeleteFile(s_batchDeleteQueue.shift())
        }
      } else {
        setResp('respFileList', I18N.t('notify.fileDeleted'), true)
        showToast(I18N.t('notify.fileDeleted'))
        setTimeout(cmdGetFileList, 500)
      }
    } else {
      setResp('respFileList', I18N.t('notify.deleteFailed'), false)
      // If batch in progress, abort the remaining queue
      s_batchDeleteQueue = null
      s_batchDeletePending = 0
    }
    document.querySelectorAll('.file-row[data-renaming]').forEach(el => delete el.dataset.renaming)
    return
  }

  // 0x08: Rename response
  if (cmd === 0x08) {
    if (ok) { setResp('respFileList', I18N.t('notify.renameSuccess'), true); setTimeout(cmdGetFileList, 500) }
    else { setResp('respFileList', I18N.t('notify.renameFail'), false) }
    document.querySelectorAll('.file-row[data-renaming]').forEach(el => delete el.dataset.renaming)
    return
  }
}
