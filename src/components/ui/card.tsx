import * as React from "react"

import { cn } from "@/lib/utils"

function Card({
  className,
  ornamented,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  /** true = tampilkan blob dekoratif di sudut kanan-bawah. Hanya untuk kartu
      display yang lega (grafik/statistik ringkasan) — bukan form/tabel/daftar. */
  ornamented?: boolean
}) {
  return (
    <div
      data-slot="card"
      className={cn(
        "bg-card text-card-foreground flex flex-col gap-6 rounded-3xl border border-border/60 py-6 shadow-[0_10px_30px_-24px_rgb(0_0_0/0.25)]",
        // ornamented: kunci blob di dalam kartu; isolate membuat -z-10 blob
        // berada di ATAS latar kartu tapi DI BAWAH konten (konten tak tertutup).
        ornamented && "relative isolate overflow-hidden",
        className
      )}
      {...props}
    >
      {ornamented && (
        <>
          {/* Hanya light mode (dark:hidden) agar tampilan dark tidak berubah. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-10 -right-10 size-28 rounded-full bg-white/70 -z-10 dark:hidden"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-8 -right-8 size-24 rounded-full bg-primary/[0.09] -z-10 dark:hidden"
          />
        </>
      )}
      {children}
    </div>
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-1.5 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6",
        className
      )}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn("leading-none font-semibold", className)}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className
      )}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("px-6", className)}
      {...props}
    />
  )
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn("flex items-center px-6 [.border-t]:pt-6", className)}
      {...props}
    />
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
}
