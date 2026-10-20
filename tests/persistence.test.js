import test from "node:test";
import assert from "node:assert/strict";
import { createDraft, createDraftStore } from "../src/drafts.js";
import { createRepository, ConflictError } from "../src/repository.js";
import { validateArchive } from "../src/archive.js";
const note = () => ({
  kind: "note",
  title: "A",
  body: "text",
  tagsText: "",
  images: [],
  links: [],
});
function storage() {
  const values = new Map();
  return {
    get length() {
      return values.size;
    },
    key: (i) => [...values.keys()][i],
    getItem: (k) => values.get(k) || null,
    setItem: (k, v) => values.set(k, v),
    removeItem: (k) => values.delete(k),
  };
}
test("saving one tab does not erase another tab or another account draft", () => {
  const store = createDraftStore(storage()),
    a = createDraft(note()),
    b = createDraft(note());
  store.save("alice", a);
  store.save("alice", b);
  store.save("bob", a);
  store.remove("alice", a);
  assert.equal(store.list("alice").length, 1);
  assert.equal(store.list("alice")[0].draft._localId, b._localId);
  assert.equal(store.list("bob").length, 1);
});
test("restored draft preserves a subsequently edited original", () => {
  const store = createDraftStore(storage()),
    a = createDraft(note());
  store.save("alice", a);
  const copy = store.restore(store.list("alice")[0]);
  store.save("alice", copy);
  a.body = "new text in original tab";
  store.save("alice", a);
  store.remove("alice", copy);
  assert.equal(store.list("alice")[0].draft.body, a.body);
});
test("successful recovery removes unchanged origin and keeps stable insert UUID", () => {
  const store = createDraftStore(storage()),
    a = createDraft(note());
  store.save("alice", a);
  const copy = store.restore(store.list("alice")[0]);
  assert.equal(copy.create_id, a.create_id);
  store.save("alice", copy);
  store.remove("alice", copy);
  assert.equal(store.list("alice").length, 0);
});
test("legacy drafts can be restored, corrupt drafts are preserved safely", () => {
  const mem = storage();
  mem.setItem("chirachirara:draft:alice", JSON.stringify(note()));
  mem.setItem("chirachirara:draft:alice:bad", "{");
  const store = createDraftStore(mem);
  assert.equal(store.list("alice").length, 1);
  const d = store.restore(store.list("alice")[0]);
  store.save("alice", d);
  store.remove("alice", d);
  assert.equal(mem.length, 1);
});
test("archive pagination works even when API caps a page below requested size", async () => {
  const rows = Array.from({ length: 1201 }, (_, i) => ({
    id: String(i),
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
  }));
  const client = {
    from: () => ({
      select: () => ({
        order: () => ({
          range: async (start) => ({
            data: rows.slice(start, start + 73),
            count: rows.length,
          }),
        }),
      }),
    }),
  };
  const archive = await createRepository(client).loadArchive();
  assert.equal(archive.notes.length, 1201);
  assert.equal(archive.projects.length, 1201);
});
test("a failed later page never returns a partial archive", async () => {
  const client = {
    from: () => ({
      select: () => ({
        order: () => ({
          range: async (start) =>
            start
              ? { error: { message: "offline" } }
              : { data: [{ id: "a" }], count: 2 },
        }),
      }),
    }),
  };
  await assert.rejects(createRepository(client).loadArchive(), /offline/);
});
test("stale revision produces an explicit conflict", async () => {
  const q = {
    update: () => q,
    eq: () => q,
    select: () => q,
    maybeSingle: async () => ({ data: null }),
  };
  await assert.rejects(
    createRepository({ from: () => q }).updateRecord(
      "notes",
      { id: "a", revision: 1 },
      {},
    ),
    ConflictError,
  );
});
test("retry of successful insert accepts JSONB object key reordering", async () => {
  const fields = {
    id: "a",
    links: [{ title: "ref", url: "https://example.com" }],
  };
  const q = {
    insert: () => ({
      select: () => ({ single: async () => ({ error: { code: "23505" } }) }),
    }),
    select: () => ({
      eq: () => ({
        single: async () => ({
          data: {
            id: "a",
            links: [{ url: "https://example.com", title: "ref" }],
          },
        }),
      }),
    }),
  };
  assert.equal(
    (await createRepository({ from: () => q }).insertRecord("notes", fields))
      .id,
    "a",
  );
  fields.links[0].title = "changed";
  await assert.rejects(
    createRepository({ from: () => q }).insertRecord("notes", fields),
    ConflictError,
  );
});
const backup = () => ({
  format: "chirachirara-v1",
  projects: [],
  notes: [
    {
      title: "A",
      body: "",
      tags: [],
      images: [],
      links: [],
      comments: [],
      project_id: null,
    },
  ],
});
test("import validates all records before writing, rejects null and future formats", () => {
  assert.equal(validateArchive(backup()).modern, true);
  for (const value of [
    null,
    { ...backup(), format: "future" },
    { ...backup(), notes: [null] },
    { ...backup(), projects: [null] },
  ])
    assert.throws(() => validateArchive(value), /Импорт не начат/);
});
test("import rejects image truncation, missing projects and invalid dates", () => {
  for (const patch of [
    { images: Array(5).fill("data:image/jpeg;base64,YQ==") },
    { project_id: "missing" },
    { created_at: "bad" },
    { comments: [null] },
  ]) {
    const b = backup();
    Object.assign(b.notes[0], patch);
    assert.throws(() => validateArchive(b));
  }
});

test("repeated recovery shows one continuation and clears unchanged ancestors", () => {
  const store = createDraftStore(storage());
  let d = createDraft(note());
  store.save("alice", d);
  for (let i = 0; i < 3; i++) {
    d = store.restore(store.list("alice")[0]);
    store.save("alice", d);
    assert.equal(store.list("alice").length, 1);
  }
  store.remove("alice", d);
  assert.equal(store.list("alice").length, 0);
});
