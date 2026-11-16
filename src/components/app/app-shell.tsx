// AppShell — kerangka SPA Serbabisa: hash router (#/app/*, #/admin/*), guard per role,
// sidebar desktop + drawer mobile, topbar, footer sticky, dark/light mode.
"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ComponentType } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  BarChart3,
  ChartColumn,
  ClipboardCheck,
  Coins,
  FolderKanban,
  FolderTree,
  HandCoins,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Printer,
  ReceiptText,
  ScanBarcode,
  ScrollText,
  Settings,
  Store,
  Ticket,
  TrendingUp,
  Truck,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import SyncIndicator from "./sync-indicator";
import { ThemeToggle, UserMenu } from "./user-menu";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { AppContext, type AppCtx } from "@/components/app/app-context";
import { api, ApiClientError } from "@/lib/api-client";
import { useApi } from "@/hooks/use-api";
import type { SessionUserDTO, StockAlertsDTO } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useIsBelowLg } from "@/hooks/use-mobile";

/* Code-splitting view — aplikasi lebih ringan: hanya view yang dikunjungi yang
   dimuat (kasir tidak pernah mengunduh chunk area admin, dsb.). Skeleton
   singkat agar perpindahan menu terasa instan. */
const ViewSkeleton = () => (
  <div className="space-y-4" aria-busy="true" aria-label="Memuat halaman">
    <div className="h-24 rounded-xl bg-muted/40 animate-pulse" />
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <div className="h-28 rounded-xl bg-muted/40 animate-pulse" />
      <div className="h-28 rounded-xl bg-muted/40 animate-pulse" />
      <div className="h-28 rounded-xl bg-muted/40 animate-pulse" />
      <div className="h-28 rounded-xl bg-muted/40 animate-pulse" />
    </div>
  </div>
);
function dyn<P>(load: () => Promise<{ default: ComponentType<P> }>) {
  return dynamic(load, { loading: () => <ViewSkeleton /> });
}

const DashboardView = dyn(() => import("@/components/user/dashboard-view"));
const PosView = dyn(() => import("@/components/user/pos/pos-view"));
const CatalogView = dyn<{ type: "PRODUCT" | "SERVICE"; initialStatus?: string }>(() => import("@/components/user/catalog-view"));
const CategoriesView = dyn(() => import("@/components/user/categories-view"));
const CustomersView = dyn(() => import("@/components/user/customers-view"));
const CustomerDetailView = dyn<{ customerId: string }>(() => import("@/components/user/customer-detail-view"));
const TransactionsView = dyn(() => import("@/components/user/transactions-view"));
const TransactionDetailView = dyn<{ transactionId: string }>(() => import("@/components/user/transaction-detail-view"));
const ProjectsView = dyn(() => import("@/components/user/projects-view"));
const ProjectDetailView = dyn<{ projectId: string }>(() => import("@/components/user/project-detail-view"));
const CashflowView = dyn(() => import("@/components/user/cashflow-view"));
const DebtsView = dyn(() => import("@/components/user/debts-view"));
const PurchasesView = dyn(() => import("@/components/user/purchases-view"));
const FinanceDashboardView = dyn(() => import("@/components/user/finance-dashboard-view"));
const AnalyticsView = dyn(() => import("@/components/user/analytics-view"));
const StockOpnameView = dyn(() => import("@/components/user/stock-opname-view"));
const VouchersView = dyn(() => import("@/components/user/vouchers-view"));
const InvoiceBuilderView = dyn(() => import("@/components/user/invoice-builder-view"));
const ReportsView = dyn(() => import("@/components/user/reports-view"));
const SettingsView = dyn(() => import("@/components/user/settings-view"));
const ProfileView = dyn(() => import("@/components/user/profile-view"));
const AdminDashboardView = dyn(() => import("@/components/admin/admin-dashboard-view"));
const AdminUsersView = dyn(() => import("@/components/admin/admin-users-view"));
const AdminUserDetailView = dyn<{ userId: string }>(() => import("@/components/admin/admin-user-detail-view"));
const AdminTenantsView = dyn(() => import("@/components/admin/admin-tenants-view"));
const AdminAuditView = dyn(() => import("@/components/admin/admin-audit-view"));
const AdminSettingsView = dyn(() => import("@/components/admin/admin-settings-view"));

type NavItem = { label: string; path: string; icon: LucideIcon; end?: boolean }

