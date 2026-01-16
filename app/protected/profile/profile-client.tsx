// app/protected/profile/profile-client.tsx
"use client";

import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateProfileAction } from "./profile-actions";
import { UserIcon } from "lucide-react";
export type ProfileData = {
  auth: {
    id: string;
    email: string | null;
  };
  profile: {
    username: string | null;
    avatar_url: string | null;
    bio: string | null;
    global_role: string | null;
    email: string | null;
  };
};

type DraftProfile = {
  username: string;
  avatarUrl: string;
  bio: string;
};

function initialsFromUsername(username: string | null): string {
  const u = (username ?? "").trim();
  if (!u) return "U";
  const parts = u.split(/[.\s_-]+/g).filter(Boolean);
  const a = parts[0]?.[0] ?? "U";
  const b = parts[1]?.[0] ?? "";
  return (a + b).toUpperCase();
}

function isImageFile(f: File): boolean {
  return f.type.startsWith("image/");
}

function extFromFile(file: File): string {
  const name = file.name.toLowerCase();
  const dot = name.lastIndexOf(".");
  if (dot === -1) return "png";
  const ext = name.slice(dot + 1).replace(/[^a-z0-9]/g, "");
  return ext || "png";
}

async function uploadAvatarToSupabase(file: File): Promise<string> {
  const supabase = createClient();

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("No autenticado.");

  const userId = data.user.id;

  const maxBytes = 2 * 1024 * 1024; // 2MB
  if (!isImageFile(file)) throw new Error("El archivo debe ser una imagen (png, jpg, webp, etc.).");
  if (file.size > maxBytes) throw new Error("La imagen no puede superar 2MB.");

  const ext = extFromFile(file);
  const filename = `${crypto.randomUUID()}.${ext}`;
  const path = `${userId}/${filename}`;

  const up = await supabase.storage.from("avatars").upload(path, file, {
    upsert: true,
    contentType: file.type,
    cacheControl: "3600",
  });

  if (up.error) throw new Error(up.error.message);

  const pub = supabase.storage.from("avatars").getPublicUrl(path);
  const publicUrl = pub.data.publicUrl;
  if (!publicUrl) throw new Error("No se pudo obtener la URL pública del avatar.");

  return publicUrl;
}

function AvatarCircle(props: { url: string | null; fallback: string; size?: number }) {
  const u = (props.url ?? "").trim();
  const size = props.size ?? 72;

  return (
    <div
      className="rounded-full border bg-muted/30 overflow-hidden grid place-items-center"
      style={{ width: size, height: size }}
      aria-label="Avatar"
    >
      {u ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={u} alt="Avatar" className="h-full w-full object-cover" />
      ) : (
        <span className="text-sm font-medium text-muted-foreground">{props.fallback}</span>
      )}
    </div>
  );
}

function ReadOnlyField(props: { label: string; value: string }) {
  return (
    <div className="grid gap-2">
      <Label>{props.label}</Label>
      <Input
        value={props.value}
        readOnly
        className="bg-muted/40 text-muted-foreground border-muted-foreground/20"
      />
    </div>
  );
}

