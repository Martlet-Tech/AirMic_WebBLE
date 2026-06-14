// ── AAC → WAV via Aurora.js AAC decoder ─────────────────────

function interleavedToWav(samples, sampleRate, channels) {
  const len = samples.length / channels
  const dataLen = samples.length * 2
  const buf = new ArrayBuffer(44 + dataLen)
  const w = new DataView(buf)
  const u32 = (o, v) => w.setUint32(o, v, true)
  const u16 = (o, v) => w.setUint16(o, v, true)
  const u8  = (o, v) => w.setUint8(o, v)

  u8(0,0x52);u8(1,0x49);u8(2,0x46);u8(3,0x46)
  u32(4, 36 + dataLen)
  u8(8,0x57);u8(9,0x41);u8(10,0x56);u8(11,0x45)
  u8(12,0x66);u8(13,0x6D);u8(14,0x74);u8(15,0x20)
  u32(16, 16)
  u16(20, 1)
  u16(22, channels)
  u32(24, sampleRate)
  u32(28, sampleRate * channels * 2)
  u16(32, channels * 2)
  u16(34, 16)
  u8(36,0x64);u8(37,0x61);u8(38,0x74);u8(39,0x61)
  u32(40, dataLen)

  let off = 44
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-32768, Math.min(32767, samples[i] * 32768))
    u16(off, s < 0 ? s + 65536 : s)
    off += 2
  }
  return buf
}

// Decode AAC ArrayBuffer → WAV ArrayBuffer via Aurora.js
function aacDecodeToWav(aacBuf) {
  return new Promise((resolve, reject) => {
    let fmt = null
    const asset = AV.Asset.fromBuffer(aacBuf.slice(0))
    asset.on('format', f => { fmt = f })
    asset.on('error', reject)
    asset.decodeToBuffer(wavBuf => {
      if (!fmt) { reject(new Error('no format')); return }
      resolve(interleavedToWav(wavBuf, fmt.sampleRate, fmt.channelsPerFrame))
    })
  })
}
