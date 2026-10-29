// پاک‌کردن فایل‌های ارسال‌شده به کاربر بعد از DELETE_AFTER ثانیه.
// سه مسیر برای اجرا داره:
//  1) مستقیم از خود webhook، همون لحظه‌ای که زمان حذف می‌رسه (runCleanup با onlyId) ← مسیر اصلی
//  2) cron بیرونی (/api/cron/cleanup) ← پشتیبان
//  3) فرصت‌طلبانه روی هر آپدیت وبهوک ← پشتیبان

import { tg, sleep } from "./tg.js";

// حذف گروهی با یک بار تلاش مجدد روی 429
async function deleteBatch(env, chatId, ids) {
  let r = await tg(env, "deleteMessages", { chat_id: chatId, message_ids: ids });
  if (!r.ok && r.error_code === 429) {
    const wait = Math.min((r.parameters?.retry_after || 1) * 1000, 5000);
    await sleep(wait);
    r = await tg(env, "deleteMessages", { chat_id: chatId, message_ids: ids });
  }
  return r;
}

export async function runCleanup(env, limit = 20, onlyId = null) {
  const now = Math.floor(Date.now() / 1000);

  // ردیف‌ها رو اتمیک «برمی‌داریم» (DELETE ... RETURNING) تا اگه cron و وبهوک
  // همزمان اجرا شدن، یک ردیف دوبار پردازش نشه
  const stmt = onlyId
    ? env.DB.prepare(`DELETE FROM pending_deletes WHERE id = ?1 RETURNING *`).bind(onlyId)
    : env.DB.prepare(
        `DELETE FROM pending_deletes
          WHERE id IN (SELECT id FROM pending_deletes WHERE at <= ?1 ORDER BY at LIMIT ?2)
          RETURNING *`
      ).bind(now, limit);

  const { results } = await stmt.all();

  let deleted = 0;
  let retried = 0;

  for (const d of results || []) {
    let ids = [];
    try { ids = JSON.parse(d.ids); } catch { /* ignore */ }
    ids = (Array.isArray(ids) ? ids : []).filter((n) => Number.isInteger(n));

    let rateLimited = false;

    if (ids.length) {
      const r = await deleteBatch(env, d.chat_id, ids);
      if (!r.ok && r.error_code === 429) {
        rateLimited = true;
      } else if (!r.ok) {
        // اگه حذف گروهی خطا داد، تک‌تک امتحان کن
        for (const id of ids) {
          let one = await tg(env, "deleteMessage", { chat_id: d.chat_id, message_id: id });
          if (!one.ok && one.error_code === 429) {
            await sleep(Math.min((one.parameters?.retry_after || 1) * 1000, 5000));
            one = await tg(env, "deleteMessage", { chat_id: d.chat_id, message_id: id });
          }
          if (!one.ok && one.error_code === 429) { rateLimited = true; break; }
        }
      }
    }

    if (rateLimited) {
      // محدودیت نرخ تلگرام: ردیف رو برای یه دقیقه‌ی بعد برگردون (cron برمی‌داره)
      await env.DB.prepare(
        "INSERT INTO pending_deletes (chat_id, ids, warn_id, at) VALUES (?1, ?2, ?3, ?4)"
      ).bind(d.chat_id, d.ids, d.warn_id, now + 60).run();
      retried++;
      continue;
    }

    if (d.warn_id) {
      await tg(env, "editMessageText", {
        chat_id: d.chat_id,
        message_id: d.warn_id,
        text: "🗑 فایل حذف شد. برای دریافت دوباره از لینک چنل استفاده کن.",
      });
    }
    deleted++;
  }

  return { deleted, retried };
}
