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

// ── Batch Delete State ──

let s_batchDeleteQueue = null  // null = not in batch mode
let s_batchDeletePending = 0

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
          <input type="checkbox" class="file-check" data-filename="${escapeHtml(file.name)}">
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

// ── Batch Delete ──

function deleteSelectedFiles(btnEl) {
  if (btnEl.dataset.confirming === 'true') {
    btnEl.dataset.confirming = ''; btnEl.classList.remove('confirming')
    btnEl.textContent = 'Delete Selected'
    const checked = document.querySelectorAll('.file-check:checked')
    if (checked.length === 0) { log('No files selected', ''); return }
    s_batchDeleteQueue = Array.from(checked).map(cb => cb.dataset.filename)
    s_batchDeletePending = s_batchDeleteQueue.length
    log('Batch delete: ' + s_batchDeleteQueue.join(', '), 'tx')
    cmdDeleteFile(s_batchDeleteQueue.shift())
    return
  }
  btnEl.dataset.confirming = 'true'; btnEl.classList.add('confirming')
  btnEl.textContent = 'OK?'
  setTimeout(() => {
    btnEl.dataset.confirming = ''; btnEl.classList.remove('confirming')
    btnEl.textContent = 'Delete Selected'
  }, 3000)
}

function deleteAllFiles(btnEl) {
  const rows = document.querySelectorAll('#fileList .file-row')
  if (rows.length === 0) { log('No files to delete', ''); return }
  if (btnEl.dataset.confirming === 'true') {
    btnEl.dataset.confirming = ''; btnEl.classList.remove('confirming')
    btnEl.textContent = 'Delete All'
    // Check all checkboxes first so UI reflects the operation
    rows.forEach(row => { const cb = row.querySelector('.file-check'); if (cb) cb.checked = true })
    s_batchDeleteQueue = Array.from(rows).map(row => row.dataset.filename)
    s_batchDeletePending = s_batchDeleteQueue.length
    log('Delete all: ' + s_batchDeleteQueue.length + ' files', 'tx')
    cmdDeleteFile(s_batchDeleteQueue.shift())
    return
  }
  btnEl.dataset.confirming = 'true'; btnEl.classList.add('confirming')
  btnEl.textContent = 'OK?'
  setTimeout(() => {
    btnEl.dataset.confirming = ''; btnEl.classList.remove('confirming')
    btnEl.textContent = 'Delete All'
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

// ── Notification Handler (called from protocol.js onNotify) ──

function handleFileNotify(cmd, ok, d) {
  // 0x06: File list count response
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
          setResp('respFileList', 'Delete done', true)
          setTimeout(cmdGetFileList, 500)
        } else {
          setResp('respFileList', 'Deleted, ' + s_batchDeletePending + ' remaining', true)
          cmdDeleteFile(s_batchDeleteQueue.shift())
        }
      } else {
        setResp('respFileList', 'File deleted', true)
        setTimeout(cmdGetFileList, 500)
      }
    } else {
      setResp('respFileList', 'Delete failed', false)
      // If batch in progress, abort the remaining queue
      s_batchDeleteQueue = null
      s_batchDeletePending = 0
    }
    document.querySelectorAll('.file-row[data-renaming]').forEach(el => delete el.dataset.renaming)
    return
  }

  // 0x08: Rename response
  if (cmd === 0x08) {
    if (ok) { setResp('respFileList', 'File renamed', true); setTimeout(cmdGetFileList, 500) }
    else { setResp('respFileList', 'Rename failed', false) }
    document.querySelectorAll('.file-row[data-renaming]').forEach(el => delete el.dataset.renaming)
    return
  }
}
