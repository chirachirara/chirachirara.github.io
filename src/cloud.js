import { createClient } from "@supabase/supabase-js";
import { createRepository } from "./repository.js";
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const configured = Boolean(
  url && key && !url.includes("YOUR_PROJECT") && !key.includes("YOUR_"),
);
export const cloud = configured ? createClient(url, key) : null;

function checked(result) {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}
export const { loadArchive, insertRecord, updateRecord } =
  createRepository(cloud);
export async function uploadReference(userId, file) {
  const path = `${userId}/${crypto.randomUUID()}.jpg`;
  checked(
    await cloud.storage
      .from("references")
      .upload(path, file, { contentType: "image/jpeg" }),
  );
  return path;
}
export async function signedReference(path) {
  const data = checked(
    await cloud.storage.from("references").createSignedUrl(path, 3600),
  );
  return data.signedUrl;
}
