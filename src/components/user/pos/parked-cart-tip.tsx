// Tips onboarding sekali-tampil #2: "parkir keranjang" (tombol Tahan / F4).
// Kontekstual: hanya relevan saat keranjang sedang berisi — parent (cart-panel)
// merendernya saat ada >= 2 baris item. Dismissible per perangkat
// (localStorage "sb-tip-parkir") dan otomatis disembunyikan setelah pengguna
// berhasil memarkir keranjang pertama kali.
//
// Pola useSyncExternalStore (sama seperti long-press-tip): snapshot server
// selalu false → tidak ada hydration mismatch; perubahan disiarkan lewat
// event custom agar semua instance sinkron.
"use client";

import { useSyncExternalStore } from "react";
import { PauseCircle, X } from "lucide-react";

const PARK_TIP_KEY = "sb-tip-parkir";
const TIP_EVENT = "sb-parkir-tip-change";

function isDismissed(): boolean {
  try {
    return window.localStorage.getItem(PARK_TIP_KEY) === "1";
  } catch {
    return false;
  }
}

/** Tutup tips permanen (per perangkat) + beri tahu semua instance. */
export function dismissParkedCartTip() {
  try {
    window.localStorage.setItem(PARK_TIP_KEY, "1");
  } catch {
    // private mode — tetap coba beri tahu instance agar UI konsisten
  }
  window.dispatchEvent(new Event(TIP_EVENT));
}

function subscribe(cb: () => void) {
  window.addEventListener("storage", cb); // tab lain
  window.addEventListener(TIP_EVENT, cb); // tab ini (manual / auto-dismiss)
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(TIP_EVENT, cb);
  };
}

function getSnapshot(): boolean {
  return !isDismissed();
}

function getServerSnapshot(): boolean {
  return false;
}

export function ParkedCartTip() {
  const visible = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  if (!visible) return null;

  return (
    <div
      role="note"
      aria-label="Tips parkir keranjang"
      className="sb-fade-in flex items-start gap-3 rounded-xl border border-amber-500/25 bg-amber-500/[0.06] dark:bg-amber-500/[0.09] px-3.5 py-2.5 mx-3 mt-2"
    >
      <span
        className="size-8 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 ring-1 ring-inset ring-amber-500/20 flex items-center justify-center shrink-0 mt-0.5"
        aria-hidden="true"
      >
        <PauseCircle className="size-4" />
      </span>
      <p className="text-xs leading-relaxed text-muted-foreground min-w-0 flex-1">
        <span className="font-semibold text-foreground">Tips:</span> pelanggan masih ragu? Parkirkan
        keranjangnya lewat tombol <span className="font-medium text-foreground">Tahan</span> di atas,
        lalu layani pelanggan berikutnya — ambil kembali kapan saja.
      </p>
      <button
        type="button"
        onClick={dismissParkedCartTip}
        className="shrink-0 size-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors focus-visible:outline-2 focus-visible:outline-ring"
        aria-label="Tutup tips (tidak ditampilkan lagi)"
      >
        <X className="size-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}
