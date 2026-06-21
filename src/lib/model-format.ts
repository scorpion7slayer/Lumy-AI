const compactNumber = new Intl.NumberFormat("fr-FR", {
  notation: "compact",
  maximumFractionDigits: 1,
})

const exactNumber = new Intl.NumberFormat("fr-FR")

export function formatTokenCount(value: number, compact = true) {
  const safeValue = Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0
  return (compact ? compactNumber : exactNumber).format(safeValue)
}
