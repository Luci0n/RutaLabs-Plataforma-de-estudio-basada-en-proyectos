// app/protected/projects/[projectId]/members-client.tsx
"use client";

import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { ProjectRole } from "@/lib/types/study";
import {
  leaveProjectAction,
  setMemberRoleAction,
  transferOwnershipAction,
} from "./actions";

type Member = {
  user_id: string;
  role: ProjectRole;
  created_at: string;

  // NUEVO (viene desde page.tsx via profiles join)
  email: string | null;
  username: string | null;
  avatar_url: string | null;
};

function roleLabel(role: ProjectRole): string {
  if (role === "owner") return "Dueño";
  if (role === "guest") return "Invitado";
  return "Editor";
}

function initialsFromUsername(username: string | null): string {
  const u = (username ?? "").trim();
  if (!u) return "U";
  const parts = u.split(/[.\s_-]+/g).filter(Boolean);
  const a = parts[0]?.[0] ?? "U";
  const b = parts[1]?.[0] ?? "";
  return (a + b).toUpperCase();
}

function AvatarCircle(props: { url: string | null; fallback: string }) {
  const u = (props.url ?? "").trim();
  return (
    <div className="h-10 w-10 rounded-full border bg-muted/30 overflow-hidden grid place-items-center">
      {u ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={u} alt="Avatar" className="h-full w-full object-cover" />
      ) : (
        <span className="text-[11px] font-medium text-muted-foreground">
          {props.fallback}
        </span>
      )}
    </div>
  );
}

function maskId(id: string): string {
  // Para que el ID sea legible pero no visualmente “ruidoso”
  // ej: 7c3d…91af
  if (id.length <= 10) return id;
  return `${id.slice(0, 4)}…${id.slice(-4)}`;
}

