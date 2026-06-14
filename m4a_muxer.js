// ── AudioBuffer → WAV (RIFF PCM) ─────────────────────────────

function audioBufToWav(audioBuf) {
  const ch = audioBuf.numberOfChannels
  const sr = audioBuf.sampleRate
  const len = audioBuf.length
  const dataLen = len * ch * 2

  const buf = new ArrayBuffer(44 + dataLen)
  const w = new DataView(buf)
  const u32 = (o, v) => w.setUint32(o, v, true)
  const u16 = (o, v) => w.setUint16(o, v, true)
  const u8  = (o, v) => w.setUint8(o, v)

  u8(0, 0x52); u8(1, 0x49); u8(2, 0x46); u8(3, 0x46)  // RIFF
  u32(4, 36 + dataLen)
  u8(8, 0x57); u8(9, 0x41); u8(10, 0x56); u8(11, 0x45) // WAVE
  u8(12, 0x66); u8(13, 0x6D); u8(14, 0x74); u8(15, 0x20)// fmt
  u32(16, 16)                                           // chunk size
  u16(20, 1)                                            // PCM
  u16(22, ch)
  u32(24, sr)
  u32(28, sr * ch * 2)
  u16(32, ch * 2)
  u16(34, 16)
  u8(36, 0x64); u8(37, 0x61); u8(38, 0x74); u8(39, 0x61)// data
  u32(40, dataLen)

  let off = 44
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < ch; c++) {
      const s = Math.max(-32768, Math.min(32767, audioBuf.getChannelData(c)[i] * 32768))
      u16(off, s < 0 ? s + 65536 : s)
      off += 2
    }
  }
  return buf
}
