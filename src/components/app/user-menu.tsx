// Kontrol akun & tema — diekstrak dari app-shell agar bisa dipakai topbar
// desktop DAN header mobile POS tanpa impor siklus (app-shell ↔ pos-view).
"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { LogOut, Moon, Sun, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { SessionUserDTO } from "@/lib/types";

const emptySubscribe = () => () => {};

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  // Hydration-safe tanpa setState-in-effect: snapshot server=false, client=true.
  const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false)
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      aria-label={theme === "dark" ? "Aktifkan mode terang" : "Aktifkan mode gelap"}
      title="Ganti tema terang/gelap"
    >
      {mounted && theme === "dark" ? <Sun className="size-4.5" /> : <Moon className="size-4.5" />}
    </Button>
  )
}

export function UserMenu({
  user,
  onProfile,
  onLogout,
  isAdmin,
  showThemeItem = false,
}: {
  user: SessionUserDTO
  onProfile: () => void
  onLogout: () => void
  isAdmin: boolean
  /** Item ganti tema di dalam menu — untuk header yang tidak punya toggle topbar (POS mobile). */
  showThemeItem?: boolean
}) {
  const { theme, setTheme } = useTheme()
  const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="size-9 rounded-full p-0" aria-label="Menu akun">
          <div className="size-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-semibold text-sm">
            {user.fullName.slice(0, 1).toUpperCase()}
          </div>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>
          <p className="text-sm font-medium truncate">{user.fullName}</p>
          <p className="text-xs text-muted-foreground truncate">{user.email}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {showThemeItem && mounted && (
          <DropdownMenuItem onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
            {theme === "dark" ? <Sun className="size-4 mr-2" /> : <Moon className="size-4 mr-2" />}
            {theme === "dark" ? "Mode terang" : "Mode gelap"}
          </DropdownMenuItem>
        )}
        {!isAdmin && (
          <DropdownMenuItem onClick={onProfile}>
            <User className="size-4 mr-2" />
            Profil Saya
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={onLogout} className="text-destructive focus:text-destructive">
          <LogOut className="size-4 mr-2" />
          Keluar
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
