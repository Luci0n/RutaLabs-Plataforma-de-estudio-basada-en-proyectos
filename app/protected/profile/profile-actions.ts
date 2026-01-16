"use server";

import { createClient } from "@/lib/supabase/server";

export type UpdateProfileInput = {
  username: string;
  avatar_url: string; // puede venir vacío
  bio: string; // puede venir vacío
};

type UpdateProfileOk = { ok: true };
type UpdateProfileErr = { ok: false; message: string; field?: "username" | "avatar_url" | "bio" };
export type UpdateProfileResult = UpdateProfileOk | UpdateProfileErr;

/**
 * Normaliza username:
 * - trim + lower
 * - espacios => _
 * - permite: a-z 0-9 . _ -
 * - colapsa underscores repetidos
 * - elimina puntos/guiones/underscores al inicio o final
 */
function normalizeUsername(raw: string): string {
  const v = raw.trim().toLowerCase();

  const cleaned = v
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9._-]/g, "")
    .replace(/_+/g, "_")
    .replace(/^[._-]+/, "")
    .replace(/[._-]+$/, "");

  return cleaned;
}

function normalizeOptionalText(raw: string): string | null {
  const t = raw.trim();
  return t === "" ? null : t;
}

function isValidAvatarUrl(url: string | null): boolean {
  if (!url) return true; // null es válido
  // Permite http(s) y también urls relativas si algún día usas proxy interno
  if (url.startsWith("/")) return true;
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

function isUniqueViolation(msg: string): boolean {
  const s = msg.toLowerCase();
  return (
    s.includes("duplicate key value") ||
    s.includes("unique constraint") ||
    s.includes("violates unique constraint")
  );
}

/**
 * Requiere:
 * - Tabla: public.profiles (id uuid PK, username text, avatar_url text, bio text, ...)
 * - Índice único recomendado:
 *   create unique index profiles_username_lower_unique on public.profiles (lower(username))
 *   where username is not null and username <> '';
 * - RPC opcional (recomendado) para validar sin romper RLS:
 *   public.is_username_available(p_username text) returns boolean security definer
 */
export async function updateProfileAction(input: UpdateProfileInput): Promise<UpdateProfileResult> {
  const supabase = await createClient();

  const { data: userRes, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userRes.user) return { ok: false, message: "No autenticado." };

  const userId = userRes.user.id;

  // ----------- username -----------
  const username = normalizeUsername(input.username);

  if (username.length < 3) {
    return { ok: false, field: "username", message: "El nombre de usuario debe tener al menos 3 caracteres." };
  }
  if (username.length > 24) {
    return { ok: false, field: "username", message: "El nombre de usuario no puede superar 24 caracteres." };
  }
  // regla básica: que empiece con letra o número (ya limpiamos símbolos al inicio, pero reforzamos)
  if (!/^[a-z0-9]/.test(username)) {
    return { ok: false, field: "username", message: "El nombre de usuario debe comenzar con una letra o número." };
  }

  // ----------- avatar/bio -----------
  const avatar_url = normalizeOptionalText(input.avatar_url);
  const bio = normalizeOptionalText(input.bio);

  if (!isValidAvatarUrl(avatar_url)) {
    return { ok: false, field: "avatar_url", message: "La URL del avatar no es válida." };
  }

  // ----------- unicidad (SIN romper RLS) -----------
  // Preferimos RPC security definer (recomendado). Si no existe, saltamos pre-check
  // y dejamos que el índice único sea la fuente de verdad.
  try {
    const { data: available, error: rpcErr } = await supabase.rpc("is_username_available", {
      p_username: username,
    });

    if (!rpcErr && available === false) {
      return { ok: false, field: "username", message: "Ese nombre de usuario ya está en uso." };
    }
    // Si rpcErr existe, no bloqueamos: seguimos y confiamos en índice único al guardar.
  } catch {
    // Igual: seguimos y confiamos en el índice único
  }

  // ----------- guardar en profiles -----------
  const { error: updErr } = await supabase
    .from("profiles")
    .update({
      username,
      avatar_url,
      bio,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);

  if (updErr) {
    // si existe índice único, aquí cae el “duplicate”
    if (isUniqueViolation(updErr.message)) {
      return { ok: false, field: "username", message: "Ese nombre de usuario ya está en uso." };
    }
    return { ok: false, message: "No se pudo guardar el perfil." };
  }

  // ----------- opcional: sincronizar metadata en auth.users -----------
  // Nota: esto NO reemplaza profiles; solo ayuda a “transportar” datos.
  try {
    await supabase.auth.updateUser({
      data: {
        username,
        avatar_url,
        bio,
      },
    });
  } catch {
    // no bloqueamos UX si falla la metadata
  }

  return { ok: true };
}
