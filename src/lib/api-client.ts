// Fetch wrapper client-side dengan error Indonesia terstandar.
"use client";

export class ApiClientError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number
  ) {
    super(message);
  }
}

async function parseError(res: Response): Promise<ApiClientError> {
  try {
    const body = (await res.json()) as { error?: string; message?: string };
    return new ApiClientError(body.error ?? "UNKNOWN", body.message ?? "Terjadi kesalahan. Silakan coba lagi.", res.status);
  } catch {
    return new ApiClientError("NETWORK", "Koneksi bermasalah. Periksa jaringan Anda.", res.status);
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const isForm = init?.body instanceof FormData;
  const res = await fetch(path, {
    ...init,
    // FormData: JANGAN set Content-Type manual — browser yang menentukan
    // boundary multipart; body dikirim apa adanya (bukan JSON.stringify).
    headers: isForm ? init?.headers : { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    credentials: "same-origin",
  });
  if (!res.ok) throw await parseError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string) => apiFetch<T>(path),
  post: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) }),
  /** POST multipart (FormData) — untuk unggah gambar produk. */
  postForm: <T>(path: string, body: FormData) =>
    apiFetch<T>(path, { method: "POST", body }),
  patch: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: "PATCH", body: body === undefined ? undefined : JSON.stringify(body) }),
  del: <T>(path: string) => apiFetch<T>(path, { method: "DELETE" }),
};
