// lib/datetime.ts
export function formatDateTimeCL(value: string | null | undefined): string {
  const s = String(value ?? "").trim();
  if (!s) return "—";

  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;

  // Determinístico: locale + TZ + 24h + 2-digit
  const fmt = new Intl.DateTimeFormat("es-CL", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = fmt.formatToParts(d);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";

  const dd = get("day");
  const mm = get("month");
  const yyyy = get("year");
  const hh = get("hour");
  const mi = get("minute");
  const ss = get("second");

  // Output estable (no depende de literales del locale)
  return `${dd}-${mm}-${yyyy}, ${hh}:${mi}:${ss}`;
}

export function formatDayLabelCL(dayYYYYMMDD: string | null | undefined): string {
  const s = String(dayYYYYMMDD ?? "").trim();
  if (!s) return "—";

  const d = new Date(`${s}T00:00:00`);
  if (Number.isNaN(d.getTime())) return s;

  const fmt = new Intl.DateTimeFormat("es-CL", {
    timeZone: "America/Santiago",
    weekday: "short",
    day: "2-digit",
    month: "short",
  });

  // Si quieres 100% estable como en formatDateTimeCL, puedes construir por parts.
  // Para este label, normalmente fmt.format(d) es suficiente:
  return fmt.format(d);
}
