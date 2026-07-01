import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, formatDistanceToNow } from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number | string | undefined | null, currency = "KES"): string {
  if (amount === undefined || amount === null) return `${currency} 0.00`;
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num)) return `${currency} 0.00`;
  return `${currency} ${num.toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatDate(date: string | Date, fmt = "dd MMM yyyy"): string {
  return format(new Date(date), fmt);
}

export function formatDateTime(date: string | Date): string {
  return format(new Date(date), "EEE, dd MMM yyyy 'at' h:mm a");
}

export function timeAgo(date: string | Date): string {
  return formatDistanceToNow(new Date(date), { addSuffix: true });
}

export function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function truncate(str: string, length: number): string {
  if (str.length <= length) return str;
  return str.slice(0, length) + "…";
}

export function getInitials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase() || "")
    .join("");
}

export function statusColor(status: string): string {
  const map: Record<string, string> = {
    ACTIVE: "text-success bg-success/10",
    PUBLISHED: "text-success bg-success/10",
    CONFIRMED: "text-success bg-success/10",
    COMPLETED: "text-secondary bg-secondary/10",
    PENDING: "text-warning bg-warning/10",
    AWAITING_PAYMENT: "text-warning bg-warning/10",
    DRAFT: "text-muted bg-muted/10",
    CANCELLED: "text-error bg-error/10",
    SUSPENDED: "text-error bg-error/10",
    BANNED: "text-error bg-error/10",
    POSTPONED: "text-orange-400 bg-orange-400/10",
    FAILED: "text-error bg-error/10",
    REJECTED: "text-error bg-error/10",
  };
  return map[status] || "text-muted bg-muted/10";
}
