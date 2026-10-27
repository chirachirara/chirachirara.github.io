import "./styles.css";
import { setupFeedback } from "./feedback.js";
import { createDraft, createDraftStore } from "./drafts.js";
import { validateArchive } from "./archive.js";
import { ic } from "./assets.js";
import {
  CHARACTER_TAG,
  parseTags,
  isCharacterNote,
  escapeHTML as esc,
  safeURL,
  scopedTags,
  filteredNotes,
  visibleNotes,
  noteInput,
  textStats,
  textFilename,
} from "./model.js";
import {
  cloud,
  configured,
  loadArchive,
  insertRecord,
  updateRecord,
  uploadReference,
  signedReference,
} from "./cloud.js";

const root = document.querySelector("#root");
const colors = [
  "#c7a1dc",
  "#87aba4",
  "#d6a48e",
  "#aaa6d6",
  "#d4c18e",
  "#a3bddb",
];
let user = null,
  archive = { projects: [], notes: [] };
let state = {
  nav: "all",
  selected: null,
  query: "",
  tag: null,
  sort: "new",
  draft: null,
  tab: "notes",
  open: false,
};
let busy = false,
  loading = false,
  authMode = "signin",
  toastTimer;
let images = new Map();
const commentDrafts = new Map();
setupFeedback(root, cloud, () => user);
const draftStore = createDraftStore({
  get length() {
    return localStorage.length;
  },
  key: (i) => localStorage.key(i),
  getItem: (key) => localStorage.getItem(key),
  setItem: (key, value) => localStorage.setItem(key, value),
  removeItem: (key) => localStorage.removeItem(key),
});
let recoveryEntries = [];
let sessionEpoch = 0;
let booted = false;
let pendingSignIn = false;
function assertSession(epoch) {
  if (epoch !== sessionEpoch)
    throw new Error("Аккаунт изменился. Операция остановлена.");
}
let focusEditor = false;
function toast(message) {
  const el = document.querySelector("#toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 6500);
}
function projectOf(id) {
  return archive.projects.find((p) => p.id === id);
}
function noteOf(id) {
  return archive.notes.find((n) => n.id === id);
}
function projectColor(id) {
  return colors[
    Math.max(
      0,
      archive.projects.findIndex((p) => p.id === id),
    ) % colors.length
  ];
}
function date(value) {
  return new Date(value).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
  });
}
function navTitle() {
  return (
    {
      all: "Все заметки",
      favorite: "Избранное",
      loose: "Без проекта",
      trash: "Корзина",
    }[state.nav] ||
    projectOf(state.nav)?.title ||
    "Заметки"
  );
}
function imageURL(path) {
  return images.get(path) || "";
}
function rememberDraft({ readForm = true } = {}) {
  if (!state.draft || !user) return true;
  if (readForm) capture();
  try {
    draftStore.save(user.id, state.draft);
    setDraftStatus("Черновик на устройстве · ещё не в базе");
    return true;
  } catch {
    setDraftStatus(
      "Не удалось сохранить черновик на устройстве. Сохрани текст в базе перед выходом.",
    );
    return false;
  }
}
function setDraftStatus(text) {
  const el = document.querySelector("#draftStatus");
  if (el) el.textContent = text;
}
function storedDrafts() {
  try {
    return user ? draftStore.list(user.id) : [];
  } catch {
    return [];
  }
}
function clearDraft(draft = state.draft) {
  try {
    if (user && draft) draftStore.remove(user.id, draft);
  } catch {
    toast("Запись сохранена, но локальную копию черновика не удалось удалить.");
  }
}
function leaveEditor() {
  if (!state.draft) return true;
  if (
    !rememberDraft() &&
    !confirm(
      "Не удалось сохранить черновик на устройстве. Уйти и потерять эти несохранённые правки?",
    )
  )
    return false;
  state.draft = null;
  return true;
}
function draftPicker() {
  return `<div class="inspector-inner"><div class="detail-top"><h2>Черновики на устройстве</h2><button class="icon-btn" data-action="close" aria-label="Закрыть">×</button></div><p class="hint">Каждый черновик хранится отдельно. Сохранение в одной вкладке не удалит работу в другой.</p>${recoveryEntries.map((entry, index) => `<button class="related-row" data-resume-index="${index}"><span>${esc(entry.draft.title || entry.draft.body?.split("\n")[0] || "Без названия")}</span><span>${entry.savedAt ? date(entry.savedAt) : "Из прежней версии"}</span></button>`).join("")}</div>`;
}
function authScreen(message = "") {
  const reset = authMode === "reset",
    signup = authMode === "signup";
  root.innerHTML = `<main class="auth-shell"><section class="auth-card"><div class="eyebrow">Кусочки будущих историй</div><h1>chirachirara.</h1><p class="auth-description">Диалоги, миры и случайные мысли.<br>Твой личный архив — с тобой на разных устройствах.</p><h2>${reset ? "Новый пароль" : signup ? "Создать личный архив" : "Вернуться к своим историям"}</h2><form id="authForm">${reset ? "" : `<label class="field"><span>Почта</span><input name="email" type="email" autocomplete="email" required></label>`}<label class="field"><span>Пароль</span><input name="password" type="password" ${signup || reset ? 'minlength="8"' : ""} autocomplete="${signup || reset ? "new-password" : "current-password"}" required></label><p id="authMessage" class="auth-message" role="status">${esc(message)}</p><button class="primary" type="submit">${reset ? "Сохранить пароль" : signup ? "Зарегистрироваться" : "Войти"}</button></form>${reset ? "" : `<button class="auth-link" data-action="authmode">${signup ? "Уже есть аккаунт? Войти" : "Создать аккаунт"}</button><button class="auth-link" data-action="forgot">Не помню пароль</button>`}<p class="hint">Проекты и заметки доступны только владельцу аккаунта.</p></section></main>`;
}
function setupScreen() {
  root.innerHTML = `<main class="auth-shell"><section class="auth-card"><div class="eyebrow">Кусочки будущих историй</div><h1>chirachirara.</h1><h2>Подключим личный архив</h2><p class="auth-description">Для этой версии нужна база Supabase. Заметки будут храниться в твоём аккаунте и открываться с разных устройств.</p><ol class="setup-steps"><li>Создай отдельный проект Supabase.</li><li>Выполни SQL из <code>supabase/migrations/202610200001_initial.sql</code>.</li><li>Скопируй <code>.env.example</code> в <code>.env.local</code> и укажи Project URL и публичный ключ.</li><li>Перезапусти приложение.</li></ol><p class="hint">Подробные шаги — в README.md. Подключение ещё не настроено; приложение не выдаёт локальное сохранение за облачное.</p></section></main>`;
}
async function hydrateImages() {
  const epoch = sessionEpoch;
  const paths = [
    ...new Set([
      ...archive.notes.flatMap((n) => n.images),
      ...(state.draft?.images || []),
    ]),
  ];
  const results = await Promise.allSettled(
    paths.map(async (path) => [path, await signedReference(path)]),
  );
  if (epoch !== sessionEpoch) return;
  // Preserve still-valid previews when a temporary network failure affects signing.
  const next = new Map(
    paths
      .filter((path) => images.has(path))
      .map((path) => [path, images.get(path)]),
  );
  for (const result of results)
    if (result.status === "fulfilled") next.set(...result.value);
  images = next;
}
async function refresh() {
  if (loading) return;
  const epoch = sessionEpoch;
  loading = true;
  try {
    const loaded = await loadArchive();
    if (epoch !== sessionEpoch || !user) return;
    archive = loaded;
    await hydrateImages();
    if (epoch === sessionEpoch) render();
  } finally {
    loading = false;
  }
}
function sidebar() {
  const navs = [
    ["all", "all", "Все заметки"],
    ["favorite", "heart", "Избранное"],
    ["loose", "archive", "Без проекта"],
    ["trash", "trash", "Корзина"],
  ];
  return `<div class="brand"><span class="brand-mark">${ic("spark", 23)}</span><div><div class="brand-title brand-long">chirachirara.</div><span class="brand-sub">кусочки будущих историй</span></div></div><div class="side-area"><div class="side-heading">Библиотека</div>${navs.map(([id, icon, label]) => `<button class="side-link ${state.nav === id ? "active" : ""}" data-nav="${id}">${ic(icon, 16)} ${label}<span class="count">${visibleNotes(archive.notes, id).length}</span></button>`).join("")}</div><div class="side-area"><div class="side-heading project-heading"><span>Проекты</span><button data-action="newproject" aria-label="Создать проект">+</button></div><div class="project-list">${archive.projects.map((p) => `<button class="side-link ${state.nav === p.id ? "active" : ""}" data-nav="${p.id}"><span class="project-dot" style="background:${projectColor(p.id)}"></span><span class="project-name">${esc(p.title)}</span><span class="count">${visibleNotes(archive.notes, p.id).length}</span></button>`).join("")}</div></div><div class="side-footer"><span class="account-label">${esc(user.email)}</span><button data-action="refresh">${ic("reset", 15)} Обновить архив</button><button data-action="resume">${ic("edit", 15)} Продолжить черновик</button><button data-action="export">${ic("download", 15)} Скачать архив</button><label class="import-label">Импорт архива<input type="file" id="importFile" accept="application/json" hidden></label><button data-feedback>Проблема или идея?</button><button data-action="logout">Выйти</button><p class="hint">Личный архив · Supabase</p></div>`;
}
function card(n) {
  const src = imageURL(n.images[0]);
  return `<article class="note-card ${src ? "has-image" : "text-only"} ${state.selected === n.id ? "is-selected" : ""}" data-note="${n.id}" tabindex="0" role="button" aria-label="Открыть ${esc(n.title)}">${src ? `<img class="card-img" src="${esc(src)}" alt="Референс" loading="lazy">` : `<div class="card-img-blank">${ic("spark", 32)}<span>story fragment</span></div>`}<div class="card-body"><div class="card-project" style="--project-color:${projectColor(n.project_id)}">${esc(projectOf(n.project_id)?.title || "Без проекта")}</div><div class="card-title">${esc(n.title)}</div>${isCharacterNote(n) ? '<span class="character-badge">Карточка персонажа</span>' : ""}<p class="card-desc">${esc(n.body || "У этой истории пока только начало…")}</p><div class="card-taglist">${n.tags
    .filter((tag) => tag !== CHARACTER_TAG)
    .slice(0, 4)
    .map((t) => `<span class="micro-tag">#${esc(t)}</span>`)
    .join(
      "",
    )}</div><div class="card-bottom"><span>${date(n.updated_at)}</span><button class="fave-btn ${n.favorite ? "on" : ""}" data-favorite="${n.id}" aria-label="${n.favorite ? "Убрать из избранного" : "В избранное"}" aria-pressed="${n.favorite}">${ic("heart", 16)}</button></div></div></article>`;
}
function boardNotes() {
  return state.tab === "characters" && projectOf(state.nav)
    ? archive.notes.filter(isCharacterNote)
    : archive.notes;
}
function renderBoard() {
  const board = document.querySelector("#board");
  if (!board) return;
  const notes = filteredNotes(
    boardNotes(),
    state.nav,
    state.tag,
    state.query,
    state.sort,
  );
  document.querySelector("#boardMeta").textContent = `Найдено: ${notes.length}`;
  board.innerHTML = notes.length
    ? notes.map(card).join("")
    : `<div class="empty">${ic("spark", 32)}<h3>${state.nav === "trash" ? "Корзина пуста" : state.tab === "characters" ? "Здесь будут персонажи истории" : "Здесь начинается история"}</h3><p>${state.tag || state.query ? "Попробуй убрать фильтр или изменить запрос." : state.tab === "characters" ? "Создай карточку: добавь имя, описание и референсы." : "Можно начать с одной строчки. Проект и теги добавишь позже."}</p>${state.nav === "trash" ? "" : `<button class="primary" data-action="new">${state.tab === "characters" ? "Добавить персонажа" : "Записать мысль"}</button>`}</div>`;
}
function render() {
  if (!user) return;
  const p = projectOf(state.nav);
  root.innerHTML = `<div class="app"><aside class="sidebar">${sidebar()}</aside><main class="main"><div class="mobile-top"><button class="mobile-brand" data-nav="all" aria-label="На главную">chirachirara.</button><div><button data-action="resume">Черновик</button> <button data-action="new">${p && state.tab === "characters" ? "+ Персонаж" : "+ Заметка"}</button> <button data-action="logout" aria-label="Выйти из аккаунта">Выйти</button></div></div><div class="main-inner">${p ? `<button class="back-home" data-nav="all">${ic("back", 16)} На главную</button>` : ""}<div class="eyebrow">${p ? "Рабочее пространство" : "Личный архив идей"}</div><div class="hero"><h1>${p ? esc(p.title) : "Всё, что пока не стало <em>историей.</em>"}</h1><button class="primary" data-action="new">${ic("plus", 16)} ${p && state.tab === "characters" ? "Новая карточка" : "Новая заметка"}</button></div><p class="hero-sub">${p ? esc(p.summary || "У каждой истории есть начало.") : "Сцены, персонажи, странные мысли и случайные озарения."}</p><div class="mobile-projects"><select id="mobileNav" aria-label="Раздел архива">${[["all", "Все заметки"], ["favorite", "Избранное"], ["loose", "Без проекта"], ["trash", "Корзина"], ...archive.projects.map((p) => [p.id, p.title])].map(([id, title]) => `<option value="${id}" ${state.nav === id ? "selected" : ""}>${esc(title)}</option>`).join("")}</select><button data-action="newproject">+ Проект</button><button data-action="refresh">Обновить</button><button data-action="export">Экспорт</button><button data-feedback>Проблема или идея?</button><label class="import-label">Импорт<input type="file" id="mobileImportFile" accept="application/json" hidden></label></div>${p ? `<div class="project-tabs"><button class="${state.tab === "notes" ? "active" : ""}" data-tab="notes">Заметки</button><button class="${state.tab === "characters" ? "active" : ""}" data-tab="characters">Персонажи</button><button class="${state.tab === "text" ? "active" : ""}" data-tab="text">Основной текст</button><button data-action="editproject">О проекте</button></div>${safeURL(p.publication_url) ? `<a class="publication-link" href="${esc(safeURL(p.publication_url))}" target="_blank" rel="noopener noreferrer">Читать опубликованную историю ↗</a>` : ""}` : ""}${
    p && state.tab === "text"
      ? `<section class="manuscript-preview"><div class="board-head"><h2>Текст в работе</h2><div class="manuscript-actions"><button class="ghost" data-action="downloadtext">Скачать .txt</button><button class="ghost" data-action="manuscript">Редактировать</button></div></div><div class="detail-content">${esc(p.manuscript || "Тут можно собирать основной текст истории. Наброски и референсы останутся на вкладке «Заметки».")}</div></section>`
      : `<div class="control-row"><div class="search-wrap">${ic("search", 17)}<input id="search" type="search" placeholder="Искать по тексту, персонажам, тегам…" value="${esc(state.query)}" aria-label="Поиск заметок"></div><button class="sort-btn" data-action="sort">${ic("sort", 15)} ${state.sort === "new" ? "Недавние" : state.sort === "alpha" ? "По названию" : "Избранные сначала"}</button></div><div class="divider-heading"><span class="section-title">${p ? "Теги этого проекта" : "Теги раздела"}</span>${state.tag ? '<button class="auth-link" data-action="cleartag">Сбросить фильтр</button>' : ""}</div><div class="tag-scroller">${
          scopedTags(boardNotes(), state.nav)
            .filter(([tag]) => tag !== CHARACTER_TAG)
            .map(
              ([tag, count]) =>
                `<button class="tag-pill ${tag === state.tag ? "chosen" : ""}" data-tag="${esc(tag)}"># ${esc(tag)} <span class="tag-num">${count}</span></button>`,
            )
            .join("") ||
          '<span class="hint">Теги появятся вместе с заметками.</span>'
        }</div><div class="board-head"><h2>${state.tab === "characters" && p ? "Персонажи" : esc(navTitle())}</h2><span class="board-meta" id="boardMeta"></span></div><div class="board-layout" id="board"></div>`
  }<div class="footer-note">chirachirara · личные тексты хранятся в базе</div></div></main><div class="mobile-shade" data-action="close"></div><aside class="inspector" id="inspector"></aside></div>`;
  document.body.classList.toggle("detail-open", state.open);
  renderBoard();
  renderInspector();
}
function related(n) {
  return archive.notes
    .filter((x) => x.id !== n.id && !x.deleted_at)
    .map((x) => ({
      note: x,
      score:
        (x.project_id && x.project_id === n.project_id ? 2 : 0) +
        x.tags.filter((t) => n.tags.includes(t)).length,
    }))
    .filter((x) => x.score > 1)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((x) => x.note);
}
function statsLabel(text) {
  const { words, characters } = textStats(text);
  return `Слов: ${words.toLocaleString("ru-RU")} · Знаков с пробелами: ${characters.toLocaleString("ru-RU")}`;
}
function detail(n) {
  return `<div class="inspector-inner"><div class="detail-top"><span class="detail-tag">${n.deleted_at ? "В корзине" : isCharacterNote(n) ? "Карточка персонажа" : "Фрагмент истории"}</span><div class="detail-buttons">${n.deleted_at ? '<button class="ghost" data-action="restore">Восстановить</button>' : ""}<button class="icon-btn" data-action="close" aria-label="Закрыть заметку">${ic("close", 16)}</button></div></div><div class="note-actions"><button class="ghost" data-action="close">${ic("back", 16)} К заметкам</button>${n.deleted_at ? "" : `<button class="ghost" data-action="edit">${ic("edit", 16)} Изменить</button><button class="danger" data-action="delete">${ic("trash", 16)} В корзину</button>`}</div><div class="detail-header"><h2>${esc(n.title)}</h2><div class="detail-info">${projectOf(n.project_id) ? `<button class="project-jump" data-project-jump="${n.project_id}">${esc(projectOf(n.project_id).title)} ↗</button>` : "Без проекта"} · ${date(n.updated_at)}</div></div>${n.images.map((path) => (imageURL(path) ? `<img class="detail-cover" src="${esc(imageURL(path))}" alt="Референс">` : "")).join("")}<div class="detail-content">${esc(n.body)}</div><p class="text-stats">${statsLabel(n.body)}</p><div class="detail-section"><h3>Теги</h3><div class="detail-tags">${n.tags
    .filter((t) => t !== CHARACTER_TAG)
    .map((t) => `<button data-tag="${esc(t)}"># ${esc(t)}</button>`)
    .join("")}</div></div>${
    n.links.length
      ? `<div class="detail-section"><h3>Ссылки и источники</h3>${n.links
          .filter((l) => safeURL(l.url))
          .map(
            (l) =>
              `<a class="detail-link" href="${esc(safeURL(l.url))}" target="_blank" rel="noopener noreferrer">${esc(l.title || l.url)} ↗</a>`,
          )
          .join("")}</div>`
      : ""
  }${
    n.deleted_at
      ? ""
      : `<div class="detail-section"><h3>Мысли на полях · ${n.comments.length}</h3>${n.comments.map((c) => `<div class="comment"><div class="comment-header"><b>Мысль на полях</b><span>${date(c.at)}</span></div><p>${esc(c.text)}</p></div>`).join("")}<div class="comment-entry"><textarea id="commentInput" placeholder="А ещё можно…" aria-label="Мысль на полях">${esc(commentDrafts.get(n.id) || "")}</textarea><button data-action="comment">Добавить мысль</button></div></div><div class="detail-section"><h3>Может быть связано</h3>${
          related(n)
            .map(
              (x) =>
                `<button class="related-row" data-note="${x.id}">${esc(x.title)} ${ic("arrow", 14)}</button>`,
            )
            .join("") ||
          '<p class="hint">Общие теги и проекты помогут найти связанные фрагменты.</p>'
        }</div>`
  }</div>`;
}
function renderInspector() {
  const el = document.querySelector("#inspector");
  if (!el) return;
  const n = noteOf(state.selected);
  el.innerHTML = state.recovering
    ? draftPicker()
    : state.draft
      ? editor()
      : n
        ? detail(n)
        : `<div class="inspector-placeholder">${state.open ? '<button class="icon-btn" data-action="close" aria-label="Закрыть">×</button>' : ""}<div class="orb">${ic("spark", 34)}</div><h2>Идеи любят компанию.</h2><p>Открой заметку или запиши первую мысль.</p><button class="ghost" data-action="resume">Продолжить черновик</button></div>`;
}
function editor() {
  const d = state.draft;
  if (d.kind === "note" && !d.noteType) {
    const tags = parseTags(d.tagsText || "");
    d.noteType = tags.includes(CHARACTER_TAG) ? "character" : "note";
    d.tagsText = tags.filter((tag) => tag !== CHARACTER_TAG).join(", ");
  }
  const isNote = d.kind === "note",
    isCharacter = d.noteType === "character";
  return `<div class="inspector-inner ${d.kind === "manuscript" ? "wide-editor" : ""}"><div class="detail-top"><span class="detail-tag">${isNote ? "Записать, пока не забылось" : d.kind === "manuscript" ? "Текст в работе" : "О проекте"}</span><button class="icon-btn" data-action="close" aria-label="Закрыть">${ic("close", 16)}</button></div><h2 class="edit-title">${isNote ? (isCharacter ? "Карточка персонажа" : "Фрагмент истории") : esc(d.title || "Новый проект")}</h2>${d.kind === "manuscript" ? "" : `<label class="field"><span>Название${isNote ? " · необязательно" : ""}</span><input id="editTitle" value="${esc(d.title)}" maxlength="150" placeholder="${isNote ? "Можно начать сразу с текста" : "Название истории"}"></label>`}${isNote ? `<label class="field"><span>Тип заметки</span><select id="editNoteType"><option value="note" ${!isCharacter ? "selected" : ""}>Обычная заметка</option><option value="character" ${isCharacter ? "selected" : ""}>Карточка персонажа</option></select></label><p class="hint">Карточки появятся во вкладке «Персонажи» выбранного проекта и останутся среди заметок.</p><label class="field"><span>Проект · можно переместить заметку</span><select id="editProject"><option value="">Без проекта</option>${archive.projects.map((p) => `<option value="${p.id}" ${d.project_id === p.id ? "selected" : ""}>${esc(p.title)}</option>`).join("")}</select></label><label class="field"><span>Сама идея</span><textarea id="editBody" placeholder="Диалог, сцена, вопрос…">${esc(d.body)}</textarea></label><label class="field"><span>Теги через запятую</span><input id="editTags" value="${esc(d.tagsText)}" placeholder="персонажи, магия, сцена"></label><div class="field"><span>Референсы · до четырёх</span><div class="edit-img-grid">${d.images.map((path, i) => `<div class="edit-thumb">${imageURL(path) ? `<img src="${esc(imageURL(path))}" alt="Референс">` : ""}<button data-rmimage="${i}" aria-label="Убрать референс">×</button></div>`).join("")}</div><label class="upload-button">Добавить картинки<input id="uploadImage" type="file" accept="image/*" multiple hidden></label></div><div class="field"><span>Ссылки</span>${d.links.map((l, i) => `<div class="link-edit"><input data-link-index="${i}" data-link-field="title" value="${esc(l.title)}" placeholder="Название" aria-label="Название ссылки"><input data-link-index="${i}" data-link-field="url" value="${esc(l.url)}" placeholder="https://…" aria-label="Адрес ссылки"><button data-rmlink="${i}" aria-label="Убрать ссылку">×</button></div>`).join("")}<button class="small-add" data-action="addlink">Добавить ссылку</button></div>` : d.kind === "project" ? `<label class="field"><span>Замысел</span><textarea id="editSummary" placeholder="О чём эта история?">${esc(d.summary)}</textarea></label><label class="field"><span>Ссылка на опубликованный текст</span><input id="editPublication" type="url" value="${esc(d.publication_url)}" placeholder="https://…"></label>` : `<label class="field"><span>Основной черновик</span><textarea id="editManuscript" class="manuscript-input" placeholder="Начни с любой сцены…">${esc(d.manuscript)}</textarea></label>`}${isNote || d.kind === "manuscript" ? `<p class="text-stats" id="textStats">${statsLabel(isNote ? d.body : d.manuscript)}</p>` : ""}<p class="hint" id="draftStatus" role="status">Черновик на устройстве · ещё не в базе</p><div class="edit-actions"><button class="ghost" data-action="discard">Отменить правки</button><button class="primary" data-action="save">Сохранить в базе</button></div>${d.id ? '<button class="auth-link" data-action="savecopy">Сохранить отдельную копию</button>' : ""}${isNote && d.id ? '<button class="danger" data-action="delete">В корзину</button>' : ""}</div>`;
}
function capture() {
  const d = state.draft;
  if (!d) return;
  for (const [id, key] of [
    ["editTitle", "title"],
    ["editProject", "project_id"],
    ["editNoteType", "noteType"],
    ["editBody", "body"],
    ["editTags", "tagsText"],
    ["editSummary", "summary"],
    ["editPublication", "publication_url"],
    ["editManuscript", "manuscript"],
  ]) {
    const el = document.getElementById(id);
    if (el) d[key] = el.value;
  }
  document.querySelectorAll("[data-link-index]").forEach((el) => {
    const link = d.links?.[Number(el.dataset.linkIndex)];
    if (link) link[el.dataset.linkField] = el.value;
  });
}
function openDraft(d) {
  if (!leaveEditor()) return;
  state.draft = createDraft(d);
  state.recovering = false;
  state.open = true;
  // Render first: the previous editor's DOM must never be captured into the new draft.
  render();
  rememberDraft({ readForm: false });
  document.querySelector("#inspector").scrollTop = 0;
  focusEditor = true;
}
function newNote() {
  openDraft({
    kind: "note",
    id: null,
    title: "",
    body: "",
    project_id: projectOf(state.nav)?.id || "",
    tagsText: "",
    noteType:
      state.tab === "characters" && projectOf(state.nav) ? "character" : "note",
    images: [],
    links: [],
  });
}
function editNote() {
  const n = noteOf(state.selected);
  if (n)
    openDraft({
      ...n,
      kind: "note",
      noteType: isCharacterNote(n) ? "character" : "note",
      tagsText: n.tags.filter((tag) => tag !== CHARACTER_TAG).join(", "),
    });
}
function editProject(kind) {
  const p = projectOf(state.nav);
  openDraft(
    p
      ? { ...p, kind }
      : {
          kind: "project",
          id: null,
          title: "",
          summary: "",
          manuscript: "",
          publication_url: "",
        },
  );
}
function replaceRecord(table, record) {
  const list = archive[table],
    i = list.findIndex((x) => x.id === record.id);
  if (i < 0) list.unshift(record);
  else list[i] = record;
}
async function save() {
  capture();
  const d = state.draft;
  if (!d) return;
  const epoch = sessionEpoch;
  rememberDraft();
  if (d.kind === "note") {
    const fields = noteInput(d);
    if (!d.title.trim() && !d.body.trim())
      throw new Error("Запиши хотя бы одну мысль.");
    const saved = d.id
      ? await updateRecord("notes", d, fields)
      : await insertRecord("notes", {
          ...fields,
          id: d.create_id,
          owner_id: user.id,
        });
    if (epoch !== sessionEpoch) return;
    replaceRecord("notes", saved);
    state.selected = saved.id;
    state.tab =
      state.tab === "characters" && fields.tags.includes(CHARACTER_TAG)
        ? "characters"
        : "notes";
    if (
      state.nav === "trash" ||
      (projectOf(state.nav) && fields.project_id !== state.nav)
    )
      state.nav = fields.project_id || "loose";
    state.tag = null;
    state.query = "";
  } else {
    let fields;
    if (d.kind === "manuscript") fields = { manuscript: d.manuscript };
    else {
      if (!d.title.trim()) throw new Error("Дай проекту название.");
      if (d.publication_url.trim() && !safeURL(d.publication_url.trim()))
        throw new Error(
          "Для публикации нужен полный адрес с https:// или http://",
        );
      fields = {
        title: d.title.trim(),
        summary: d.summary,
        publication_url: d.publication_url.trim(),
        ...(!d.id ? { manuscript: d.manuscript || "" } : {}),
      };
    }
    const saved = d.id
      ? await updateRecord("projects", d, fields)
      : await insertRecord("projects", {
          ...fields,
          id: d.create_id,
          owner_id: user.id,
        });
    if (epoch !== sessionEpoch) return;
    replaceRecord("projects", saved);
    state.nav = saved.id;
    state.selected = null;
    state.open = false;
    state.tab = d.kind === "manuscript" ? "text" : "notes";
  }
  clearDraft(d);
  state.draft = null;
  render();
  toast("Сохранено в базе ✦");
}
async function mutateNote(n, fields) {
  const epoch = sessionEpoch;
  const saved = await updateRecord("notes", n, fields);
  if (epoch !== sessionEpoch) return;
  replaceRecord("notes", saved);
  render();
}
async function addComment() {
  const el = document.querySelector("#commentInput"),
    text = el?.value.trim(),
    n = noteOf(state.selected);
  if (!text || !n) return;
  const epoch = sessionEpoch;
  const saved = await updateRecord("notes", n, {
    comments: [
      ...n.comments,
      { id: crypto.randomUUID(), text, at: new Date().toISOString() },
    ],
  });
  if (epoch !== sessionEpoch) return;
  commentDrafts.delete(n.id);
  replaceRecord("notes", saved);
  render();
  toast("Мысль сохранена в базе");
}
async function compress(file) {
  if (!file.type.startsWith("image/")) throw new Error("Выбери изображение.");
  if (file.size > 25 * 1024 * 1024)
    throw new Error("Изображение слишком большое. Выбери файл до 25 МБ.");
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 1400 / Math.max(bitmap.width, bitmap.height));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(bitmap.width * scale));
    c.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(bitmap, 0, 0, c.width, c.height);
    return await new Promise((resolve, reject) =>
      c.toBlob(
        (b) =>
          b ? resolve(b) : reject(new Error("Не удалось прочитать картинку.")),
        "image/jpeg",
        0.8,
      ),
    );
  } finally {
    bitmap.close();
  }
}
async function uploadFiles(files) {
  const epoch = sessionEpoch,
    owner = user.id;
  const d = state.draft;
  if (d?.kind !== "note") return;
  capture();
  if (d.images.length >= 4)
    throw new Error("Можно добавить до четырёх изображений.");
  for (const file of [...files].slice(0, 4 - d.images.length)) {
    const blob = await compress(file);
    assertSession(epoch);
    const path = await uploadReference(owner, blob);
    assertSession(epoch);
    const url = await signedReference(path);
    assertSession(epoch);
    images.set(path, url);
    d.images.push(path);
    rememberDraft();
  }
  renderInspector();
  toast("Картинки загружены. Сохрани заметку, чтобы прикрепить их.");
}
async function exportArchive() {
  const epoch = sessionEpoch;
  const fresh = await loadArchive();
  assertSession(epoch);
  // Embed private images so the downloaded backup remains usable after signed URLs expire.
  const notes = [];
  for (const note of fresh.notes) {
    const embedded = [];
    for (const path of note.images) {
      assertSession(epoch);
      const { data, error } = await cloud.storage
        .from("references")
        .download(path);
      if (error) throw error;
      embedded.push(
        await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(data);
        }),
      );
    }
    notes.push({ ...note, images: embedded });
  }
  assertSession(epoch);
  const blob = new Blob(
    [
      JSON.stringify(
        {
          format: "chirachirara-v1",
          exported_at: new Date().toISOString(),
          projects: fresh.projects,
          notes,
        },
        null,
        2,
      ),
    ],
    { type: "application/json" },
  );
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = "chirachirara-archive.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast("Архив скачан вместе с референсами");
}
async function importLegacy(file) {
  if (!file) return;
  if (file.size > 60 * 1024 * 1024)
    throw new Error("Архив слишком большой. Максимум 60 МБ.");
  const epoch = sessionEpoch,
    owner = user.id;
  const { data, modern } = validateArchive(JSON.parse(await file.text()));
  assertSession(epoch);
  if (
    !confirm(
      `Добавить ${data.notes.length} заметок из архива? Существующие записи останутся. Повторный импорт создаёт копии.`,
    )
  )
    return;
  let imported = 0,
    projectsAdded = 0;
  try {
    const mapping = new Map();
    if (modern) {
      for (const p of data.projects) {
        assertSession(epoch);
        const saved = await insertRecord("projects", {
          title: p.title,
          summary: p.summary,
          manuscript: p.manuscript,
          publication_url: p.publication_url,
          owner_id: owner,
          ...(p.created_at
            ? {
                created_at: p.created_at,
                updated_at: p.updated_at || p.created_at,
              }
            : {}),
        });
        assertSession(epoch);
        mapping.set(p.id, saved.id);
        replaceRecord("projects", saved);
        projectsAdded++;
      }
    } else {
      archive.projects.forEach((p) => mapping.set(p.title, p.id));
      for (const title of [
        ...new Set([
          ...data.projects,
          ...data.notes.map((n) => n.project).filter(Boolean),
        ]),
      ]) {
        assertSession(epoch);
        if (!mapping.has(title)) {
          const p = await insertRecord("projects", { title, owner_id: owner });
          assertSession(epoch);
          mapping.set(title, p.id);
          replaceRecord("projects", p);
          projectsAdded++;
        }
      }
    }
    for (const n of data.notes) {
      assertSession(epoch);
      const paths = [];
      for (const src of n.images) {
        const response = await fetch(src),
          blob = await compress(await response.blob());
        assertSession(epoch);
        paths.push(await uploadReference(owner, blob));
        assertSession(epoch);
      }
      const fields = noteInput({
        ...n,
        images: paths,
        project_id: mapping.get(modern ? n.project_id : n.project) || null,
        tagsText: n.tags.join(","),
      });
      const record = await insertRecord("notes", {
        ...fields,
        owner_id: owner,
        ...(n.created_at
          ? {
              created_at: n.created_at,
              updated_at: n.updated_at || n.created_at,
            }
          : {}),
        comments: n.comments.map((c) => ({
          id: crypto.randomUUID(),
          text: c.text,
          at: c.at || new Date().toISOString(),
        })),
        favorite: Boolean(n.favorite),
        deleted_at: modern ? n.deleted_at || null : null,
      });
      assertSession(epoch);
      replaceRecord("notes", record);
      imported++;
    }
    await hydrateImages();
    render();
    toast(`Импортировано заметок: ${imported}`);
  } catch (error) {
    render();
    throw new Error(
      `Импорт остановился. Добавлено проектов: ${projectsAdded}, заметок: ${imported}. Уже добавленные записи сохранены; повторный импорт создаст копии. ${error.message}`,
    );
  }
}
async function run(operation) {
  if (busy) return;
  busy = true;
  document.body.classList.add("busy");
  document.querySelector("#root")?.setAttribute("inert", "");
  try {
    await operation();
  } catch (error) {
    toast(error.message || "Не удалось связаться с базой. Попробуй ещё раз.");
  } finally {
    busy = false;
    document.body.classList.remove("busy");
    root.removeAttribute("inert");
    if (pendingSignIn) {
      pendingSignIn = false;
      setTimeout(() => run(enterArchive), 0);
    }
    if (focusEditor) {
      focusEditor = false;
      document.querySelector("#editBody, #editTitle, #editManuscript")?.focus();
    }
  }
}
async function action(name) {
  switch (name) {
    case "downloadtext": {
      const project = projectOf(state.nav);
      if (!project) break;
      const blob = new Blob([project.manuscript], {
        type: "text/plain;charset=utf-8",
      });
      const url = URL.createObjectURL(blob),
        link = document.createElement("a");
      link.href = url;
      link.download = textFilename(project.title);
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast("Скачан сохранённый текст проекта");
      break;
    }
    case "new":
      newNote();
      break;
    case "edit":
      editNote();
      break;
    case "newproject":
      openDraft({
        kind: "project",
        id: null,
        title: "",
        summary: "",
        manuscript: "",
        publication_url: "",
      });
      break;
    case "editproject":
      editProject("project");
      break;
    case "manuscript":
      editProject("manuscript");
      break;
    case "save":
      await save();
      break;
    case "savecopy": {
      capture();
      const original = state.draft;
      if (!original) break;
      rememberDraft({ readForm: false });
      const copy =
        original.kind === "manuscript"
          ? {
              kind: "note",
              id: null,
              title: `Текст: ${original.title} (копия)`.slice(0, 150),
              body: original.manuscript,
              project_id: original.id,
              tagsText: "",
              images: [],
              links: [],
            }
          : {
              ...original,
              id: null,
              create_id: undefined,
              title: (original.title + " (копия)").slice(0, 150),
            };
      state.draft = createDraft(copy);
      renderInspector();
      rememberDraft({ readForm: false });
      await save();
      // Keep the original draft if saving the copy failed.
      clearDraft(original);
      break;
    }
    case "close":
      if (leaveEditor()) {
        state.recovering = false;
        state.open = false;
        state.selected = null;
        render();
      }
      break;
    case "discard":
      if (
        confirm("Отменить эти правки? Сохранённая в базе версия останется.")
      ) {
        clearDraft();
        state.draft = null;
        if (!state.selected) state.open = false;
        render();
      }
      break;
    case "resume": {
      if (!leaveEditor()) break;
      recoveryEntries = storedDrafts();
      if (!recoveryEntries.length) {
        toast("На этом устройстве нет черновиков");
        break;
      }
      state.recovering = true;
      state.open = true;
      render();
      break;
    }
    case "sort":
      state.sort =
        state.sort === "new"
          ? "alpha"
          : state.sort === "alpha"
            ? "favorite"
            : "new";
      render();
      break;
    case "cleartag":
      state.tag = null;
      render();
      break;
    case "addlink":
      capture();
      state.draft.links.push({ title: "", url: "" });
      rememberDraft();
      renderInspector();
      break;
    case "comment":
      await addComment();
      break;
    case "delete": {
      const n = noteOf(state.draft?.id || state.selected);
      if (
        n &&
        !n.deleted_at &&
        confirm("Переместить заметку в корзину? Её можно восстановить.")
      ) {
        const epoch = sessionEpoch;
        const saved = await updateRecord("notes", n, {
          deleted_at: new Date().toISOString(),
        });
        assertSession(epoch);
        replaceRecord("notes", saved);
        if (state.draft?.id === n.id) clearDraft();
        state.draft = null;
        state.selected = null;
        state.open = false;
        render();
        toast("Заметка в корзине");
      }
      break;
    }
    case "restore": {
      const n = noteOf(state.selected);
      if (n) {
        const epoch = sessionEpoch;
        await mutateNote(n, { deleted_at: null });
        assertSession(epoch);
        state.selected = null;
        state.open = false;
        render();
        toast("Заметка восстановлена");
      }
      break;
    }
    case "refresh":
      rememberDraft();
      await refresh();
      toast("Архив обновлён");
      break;
    case "export":
      await exportArchive();
      break;
    case "logout": {
      if (!leaveEditor()) return;
      const { error } = await cloud.auth.signOut();
      if (error) throw error;
      user = null;
      archive = { projects: [], notes: [] };
      images.clear();
      commentDrafts.clear();
      state = {
        nav: "all",
        selected: null,
        query: "",
        tag: null,
        sort: "new",
        draft: null,
        tab: "notes",
        open: false,
      };
      document.body.classList.remove("detail-open");
      authMode = "signin";
      authScreen();
      break;
    }
    case "authmode":
      authMode = authMode === "signup" ? "signin" : "signup";
      authScreen();
      break;
    case "forgot": {
      const email = document.querySelector("[name=email]")?.value.trim();
      if (!email) throw new Error("Сначала введи почту в поле выше.");
      const { error } = await cloud.auth.resetPasswordForEmail(email, {
        redirectTo: location.origin + location.pathname,
      });
      if (error) throw error;
      document.querySelector("#authMessage").textContent =
        "Если аккаунт существует, на почту придёт ссылка для смены пароля.";
      break;
    }
  }
}
root.addEventListener("click", (e) => {
  if (busy) return;
  const resume = e.target.closest("[data-resume-index]");
  if (resume) {
    const entry = recoveryEntries[Number(resume.dataset.resumeIndex)];
    if (!entry) return;
    state.draft = draftStore.restore(entry);
    state.recovering = false;
    state.open = true;
    render();
    rememberDraft({ readForm: false });
    run(async () => {
      await hydrateImages();
      renderInspector();
      focusEditor = true;
    });
    return;
  }
  const a = e.target.closest("[data-action]");
  if (a) {
    run(() => action(a.dataset.action));
    return;
  }
  const nav = e.target.closest("[data-nav]");
  if (nav) {
    if (!leaveEditor()) return;
    state.recovering = false;
    state.nav = nav.dataset.nav;
    state.tag = null;
    state.query = "";
    state.selected = null;
    state.tab = "notes";
    state.open = false;
    render();
    return;
  }
  const tab = e.target.closest("[data-tab]");
  if (tab) {
    if (!leaveEditor()) return;
    state.recovering = false;
    state.tab = tab.dataset.tab;
    state.tag = null;
    state.query = "";
    state.selected = null;
    state.open = false;
    render();
    return;
  }
  const projectJump = e.target.closest("[data-project-jump]");
  if (projectJump) {
    if (!leaveEditor()) return;
    state.nav = projectJump.dataset.projectJump;
    state.tag = null;
    state.query = "";
    state.tab = "notes";
    state.selected = null;
    state.open = false;
    state.recovering = false;
    render();
    return;
  }
  const fav = e.target.closest("[data-favorite]");
  if (fav) {
    const n = noteOf(fav.dataset.favorite);
    run(() => mutateNote(n, { favorite: !n.favorite }));
    return;
  }
  const tag = e.target.closest("[data-tag]");
  if (tag) {
    state.tag = state.tag === tag.dataset.tag ? null : tag.dataset.tag;
    render();
    return;
  }
  const rmimg = e.target.closest("[data-rmimage]");
  if (rmimg) {
    capture();
    state.draft.images.splice(Number(rmimg.dataset.rmimage), 1);
    rememberDraft();
    renderInspector();
    return;
  }
  const rmlink = e.target.closest("[data-rmlink]");
  if (rmlink) {
    capture();
    state.draft.links.splice(Number(rmlink.dataset.rmlink), 1);
    rememberDraft();
    renderInspector();
    return;
  }
  const n = e.target.closest("[data-note]");
  if (n) {
    if (!leaveEditor()) return;
    state.recovering = false;
    state.selected = n.dataset.note;
    state.open = true;
    render();
  }
});
root.addEventListener("input", (e) => {
  if (e.target.id === "commentInput") {
    commentDrafts.set(state.selected, e.target.value);
    return;
  }
  if (e.target.id === "search") {
    state.query = e.target.value;
    renderBoard();
    return;
  }
  if (state.draft && e.target.closest("#inspector")) {
    rememberDraft();
    if (["editBody", "editManuscript"].includes(e.target.id)) {
      const stats = document.querySelector("#textStats");
      if (stats) stats.textContent = statsLabel(e.target.value);
    }
  }
});
root.addEventListener("change", (e) => {
  if (e.target.id === "editNoteType") {
    capture();
    rememberDraft({ readForm: false });
    renderInspector();
    document.querySelector("#editNoteType")?.focus();
  }
  if (e.target.id === "uploadImage") run(() => uploadFiles(e.target.files));
  if (["importFile", "mobileImportFile"].includes(e.target.id))
    run(() => importLegacy(e.target.files[0]));
  if (e.target.id === "mobileNav") {
    const value = e.target.value;
    if (!leaveEditor()) {
      e.target.value = state.nav;
      return;
    }
    state.recovering = false;
    state.nav = value;
    state.tag = null;
    state.query = "";
    state.selected = null;
    state.tab = "notes";
    state.open = false;
    render();
  }
});
root.addEventListener("submit", (e) => {
  if (e.target.id !== "authForm") return;
  e.preventDefault();
  const values = new FormData(e.target),
    email = values.get("email"),
    password = values.get("password");
  run(async () => {
    const el = document.querySelector("#authMessage");
    el.textContent = "Подключаемся…";
    try {
      if (authMode === "reset") {
        const { error } = await cloud.auth.updateUser({ password });
        if (error) throw error;
        authMode = "signin";
        await enterArchive();
        return;
      }
      const result =
        authMode === "signup"
          ? await cloud.auth.signUp({
              email,
              password,
              options: { emailRedirectTo: location.origin + location.pathname },
            })
          : await cloud.auth.signInWithPassword({ email, password });
      if (result.error) throw result.error;
      if (result.data.session) {
        await enterArchive();
      } else
        el.textContent =
          "Проверь почту: нужно подтвердить регистрацию, затем войти.";
    } catch (error) {
      el.textContent = error.message;
    }
  });
});
document.addEventListener("keydown", (e) => {
  if (busy) return;
  if (e.key === "Escape" && state.open) action("close");
  if ((e.ctrlKey || e.metaKey) && e.key === "s" && state.draft) {
    e.preventDefault();
    run(save);
  }
  if (
    (e.key === "Enter" || e.key === " ") &&
    e.target.matches("article[data-note]")
  ) {
    e.preventDefault();
    e.target.click();
  }
});
window.addEventListener("beforeunload", (e) => {
  if (state.draft) {
    rememberDraft();
    e.preventDefault();
    e.returnValue = "";
  }
});
window.addEventListener("pagehide", () => rememberDraft());
async function enterArchive() {
  const epoch = sessionEpoch;
  const { data, error } = await cloud.auth.getUser();
  if (epoch !== sessionEpoch) return;
  if (error) throw error;
  user = data.user;
  if (!user) {
    authScreen();
    return;
  }
  root.innerHTML =
    '<main class="auth-shell"><p role="status">Открываем твой архив…</p></main>';
  try {
    await refresh();
    if (storedDrafts().length)
      toast(
        "Есть незавершённый черновик на этом устройстве — его можно продолжить.",
      );
  } catch (error) {
    if (epoch !== sessionEpoch) return;
    root.innerHTML = `<main class="auth-shell"><section class="auth-card"><h1>Не удалось открыть архив</h1><p role="alert">${esc(error.message)}</p><p>Проверь подключение и настройку таблиц Supabase.</p><button class="primary" data-action="refresh">Попробовать снова</button><button class="auth-link" data-action="logout">Выйти</button></section></main>`;
  }
}
async function boot() {
  if (!configured) {
    setupScreen();
    return;
  }
  cloud.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_IN" && booted && session?.user.id !== user?.id) {
      rememberDraft();
      sessionEpoch++;
      user = null;
      archive = { projects: [], notes: [] };
      images.clear();
      commentDrafts.clear();
      state = {
        nav: "all",
        selected: null,
        query: "",
        tag: null,
        sort: "new",
        draft: null,
        tab: "notes",
        open: false,
      };
      document.body.classList.remove("detail-open");
      authScreen();
      if (busy) pendingSignIn = true;
      else setTimeout(() => run(enterArchive), 0);
    }
    if (event === "PASSWORD_RECOVERY") {
      authMode = "reset";
      authScreen();
    }
    if (event === "SIGNED_OUT") {
      pendingSignIn = false;
      rememberDraft();
      sessionEpoch++;
      user = null;
      archive = { projects: [], notes: [] };
      images.clear();
      commentDrafts.clear();
      state = {
        nav: "all",
        selected: null,
        query: "",
        tag: null,
        sort: "new",
        draft: null,
        tab: "notes",
        open: false,
      };
      authMode = "signin";
      document.body.classList.remove("detail-open");
      authScreen();
    }
  });
  const recovery = location.hash.includes("type=recovery");
  const { data, error } = await cloud.auth.getSession();
  if (error) throw error;
  if (recovery || authMode === "reset") {
    authMode = "reset";
    authScreen();
    return;
  }
  if (data.session) await enterArchive();
  else authScreen();
  booted = true;
}
boot().catch((error) => {
  authScreen(error.message);
});
// Refresh private reference URLs before their one-hour expiry; do not replace active form inputs.
setInterval(
  () => {
    if (user && !busy)
      run(async () => {
        await hydrateImages();
        if (!state.draft) render();
      });
  },
  45 * 60 * 1000,
);
