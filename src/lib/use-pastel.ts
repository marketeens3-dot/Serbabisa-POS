"use client"
import { useTheme } from "next-themes"
import { pastelDarkFor, pastelFor } from "./catalog-visual"

/** Hook tema-aware untuk gradasi pastel katalog: mode terang memakai palet
    pastel terang, mode gelap memakai versi redup (pastelDarkFor). Render awal
    (sebelum mount) selalu memakai palet terang supaya bebas hydration mismatch,
    lalu ikut tema setelah mount. Light mode tidak pernah berubah perilakunya. */
export function usePastelFor() {
  const { resolvedTheme } = useTheme()
  return (seed: string) => (resolvedTheme === "dark" ? pastelDarkFor(seed) : pastelFor(seed))
}
