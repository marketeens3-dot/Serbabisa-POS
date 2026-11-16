"use client";

// Confetti burst — perayaan visual saat momen sukacita (checkout sukses, dll).
// Implementasi DOM murni: ~72 potongan div animasi CSS (tanpa library berat),
// auto-unmount setelah selesai, pointer-events-none sehingga tidak mengganggu
// klik, dan menghormati prefers-reduced-motion (potongan tak dirender sama
// sekali — CSS menyembunyikannya, hook useReducedMotion mencegah mount).

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

const COLORS = [
  "#3878ff", // biru brand
  "#22c1ee", // cyan
  "#10b981", // emerald
  "#f59e0b", // amber
  "#f43f5e", // rose
  "#a855f7", // violet
  "#fbbf24", // kuning cerah
] as const;

const SHAPES = ["rounded-[2px]", "rounded-full", "rounded-[3px]"] as const;

type Piece = {
  id: number;
  left: number; // 0–100 vw%
  drift: number; // px horizontal selama jatuh
  delay: number; // s
  duration: number; // s
  spin: number; // deg
  size: number; // px
  color: string;
  shape: string;
  tall: boolean; // potongan kertas memanjang
};

function buildPieces(count: number): Piece[] {
  const pieces: Piece[] = [];
  for (let i = 0; i < count; i++) {
    pieces.push({
      id: i,
      left: Math.random() * 100,
      drift: (Math.random() - 0.5) * 220,
      delay: Math.random() * 0.45,
      duration: 2.1 + Math.random() * 1.3,
      spin: (Math.random() > 0.5 ? 1 : -1) * (360 + Math.random() * 540),
      size: 6 + Math.random() * 8,
      color: COLORS[i % COLORS.length],
      shape: SHAPES[i % SHAPES.length],
      tall: i % 3 === 0,
    });
  }
  return pieces;
}

export function ConfettiBurst({ pieces = 72, className }: { pieces?: number; className?: string }) {
  const [mounted, setMounted] = useState(false);
  const [expired, setExpired] = useState(false);
  const data = useMemo(() => buildPieces(pieces), [pieces]);

  // Mount setelah frame pertama + unmount otomatis setelah animasi tuntas
  // (durasi maksimum + delay maksimum + buffer).
  useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true));
    const t = setTimeout(() => setExpired(true), 4500);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
    };
  }, []);

  // SSR snapshot & kondisi mati: tidak render apa pun (hydration-safe).
  if (!mounted || expired) return null;

  return (
    <div
      className={cn("pointer-events-none fixed inset-0 z-[100] overflow-hidden no-print", className)}
      aria-hidden="true"
    >
      {data.map((p) => (
        <span
          key={p.id}
          className={cn("sb-confetti-piece", p.shape)}
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.tall ? p.size * 1.9 : p.size,
            background: p.color,
            ["--sb-drift" as string]: `${p.drift}px`,
            ["--sb-delay" as string]: `${p.delay}s`,
            ["--sb-duration" as string]: `${p.duration}s`,
            ["--sb-spin" as string]: `${p.spin}deg`,
          }}
        />
      ))}
    </div>
  );
}
