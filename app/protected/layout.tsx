// app/protected/layout.tsx
import type { ReactNode } from "react";
import { Suspense } from "react";

import { TopNav } from "@/components/TopNav";
import { PomodoroDock } from "@/components/pomodoro/PomodoroDock";

export default function ProtectedLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh">
      <Suspense fallback={null}>
        <TopNav />
      </Suspense>

      <main className="mx-auto w-full max-w-6xl px-4 py-6 pb-24 sm:pb-6">
        {children}
      </main>

      <Suspense fallback={null}>
        <PomodoroDock />
      </Suspense>
    </div>
  );
}