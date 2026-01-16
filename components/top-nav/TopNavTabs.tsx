// components/top-nav/TopNavTabs.tsx
import { createClient } from "@/lib/supabase/server";
import { TopNavTabsClient } from "@/components/top-nav/TopNavTabsClient";

type ProfileRoleRow = { global_role: "user" | "admin" | null };

export async function TopNavTabs() {
  const supabase = await createClient();

  const { data: userRes, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userRes.user) {
    return <TopNavTabsClient isAdmin={false} />;
  }

  const { data: profile, error: pErr } = await supabase
    .from("profiles")
    .select("global_role")
    .eq("id", userRes.user.id)
    .maybeSingle<ProfileRoleRow>();

  if (pErr) {
    return <TopNavTabsClient isAdmin={false} />;
  }

  const isAdmin = profile?.global_role === "admin";
  return <TopNavTabsClient isAdmin={isAdmin} />;
}
