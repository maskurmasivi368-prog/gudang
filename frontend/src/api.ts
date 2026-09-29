import { storage } from "@/src/utils/storage";

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL;
export const TOKEN_KEY = "gudang_token";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await storage.secureGet<string>(TOKEN_KEY, "");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string> | undefined),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${BASE}/api${path}`, { ...init, headers });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const detail = data?.detail ?? "Terjadi kesalahan";
    throw new ApiError(typeof detail === "string" ? detail : "Terjadi kesalahan", res.status);
  }
  return data as T;
}

export const api = {
  get: <T,>(path: string) => request<T>(path),
  post: <T,>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  patch: <T,>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined }),
};

// ---- Types ----
export type Role = "admin" | "staff";
export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  active: boolean;
}
export interface Supplier { id: string; name: string; phone: string }
export interface Product {
  id: string; barcode: string; name: string; stock: number; cost: number; price: number;
}
export interface ReceiptItem {
  product_id: string; barcode: string; name: string; qty: number; unit_cost: number; last_cost: number;
}
export interface Receipt {
  id: string;
  supplier_id: string;
  supplier_name: string;
  status: "pending_audit" | "approved";
  items: ReceiptItem[];
  created_by_name: string;
  created_at: string;
  submitted_at: string;
  approved_at: string | null;
  approved_by_name: string | null;
  total_qty: number;
  total_cost: number;
}
export interface LastCost {
  barcode: string; last_cost: number; last_supplier: string;
  last_purchased_at: string | null; found: boolean;
}
