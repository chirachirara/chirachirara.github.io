export class ConflictError extends Error {
  constructor() {
    super(
      "Запись уже изменилась на другом устройстве. Обнови архив для сравнения или сохрани свою версию отдельной копией.",
    );
    this.name = "ConflictError";
  }
}

function checked(result) {
  if (result.error)
    throw Object.assign(new Error(result.error.message), {
      code: result.error.code,
    });
  return result.data;
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  return value;
}
export function createRepository(client) {
  async function allRows(table) {
    const rows = [];
    // The API can return fewer rows than requested. Exact counts prevent a silent
    // truncation in both the library and a supposedly complete backup.
    for (;;) {
      const response = await client
        .from(table)
        .select("*", { count: "exact" })
        .order("id")
        .range(rows.length, rows.length + 499);
      const page = checked(response);
      if (!Array.isArray(page))
        throw new Error("База вернула некорректный ответ.");
      const total = response.count;
      if (!Number.isInteger(total))
        throw new Error(
          "Не удалось проверить полноту архива. Повтори загрузку.",
        );
      if (page.length === 0 && rows.length < total)
        throw new Error("Архив изменился во время загрузки. Повтори загрузку.");
      rows.push(...page);
      if (rows.length >= total) return rows;
    }
  }
  return {
    async loadArchive() {
      const [projects, notes] = await Promise.all([
        allRows("projects"),
        allRows("notes"),
      ]);
      projects.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      notes.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
      return { projects, notes };
    },
    async insertRecord(table, fields) {
      const result = await client.from(table).insert(fields).select().single();
      // A request may have committed before the connection dropped. Retrying a
      // draft uses the same UUID and returns that insert rather than duplicating it.
      if (result.error?.code === "23505" && fields.id) {
        const existing = checked(
          await client.from(table).select("*").eq("id", fields.id).single(),
        );
        if (
          Object.entries(fields).every(
            ([key, value]) =>
              JSON.stringify(canonical(existing[key])) ===
              JSON.stringify(canonical(value)),
          )
        )
          return existing;
        throw new ConflictError();
      }
      return checked(result);
    },
    async updateRecord(table, record, fields) {
      const data = checked(
        await client
          .from(table)
          .update(fields)
          .eq("id", record.id)
          .eq("revision", record.revision)
          .select()
          .maybeSingle(),
      );
      if (!data) throw new ConflictError();
      return data;
    },
  };
}