const USER_NAV: NavItem[] = [
  { label: "Dashboard", path: "/app", icon: LayoutDashboard, end: true },
  { label: "Kasir", path: "/app/pos", icon: ScanBarcode },
  { label: "Produk", path: "/app/products", icon: Package },
  { label: "Jasa", path: "/app/services", icon: Wrench },
  { label: "Kategori", path: "/app/categories", icon: FolderTree },
  { label: "Pelanggan", path: "/app/customers", icon: Users },
  { label: "Transaksi", path: "/app/transactions", icon: ReceiptText },
  { label: "Proyek RAB", path: "/app/projects", icon: FolderKanban },
  { label: "Kas & Cashflow", path: "/app/cashflow", icon: Coins },
  { label: "Hutang Piutang", path: "/app/debts", icon: HandCoins },
  { label: "Pembelian", path: "/app/purchases", icon: Truck },
  { label: "Stok Opname", path: "/app/stock-opname", icon: ClipboardCheck },
  { label: "Voucher", path: "/app/vouchers", icon: Ticket },
  { label: "Keuangan", path: "/app/finance", icon: TrendingUp },
  { label: "Analitik", path: "/app/analytics", icon: BarChart3 },
  { label: "Nota", path: "/app/invoice-builder", icon: Printer },
  { label: "Laporan", path: "/app/reports", icon: ChartColumn },
  { label: "Pengaturan", path: "/app/settings", icon: Settings },
]

const ADMIN_NAV: NavItem[] = [
  { label: "Dashboard", path: "/admin", icon: LayoutDashboard, end: true },
  { label: "Pengguna", path: "/admin/users", icon: Users },
  { label: "Toko", path: "/admin/tenants", icon: Store },
  { label: "Audit Log", path: "/admin/audit", icon: ScrollText },
  { label: "Pengaturan", path: "/admin/settings", icon: Settings },
]

const VIEW_TITLES: Record<string, string> = {
  pos: "Kasir",
  products: "Produk",
  services: "Jasa",
  categories: "Kategori",
  customers: "Pelanggan",
  transactions: "Transaksi",
  projects: "Proyek RAB",
  cashflow: "Kas & Cashflow",
  debts: "Hutang & Piutang",
  purchases: "Pembelian",
  "stock-opname": "Stok Opname",
  vouchers: "Voucher & Promo",
  finance: "Dashboard Keuangan",
  analytics: "Analitik",
  "invoice-builder": "Nota",
  reports: "Laporan",
  settings: "Pengaturan",
  profile: "Profil Saya",
  users: "Pengguna",
  tenants: "Toko",
  audit: "Audit Log",
}

/* Hash router hydration-safe: snapshot server selalu "" (root) — identik
   dengan render server, sehingga TIDAK ada hydration mismatch saat halaman
   di-reload dengan hash tertentu; useSyncExternalStore kemudian sinkron ke
   hash asli setelah mount. */
const subscribeHash = (callback: () => void) => {
  window.addEventListener("hashchange", callback)
  return () => window.removeEventListener("hashchange", callback)
}

