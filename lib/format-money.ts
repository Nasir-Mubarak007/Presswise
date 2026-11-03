export function formatMoney(kobo: number | null | undefined): string {
  if (kobo == null) return "₦0.00";
  return `₦${(kobo / 100).toFixed(2)}`;
}

export function formatOrderNumber(n: number | null | undefined): string {
  if (n == null) return "—";
  return `ORD-${String(n).padStart(6, "0")}`;
}
