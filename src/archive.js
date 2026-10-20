import { noteInput, safeURL } from "./model.js";

// Validate the whole file before the first cloud write: malformed backups must
// not produce half an import merely because the invalid item came last.
export function validateArchive(data) {
  const fail = () => {
    throw new Error(
      "Архив повреждён или его формат не поддерживается. Импорт не начат.",
    );
  };
  const object = (value) =>
    value && typeof value === "object" && !Array.isArray(value);
  const title = (value) =>
    typeof value === "string" && value.trim().length > 0 && value.length <= 150;
  const dates = (value) =>
    ["created_at", "updated_at", "deleted_at"].every(
      (key) =>
        value[key] == null ||
        (typeof value[key] === "string" &&
          Number.isFinite(Date.parse(value[key]))),
    );
  if (
    !object(data) ||
    (data.format !== undefined && data.format !== "chirachirara-v1") ||
    !Array.isArray(data.projects) ||
    !Array.isArray(data.notes)
  )
    fail();
  const modern = data.format === "chirachirara-v1";
  if (data.notes.length > 500)
    throw new Error("Импортируй не больше 500 заметок за один раз.");
  const ids = new Set();
  for (const p of data.projects) {
    if (!modern) {
      if (!title(p)) fail();
      continue;
    }
    if (
      !object(p) ||
      typeof p.id !== "string" ||
      !p.id ||
      ids.has(p.id) ||
      !title(p.title) ||
      !["summary", "manuscript", "publication_url"].every(
        (key) => typeof p[key] === "string",
      ) ||
      (p.publication_url && !safeURL(p.publication_url)) ||
      !dates(p)
    )
      fail();
    ids.add(p.id);
  }
  for (const n of data.notes) {
    if (
      !object(n) ||
      typeof n.title !== "string" ||
      n.title.length > 150 ||
      typeof n.body !== "string" ||
      !dates(n) ||
      !Array.isArray(n.tags) ||
      !n.tags.every((t) => typeof t === "string") ||
      !Array.isArray(n.images) ||
      n.images.length > 4 ||
      !n.images.every(
        (i) =>
          typeof i === "string" &&
          /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(i),
      ) ||
      !Array.isArray(n.links) ||
      !n.links.every(
        (l) =>
          object(l) && typeof l.title === "string" && typeof l.url === "string",
      ) ||
      !Array.isArray(n.comments) ||
      !n.comments.every(
        (c) =>
          object(c) &&
          typeof c.text === "string" &&
          (c.at == null ||
            (typeof c.at === "string" && Number.isFinite(Date.parse(c.at)))),
      )
    )
      fail();
    if (
      modern
        ? n.project_id != null && !ids.has(n.project_id)
        : n.project != null && !title(n.project)
    )
      fail();
    noteInput({ ...n, project_id: null, tagsText: n.tags.join(",") });
  }
  return { data, modern };
}
