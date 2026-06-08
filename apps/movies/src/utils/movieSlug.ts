export function movieSlugFromText(value: string, fallback = "untitled"): string {
  const slug = value
    .replace(/\u0110/g, "D")
    .replace(/\u0111/g, "d")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
  return slug.length > 0 ? slug : fallback;
}
