// Tips onboarding sekali-tampil: "tekan-tahan kartu = input jumlah".
// Dismissible per perangkat (localStorage "sb-tip-longpress") dan otomatis
// disembunyikan begitu pengguna berhasil melakukan tekan-tahan pertama.
//
// Pola useSyncExternalStore (sama seperti useHashRoute): server snapshot
// selalu false (tidak ada localStorage di SSR) → tidak ada hydration
// mismatch; pasca-mount snapshot client dibaca dan tips muncul bila belum
// pernah ditutup. Perubahan (tutup manual / auto setelah tekan-tahan
// pertama) disiarkan lewat event custom agar semua instance sinkron.
"use client";

import { useSyncExternalStore } from "react";
import { Pointer, X } from "lucide-react";

const LONG_PRESS_TIP_KEY = "sb-tip-longpress";
const TIP_EVENT = "sb-longpress-tip-change";

function isDismissed(): boolean {
  try {
    return window.localStorage.getItem(LONG_PRESS_TIP_KEY) === "1";
  } catch {
    return false;
  }
}

/** Tutup tips permanen (per perangkat) + beri tahu semua instance untuk re-render. */
export function dismissLongPressTip() {
  try {
    window.localStorage.setItem(LONG_PRESS_TIP_KEY, "1");
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

/** Snapshot client: tampil selama belum pernah ditutup. */
function getSnapshot(): boolean {
  return !isDismissed();
}

/** Snapshot server: tidak pernah tampil (SSR tidak punya localStorage). */
function getServerSnapshot(): boolean {
  return false;
}

export function LongPressTip() {
  const visible = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  if (!visible) return null;

  return (
    <div
      role="note"
      aria-label="Tips penggunaan katalog"
      className="sb-fade-in flex items-start gap-3 rounded-xl border border-primary/25 bg-primary/[0.05] dark:bg-primary/[0.08] px-3.5 py-2.5"
    >
      <span
        className="size-8 rounded-lg bg-primary/10 text-primary ring-1 ring-inset ring-primary/15 flex items-center justify-center shrink-0 mt-0.5"
        aria-hidden="true"
      >
        <Pointer className="size-4" />
      </span>
      <p className="text-xs leading-relaxed text-muted-foreground min-w-0 flex-1">
        <span className="font-semibold text-foreground">Tips:</span> tahan kartu produk
        (atau item <span className="font-medium text-foreground">Sering dijual</span>) untuk
        memasukkan jumlah sekaligus — ketuk biasa menambah 1.
      </p>
      <button
        type="button"
        onClick={dismissLongPressTip}
        className="shrink-0 size-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors focus-visible:outline-2 focus-visible:outline-ring"
        aria-label="Tutup tips (tidak ditampilkan lagi)"
      >
        <X className="size-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}
