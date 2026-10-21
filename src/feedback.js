import { escapeHTML } from "./model.js";

export function feedbackInput(kind, message) {
  if (!["problem", "idea"].includes(kind))
    throw new Error("Выбери тип обращения.");
  const text = message.trim();
  if ([...text].length < 10)
    throw new Error("Добавь немного подробностей — хотя бы 10 знаков.");
  if ([...text].length > 5000)
    throw new Error("Сообщение должно быть не длиннее 5000 знаков.");
  return { kind, message: text };
}

export async function sendFeedback(client, record) {
  const { error } = await client.from("feedback").insert(record);
  if (!error) return;
  // A response can be lost after a successful insert. Retry the same UUID.
  if (error.code === "23505") {
    const existing = await client
      .from("feedback")
      .select("id,owner_id,kind,message")
      .eq("id", record.id)
      .single();
    if (
      !existing.error &&
      ["id", "owner_id", "kind", "message"].every(
        (key) => existing.data?.[key] === record[key],
      )
    )
      return;
  }
  throw new Error(
    "Не удалось отправить сообщение. Текст остался в форме — попробуй ещё раз.",
  );
}

export function setupFeedback(root, client, currentUser) {
  if (!client) return;
  let dialog,
    form,
    status,
    submit,
    pending = false,
    owner = null,
    attempt = null;
  function close() {
    dialog?.close();
  }
  function reset() {
    close();
    dialog?.remove();
    dialog = null;
    owner = null;
    attempt = null;
  }
  client.auth.onAuthStateChange((event, session) => {
    if (
      event === "SIGNED_OUT" ||
      (owner && session?.user?.id && session.user.id !== owner)
    )
      reset();
  });
  root.addEventListener("click", (event) => {
    if (!event.target.closest("[data-feedback]")) return;
    const user = currentUser();
    if (!user) return;
    if (owner !== user.id) reset();
    owner = user.id;
    if (!dialog) {
      dialog = document.createElement("dialog");
      dialog.className = "feedback-dialog";
      dialog.setAttribute("aria-labelledby", "feedbackTitle");
      dialog.innerHTML = `<div class="feedback-header"><h2 id="feedbackTitle">Проблема или идея?</h2><button type="button" class="icon-btn" id="feedbackClose" aria-label="Закрыть форму обратной связи">×</button></div><p class="hint">Сообщение попадёт автору приложения. Твои заметки и тексты не прикрепляются.</p><form id="feedbackForm"><label class="field"><span>Что хочешь сообщить?</span><select name="kind"><option value="problem">Сообщить о проблеме</option><option value="idea">Предложить идею</option></select></label><label class="field"><span>Сообщение</span><textarea name="message" required minlength="10" maxlength="5000" rows="7" placeholder="Что произошло и чего ты ожидала? Или какой возможности не хватает?"></textarea></label><p class="hint">От 10 до 5000 знаков. Можно описать шаги, на которых возникла проблема.</p><p id="feedbackStatus" role="status" class="feedback-status"></p><button type="submit" class="primary">Отправить</button></form>`;
      document.body.append(dialog);
      form = dialog.querySelector("form");
      status = dialog.querySelector("#feedbackStatus");
      submit = form.querySelector("[type=submit]");
      dialog.querySelector("#feedbackClose").addEventListener("click", close);
      form.addEventListener("input", () => {
        if (!pending) status.textContent = "";
      });
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        if (pending) return;
        const thisDialog = dialog,
          thisOwner = owner,
          thisForm = form,
          thisStatus = status,
          thisSubmit = submit;
        try {
          if (currentUser()?.id !== thisOwner)
            throw new Error("Войди в свой аккаунт заново.");
          const fields = feedbackInput(
            thisForm.elements.kind.value,
            thisForm.elements.message.value,
          );
          const signature = JSON.stringify(fields);
          if (!attempt || attempt.signature !== signature)
            attempt = { id: crypto.randomUUID(), signature };
          const record = { id: attempt.id, owner_id: thisOwner, ...fields };
          pending = true;
          thisSubmit.disabled = true;
          for (const field of thisForm.querySelectorAll(
            "input,textarea,select",
          ))
            field.disabled = true;
          thisStatus.textContent = "Отправляем…";
          await sendFeedback(client, record);
          if (dialog !== thisDialog || currentUser()?.id !== thisOwner) return;
          attempt = null;
          thisForm.reset();
          thisStatus.innerHTML = `<strong>Спасибо! Сообщение отправлено.</strong><br><span class="hint">Номер: ${escapeHTML(record.id.slice(0, 8))}</span>`;
        } catch (error) {
          if (dialog === thisDialog) thisStatus.textContent = error.message;
        } finally {
          pending = false;
          thisSubmit.disabled = false;
          for (const field of thisForm.querySelectorAll(
            "input,textarea,select",
          ))
            field.disabled = false;
        }
      });
    }
    if (!dialog.open) dialog.showModal();
  });
}
