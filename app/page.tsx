// app/page.tsx
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default async function HomePage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();

  // Si ya está autenticado, lo mandamos directo a la app.
  if (data.user) redirect("/protected");

  return (
    <main className="min-h-[calc(100vh-0px)]">
      {/* Background */}
      <div className="relative overflow-hidden">
        {/* Glow grid */}
        <div
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{
            backgroundImage:
              "radial-gradient(1200px 600px at 20% 10%, rgba(220,38,38,0.18), transparent 60%), radial-gradient(900px 500px at 80% 30%, rgba(59,130,246,0.14), transparent 55%), radial-gradient(700px 500px at 40% 90%, rgba(16,185,129,0.10), transparent 55%)",
          }}
        />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(to right, rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.5) 1px, transparent 1px)",
            backgroundSize: "72px 72px",
            maskImage: "radial-gradient(ellipse at center, black 45%, transparent 75%)",
            WebkitMaskImage: "radial-gradient(ellipse at center, black 45%, transparent 75%)",
          }}
        />

        <div className="mx-auto max-w-6xl px-4 py-10 sm:py-14">
          {/* Top bar */}
          <header className="flex items-center justify-between gap-3">
            <Link href="/" className="flex items-center gap-2">
              <div className="h-9 w-9 rounded-2xl border bg-card shadow-sm grid place-items-center">
                <span className="text-sm font-semibold tracking-tight">RL</span>
              </div>
              <span className="font-semibold tracking-tight">RutaLabs</span>
            </Link>

          </header>

          {/* Hero */}
          <section className="mt-10 sm:mt-14 grid gap-8 lg:grid-cols-2 lg:items-center">
            <div className="space-y-6">
              <div className="inline-flex items-center gap-2 rounded-full border bg-card/70 px-3 py-1 text-xs text-muted-foreground">
                <span className="h-2 w-2 rounded-full bg-red-500" />
                Sistema de estudio y enfoque personal
              </div>

              <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight leading-[1.05]">
                Rutinas claras.
                <span className="block text-muted-foreground">Mente liviana. Progreso visible.</span>
              </h1>

              <p className="text-base sm:text-lg text-muted-foreground leading-relaxed max-w-xl">
                RutaLabs te ayuda a sostener el impulso: estructura tus proyectos de estudio, reduce fricción al
                empezar y convierte intención en práctica diaria. Menos ruido mental, más continuidad.
              </p>

              <div className="flex flex-col sm:flex-row gap-2">
                <Button asChild className="h-11">
                  <Link href="/auth/sign-up">Empezar gratis</Link>
                </Button>
                <Button asChild variant="secondary" className="h-11">
                  <Link href="/auth/login">Ya tengo cuenta</Link>
                </Button>
              </div>

              <div className="grid gap-3 sm:grid-cols-3 pt-2">
                <Stat title="Proyectos" desc="Organiza por objetivos y bloques." />
                <Stat title="Pomodoro" desc="Enfoque con ritmo y registro." />
                <Stat title="Comunidad" desc="Explora e importa proyectos." />
              </div>
            </div>

            {/* Right preview */}
            <div className="relative">
              <div className="absolute -inset-4 rounded-3xl bg-gradient-to-b from-red-500/10 via-transparent to-transparent blur-2xl" />
              <Card className="relative rounded-3xl border bg-card/80 backdrop-blur shadow-sm overflow-hidden">
                <div className="p-5 border-b flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">Vista previa</p>
                    <p className="text-xs text-muted-foreground truncate">
                      Un dashboard minimalista para sostener hábitos.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-red-500/70" />
                    <span className="h-2 w-2 rounded-full bg-yellow-500/70" />
                    <span className="h-2 w-2 rounded-full bg-green-500/70" />
                  </div>
                </div>

                <div className="p-5 space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <MiniCard
                      title="Hoy"
                      value="2 sesiones de foco"
                      sub="Continúa donde lo dejaste"
                    />
                    <MiniCard
                      title="Siguiente paso"
                      value="Repasar 12 tarjetas"
                      sub="5–8 minutos"
                    />
                  </div>

                  <div className="rounded-2xl border bg-muted/20 p-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">Proyecto destacado</p>
                      <span className="text-xs text-muted-foreground">Actualizado hace poco</span>
                    </div>
                    <div className="mt-3 space-y-2">
                      <div className="h-3 w-3/4 rounded bg-muted" />
                      <div className="h-3 w-2/3 rounded bg-muted" />
                      <div className="h-3 w-1/2 rounded bg-muted" />
                    </div>

                    <div className="mt-4 grid grid-cols-3 gap-2">
                      <div className="h-9 rounded-xl border bg-card" />
                      <div className="h-9 rounded-xl border bg-card" />
                      <div className="h-9 rounded-xl border bg-card" />
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <MiniBadge title="Baja fricción" desc="Empieza en 30s" />
                    <MiniBadge title="Constancia" desc="Pequeños ciclos" />
                    <MiniBadge title="Claridad" desc="Menos decisión" />
                  </div>
                </div>
              </Card>

              <p className="mt-3 text-xs text-muted-foreground text-center">
                Consejo: el objetivo no es “motivación”, es reducir fricción y sostener continuidad.
              </p>
            </div>
          </section>

          {/* Footer */}
          <footer className="mt-12 sm:mt-14 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
            <p>© {new Date().getFullYear()} RutaLabs. Construido para práctica real.</p>
            <div className="flex items-center gap-4">
            </div>
          </footer>
        </div>
      </div>
    </main>
  );
}

/* ------------------ components ------------------ */

function Stat(props: { title: string; desc: string }) {
  return (
    <div className="rounded-2xl border bg-card/70 px-4 py-3">
      <p className="text-sm font-medium">{props.title}</p>
      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{props.desc}</p>
    </div>
  );
}

function MiniCard(props: { title: string; value: string; sub: string }) {
  return (
    <div className="rounded-2xl border bg-card p-4">
      <p className="text-xs text-muted-foreground">{props.title}</p>
      <p className="mt-1 text-sm font-medium">{props.value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{props.sub}</p>
    </div>
  );
}

function MiniBadge(props: { title: string; desc: string }) {
  return (
    <div className="rounded-2xl border bg-card px-4 py-3">
      <p className="text-sm font-medium">{props.title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{props.desc}</p>
    </div>
  );
}
