import test from "node:test";
import assert from "node:assert/strict";
import { feedbackInput, sendFeedback } from "../src/feedback.js";
test("feedback rejects empty reports, unsupported types and overlong messages", () => {
  assert.deepEqual(feedbackInput("idea", "  Хочу список фандомов  "), {
    kind: "idea",
    message: "Хочу список фандомов",
  });
  for (const [kind, text] of [
    ["problem", " "],
    ["other", "Подробное сообщение"],
    ["idea", "x".repeat(5001)],
  ])
    assert.throws(() => feedbackInput(kind, text));
});
test("a retry after a lost insert response succeeds only for the same report", async () => {
  const record = {
    id: "same-id",
    owner_id: "alice",
    kind: "problem",
    message: "Кнопка не работает",
  };
  let existing = { ...record };
  const client = {
    from: () => ({
      insert: async () => ({ error: { code: "23505" } }),
      select: () => ({
        eq: () => ({ single: async () => ({ data: existing }) }),
      }),
    }),
  };
  await sendFeedback(client, record);
  existing = { ...record, owner_id: "bob" };
  await assert.rejects(sendFeedback(client, record), /Текст остался/);
});
test("a failed send preserves a useful retry message instead of claiming success", async () => {
  const client = {
    from: () => ({ insert: async () => ({ error: { code: "NETWORK" } }) }),
  };
  await assert.rejects(
    sendFeedback(client, { id: "a" }),
    /Не удалось отправить/,
  );
});
