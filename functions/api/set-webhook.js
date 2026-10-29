// GET /api/set-webhook?key=WEBHOOK_SECRET
// این فایل فقط یه بار برای وصل کردن وبهوک لازمه. بعد از اینکه جواب گرفتی
// و مطمئن شدی وبهوک وصل شده، بهتره این فایل رو حذف کنی (یا حداقل غیرفعالش کنی)
// چون هر کسی که آدرسش رو بدونه می‌تونه وبهوک بات رو دوباره ست کنه.

import { isAuthorized } from "../_lib/auth.js";

export async function onRequestGet({ request, env }) {
  if (!isAuthorized(request, env)) {
    return new Response("forbidden", { status: 403 });
  }

  if (!env.BOT_TOKEN) {
    return new Response("BOT_TOKEN تنظیم نشده", { status: 500 });
  }

  const url = new URL(request.url);
  const webhookUrl = `${url.origin}/webhook`;

  const res = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: webhookUrl,
      secret_token: env.WEBHOOK_SECRET,
      // callback_query: برای دکمه‌ی «بررسی مجدد» عضویت
      allowed_updates: ["message", "channel_post", "edited_channel_post", "callback_query"],
    }),
  });

  return new Response(JSON.stringify({ webhookUrl, telegram: await res.json() }, null, 2), {
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
