import { characterProfile, characterSearchText } from "./character-profile.js";
export const CHARACTER_TAG = "карточка персонажа";

export function isCharacterNote(note) {
  return note.tags.includes(CHARACTER_TAG);
}

export function escapeHTML(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}
export function safeURL(value) {
  try {
    const u = new URL(value);
    return ["https:", "http:"].includes(u.protocol) ? u.href : "";
  } catch {
    return "";
  }
}
export function parseTags(value) {
  return [
    ...new Set(
      value
        .split(/[,，\n]/)
        .map((t) => t.trim().replace(/^#/, "").toLocaleLowerCase("ru"))
        .filter(Boolean),
    ),
  ];
}
export function visibleNotes(notes, nav) {
  if (nav === "trash") return notes.filter((n) => n.deleted_at);
  return notes.filter(
    (n) =>
      !n.deleted_at &&
      (nav === "all" ||
        (nav === "favorite" && n.favorite) ||
        (nav === "loose" && !n.project_id) ||
        n.project_id === nav),
  );
}
export function scopedTags(notes, nav) {
  const counts = new Map();
  for (const n of visibleNotes(notes, nav))
    for (const t of n.tags) counts.set(t, (counts.get(t) || 0) + 1);
  return [...counts].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ru"),
  );
}
export function filteredNotes(notes, nav, tag, query, sort) {
  const q = query.trim().toLocaleLowerCase("ru");
  return visibleNotes(notes, nav)
    .filter(
      (n) =>
        (!tag || n.tags.includes(tag)) &&
        (!q ||
          [
            n.title,
            n.body,
            characterSearchText(n.character_profile),
            ...n.tags,
            ...n.comments.map((c) => c.text),
          ]
            .join(" ")
            .toLocaleLowerCase("ru")
            .includes(q)),
    )
    .sort((a, b) =>
      sort === "favorite" && Boolean(a.favorite) !== Boolean(b.favorite)
        ? Number(Boolean(b.favorite)) - Number(Boolean(a.favorite))
        : sort === "alpha"
          ? a.title.localeCompare(b.title, "ru")
          : new Date(b.updated_at) - new Date(a.updated_at),
    );
}
export function noteInput(draft) {
  const body = draft.body || "";
  const title = (
    draft.title.trim() ||
    body.trim().split("\n")[0] ||
    "Без названия"
  ).slice(0, 150);
  const links = draft.links
    .map((l) => ({ title: l.title.trim(), url: l.url.trim() }))
    .filter((l) => l.url);
  if (links.some((l) => !safeURL(l.url)))
    throw new Error("В ссылках нужен полный адрес с https:// или http://");
  const tags = parseTags(draft.tagsText);
  const noteType =
    draft.noteType ?? (tags.includes(CHARACTER_TAG) ? "character" : "note");
  const regularTags = tags.filter((tag) => tag !== CHARACTER_TAG);
  return {
    title,
    body,
    project_id: draft.project_id || null,
    tags:
      noteType === "character" ? [...regularTags, CHARACTER_TAG] : regularTags,
    ...(draft.character_profile !== undefined || noteType === "character"
      ? { character_profile: characterProfile(draft.character_profile) }
      : {}),
    images: draft.images,
    links,
  };
}

export function textStats(text) {
  const words = [
    ...new Intl.Segmenter("ru", { granularity: "word" }).segment(text),
  ].filter((part) => part.isWordLike).length;
  const characters = [
    ...new Intl.Segmenter("ru", { granularity: "grapheme" }).segment(text),
  ].length;
  return { words, characters };
}
export function textFilename(title) {
  return (
    (title
      .replace(/[\\/:*?"<>|\x00-\x1f]/g, "-")
      .replace(/[. ]+$/g, "")
      .slice(0, 100) || "История") + ".txt"
  );
}
