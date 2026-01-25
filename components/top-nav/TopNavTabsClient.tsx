//TopNavTabsClient
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
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

export function TopNavTabsClient(props: { isAdmin?: boolean; topOffsetPx?: number }) {
  const pathname = usePathname();
  const nav = useMemo(
    () => (props.isAdmin ? [...BASE_NAV, ADMIN_NAV] : BASE_NAV),
    [props.isAdmin],
  );

  const [open, setOpen] = useState(false);
  const topOffset = props.topOffsetPx ?? 56;

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <div className="flex items-center">
      {/* Desktop tabs */}
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

      {/* Mobile hamburger */}
      <div className="ml-auto md:hidden">
        <button
          type="button"
          aria-label={open ? "Cerrar menú" : "Abrir menú"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="rounded-md p-2 hover:bg-muted"
        >
          <div className="space-y-1">
            <span className="block h-0.5 w-5 bg-foreground" />
            <span className="block h-0.5 w-5 bg-foreground" />
            <span className="block h-0.5 w-5 bg-foreground" />
          </div>
        </button>
      </div>

      {/* Mobile sheet */}
      {open && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 bg-black/40 md:hidden"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />

          {/* Panel */}
          <div
            className="fixed inset-x-0 z-50 border-b bg-background shadow-lg md:hidden"
            style={{ top: topOffset }}
            role="dialog"
            aria-label="Menú de navegación"
          >
            <div className="px-3 py-2">
              <div className="grid gap-1">
                {nav.map((item) => {
                  const active = isActive(pathname, item);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "rounded-xl px-3 py-2 text-sm transition-colors",
                        active
                          ? "bg-muted text-foreground"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground",
                      )}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
