export function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

export type ProjectIdValue = string | number;

export function parseProjectIdValue(raw: string): ProjectIdValue | null {
  const v = (raw ?? "").trim();
  if (!v || v === "undefined" || v === "null") return null;

  if (isUuid(v)) return v;

  const n = Number(v);
  if (Number.isSafeInteger(n) && n > 0) return n;

  return null;
}
