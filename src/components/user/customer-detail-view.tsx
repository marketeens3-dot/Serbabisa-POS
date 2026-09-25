// Detail pelanggan: profil, ringkasan, riwayat transaksi, tombol WhatsApp.
"use client";

import { toast } from "sonner";
import { ArrowLeft, MessageCircle, Pencil, ReceiptText, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  ErrorState,
  LoadingRows,
  MoneyCell,
  PageHeader,
  PaymentMethodBadge,
  TransactionStatusBadge,
} from "@/components/app/shared";
import { useApi } from "@/hooks/use-api";
import { formatDateTimeID, formatIDR } from "@/lib/format";
import { formatPhoneDisplay } from "@/lib/phone";
import type { CustomerDTO, TransactionDTO } from "@/lib/types";
import { useRouter } from "next/navigation";

export default function CustomerDetailView({ customerId }: { customerId: string }) {
  const router = useRouter()
  const { data, error, loading, refresh } = useApi<{ customer: CustomerDTO; transactions: TransactionDTO[] }>(
    `/api/customers/${customerId}`
  )

  const customer = data?.customer
  const transactions = data?.transactions ?? []
  const waLink = customer?.phone ? `https://wa.me/${customer.phone}` : null

  async function handleEdit() {
    // Edit via modal sederhana: gunakan prompt-like flow di halaman pelanggan utama.
    router.push("/app/customers")
    toast.info("Pilih pelanggan di daftar lalu tekan Ubah.")
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto">
        <a href="#/app/customers" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4">
          <ArrowLeft className="size-4" /> Kembali ke daftar pelanggan
        </a>
        <ErrorState message={error} onRetry={refresh} />
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto">
      <a href="#/app/customers" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="size-4" /> Kembali ke daftar pelanggan
      </a>

      {loading || !customer ? (
        <LoadingRows rows={6} />
      ) : (
        <>
          <PageHeader
            title={customer.name}
            description={`Pelanggan sejak ${formatDateTimeID(customer.createdAt)}`}
            actions={
              <>
                {waLink ? (
                  <Button
                    className="gap-1.5"
                    onClick={() => window.open(waLink, "_blank", "noopener,noreferrer")}
                  >
                    <MessageCircle className="size-4" />
                    WhatsApp
                  </Button>
                ) : (
                  <Button variant="outline" disabled title="Nomor WhatsApp tidak valid">
                    <MessageCircle className="size-4" />
                    Nomor WhatsApp tidak valid
                  </Button>
                )}
                <Button variant="outline" onClick={handleEdit}>
                  <Pencil className="size-4" />
                  Ubah
                </Button>
              </>
            }
          />

          <div className="grid sm:grid-cols-3 gap-3 mb-5">
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="size-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center" aria-hidden="true">
                  <ReceiptText className="size-5" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Transaksi</p>
                  <p className="text-xl font-bold tabular">{customer.transactionCount ?? 0}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="size-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center" aria-hidden="true">
                  <Users className="size-5" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total belanja</p>
                  <p className="text-xl font-bold tabular">{formatIDR(customer.totalSpent ?? 0)}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">Kontak</p>
                <p className="font-medium tabular">{customer.phone ? formatPhoneDisplay(customer.phone) : "—"}</p>
                {customer.email && <p className="text-sm text-muted-foreground truncate">{customer.email}</p>}
                {customer.address && <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">{customer.address}</p>}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Riwayat Transaksi</CardTitle>
            </CardHeader>
            <CardContent>
              {!transactions.length ? (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  Belum ada transaksi untuk pelanggan ini.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice</TableHead>
                      <TableHead className="hidden sm:table-cell">Tanggal</TableHead>
                      <TableHead>Metode</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transactions.map((tx) => (
                      <TableRow key={tx.id}>
                        <TableCell>
                          <a href={`#/app/transactions/${tx.id}`} className="font-medium tabular hover:text-primary hover:underline">
                            {tx.invoiceNumber}
                          </a>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell text-muted-foreground text-sm">
                          {formatDateTimeID(tx.createdAt)}
                        </TableCell>
                        <TableCell><PaymentMethodBadge method={tx.paymentMethod} /></TableCell>
                        <TableCell><TransactionStatusBadge status={tx.status} /></TableCell>
                        <TableCell className="text-right">
                          <MoneyCell amount={tx.totalAmount} className="font-semibold" />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
