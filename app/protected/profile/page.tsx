// app/protected/profile/page.tsx
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { unstable_noStore as noStore } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { ProfileClient, type ProfileData } from "./profile-client";

function PageSkeleton() {
  return <div className="h-[520px] rounded-2xl border bg-card animate-pulse" />;
}

/**
 * Perfil (protected)
 * - noStore() evita cache cross-user sin usar route segment config (compatible con cacheComponents).
 * - Suspense evita "blocking navigation".
 */
export default function ProfilePage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ProfileInner />
    </Suspense>
  );
}

async function ProfileInner() {
  noStore(); // <- clave: desactiva cache para este render

  const supabase = await createClient();

  const { data: userRes, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userRes.user) redirect("/auth/login");

  const user = userRes.user;

  // Importante: usa tu tabla real (profiles)
  // Ajusta columnas según tu esquema final.
  const { data: profileRow, error: profErr } = await supabase
    .from("profiles")
    .select("username, avatar_url, bio, global_role, email")
    .eq("id", user.id)
    .maybeSingle();

  // fallback seguro si falla
  const profileSafe = profErr || !profileRow
    ? {
        username: null,
        avatar_url: null,
        bio: null,
        global_role: null,
        email: null,
      }
    : profileRow;

  const data: ProfileData = {
    auth: {
      id: user.id,
      email: user.email ?? null,
    },
    profile: {
      username: profileSafe.username ?? null,
      avatar_url: profileSafe.avatar_url ?? null,
      bio: profileSafe.bio ?? null,
      global_role: profileSafe.global_role ?? null,
      email: profileSafe.email ?? null,
    },
  };

  return <ProfileClient data={data} />;
}