function useHashRoute() {
  const hash = useSyncExternalStore(subscribeHash, () => window.location.hash, () => "")
  const path = hash.replace(/^#/, "") || "/"
  const segments = path.split("/").filter(Boolean)
  return { path, segments }
}

const emptySubscribe = () => () => {}

export default function AppShell({ initialUser }: { initialUser: SessionUserDTO }) {
  const router = useRouter()
  // Drawer navigasi aktif untuk SEMUA lebar < 1024px (ponsel & tablet) —
  // memperbaiki bug area 768–1023px yang kehilangan navigasi total.
  const showNavDrawer = useIsBelowLg()
  const [user, setUser] = useState<SessionUserDTO>(initialUser)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const { path: realPath, segments: realSegments } = useHashRoute()
  // Hydration-safe untuk DEEP-LINK (muat ulang dengan hash, mis. #/app/pos):
  // server selalu merender path "/" (Dashboard), jadi selama hydrasi klien
  // juga memakai "/" agar pohon cocok dengan HTML server — view asli baru
  // dipasang setelah mount. Tanpa ini, muat langsung ke hash tertentu
  // memicu hydration mismatch (id Radix & teks header bergeser).
  const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false)
  const path = mounted ? realPath : "/"
  const segments = mounted ? realSegments : []

  const navigate = useCallback((to: string) => {
    const clean = to.startsWith("/") ? to : `/${to}`
    window.location.hash = `#${clean}`
  }, [])

  // Default & guard role — USER tidak bisa ke #/admin, SUPER_ADMIN tidak ke #/app.
  // Effect memakai REAL PATH (bukan path efektif pra-mount) dan BERJALAN HANYA
  // SETELAH mount: sebelum mount, useHashRoute masih memegang snapshot server
  // ("/") — bertindak saat itu bisa mengalihkan deep-link #/app/pos keliru ke /app.
  useEffect(() => {
    if (!mounted) return
    const defaultPath = user.role === "SUPER_ADMIN" ? "/admin" : "/app"
    if (!realPath || realPath === "/") {
      navigate(defaultPath)
    } else if (user.role === "USER" && realPath.startsWith("/admin")) {
      navigate("/app")
    } else if (user.role === "SUPER_ADMIN" && realPath.startsWith("/app")) {
      navigate("/admin")
    }
  }, [mounted, realPath, user.role, navigate])

  const refreshUser = useCallback(async () => {
    try {
      const res = await api.get<{ user: SessionUserDTO }>("/api/auth/me")
      setUser(res.user)
    } catch {
      router.refresh() // sesi hangus → server render login
    }
  }, [router])

  const logout = useCallback(async () => {
    try {
      await api.post("/api/auth/logout")
      toast.success("Anda telah keluar.")
    } catch (err) {
      if (err instanceof ApiClientError && err.status !== 401) {
        toast.error("Gagal keluar. Silakan coba lagi.")
      }
    }
    router.refresh()
  }, [router])

  // Peringatan stok menipis untuk badge navigasi (hanya role USER — admin
  // tidak punya katalog toko). Endpoint ringan + cache 2 menit di server.
  const { data: stockAlerts, refresh: refreshStockAlerts } = useApi<StockAlertsDTO>(
    user.role === "USER" ? "/api/catalog/stock-alerts" : null
  )

  // Segarkan hitungan stok saat aplikasi kembali terlihat (kasir menaruh
  // tablet lalu mengambilnya lagi / berpindah tab). Dithrottle 60 detik —
  // server tetap di-cache 2 menit, jadi ini murah; badge jadi segar tanpa
  // reload manual saat shift panjang.
  const lastStockRefreshRef = useRef(0)
  useEffect(() => {
    if (user.role !== "USER") return
    const onVisible = () => {
      if (document.visibilityState !== "visible") return
      const now = Date.now()
      if (now - lastStockRefreshRef.current < 60_000) return
      lastStockRefreshRef.current = now
      refreshStockAlerts()
    }
    document.addEventListener("visibilitychange", onVisible)
    window.addEventListener("focus", onVisible)
    return () => {
      document.removeEventListener("visibilitychange", onVisible)
      window.removeEventListener("focus", onVisible)
    }
  }, [user.role, refreshStockAlerts])

  const ctx = useMemo<AppCtx>(() => ({
    user,
    setUser,
    refreshUser,
    navigate,
    logout,
    stockAlertCount: stockAlerts?.count ?? 0,
    refreshStockAlerts,
    openNavDrawer: () => setDrawerOpen(true),
  }), [user, refreshUser, navigate, logout, stockAlerts, refreshStockAlerts])

  const nav = user.role === "SUPER_ADMIN" ? ADMIN_NAV : USER_NAV
  const area = segments[0] ?? (user.role === "SUPER_ADMIN" ? "admin" : "app") // "app" | "admin"
  const section = segments[1] ?? ""
  const detailId = segments[2] ?? ""
  // Mode POS: topbar standar disembunyikan di mobile (diganti header brand POS),
  // bottom nav memakai varian 4 tujuan tanpa tombol Menu (Menu ada di bar keranjang).
  const posMode = area === "app" && section === "pos"

  const title = useMemo(() => {
    if (!section) return area === "admin" ? "Dashboard Admin" : "Dashboard"
    return VIEW_TITLES[section] ?? "Serbabisa"
  }, [area, section])

  const view = useMemo(() => {
    if (area !== "admin") {
      // ---------- USER / KASIR ----------
      switch (section) {
        case "pos":
          return <PosView />
        case "products":
          // /app/products/stok — pintasan dari badge/kartu stok menipis:
          // buka daftar produk dengan filter "Stok menipis" aktif.
          return detailId === "stok"
            ? <CatalogView key="products-low" type="PRODUCT" initialStatus="LOW_STOCK" />
            : <CatalogView key="products" type="PRODUCT" />
        case "services":
          return <CatalogView key="services" type="SERVICE" />
        case "categories":
          return <CategoriesView />
        case "customers":
          return detailId ? <CustomerDetailView customerId={detailId} /> : <CustomersView />
        case "transactions":
          return detailId ? <TransactionDetailView transactionId={detailId} /> : <TransactionsView />
        case "projects":
          return detailId ? <ProjectDetailView projectId={detailId} /> : <ProjectsView />
        case "cashflow":
          return <CashflowView />
        case "debts":
          return <DebtsView />
        case "purchases":
          return <PurchasesView />
        case "stock-opname":
          return <StockOpnameView />
        case "vouchers":
          return <VouchersView />
        case "finance":
          return <FinanceDashboardView />
        case "analytics":
          return <AnalyticsView />
        case "invoice-builder":
          return <InvoiceBuilderView />
        case "reports":
          return <ReportsView />
        case "settings":
          return <SettingsView />
        case "profile":
          return <ProfileView />
        default:
          return <DashboardView />
      }
    }
    // ---------- SUPER ADMIN ----------
    switch (section) {
      case "users":
        return detailId ? <AdminUserDetailView userId={detailId} /> : <AdminUsersView />
      case "tenants":
        return <AdminTenantsView />
      case "audit":
        return <AdminAuditView />
      case "settings":
        return <AdminSettingsView />
      default:
        return <AdminDashboardView />
    }
  }, [area, section, detailId])

  return (
    <AppContext.Provider value={ctx}>
      <div className="min-h-screen flex flex-col">
        <div className="flex flex-1 min-h-0">
          {/* Sidebar desktop — navy solid, bersih & mudah dibaca */}
          <aside className="hidden lg:flex flex-col w-64 shrink-0 bg-sidebar text-sidebar-foreground border-r border-sidebar-border sticky top-0 h-screen">
            <SidebarContent user={user} nav={nav} path={path} navigate={navigate} onLogout={logout} alertCount={stockAlerts?.count ?? 0} />
          </aside>

          <div className="flex-1 flex flex-col min-w-0">
            {/* Topbar — kaca frosted. Di POS mobile disembunyikan: header brand
                ala referensi (logo + sapaan + avatar) dirender oleh POS itu sendiri. */}
            <header className={cn(
              "sticky top-0 z-30 flex items-center gap-2 sm:gap-3 h-14 lg:h-16 px-3 sm:px-5 border-b border-border/60 bg-background/90 backdrop-blur-xl supports-[backdrop-filter]:bg-background/80 no-print",
              posMode && "max-lg:hidden"
            )}>
              {showNavDrawer && (
                <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
                  <SheetTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label="Buka menu navigasi">
                      <Menu className="size-5" />
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="left" className="p-0 w-72 bg-sidebar/95 backdrop-blur-xl supports-[backdrop-filter]:bg-sidebar/90 text-sidebar-foreground border-sidebar-border">
                    <SheetTitle className="sr-only">Menu navigasi</SheetTitle>
                    <SheetDescription className="sr-only">
                      Pilih halaman untuk dibuka dari daftar menu di bawah.
                    </SheetDescription>
                    <SidebarContent
                      user={user}
                      nav={nav}
                      path={path}
                      navigate={(p) => {
                        navigate(p)
                        setDrawerOpen(false)
                      }}
                      onLogout={logout}
                      alertCount={stockAlerts?.count ?? 0}
                    />
                  </SheetContent>
                </Sheet>
              )}
              <h2 className="font-semibold text-base lg:text-lg truncate">{title}</h2>
              <div className="flex-1" />
              {user.tenant && (
                <div className="hidden md:flex items-center gap-2 rounded-full border border-border/60 bg-muted/30 backdrop-blur-sm pl-3 pr-3.5 py-1.5 max-w-[280px]">
                  <Store className="size-3.5 text-primary shrink-0" aria-hidden="true" />
                  <span className="text-sm truncate">{user.tenant.businessName}</span>
                </div>
              )}
              <SyncIndicator />
              <ThemeToggle />
              <UserMenu user={user} onProfile={() => navigate("/app/profile")} onLogout={logout} isAdmin={user.role === "SUPER_ADMIN"} />
            </header>

            {/* Konten — pb ekstra di bawah lg memberi ruang untuk bottom nav */}
            <main className="flex-1 p-4 sm:p-5 lg:p-6 xl:p-8 max-lg:pb-24 max-w-full">
              <div key={path} className="sb-fade-in">
                {view}
              </div>
            </main>

            <footer className="mt-auto hidden lg:block border-t border-border/60 bg-background/95 backdrop-blur-md supports-[backdrop-filter]:bg-background/85 no-print">
              <div className="px-4 sm:px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-muted-foreground">
                <p className="flex items-center gap-2">
                  <img src="/logo-icon.png" alt="" className="h-4 w-auto" aria-hidden="true" />
                  Serbabisa · Kasir POS SaaS
                </p>
                <p>© 2026 Serbabisa — Data setiap toko terisolasi &amp; aman.</p>
              </div>
            </footer>
          </div>
        </div>

        {/* Bottom nav — ponsel & tablet (< lg). 5 seluas jempol: 4 tujuan
            tersering + "Menu" (drawer lengkap) di ujung kanan — termasuk di
            POS, menggantikan tombol Menu melayang di bar bawah keranjang. */}
        {showNavDrawer && (
          <BottomNav
            path={path}
            navigate={navigate}
            onOpenMenu={() => setDrawerOpen(true)}
            isAdmin={user.role === "SUPER_ADMIN"}
            alertCount={stockAlerts?.count ?? 0}
            posMode={posMode}
          />
        )}
      </div>
    </AppContext.Provider>
  )
}

