/** Copy cursor positions refer to displayed graphemes, never UTF-16 halves. */
export interface CopyBuffer {
  units: string[];
  cursor: number;
  anchor: number | null;
}
const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
export function enterCopyMode(text: string): CopyBuffer {
  return {
    units: Array.from(segmenter.segment(text), (part) => part.segment),
    cursor: 0,
    anchor: null,
  };
}
export function toggleCopySelection(buffer: CopyBuffer): CopyBuffer {
  return { ...buffer, anchor: buffer.anchor === null ? buffer.cursor : null };
}
export function moveCopyCursor(
  buffer: CopyBuffer,
  direction: "h" | "j" | "k" | "l",
): CopyBuffer {
  const { units, cursor } = buffer;
  let target = cursor;
  if (direction === "h") target--;
  if (direction === "l") target++;
  const before = units.slice(0, cursor);
  const lineStart = before.lastIndexOf("\n") + 1;
  if (direction === "j") {
    const next = units.indexOf("\n", cursor);
    if (next !== -1) {
      const end = units.indexOf("\n", next + 1);
      target = Math.min(
        next + 1 + cursor - lineStart,
        end < 0 ? units.length - 1 : end,
      );
    }
  }
  if (direction === "k" && lineStart > 0) {
    const previous = units.slice(0, lineStart - 1).lastIndexOf("\n") + 1;
    target = Math.min(previous + cursor - lineStart, lineStart - 1);
  }
  return {
    ...buffer,
    cursor: Math.max(0, Math.min(Math.max(0, units.length - 1), target)),
  };
}
export function selectedCopyText(buffer: CopyBuffer): string {
  const { units, cursor, anchor } = buffer;
  const start = anchor === null ? cursor : Math.min(anchor, cursor);
  const lineEnd = units.indexOf("\n", start);
  const end =
    anchor === null
      ? lineEnd < 0
        ? units.length
        : lineEnd
      : Math.max(anchor, cursor) + 1;
  return units.slice(start, end).join("");
}
