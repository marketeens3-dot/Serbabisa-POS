// Bunyi + getaran konfirmasi kasir (WebAudio + Vibration API — tanpa file, ringan).
// - tick(): item masuk keranjang (tap kartu / barcode scan / Enter).
// - success(): transaksi berhasil (checkout 201).
// Getaran (navigator.vibrate) aktif di Android; iOS/desktop diam-diam no-op.
// Preferensi perangkat: localStorage "sb-pos-sound" ("1" aktif — default, "0" mati).
// AudioContext dibuat lazy pada gestur pertama (kebijakan autoplay aman) dan
// semua jalur dibungkus try/catch — bunyi TIDAK boleh mengganggu alur kasir.

const STORAGE_KEY = "sb-pos-sound"

let ctx: AudioContext | null = null

export function isPosSoundEnabled(): boolean {
  try {
    return (typeof window !== "undefined" && window.localStorage.getItem(STORAGE_KEY)) !== "0"
  } catch {
    return true
  }
}

export function setPosSoundEnabled(v: boolean) {
  try {
    window.localStorage.setItem(STORAGE_KEY, v ? "1" : "0")
  } catch {
    // localStorage tidak tersedia (private mode) — abaikan.
  }
}

function getContext(): AudioContext | null {
  try {
    if (!ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!AC) return null
      ctx = new AC()
    }
    if (ctx.state === "suspended") void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

/** Satu nada singkat dengan decay halus — tidak "nyaring". */
function tone(ac: AudioContext, freq: number, start: number, dur: number, gain: number) {
  const osc = ac.createOscillator()
  const amp = ac.createGain()
  osc.type = "sine"
  osc.frequency.value = freq
  amp.gain.setValueAtTime(0.0001, ac.currentTime + start)
  amp.gain.exponentialRampToValueAtTime(gain, ac.currentTime + start + 0.012)
  amp.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + start + dur)
  osc.connect(amp).connect(ac.destination)
  osc.start(ac.currentTime + start)
  osc.stop(ac.currentTime + start + dur + 0.05)
}

/** Getaran singkat — pola kecil agar terasa pasti tanpa mengganggu. */
function vibrateSafe(pattern: number | number[]) {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(pattern)
    }
  } catch {
    // no-op — perangkat tanpa dukungan getar
  }
}

/** Bunyi "tik" item masuk keranjang — dua nada naik singkat (±130 ms) + getar halus. */
export function playCartTick() {
  if (!isPosSoundEnabled()) return
  try {
    vibrateSafe(12)
    const ac = getContext()
    if (!ac) return
    tone(ac, 880, 0, 0.07, 0.05)
    tone(ac, 1318.5, 0.06, 0.09, 0.045)
  } catch {
    // jangan pernah ganggu alur kasir
  }
}

/** Bunyi transaksi berhasil — tiga nada naik (±260 ms), rasa "selesai" + getar ganda. */
export function playCheckoutSuccess() {
  if (!isPosSoundEnabled()) return
  try {
    vibrateSafe([28, 60, 28])
    const ac = getContext()
    if (!ac) return
    tone(ac, 659.3, 0, 0.09, 0.05)
    tone(ac, 880, 0.09, 0.09, 0.05)
    tone(ac, 1174.7, 0.18, 0.14, 0.055)
  } catch {
    // jangan pernah ganggu alur kasir
  }
}
