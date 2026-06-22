export async function readLimitedJsonObject(
  request: Request,
  maxBytes = 32 * 1024
): Promise<Record<string, unknown>> {
  const declaredLength = Number(request.headers.get("content-length") ?? 0)
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw Response.json({ error: "Requête trop volumineuse." }, { status: 413 })
  }
  const raw = await request.text()
  if (new TextEncoder().encode(raw).byteLength > maxBytes) {
    throw Response.json({ error: "Requête trop volumineuse." }, { status: 413 })
  }
  try {
    const value = JSON.parse(raw) as unknown
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}
