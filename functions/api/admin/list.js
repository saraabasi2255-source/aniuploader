// GET /api/admin/list

import { json } from "../../_lib/auth.js";
import { parseFileName } from "../../_lib/parse.js";

export async function onRequestGet({ env }) {
  try {
    const { results } = await env.DB.prepare(
      `SELECT MIN(id) AS id, MIN(message_id) AS message_id, MAX(chat_id) AS chat_id,
              MAX(type) AS type, MAX(caption) AS caption, COUNT(*) AS files, MAX(created_at) AS created_at
       FROM posts GROUP BY COALESCE(group_id, id) ORDER BY MIN(id) DESC`
    ).all();

    const bot = String(env.BOT_USERNAME || "").replace(/^@/, "");
    const channelUsername = String(env.CHANNEL_USERNAME || "").replace(/^@/, "");

    return json(
      results.map((r) => {
        const info = parseFileName(r.caption);

        // فایل بدون پسوند ولی از نوع ویدیو/انیمیشن ⇒ ویدیو حساب کن
        let category = info.category;
        if (category === "other" && !info.ext && (r.type === "video" || r.type === "animation")) {
          category = "video";
        }

        const chan = String(r.chat_id).replace(/^-100/, "");
        return {
          id: r.id,
          name: info.name,          // نام انیمه (بدون قسمت/کیفیت)
          title: info.title,        // نام کامل فایل بدون پسوند
          caption: info.rawName || "بدون نام",
          ext: info.ext,
          category,
          ep: info.ep,
          season: info.season,
          type: r.type,
          files: r.files,
          date: r.created_at,
          archive_link: channelUsername
            ? `https://t.me/${channelUsername}/${r.message_id}`
            : `https://t.me/c/${chan}/${r.message_id}`,
          bot_link: bot ? `https://t.me/${bot}?start=p_${r.id}` : "",
        };
      })
    );
  } catch (e) {
    console.error("list error:", e);
    return json({ error: String(e) }, 500);
  }
}
