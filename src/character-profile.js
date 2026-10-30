export const CHARACTER_GROUPS = [
  {
    id: "basic",
    title: "Основное",
    fields: [
      ["nicknames", "Прозвища"],
      [
        "age",
        "Возраст на момент событий",
        "27; около 30; 17 → 25 после таймскипа",
      ],
      ["birthday", "День рождения", "Можно указать только день и месяц"],
      ["birthplace", "Место рождения"],
      ["residence", "Где живёт сейчас"],
      [
        "occupation",
        "Занятие / роль в мире",
        "Работа, учёба, положение в этой AU",
      ],
    ],
  },
  {
    id: "appearance",
    title: "Внешность и манеры",
    long: true,
    fields: [
      ["appearance", "Внешность и отличительные черты"],
      ["voice", "Голос и речь"],
      ["habits", "Привычки, жесты, стиль"],
    ],
  },
  {
    id: "motivation",
    title: "Характер и мотивация",
    long: true,
    fields: [
      ["personality", "Характер"],
      ["desire", "Чего хочет"],
      ["fears", "Чего боится"],
      ["strengths", "Сильные стороны и уязвимости"],
      ["contradiction", "Внутреннее противоречие"],
    ],
  },
  {
    id: "history",
    title: "Прошлое и отношения",
    long: true,
    fields: [
      ["past", "Важные события прошлого"],
      ["family", "Семья"],
      ["relationships", "Отношения с героями"],
    ],
  },
  {
    id: "au",
    title: "В этой истории / AU",
    long: true,
    fields: [
      ["canon", "Что сохраняем из канона"],
      ["au_changes", "Что меняем в этой версии"],
      ["abilities", "Навыки, способности и ограничения"],
      ["arc", "Как меняется в истории"],
    ],
  },
];
export function characterProfile(value) {
  if (value === undefined) return {};
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Анкета персонажа повреждена.");
  const result = {};
  if (Object.keys(value).length > 64)
    throw new Error("В анкете слишком много полей.");
  for (const [key, text] of Object.entries(value)) {
    if (["__proto__", "constructor", "prototype"].includes(key))
      throw new Error("Некорректное поле анкеты.");
    if (key === "custom") {
      if (!Array.isArray(text) || text.length > 30)
        throw new Error("Можно добавить до 30 своих полей.");
      result.custom = text.map((field) => {
        if (
          !field ||
          typeof field.label !== "string" ||
          typeof field.value !== "string" ||
          field.label.length > 100 ||
          field.value.length > 5000
        )
          throw new Error("Проверь название и текст своего поля.");
        return { label: field.label, value: field.value };
      });
    } else {
      if (typeof text !== "string" || text.length > 5000 || key.length > 100)
        throw new Error(
          "Каждое поле анкеты должно содержать текст до 5000 знаков.",
        );
      result[key] = text;
    }
  }
  if (new TextEncoder().encode(JSON.stringify(result)).byteLength > 100000)
    throw new Error("Анкета слишком большая — сократи текст полей.");
  return result;
}
export function hasCharacterData(value) {
  return Object.entries(characterProfile(value)).some(([key, text]) =>
    key === "custom" ? text.some((field) => field.value.trim()) : text.trim(),
  );
}
export function characterSearchText(value) {
  return Object.entries(characterProfile(value))
    .flatMap(([key, text]) =>
      key === "custom"
        ? text.flatMap((field) => [field.label, field.value])
        : [text],
    )
    .join(" ");
}
