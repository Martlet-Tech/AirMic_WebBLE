// ── Browser-side AAC → WAV (decoded PCM in RIFF container) ──

async function aacToWav(aacBuf, sampleRate, channels) {
  // Decode AAC via Web Audio API
  const actx = new (window.AudioContext || window.webkitAudioContext)()
  const audioBuf = await actx.decodeAudioData(aacBuf.slice(0))
  actx.close()

  const ch = audioBuf.numberOfChannels
  const sr = audioBuf.sampleRate
  const len = audioBuf.length
  const dataLen = len * ch * 2  // 16-bit samples

  // Build WAV: 44-byte header + PCM data
  const view = new DataView(new ArrayBuffer(44 + dataLen))
  const w = (off, v) => view.setUint32(off, v, true)
  const w16 = (off, v) => view.setUint16(off, v, true)
  const w8 = (off, v) => view.setUint8(off, v)

  w8(0, 0x52); w8(1, 0x49); w8(2, 0x46); w8(3, 0x46)  // "RIFF"
  w(4, 36 + dataLen)                                     // file size - 8
  w8(8, 0x57); w8(9, 0x41); w8(10, 0x56); w8(11, 0x45)  // "WAVE"
  w8(12, 0x66); w8(13, 0x6D); w8(14, 0x74); w8(15, 0x20) // "fmt "
  w(16, 16)                                                // chunk size
  w16(20, 1)                                               // PCM
  w16(22, ch)                                              // channels
  w(24, sr)                                                // sample rate
  w(28, sr * ch * 2)                                       // byte rate
  w16(32, ch * 2)                                          // block align
  w16(34, 16)                                              // bits per sample
  w8(36, 0x64); w8(37, 0x61); w8(38, 0x74); w8(39, 0x61)  // "data"
  w(40, dataLen)                                            // data chunk size

  let off = 44
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < ch; c++) {
      const s = Math.max(-32768, Math.min(32767, audioBuf.getChannelData(c)[i] * 32768))
      w16(off, s < 0 ? s + 65536 : s)
      off += 2
    }
  }
  return view.buffer
}
