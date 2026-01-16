// components/TopNav.tsx
import Link from "next/link";
import { Suspense } from "react";

import { AuthButton } from "@/components/auth-button";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { EnvVarWarning } from "@/components/env-var-warning";
import { hasEnvVars } from "@/lib/utils";

import { TopNavTabsClient } from "@/components/top-nav/TopNavTabsClient";
import { TopNavTabs } from "@/components/top-nav/TopNavTabs";
import { TopNavSearchClient } from "@/components/top-nav/TopNavSearchClient";

export function TopNav() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
        <Link href="/protected" className="flex items-center gap-2 font-semibold">
          <div className="h-9 w-9 rounded-2xl border bg-card shadow-sm grid place-items-center">
            <span className="text-sm font-semibold tracking-tight">RL</span>
          </div>
          <span>RutaLabs</span>
        </Link>

        {/* Tabs: Server wrapper (lee rol) dentro de Suspense */}
        <Suspense fallback={<TopNavTabsClient isAdmin={false} />}>
          <TopNavTabs />
        </Suspense>

        <div className="flex items-center gap-2">
          <TopNavSearchClient />
          <ThemeSwitcher />

          {!hasEnvVars ? (
            <EnvVarWarning />
          ) : (
            <Suspense>
              <AuthButton />
            </Suspense>
          )}
        </div>
      </div>
    </header>
  );
}