/* Navigasi bawah gaya aplikasi native — 4 tujuan tersering + Menu (drawer).
   Item aktif: warna primer + titik indikator di atas (gaya tab bar iOS).
   Target sentuh: seluruh sel 64px tinggi, lebar ≥ 1/5 layar.
   Tombol Menu (icon + badge stok) SELALU di ujung kanan — sebelah Pengaturan. */
function BottomNav({
  path,
  navigate,
  onOpenMenu,
  isAdmin,
  alertCount,
  posMode = false,
}: {
  path: string
  navigate: (p: string) => void
  onOpenMenu: () => void
  isAdmin: boolean
  alertCount: number
  /** Varian POS: urutan tujuan 4 teratas mengikuti halaman kasir. */
  posMode?: boolean
}) {
  const items: { label: string; path: string; icon: LucideIcon; end?: boolean }[] = isAdmin
    ? [
        { label: "Dashboard", path: "/admin", icon: LayoutDashboard, end: true },
        { label: "Pengguna", path: "/admin/users", icon: Users },
        { label: "Toko", path: "/admin/tenants", icon: Store },
        { label: "Audit", path: "/admin/audit", icon: ScrollText },
      ]
    : posMode
      ? [
          { label: "Beranda", path: "/app", icon: LayoutDashboard, end: true },
          { label: "Laporan", path: "/app/reports", icon: ChartColumn },
          { label: "Produk", path: "/app/products", icon: Package },
          { label: "Pengaturan", path: "/app/settings", icon: Settings },
        ]
      : [
          { label: "Beranda", path: "/app", icon: LayoutDashboard, end: true },
          { label: "Kasir", path: "/app/pos", icon: ScanBarcode },
          { label: "Transaksi", path: "/app/transactions", icon: ReceiptText },
          { label: "Laporan", path: "/app/reports", icon: ChartColumn },
        ]

  const isActive = (it: { path: string; end?: boolean }) =>
    it.end
      ? path === it.path || path === `${it.path}/` || path === "" || path === "/"
      : path.startsWith(it.path)

  return (
    <nav
      aria-label="Navigasi cepat"
      className="lg:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border/60 bg-background/90 backdrop-blur-xl supports-[backdrop-filter]:bg-background/80 shadow-[0_-8px_24px_-16px_rgb(0_0_0/0.18)] no-print"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="grid grid-cols-5 max-w-lg mx-auto h-16">
        {items.map((it) => {
          const active = isActive(it)
          return (
            <button
              key={it.path}
              type="button"
              onClick={() => navigate(it.path)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex flex-col items-center justify-center gap-1 transition-transform active:scale-95 focus-visible:outline-2 focus-visible:outline-ring",
                active ? "text-primary" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {active && (
                <span className="absolute top-1.5 size-1 rounded-full bg-primary" aria-hidden="true" />
              )}
              <it.icon className="size-5" aria-hidden="true" />
              <span className={cn("text-[10.5px] leading-none", active ? "font-semibold" : "font-medium")}>
                {it.label}
              </span>
            </button>
          )
        })}
        <button
            type="button"
            onClick={onOpenMenu}
            aria-label={alertCount > 0 ? `Buka menu navigasi lengkap — ${alertCount} produk stok menipis` : "Buka menu navigasi lengkap"}
            aria-haspopup="dialog"
            className="relative flex flex-col items-center justify-center gap-1 text-muted-foreground transition-transform active:scale-95 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
          >
            <span className="relative">
              <Menu className="size-5" aria-hidden="true" />
              {alertCount > 0 && (
                <span
                  className="absolute -top-1.5 -right-2.5 min-w-4 h-4 px-1 rounded-full bg-amber-500 text-white text-[9.5px] font-bold leading-none flex items-center justify-center tabular-nums ring-2 ring-background"
                  aria-hidden="true"
                >
                  {alertCount > 99 ? "99+" : alertCount}
                </span>
              )}
            </span>
            <span className="text-[10.5px] leading-none font-medium">Menu</span>
          </button>
      </div>
    </nav>
  )
}

function SidebarContent({
  user,
  nav,
  path,
  navigate,
  onLogout,
  alertCount,
}: {
  user: SessionUserDTO
  nav: NavItem[]
  path: string
  navigate: (p: string) => void
  onLogout: () => void
  alertCount: number
}) {
  const isActive = (item: NavItem) => {
    const itemPath = item.path
    if (item.end) return path === itemPath || path === `${itemPath}/` || path === "" || path === "/"
    return path.startsWith(itemPath)
  }
  return (
    <div className="relative flex flex-col h-full overflow-hidden">
      {/* Hiasan lembut di dasar sidebar (non-interaktif, murni visual ala tema) */}
      <div className="pointer-events-none absolute -bottom-10 -right-10 size-44 rounded-full bg-primary/15 blur-2xl" aria-hidden="true" />
      <div className="pointer-events-none absolute bottom-16 -left-14 size-32 rounded-full bg-sky-400/10 blur-2xl" aria-hidden="true" />
      <div className="flex items-center gap-2.5 px-5 h-16 shrink-0">
        <img src="/logo-icon.png" alt="Logo Serbabisa" className="h-8.5 w-auto drop-shadow" />
        <div className="min-w-0">
          <p className="font-semibold tracking-tight text-white truncate">
            Serba<span className="text-sky-400">bisa</span>
          </p>
          <p className="text-[11px] text-zinc-400 truncate">
            {user.role === "SUPER_ADMIN" ? "Super Admin" : "POS Kasir"}
          </p>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1" aria-label="Navigasi utama">
        {nav.map((item) => {
          const active = isActive(item)
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={cn(
                "sb-wiggle w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-left transition-colors",
                active
                  ? "bg-primary text-primary-foreground font-semibold shadow-lg shadow-primary/25"
                  : "text-zinc-400 hover:text-white hover:bg-white/[0.06]"
              )}
              aria-current={active ? "page" : undefined}
            >
              <item.icon className={cn("sb-wiggle-target size-4.5 shrink-0", active ? "text-white" : "")} aria-hidden="true" />
              <span className="truncate">{item.label}</span>
              {item.path === "/app/products" && alertCount > 0 && (
                <span
                  className="ml-auto min-w-5 h-5 px-1.5 rounded-full bg-amber-500 text-white text-[11px] font-bold leading-none flex items-center justify-center tabular-nums shrink-0"
                  title={`${alertCount} produk stok menipis`}
                  aria-label={`${alertCount} produk stok menipis`}
                >
                  {alertCount > 99 ? "99+" : alertCount}
                </span>
              )}
            </button>
          )
        })}
      </nav>
      <div className="p-3 border-t border-sidebar-border shrink-0">
        <div className="flex items-center gap-3 rounded-lg px-2.5 py-2.5">
          <div className="size-9 rounded-full bg-primary/20 text-primary flex items-center justify-center font-semibold text-sm shrink-0" aria-hidden="true">
            {user.fullName.slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-white truncate">{user.fullName}</p>
            <p className="text-[11px] text-zinc-400 truncate">{user.email}</p>
          </div>
          <button
            onClick={onLogout}
            className="text-zinc-400 hover:text-white p-2 rounded-md hover:bg-sidebar-accent/60 transition-colors"
            aria-label="Keluar dari aplikasi"
            title="Keluar"
          >
            <LogOut className="size-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

/* ThemeToggle & UserMenu diekstrak ke ./user-menu — dipakai bersama
   topbar desktop dan header mobile POS. */
