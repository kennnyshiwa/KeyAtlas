import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { slugify } from "@/lib/slug";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatPrice(cents: number, currency = "USD"): string {
  // Normalize common currency names to ISO 4217 codes
  const CURRENCY_MAP: Record<string, string> = {
    euro: "EUR",
    euros: "EUR",
    dollar: "USD",
    dollars: "USD",
    pound: "GBP",
    pounds: "GBP",
    yen: "JPY",
    yuan: "CNY",
    won: "KRW",
    cad: "CAD",
    aud: "AUD",
  };

  const normalized = CURRENCY_MAP[currency.toLowerCase()] || currency;

  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: normalized,
    }).format(cents / 100);
  } catch {
    // Fallback if currency code is still invalid
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

export function formatDate(date: Date | string): string {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(date));
}

export function generateSlug(title: string): string {
  return slugify(title, 100);
}
