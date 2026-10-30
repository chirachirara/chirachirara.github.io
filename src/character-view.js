import { CHARACTER_GROUPS, characterProfile } from "./character-profile.js";
import { escapeHTML as esc } from "./model.js";
export function characterEditor(draft) {
  const profile = characterProfile(draft.character_profile);
  return `<section class="character-editor"><p class="hint">Все поля необязательные. Анкета относится к этой карточке и этой версии истории.</p>${CHARACTER_GROUPS.map(
    (group) => {
      const open =
        draft.characterSections?.includes(group.id) ??
        (group.id === "basic" ||
          group.fields.some(([key]) => profile[key]?.trim()));
      return `<details class="character-group" data-character-group="${group.id}" ${open ? "open" : ""}><summary>${group.title}</summary><div class="character-fields ${group.long ? "" : "character-basics"}">${group.fields.map(([key, label, hint]) => `<label class="field"><span>${label}</span>${group.long ? `<textarea aria-label="${esc(label)}" data-character-field="${key}" maxlength="5000" rows="3">${esc(profile[key] || "")}</textarea>` : `<input data-character-field="${key}" maxlength="5000" value="${esc(profile[key] || "")}" ${hint ? `placeholder="${esc(hint)}"` : ""}>`}</label>`).join("")}</div></details>`;
    },
  ).join(
    "",
  )}<details class="character-group" data-character-group="custom" ${(draft.characterSections?.includes("custom") ?? Boolean(profile.custom?.length)) ? "open" : ""}><summary>Свои поля</summary>${(profile.custom || []).map((field, index) => `<div class="character-custom"><label class="field"><span>Название своего поля</span><input data-character-custom="${index}" data-custom-key="label" maxlength="100" value="${esc(field.label)}" placeholder="Например, знак зодиака"></label><label class="field"><span>Значение своего поля</span><textarea aria-label="Значение своего поля" data-character-custom="${index}" data-custom-key="value" maxlength="5000" rows="2">${esc(field.value)}</textarea></label><button class="auth-link" data-action="removecharacterfield" data-character-index="${index}">Убрать поле ${index + 1}</button></div>`).join("")}<button class="small-add" data-action="addcharacterfield">Добавить своё поле</button></details></section>`;
}
export function captureCharacter(draft, root) {
  if (!root.querySelector("[data-character-field]")) return;
  draft.character_profile = characterProfile(draft.character_profile);
  root.querySelectorAll("[data-character-field]").forEach((input) => {
    draft.character_profile[input.dataset.characterField] = input.value;
  });
  root.querySelectorAll("[data-character-custom]").forEach((input) => {
    const field =
      draft.character_profile.custom?.[Number(input.dataset.characterCustom)];
    if (field) field[input.dataset.customKey] = input.value;
  });
  draft.characterSections = [
    ...root.querySelectorAll("[data-character-group][open]"),
  ].map((group) => group.dataset.characterGroup);
}
export function characterDetail(value) {
  const profile = characterProfile(value);
  const blocks = CHARACTER_GROUPS.map((group) => {
    const fields = group.fields.filter(([key]) => profile[key]?.trim());
    return fields.length
      ? `<section class="detail-section character-profile"><h3>${group.title}</h3><dl>${fields.map(([key, label]) => `<div><dt>${label}</dt><dd>${esc(profile[key])}</dd></div>`).join("")}</dl></section>`
      : "";
  }).join("");
  const custom = (profile.custom || []).filter((field) => field.value.trim());
  return (
    blocks +
    (custom.length
      ? `<section class="detail-section character-profile"><h3>Свои поля</h3><dl>${custom.map((field) => `<div><dt>${esc(field.label || "Без названия")}</dt><dd>${esc(field.value)}</dd></div>`).join("")}</dl></section>`
      : "")
  );
}
