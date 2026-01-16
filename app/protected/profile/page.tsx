import { redirect } from "next/navigation";
import { Suspense } from "react";
import { unstable_noStore as noStore } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { ProfileClient, type ProfileData } from "./profile-client";

type ProfileRow = {
  username: string | null;
  avatar_url: string | null;
  bio: string | null;
  global_role: string | null;
  email: string | null;
};

function PageSkeleton() {
  return <div className="h-[520px] rounded-2xl border bg-card animate-pulse" />;
}

export default function ProfilePage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ProfileInner />
    </Suspense>
  );
}

async function ProfileInner() {
  noStore();

  const supabase = await createClient();
  const { data: userRes, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userRes.user) redirect("/auth/login");

  const user = userRes.user;

  const { data: profileRow, error: profErr } = await supabase
    .from("profiles")
    .select("username, avatar_url, bio, global_role, email")
    .eq("id", user.id)
    .maybeSingle<ProfileRow>();

  const safe: ProfileRow = profErr || !profileRow
    ? { username: null, avatar_url: null, bio: null, global_role: null, email: null }
    : profileRow;

  const data: ProfileData = {
    auth: { id: user.id, email: user.email ?? null },
    profile: {
      username: safe.username,
      avatar_url: safe.avatar_url,
      bio: safe.bio,
      global_role: safe.global_role,
      email: safe.email,
    },
  };

  return <ProfileClient data={data} />;
}