export function MembersClient(props: {
  projectId: string;
  canEdit: boolean; // dueño/editor (según tu lógica)
  currentUserId: string;
  ownerUserId: string;
  members: Member[];
}) {
  // Orden estable: dueño primero, luego resto por created_at
  const rows = useMemo(() => {
    const all = [...(props.members ?? [])];
    all.sort((a, b) => {
      const aOwner = a.user_id === props.ownerUserId ? 0 : 1;
      const bOwner = b.user_id === props.ownerUserId ? 0 : 1;
      if (aOwner !== bOwner) return aOwner - bOwner;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
    return all;
  }, [props.members, props.ownerUserId]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Miembros</CardTitle>
        <CardDescription>
          Lista de usuarios con acceso. Recall: el dueño puede administrar roles y
          transferir propiedad.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Header “tabla” */}
        <div className="hidden md:grid grid-cols-[44px_1.2fr_1.2fr_1fr_0.8fr_1fr] gap-3 px-3 py-2 text-xs text-muted-foreground">
          <div></div>
          <div>ID</div>
          <div>Correo</div>
          <div>Usuario</div>
          <div>Rol</div>
          <div className="text-right">Acciones</div>
        </div>

        {rows.map((m) => {
          const isOwner = m.user_id === props.ownerUserId;
          const isMe = m.user_id === props.currentUserId;

          const emailShown = m.email ?? "—";
          const usernameShown = m.username ?? "—";
          const initials = initialsFromUsername(m.username);

          return (
            <div
              key={m.user_id}
              className="rounded-xl border bg-card p-3"
            >
              {/* Desktop: grid tipo tabla */}
              <div className="hidden md:grid grid-cols-[44px_1.2fr_1.2fr_1fr_0.8fr_1fr] gap-3 items-center">
                <div className="flex items-center justify-center">
                  <AvatarCircle url={m.avatar_url} fallback={initials} />
                </div>

                <div className="min-w-0">
                  <p className="text-sm font-medium truncate" title={m.user_id}>
                    {maskId(m.user_id)}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {isOwner ? "Dueño" : isMe ? "Tú" : "Miembro"}
                  </p>
                </div>

                <div className="min-w-0">
                  <p className="text-sm truncate" title={emailShown}>
                    {emailShown}
                  </p>
                </div>

                <div className="min-w-0">
                  <p className="text-sm truncate" title={usernameShown}>
                    {usernameShown}
                  </p>
                </div>

                <div>
                  <span className="text-xs px-2 py-1 rounded-full border bg-muted/30 text-muted-foreground whitespace-nowrap">
                    {roleLabel(m.role)}
                  </span>
                </div>

                <div className="flex items-center justify-end gap-2 flex-wrap">
                  {/* Retirarme (solo si soy yo y no soy dueño) */}
                  {isMe && !isOwner ? (
                    <form
                      action={leaveProjectAction}
                      onSubmit={(e) => {
                        const ok = window.confirm(
                          "¿Retirarte del proyecto? Perderás acceso en tu biblioteca."
                        );
                        if (!ok) e.preventDefault();
                      }}
                    >
                      <input
                        type="hidden"
                        name="project_id"
                        value={props.projectId}
                      />
                      <Button type="submit" variant="secondary" size="sm">
                        Retirarme
                      </Button>
                    </form>
                  ) : null}

                  {/* Cambiar rol (no al dueño) */}
                  <form
                    action={setMemberRoleAction}
                    className="flex items-center gap-2"
                  >
                    <input
                      type="hidden"
                      name="project_id"
                      value={props.projectId}
                    />
                    <input type="hidden" name="user_id" value={m.user_id} />

                    <select
                      name="role"
                      defaultValue={m.role === "owner" ? "editor" : m.role}
                      disabled={!props.canEdit || isOwner}
                      className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm disabled:opacity-50"
                    >
                      <option value="guest">Invitado</option>
                      <option value="editor">Editor</option>
                    </select>

                    <Button
                      type="submit"
                      variant="ghost"
                      size="sm"
                      disabled={!props.canEdit || isOwner}
                    >
                      Aplicar
                    </Button>
                  </form>

                  {/* Transferir dueño */}
                  <form
                    action={transferOwnershipAction}
                    onSubmit={(e) => {
                      if (!props.canEdit || isOwner) {
                        e.preventDefault();
                        return;
                      }
                      const ok = window.confirm(
                        "¿Transferir propiedad a este usuario? Tú pasarás a ser editor."
                      );
                      if (!ok) e.preventDefault();
                    }}
                  >
                    <input
                      type="hidden"
                      name="project_id"
                      value={props.projectId}
                    />
                    <input
                      type="hidden"
                      name="new_owner_user_id"
                      value={m.user_id}
                    />
                    <Button
                      type="submit"
                      variant="ghost"
                      size="sm"
                      disabled={!props.canEdit || isOwner}
                    >
                      Hacer dueño
                    </Button>
                  </form>
                </div>
              </div>

              {/* Mobile: layout apilado */}
              <div className="md:hidden flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <AvatarCircle url={m.avatar_url} fallback={initials} />

                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {usernameShown !== "—" ? usernameShown : maskId(m.user_id)}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {emailShown}
                    </p>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="text-[10px] px-2 py-0.5 rounded-full border bg-muted/30 text-muted-foreground">
                        {roleLabel(m.role)}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {isOwner ? "Dueño" : isMe ? "Tú" : "Miembro"}
                      </span>
                    </div>

                    <p className="mt-1 text-[11px] text-muted-foreground">
                      ID: <span className="font-mono">{maskId(m.user_id)}</span>
                    </p>
                  </div>
                </div>
              </div>

              {/* Mobile actions */}
              <div className="md:hidden mt-3 flex flex-wrap gap-2">
                {isMe && !isOwner ? (
                  <form
                    action={leaveProjectAction}
                    onSubmit={(e) => {
                      const ok = window.confirm(
                        "¿Retirarte del proyecto? Perderás acceso en tu biblioteca."
                      );
                      if (!ok) e.preventDefault();
                    }}
                  >
                    <input type="hidden" name="project_id" value={props.projectId} />
                    <Button type="submit" variant="secondary" size="sm">
                      Retirarme
                    </Button>
                  </form>
                ) : null}

                <form action={setMemberRoleAction} className="flex items-center gap-2">
                  <input type="hidden" name="project_id" value={props.projectId} />
                  <input type="hidden" name="user_id" value={m.user_id} />

                  <select
                    name="role"
                    defaultValue={m.role === "owner" ? "editor" : m.role}
                    disabled={!props.canEdit || isOwner}
                    className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm disabled:opacity-50"
                  >
                    <option value="guest">Invitado</option>
                    <option value="editor">Editor</option>
                  </select>

                  <Button type="submit" variant="ghost" size="sm" disabled={!props.canEdit || isOwner}>
                    Aplicar
                  </Button>
                </form>

                <form
                  action={transferOwnershipAction}
                  onSubmit={(e) => {
                    if (!props.canEdit || isOwner) {
                      e.preventDefault();
                      return;
                    }
                    const ok = window.confirm(
                      "¿Transferir propiedad a este usuario? Tú pasarás a ser editor."
                    );
                    if (!ok) e.preventDefault();
                  }}
                >
                  <input type="hidden" name="project_id" value={props.projectId} />
                  <input type="hidden" name="new_owner_user_id" value={m.user_id} />
                  <Button type="submit" variant="ghost" size="sm" disabled={!props.canEdit || isOwner}>
                    Hacer dueño
                  </Button>
                </form>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
