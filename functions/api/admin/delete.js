// POST /api/admin/delete
// body: { id } یا { ids: [..] }
// فقط از دیتابیس حذف می‌کنه، پیام چنل دست‌نخورده می‌مونه (آلبوم‌ها کامل حذف می‌شن)

import { json } from "../../_lib/auth.js";

const CHUNK = 50; // سقف پارامترهای D1 برای هر کوئری ۱۰۰ تاست

function chunks(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: "bad request" }, 400); }

  const raw = Array.isArray(body?.ids) ? body.ids : [body?.id];
  const ids = [...new Set(raw.map(Number))].filter((n) => Number.isInteger(n) && n > 0);
  if (!ids.length) return json({ ok: false, error: "invalid id" }, 400);
  if (ids.length > 1000) return json({ ok: false, error: "too many ids" }, 400);

  try {
    // آیدی‌ها → گروه‌ها
    const groupIds = new Set();
    for (const part of chunks(ids, CHUNK)) {
      const ph = part.map((_, i) => `?${i + 1}`).join(",");
      const { results } = await env.DB.prepare(
        `SELECT group_id FROM posts WHERE id IN (${ph}) AND group_id IS NOT NULL`
      ).bind(...part).all();
      results.forEach((r) => groupIds.add(r.group_id));
    }

    const stmts = [];
    for (const part of chunks(ids, CHUNK)) {
      const ph = part.map((_, i) => `?${i + 1}`).join(",");
      stmts.push(env.DB.prepare(`DELETE FROM posts WHERE id IN (${ph})`).bind(...part));
    }
    for (const part of chunks([...groupIds], CHUNK)) {
      const ph = part.map((_, i) => `?${i + 1}`).join(",");
      stmts.push(env.DB.prepare(`DELETE FROM posts WHERE group_id IN (${ph})`).bind(...part));
    }

    const res = await env.DB.batch(stmts);
    const changes = res.reduce((s, r) => s + (r.meta?.changes || 0), 0);
    if (!changes) return json({ ok: false, error: "not found" }, 404);
    return json({ ok: true, changes });
  } catch (e) {
    console.error("delete error:", e);
    return json({ ok: false, error: String(e) }, 500);
  }
}