export function ProfileClient(props: { data: ProfileData }) {
  const router = useRouter();
  const d = props.data;

  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);
  if (!supabaseRef.current) supabaseRef.current = createClient();
  const supabase = supabaseRef.current;

  const emailShown = d.auth.email ?? d.profile.email ?? "—";
  const roleShown = d.profile.global_role ?? "—";

  // “baseline” (lo que está guardado / cargado)
  const [base, setBase] = useState<DraftProfile>(() => ({
    username: d.profile.username ?? "",
    avatarUrl: d.profile.avatar_url ?? "",
    bio: d.profile.bio ?? "",
  }));

  // draft (lo que el usuario está editando)
  const [draft, setDraft] = useState<DraftProfile>(() => ({
    username: d.profile.username ?? "",
    avatarUrl: d.profile.avatar_url ?? "",
    bio: d.profile.bio ?? "",
  }));

  const [isEditing, setIsEditing] = useState(false);

  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Preview local temporal (solo para UX)
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const initials = useMemo(() => initialsFromUsername(draft.username), [draft.username]);


  const avatarToShow = useMemo(() => {
    if (localPreview) return localPreview;
    const url = draft.avatarUrl.trim();
    return url ? url : null;
  }, [localPreview, draft.avatarUrl]);

  const dirty = useMemo(() => {
    return (
      draft.username !== base.username ||
      draft.avatarUrl !== base.avatarUrl ||
      draft.bio !== base.bio ||
      localPreview !== null
    );
  }, [draft, base, localPreview]);

  // 1) Rehidratar cuando cambia el usuario (evita “persistencia” visual entre cuentas)
  useEffect(() => {
    const nextBase: DraftProfile = {
      username: d.profile.username ?? "",
      avatarUrl: d.profile.avatar_url ?? "",
      bio: d.profile.bio ?? "",
    };

    setBase(nextBase);
    setDraft(nextBase);

    setIsEditing(false);
    setSaving(false);
    setUploading(false);
    setMsg(null);
    setErr(null);

    if (localPreview) {
      URL.revokeObjectURL(localPreview);
      setLocalPreview(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.auth.id]);

  // 2) Si el auth session cambia en el cliente, refrescamos para traer props del usuario correcto
  useEffect(() => {
    const sub = supabase.auth.onAuthStateChange(() => {
      // evita que queden props cacheadas de otro usuario en el App Router
      setIsEditing(false);
      setMsg(null);
      setErr(null);

      if (localPreview) {
        URL.revokeObjectURL(localPreview);
        setLocalPreview(null);
      }

      router.refresh();
    });

    return () => {
      sub.data.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 3) Hard-check: si por alguna razón la sesión actual no coincide con props, forzar refresh (barato)
  useEffect(() => {
    void (async () => {
      const { data } = await supabase.auth.getUser();
      const currentId = data.user?.id ?? null;
      if (currentId && currentId !== d.auth.id) router.refresh();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.auth.id]);

  // Cleanup preview
  useEffect(() => {
    return () => {
      if (localPreview) URL.revokeObjectURL(localPreview);
    };
  }, [localPreview]);

  function beginEdit() {
    setErr(null);
    setMsg(null);
    setIsEditing(true);
  }

  function cancelEdit() {
    setErr(null);
    setMsg(null);
    setIsEditing(false);

    setDraft(base);

    if (localPreview) {
      URL.revokeObjectURL(localPreview);
      setLocalPreview(null);
    }
  }

  async function onPickFile(file: File) {
    setErr(null);
    setMsg(null);

    const nextPreview = URL.createObjectURL(file);
    if (localPreview) URL.revokeObjectURL(localPreview);
    setLocalPreview(nextPreview);

    setUploading(true);
    try {
      const publicUrl = await uploadAvatarToSupabase(file);

      // ya tenemos URL real: quitamos preview
      URL.revokeObjectURL(nextPreview);
      setLocalPreview(null);

      setDraft((cur) => ({ ...cur, avatarUrl: publicUrl }));
      setMsg("Foto subida. Guarda cambios para aplicarla.");
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "No se pudo subir la imagen.");

      URL.revokeObjectURL(nextPreview);
      setLocalPreview(null);
    } finally {
      setUploading(false);
    }
  }

  async function onSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!isEditing) return;

    setSaving(true);
    setErr(null);
    setMsg(null);

    const res = await updateProfileAction({
      username: draft.username,
      avatar_url: draft.avatarUrl,
      bio: draft.bio,
    });

    if (!res.ok) {
      setErr(res.message);
      setSaving(false);
      return;
    }

    // Commit local: baseline = draft, salir de edición
    setBase(draft);
    setIsEditing(false);
    setMsg("Perfil guardado.");
    setSaving(false);

    // Asegura que cualquier server component que lea perfil se refresque
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg border bg-muted/30">
                <UserIcon className="h-5 w-5 text-muted-foreground" />
            </span>
            <h1 className="text-2xl font-semibold">Perfil</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Tu perfil público se usa en Comunidad y en tus proyectos publicados.
        </p>
      </div>

      {/* 1) Perfil público (arriba) */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle>Perfil público</CardTitle>
            <CardDescription>
              Foto, nombre de usuario y biografía.
            </CardDescription>
          </div>

          {!isEditing ? (
            <Button type="button" variant="secondary" onClick={beginEdit}>
              Editar
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={cancelEdit}
                disabled={saving || uploading}
              >
                Cancelar
              </Button>
            </div>
          )}
        </CardHeader>

        <CardContent className="space-y-5">
          {/* “Vista” siempre visible */}
          <div className="flex items-center gap-4">
            <AvatarCircle url={avatarToShow} fallback={initials} size={72} />

            <div className="min-w-0">
              <p className="text-base font-semibold truncate">
                {base.username?.trim() ? base.username : "Sin nombre de usuario"}
              </p>
              <p className="text-sm text-muted-foreground line-clamp-2">
                {base.bio?.trim() ? base.bio : "Sin biografía."}
              </p>
            </div>
          </div>

          {/* Form solo en modo edición */}
          {isEditing ? (
            <form onSubmit={onSave} className="space-y-5">
              {/* Avatar upload */}
              <div className="rounded-2xl border p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">Foto de perfil</p>
                    <p className="text-xs text-muted-foreground">PNG/JPG/WEBP · máx. 2MB</p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0] ?? null;
                        e.target.value = "";
                        if (!f) return;
                        void onPickFile(f);
                      }}
                    />

                    <Button
                      type="button"
                      variant="secondary"
                      disabled={uploading || saving}
                      onClick={() => fileRef.current?.click()}
                    >
                      {uploading ? "Subiendo..." : "Cambiar foto"}
                    </Button>

                    <Button
                      type="button"
                      variant="ghost"
                      disabled={uploading || saving || (!draft.avatarUrl.trim() && !localPreview)}
                      onClick={() => {
                        setErr(null);
                        setMsg("Foto removida. Guarda cambios para aplicarla.");

                        if (localPreview) {
                          URL.revokeObjectURL(localPreview);
                          setLocalPreview(null);
                        }
                        setDraft((cur) => ({ ...cur, avatarUrl: "" }));
                      }}
                    >
                      Quitar
                    </Button>
                  </div>
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="username">Nombre de usuario</Label>
                <Input
                  id="username"
                  value={draft.username}
                  onChange={(e) => setDraft((cur) => ({ ...cur, username: e.target.value }))}
                  placeholder="tu_nombre"
                  required
                  disabled={saving}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="bio">Biografía (opcional)</Label>
                <textarea
                  id="bio"
                  value={draft.bio}
                  onChange={(e) => setDraft((cur) => ({ ...cur, bio: e.target.value }))}
                  rows={5}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  placeholder="Breve descripción..."
                  disabled={saving}
                />
              </div>

              {err ? <p className="text-sm text-red-500">{err}</p> : null}
              {msg ? <p className="text-sm text-green-600">{msg}</p> : null}

              <div className="flex flex-wrap gap-2">
                <Button
                  type="submit"
                  className="min-w-[220px]"
                  disabled={saving || uploading || !dirty}
                >
                  {saving ? "Guardando..." : "Guardar cambios"}
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  disabled={saving || uploading || !dirty}
                  onClick={cancelEdit}
                >
                  Descartar cambios
                </Button>
              </div>

              <p className="text-xs text-muted-foreground">
                Nota: si subes una imagen y luego cancelas, la UI vuelve al estado anterior, pero el archivo ya subido puede
                quedar en Storage (podemos agregar limpieza automática después).
              </p>
            </form>
          ) : (
            <div className="text-sm text-muted-foreground">
              Presiona <span className="font-medium">Editar</span> para modificar tu perfil.
            </div>
          )}
        </CardContent>
      </Card>

      {/* 2) Datos de cuenta (abajo, “inaccesible pero legible”) */}
      <Card>
        <CardHeader>
          <CardTitle>Tu cuenta</CardTitle>
          <CardDescription>Datos de autenticación (no editables).</CardDescription>
        </CardHeader>

        <CardContent className="grid gap-4">
          <ReadOnlyField label="Correo" value={emailShown} />
          <ReadOnlyField label="ID" value={d.auth.id} />
          <ReadOnlyField label="Rol" value={roleShown} />

          <p className="text-xs text-muted-foreground">
            Estos datos vienen de Supabase Auth y/o del perfil público. Si ves algo desactualizado, al recargar la ruta se
            sincroniza.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
