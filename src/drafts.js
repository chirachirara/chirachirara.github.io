// Every editor owns a separate draft. A save in one tab must never erase another tab.
export function createDraft(record) {
  const { _localId, _origin, create_id, ...fields } = structuredClone(record);
  return {
    ...fields,
    _localId: crypto.randomUUID(),
    ...(!fields.id ? { create_id: create_id || crypto.randomUUID() } : {}),
  };
}

function validDraft(draft) {
  if (!draft || typeof draft.title !== "string") return false;
  if (draft.kind === "manuscript") return typeof draft.manuscript === "string";
  if (draft.kind === "project")
    return (
      typeof draft.summary === "string" &&
      typeof draft.publication_url === "string"
    );
  return (
    draft.kind === "note" &&
    typeof draft.body === "string" &&
    typeof draft.tagsText === "string" &&
    Array.isArray(draft.images) &&
    draft.images.every((value) => typeof value === "string") &&
    Array.isArray(draft.links) &&
    draft.links.every(
      (link) =>
        link && typeof link.title === "string" && typeof link.url === "string",
    )
  );
}

export function createDraftStore(storage) {
  const prefix = (owner) => `chirachirara:draft:${owner}`;
  function entries(owner) {
    const result = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key !== prefix(owner) && !key?.startsWith(`${prefix(owner)}:`))
        continue;
      try {
        const raw = storage.getItem(key);
        const parsed = JSON.parse(raw);
        const legacy = key === prefix(owner);
        const entry = legacy
          ? { draft: parsed, savedAt: 0, version: raw }
          : parsed;
        if (validDraft(entry.draft)) result.push({ ...entry, key, legacy });
      } catch {
        /* Preserve unreadable drafts instead of deleting user data. */
      }
    }
    // Hide unchanged ancestors while a recovered continuation exists.
    const superseded = new Set(
      result.flatMap((entry) => {
        const origin = entry.draft._origin;
        return origin &&
          result.some(
            (other) =>
              other.key === origin.key && other.version === origin.version,
          )
          ? [origin.key]
          : [];
      }),
    );
    return result
      .filter((entry) => !superseded.has(entry.key))
      .sort((a, b) => b.savedAt - a.savedAt);
  }
  return {
    list: entries,
    save(owner, draft) {
      if (!validDraft(draft) || !draft._localId)
        throw new Error("Некорректный черновик");
      storage.setItem(
        `${prefix(owner)}:${draft._localId}`,
        JSON.stringify({
          version: crypto.randomUUID(),
          savedAt: Date.now(),
          draft,
        }),
      );
    },
    restore(entry) {
      return {
        ...createDraft(entry.draft),
        _origin: {
          key: entry.key,
          version: entry.version,
          legacy: entry.legacy,
        },
      };
    },
    remove(owner, draft) {
      if (draft?._localId)
        storage.removeItem(`${prefix(owner)}:${draft._localId}`);
      let origin = draft?._origin;
      const visited = new Set();
      while (origin && !visited.has(origin.key)) {
        if (
          typeof origin.key !== "string" ||
          !(
            origin.key === prefix(owner) ||
            origin.key.startsWith(`${prefix(owner)}:`)
          )
        )
          return;
        visited.add(origin.key);
        const raw = storage.getItem(origin.key);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        const version = origin.legacy ? raw : parsed.version;
        // Preserve any ancestor that another tab has edited since recovery.
        if (version !== origin.version) return;
        storage.removeItem(origin.key);
        origin = (origin.legacy ? parsed : parsed.draft)?._origin;
      }
    },
  };
}
