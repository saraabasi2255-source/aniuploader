// GET /api/tick?id=<pending_deletes.id>&key=WEBHOOK_SECRET
// تایمر حذفِ یک فایل. فوراً جواب می‌ده و تو پس‌زمینه (waitUntil) تا موعد صبر می‌کنه.
// چون waitUntil حدود ۳۰ ثانیه بیشتر وقت نداره، صبر رو تکه‌تکه (حداکثر ۲۰ ثانیه) انجام می‌ده
// و برای ادامه خودش رو دوباره صدا می‌زنه؛ پس هر DELETE_AFTER دلخواهی درست کار می‌کنه.

import { isAuthorized, json } from "../_lib/auth.js";
import { runCleanup } from "../_lib/cleanup.js";
import { sleep } from "../_lib/tg.js";

const HOP_MS = 20000;

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!isAuthorized(request, env)) return new Response("forbidden", { status: 403 });

  const url = new URL(request.url);
  const id = Number(url.searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) return json({ ok: false, error: "invalid id" }, 400);

  const row = await env.DB.prepare("SELECT at FROM pending_deletes WHERE id = ?1").bind(id).first();
  if (!row) return json({ ok: true, gone: true }); // قبلاً پاک شده

  const dueMs = Number(row.at) * 1000;

  context.waitUntil(
    (async () => {
      try {
        const wait = dueMs - Date.now();
        if (wait > 0) await sleep(Math.min(wait, HOP_MS));

        if (Date.now() >= dueMs - 100) {
          await runCleanup(env, 1, id);
        } else {
          // هنوز وقت نشده ⇒ تکه‌ی بعدی تایمر
          await fetch(`${url.origin}/api/tick?id=${id}&key=${encodeURIComponent(env.WEBHOOK_SECRET)}`, {
            signal: AbortSignal.timeout(8000),
          });
        }
      } catch (e) {
        console.error("tick error:", e);
      }
    })()
  );

  return json({ ok: true, in: Math.max(0, dueMs - Date.now()) });
}
