"use client";

// useCountUp — animasi angka "berjalan naik" (dari nilai sebelumnya → target)
// dengan easing-out. Dipakai di kartu KPI dashboard agar angka terasa hidup,
// bukan sekadar muncul. Menghormati prefers-reduced-motion: angka langsung
// snap ke target tanpa animasi.

import { useEffect, useRef, useState } from "react";

export function useCountUp(target: number, durationMs = 900): number {
  const [value, setValue] = useState(0);
  const rafRef = useRef(0);
  const startRef = useRef(0);
  // Basis animasi berikutnya — selalu nilai target terakhir yang diminta.
  const fromRef = useRef(0);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const from = reduced ? target : fromRef.current;
    startRef.current = 0;
    const total = Math.max(1, durationMs);

    const tick = (ts: number) => {
      if (!startRef.current) startRef.current = ts;
      // Gerak-minim: snap langsung ke target tanpa animasi.
      if (reduced) {
        setValue(target);
        return;
      }
      // ease-out cubic — mulai cepat, mendarat lembut
      const t = Math.min(1, (ts - startRef.current) / total);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(from + (target - from) * eased);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
      else setValue(target);
    };
    rafRef.current = requestAnimationFrame(tick);
    fromRef.current = target;
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, durationMs]);

  return value;
}
