import test from "node:test";
import assert from "node:assert/strict";
import {
  characterProfile,
  hasCharacterData,
} from "../src/character-profile.js";
import { characterDetail, characterEditor } from "../src/character-view.js";
import { noteInput, filteredNotes } from "../src/model.js";
import { validateArchive } from "../src/archive.js";
import { createDraft, createDraftStore } from "../src/drafts.js";
const draft = {
  kind: "note",
  title: "Суна",
  body: "Старое свободное описание",
  tagsText: "суна",
  noteType: "character",
  project_id: "a",
  images: [],
  links: [],
};
const profile = {
  age: "17 → 25",
  birthplace: "Хёго",
  au_changes: "Работает в библиотеке",
  custom: [{ label: "Знак зодиака", value: "Весы" }],
};
test("old character descriptions and archives work with an empty profile", () => {
  const fields = noteInput(draft);
  assert.equal(fields.body, draft.body);
  assert.deepEqual(fields.character_profile, {});
  assert.equal(characterDetail(undefined), "");
  assert.equal(hasCharacterData(undefined), false);
});
test("character profile survives type changes and remains independent across AUs", () => {
  const first = noteInput({ ...draft, character_profile: profile });
  const normal = noteInput({
    ...draft,
    noteType: "note",
    character_profile: first.character_profile,
  });
  const restored = noteInput({
    ...draft,
    character_profile: normal.character_profile,
  });
  assert.deepEqual(restored.character_profile, profile);
  const other = noteInput({ ...draft, character_profile: { age: "35" } });
  other.character_profile.age = "36";
  assert.equal(first.character_profile.age, "17 → 25");
});
test("archive export/import retains optional fields and rejects malformed profiles", () => {
  const n = {
    ...noteInput({ ...draft, character_profile: profile }),
    project_id: null,
    comments: [],
  };
  const archive = JSON.parse(
    JSON.stringify({ format: "chirachirara-v1", projects: [], notes: [n] }),
  );
  assert.deepEqual(
    validateArchive(archive).data.notes[0].character_profile,
    profile,
  );
  assert.deepEqual(
    noteInput({
      ...archive.notes[0],
      tagsText: archive.notes[0].tags.join(","),
    }).character_profile,
    profile,
  );
  for (const invalid of [
    null,
    [],
    { age: 27 },
    { custom: [{ label: "Age", value: 27 }] },
    { age: "x".repeat(5001) },
  ]) {
    assert.throws(() => characterProfile(invalid));
    assert.throws(() =>
      validateArchive({
        ...archive,
        notes: [{ ...n, character_profile: invalid }],
      }),
    );
  }
});
test("filled fields are displayed safely while empty fields are hidden", () => {
  const html = characterDetail({
    age: "27",
    birthplace: "",
    custom: [{ label: "<script>", value: "<img src=x onerror=alert(1)>" }],
  });
  assert.match(html, /27/);
  assert.doesNotMatch(html, /Место рождения|<script>|<img/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(
    characterEditor({ ...draft, character_profile: profile }),
    /17 → 25/,
  );
});
test("search finds a character by structured field and custom value", () => {
  const n = {
    ...noteInput({ ...draft, character_profile: profile }),
    id: "a",
    tags: [],
    comments: [],
  };
  assert.equal(filteredNotes([n], "all", null, "библиотеке", "new").length, 1);
  assert.equal(filteredNotes([n], "all", null, "весы", "new").length, 1);
});
test("local draft recovery preserves profile, custom fields and expanded sections", () => {
  const data = new Map();
  const storage = {
    get length() {
      return data.size;
    },
    key: (i) => [...data.keys()][i],
    getItem: (k) => data.get(k) || null,
    setItem: (k, v) => data.set(k, v),
    removeItem: (k) => data.delete(k),
  };
  const store = createDraftStore(storage);
  const d = createDraft({
    ...draft,
    character_profile: profile,
    characterSections: ["basic", "au"],
  });
  store.save("alice", d);
  const recovered = store.restore(store.list("alice")[0]);
  assert.deepEqual(recovered.character_profile, profile);
  assert.deepEqual(recovered.characterSections, ["basic", "au"]);
});
