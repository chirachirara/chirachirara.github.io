import test from "node:test";
import assert from "node:assert/strict";
import {
  parseTags,
  scopedTags,
  noteInput,
  filteredNotes,
  safeURL,
  escapeHTML,
} from "../src/model.js";
const notes = [
  {
    id: "1",
    project_id: "a",
    title: "Лиса",
    body: "Ритуал",
    tags: ["лисы", "магия"],
    comments: [{ text: "Луна" }],
    updated_at: "2026-10-20",
    favorite: true,
  },
  {
    id: "2",
    project_id: "b",
    title: "Офис",
    body: "",
    tags: ["офис"],
    comments: [],
    updated_at: "2026-10-19",
  },
  {
    id: "3",
    project_id: null,
    title: "Песня",
    body: "",
    tags: ["музыка"],
    comments: [],
    updated_at: "2026-10-18",
  },
  {
    id: "4",
    project_id: "a",
    title: "Удалено",
    body: "",
    tags: ["тайна"],
    comments: [],
    updated_at: "2026-10-17",
    deleted_at: "2026-10-20",
  },
];
test("project tags exclude other projects and deleted notes", () => {
  assert.deepEqual(
    scopedTags(notes, "a")
      .map(([tag]) => tag)
      .sort(),
    ["лисы", "магия"],
  );
  assert.equal(scopedTags(notes, "all").length, 4);
  assert.deepEqual(scopedTags(notes, "loose"), [["музыка", 1]]);
});
test("search includes thoughts on margins and combines project/tag filters", () => {
  assert.deepEqual(
    filteredNotes(notes, "a", "магия", "луна", "new").map((n) => n.id),
    ["1"],
  );
  assert.equal(filteredNotes(notes, "b", null, "луна", "new").length, 0);
  assert.deepEqual(
    filteredNotes(notes, "trash", null, "", "new").map((n) => n.id),
    ["4"],
  );
});
test("tag normalization avoids duplicates", () =>
  assert.deepEqual(parseTags("#Куроо, куроо， Магия\n"), ["куроо", "магия"]));
test("quick capture derives a title without requiring project", () => {
  const n = noteInput({
    title: "",
    body: "Однажды\nдальше",
    project_id: "",
    tagsText: "",
    images: [],
    links: [],
  });
  assert.equal(n.title, "Однажды");
  assert.equal(n.project_id, null);
});
test("unsafe links are rejected and user HTML is escaped", () => {
  assert.equal(safeURL("javascript:alert(1)"), "");
  assert.equal(safeURL("https://example.com"), "https://example.com/");
  assert.match(escapeHTML('<img onerror="x">'), /^&lt;/);
  assert.throws(() =>
    noteInput({
      title: "X",
      body: "",
      tagsText: "",
      images: [],
      links: [{ title: "x", url: "javascript:alert(1)" }],
    }),
  );
});

test("favorite-first sorting respects project scope and excludes trash", () => {
  const items = [
    ...notes,
    { ...notes[1], id: "5", project_id: "a", updated_at: "2026-10-22" },
  ];
  assert.deepEqual(
    filteredNotes(items, "a", null, "", "favorite").map((n) => n.id),
    ["1", "5"],
  );
});
