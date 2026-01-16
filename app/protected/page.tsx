import { redirect } from "next/navigation";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { HomeClient, type HomeDashboardData } from "./home/home-client";
import { loadHomeDashboardData } from "./home/home-data";

function PageSkeleton() {
  return <div className="h-[520px] rounded-2xl border bg-card animate-pulse" />;
}

/**
 * Home / Dashboard (protected)
 * - Suspense para evitar blocking navigation
 */
export default function ProtectedHomePage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ProtectedHomeInner />
    </Suspense>
  );
}

async function ProtectedHomeInner() {
  const supabase = await createClient();

  const { data: userRes, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userRes.user) redirect("/auth/login");

  const userId = userRes.user.id;

  let data: HomeDashboardData;
  try {
    data = await loadHomeDashboardData({ userId });
  } catch {
    // Fallback seguro si algo sale mal
    data = {
      stats: {
        dueToday: 0,
        activeProjects: 0,
      },
      agendaToday: [],
      recentProjects: [],
      recentActivity: [],
    };
  }

  return <HomeClient data={data} />;
}
