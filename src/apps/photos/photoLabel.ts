/** Human-friendly label derived from a photo's R2 object key. */
export function photoLabel(key: string): string {
  const fileName = key.split("/").pop() ?? key;
  const base = fileName.replace(/\.[^.]+$/, "");
  return base.replace(/[-_]+/g, " ").trim() || fileName;
}
