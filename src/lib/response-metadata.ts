const memoryMarker = "[[LUMY_MEMORY:"

export function splitResponseMetadata(value: string) {
  const markerStart = value.indexOf(memoryMarker)
  if (markerStart >= 0) {
    const markerEnd = value.indexOf("]]", markerStart + memoryMarker.length)
    const rawIds =
      markerEnd >= 0
        ? value.slice(markerStart + memoryMarker.length, markerEnd)
        : ""
    const usedMemoryIds = rawIds
      .split(",")
      .map((id) => id.trim())
      .filter((id) => id !== "none" && /^[A-Za-z0-9_-]{1,100}$/.test(id))
    return {
      content:
        markerEnd >= 0
          ? `${value.slice(0, markerStart)}${value.slice(markerEnd + 2)}`
          : value.slice(0, markerStart),
      usedMemoryIds: Array.from(new Set(usedMemoryIds)),
    }
  }

  const possiblePartialStart = value.lastIndexOf("[[")
  if (possiblePartialStart >= 0) {
    const tail = value.slice(possiblePartialStart)
    if (memoryMarker.startsWith(tail)) {
      return {
        content: value.slice(0, possiblePartialStart),
        usedMemoryIds: [],
      }
    }
  }
  return { content: value, usedMemoryIds: [] }
}
