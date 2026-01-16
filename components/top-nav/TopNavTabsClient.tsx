"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

type NavItem = {
  label: string;
  href: string;
  match: "exact" | "prefix";
};

const BASE_NAV: NavItem[] = [
  { label: "Inicio", href: "/protected", match: "exact" },
  { label: "Proyectos", href: "/protected/projects", match: "prefix" },
  { label: "Agenda", href: "/protected/agenda", match: "prefix" },
  { label: "Comunidad", href: "/protected/community", match: "prefix" },
  { label: "Perfil", href: "/protected/profile", match: "prefix" },
];

const ADMIN_NAV: NavItem = {
  label: "Administración",
  href: "/protected/admin",
  match: "prefix",
};

function isActive(pathname: string, item: NavItem): boolean {
  if (item.match === "exact") return pathname === item.href;
  return pathname === item.href || pathname.startsWith(item.href + "/");
}

export function TopNavTabsClient(props: { isAdmin?: boolean }) {
  const pathname = usePathname();
  const nav = props.isAdmin ? [...BASE_NAV, ADMIN_NAV] : BASE_NAV;

  return (
    <nav className="hidden items-center gap-1 md:flex">
      {nav.map((item) => {
        const active = isActive(pathname, item);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
              active
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
