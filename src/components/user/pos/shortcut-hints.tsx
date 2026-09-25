// Baris petunjuk shortcut kasir — hanya desktop (lg+), sangat subtil.
// Ditempatkan di bawah pencarian katalog.
// Catatan: petunjuk "tahan kartu = jumlah" ada di LongPressTip (onboarding
// sekali-tampil) agar baris ini tetap ringkas — hanya shortcut keyboard nyata.
"use client";

const HINTS: { keys: string; label: string }[] = [
  { keys: "F2 /", label: "Cari" },
  { keys: "F4", label: "Parkir" },
  { keys: "F8", label: "Bayar" },
];

export function ShortcutHints() {
  return (
    <div
      className="hidden lg:flex items-center gap-2.5 text-[10px] text-muted-foreground/80"
      aria-hidden="true"
    >
      {HINTS.map((h) => (
        <span key={h.keys} className="inline-flex items-center gap-1">
          <kbd className="rounded-md border bg-muted px-1.5 py-0.5 font-mono text-[10px] font-semibold text-muted-foreground shadow-[inset_0_-1px_0_0_var(--border)]">
            {h.keys}
          </kbd>
          <span>{h.label}</span>
        </span>
      ))}
    </div>
  );
}
