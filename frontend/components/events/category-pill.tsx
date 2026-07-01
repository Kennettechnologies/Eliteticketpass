import Link from "next/link";
import { cn } from "@/lib/utils";

interface CategoryPillProps {
  href: string;
  label: string;
  color?: string;
  active?: boolean;
}

export function CategoryPill({ href, label, color, active }: CategoryPillProps) {
  return (
    <Link
      href={href}
      className={cn(
        "shrink-0 px-4 py-2 rounded-full text-sm font-medium border transition-all whitespace-nowrap",
        active
          ? "bg-primary text-background border-primary"
          : "bg-surface-2 text-muted border-border hover:border-primary/50 hover:text-foreground"
      )}
      style={!active && color ? { borderColor: `${color}40`, color: color } : undefined}
    >
      {label}
    </Link>
  );
}
