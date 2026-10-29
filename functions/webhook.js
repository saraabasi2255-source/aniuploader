// POST /webhook — آدرسی که به تلگرام معرفی میشه

import { tg, sendMessage, answerCallbackQuery, deleteMessage, editMessageText, sleep } from "./_lib/tg.js";
import { runCleanup } from "./_lib/cleanup.js";

// آدرس خود سایت؛ برای شروع تایمر حذف (/api/tick)
let ORIGIN = "";

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.WEBHOOK_SECRET || request.headers.get("X-Telegram-Bot-Api-Secret-Token") !== env.WEBHOOK_SECRET) {
    return new Response("forbidden", { status: 403 });
  }

  let update;
  try { update = await request.json(); } catch { return new Response("bad request", { status: 400 }); }

  ORIGIN = new URL(request.url).origin;

  const task = (async () => {
    try {
      const post = update.channel_post || update.edited_channel_post;
      if (post) {
        await handleChannelPost(post, env);
      } else if (update.message) {
        await handleMessage(update.message, env);
      } else if (update.callback_query) {
        await handleCallbackQuery(update.callback_query, env);
      }
    } catch (e) {
      console.error("webhook error:", e);
    }

    if (update.message || update.callback_query) {
      try { await runCleanup(env, 10); } catch (e) { console.error("cleanup error:", e); }
    }
  })();

  // فوراً جواب می‌دیم تا تلگرام آپدیت بعدی (لینک بعدی) رو بدون معطلی بفرسته.
  // تایمر حذف هر فایل تو درخواست‌های جداگانه‌ی /api/tick اجرا می‌شه (پایین رو ببین).
  context.waitUntil(task);
  return new Response("ok");
}

// ── ذخیره‌ی خودکار پست‌های چنل آرشیو ─────────────────────────
async function handleChannelPost(msg, env) {
  if (String(msg.chat.id) !== String(env.ARCHIVE_CHAT_ID)) {
    console.log("channel id:", msg.chat.id);
    return;
  }

  let fileName = null;
  let type = null;

  if (msg.video) {
    type = "video";
    fileName = msg.video.file_name || null;
  } else if (msg.document) {
    type = "document";
    fileName = msg.document.file_name || null;
  } else if (msg.animation) {
    type = "animation";
    fileName = msg.animation.file_name || null;
  }

  if (!type) return;

  const caption = fileName || msg.caption || null;

  await env.DB.prepare(
    `INSERT INTO posts (chat_id, message_id, group_id, type, caption)
     VALUES (?1, ?2, ?3, ?4, ?5)
     ON CONFLICT(message_id) DO UPDATE SET
       chat_id = excluded.chat_id,
       type = excluded.type,
       caption = COALESCE(excluded.caption, posts.caption),
       group_id = COALESCE(excluded.group_id, posts.group_id)`
  ).bind(msg.chat.id, msg.message_id, msg.media_group_id || null, type, caption).run();
}

// ── پیام‌های کاربر ───────────────────────────────────────────
async function handleMessage(msg, env) {
  if (msg.chat.type !== "private") return;
  if (!msg.from || msg.from.is_bot) return;

  const text = (msg.text || "").trim();
  if (!text) return;

  const chatId = msg.chat.id;
  const userId = msg.from.id;

  const m = text.match(/^\/start(?:@\w+)?(?:\s+(\S+))?/);
  const payload = m && m[1] ? m[1] : "";
  const postId = /^p_\d+$/.test(payload) ? Number(payload.slice(2)) : null;

  // ── جوین اجباری ──
  if (!(await isMember(env, userId))) {
    const existing = await getJoinPrompt(env, userId);

    if (existing && existing.message_id) {
      // پیام عضویت قبلاً فرستاده شده ⇒ فقط ویرایشش کن (پیام جدید نده)
      await editJoinPrompt(env, chatId, existing.message_id, postId, userId);
      return;
    }

    // بار اول — پیام عضویت بفرست
    await sendJoinPrompt(env, chatId, postId, userId);
    return;
  }

  // ── عضوه ──
  await clearJoinPrompt(env, chatId, userId);

  if (m) {
    if (postId) {
      await deliverPost(env, chatId, postId);
    } else {
      await sendMessage(
        env,
        chatId,
        'خوش اومدی🎉\n\n' +
        'برای دریافت انیمه یا زیرنویس از لینک‌های داخل چنل استفاده کن❗️\n\n' +
        '📢 کانال ما: <a href="https://t.me/NivaroSub">@NivaroSub</a>',
        undefined,
        "HTML"
      );
    }
    return;
  }

  await sendMessage(env, chatId, "برای دریافت انیمه یا زیرنویس از لینک‌های داخل چنل استفاده کن❗️");
}

// ── دکمه‌های اینلاین ─────────────────────────────────────────
async function handleCallbackQuery(cq, env) {
  const chatId = cq.message?.chat?.id;
  const messageId = cq.message?.message_id;
  const userId = cq.from?.id;
  const data = cq.data || "";

  if (!chatId || !userId) {
    await answerCallbackQuery(env, cq.id);
    return;
  }

  if (data === "check_join" || data.startsWith("check_join:")) {
    if (await isMember(env, userId)) {
      // عضوه ✅
      await answerCallbackQuery(env, cq.id, "عضویت تایید شد ✅");
      if (messageId) await deleteMessage(env, chatId, messageId);
      await clearJoinPrompt(env, chatId, userId);

      const payload = data.slice("check_join:".length);
      if (data.startsWith("check_join:") && /^p_\d+$/.test(payload)) {
        await deliverPost(env, chatId, Number(payload.slice(2)));
      } else {
        await sendMessage(
          env,
          chatId,
          'خوش اومدی🎉\n\n' +
          'برای دریافت انیمه یا زیرنویس از لینک‌های داخل چنل استفاده کن❗️\n\n' +
          '📢 کانال ما: <a href="https://t.me/NivaroSub">@NivaroSub</a>',
          undefined,
          "HTML"
        );
      }
    } else {
      // هنوز عضو نشده ⇒ فقط پاپ‌آپ
      await answerCallbackQuery(env, cq.id, "هنوز عضو چنل نشدی 🙁");
    }
    return;
  }

  await answerCallbackQuery(env, cq.id);
}

// ── مدیریت پیام عضویت ────────────────────────────────────────
async function getJoinPrompt(env, userId) {
  try {
    return await env.DB.prepare(
      "SELECT message_id FROM join_prompts WHERE user_id = ?1"
    ).bind(userId).first();
  } catch (e) {
    console.error("getJoinPrompt error:", e);
    return null;
  }
}

function joinPromptMarkup(env, postId) {
  const cfg = getJoinConfig(env);
  const row = [];
  if (cfg?.url) row.push({ text: "📢 عضویت در چنل", url: cfg.url });
  row.push({
    text: "✅ بررسی مجدد",
    callback_data: postId ? `check_join:p_${postId}` : "check_join",
  });
  return { inline_keyboard: [row] };
}

async function sendJoinPrompt(env, chatId, postId, userId) {
  const res = await sendMessage(
    env,
    chatId,
    "برای استفاده از بات، اول باید عضو چنل ما بشی 👇",
    joinPromptMarkup(env, postId)
  );

  const mid = res?.result?.message_id;
  if (mid && userId) {
    try {
      await env.DB.prepare(
        `INSERT INTO join_prompts (user_id, message_id, sent_at) VALUES (?1, ?2, ?3)
         ON CONFLICT(user_id) DO UPDATE SET message_id = excluded.message_id, sent_at = excluded.sent_at`
      ).bind(userId, mid, Math.floor(Date.now() / 1000)).run();
    } catch (e) {
      console.error("save join prompt error:", e);
    }
  }
}

// پیام عضویت قبلی رو ویرایش می‌کنه (بدون فرستادن پیام جدید)
// این‌طوری پیام میاد آخر چت ولی چت شلوغ نمیشه
async function editJoinPrompt(env, chatId, messageId, postId, userId) {
  const res = await editMessageText(
    env,
    chatId,
    messageId,
    "برای استفاده از بات، اول باید عضو چنل ما بشی 👇",
    joinPromptMarkup(env, postId)
  );

  // اگه ویرایش خطا داد (مثلاً پیام قدیمی/پاک شده)، یه پیام جدید بفرست
  if (!res.ok) {
    await env.DB.prepare("DELETE FROM join_prompts WHERE user_id = ?1").bind(userId).run();
    await sendJoinPrompt(env, chatId, postId, userId);
  }
}

async function clearJoinPrompt(env, chatId, userId) {
  try {
    const row = await getJoinPrompt(env, userId);
    if (row?.message_id && chatId) {
      await deleteMessage(env, chatId, row.message_id);
    }
    await env.DB.prepare("DELETE FROM join_prompts WHERE user_id = ?1").bind(userId).run();
  } catch (e) {
    console.error("clearJoinPrompt error:", e);
  }
}

// ── ارسال فایل(ها) به کاربر ──────────────────────────────────
async function deliverPost(env, chatId, postId) {
  const row = await env.DB.prepare("SELECT * FROM posts WHERE id = ?1").bind(postId).first();
  if (!row) {
    await sendMessage(env, chatId, "این پست پیدا نشد یا از آرشیو حذف شده 🙁");
    return;
  }

  const rows = row.group_id
    ? (await env.DB.prepare("SELECT id, message_id FROM posts WHERE group_id = ?1 ORDER BY message_id")
        .bind(row.group_id).all()).results
    : [row];

  const sent = [];
  let dead = 0;
  for (const r of rows) {
    let res = await tg(env, "copyMessage", {
      chat_id: chatId,
      from_chat_id: row.chat_id,
      message_id: r.message_id,
    });

    if (!res.ok && res.error_code === 429) {
      await sleep(Math.min((res.parameters?.retry_after || 1) * 1000, 5000));
      res = await tg(env, "copyMessage", {
        chat_id: chatId,
        from_chat_id: row.chat_id,
        message_id: r.message_id,
      });
    }

    if (res.ok) {
      sent.push(res.result.message_id);
      continue;
    }

    const desc = (res.description || "").toLowerCase();
    if (
      desc.includes("message to copy not found") ||
      desc.includes("message not found") ||
      desc.includes("message_id_invalid")
    ) {
      dead++;
      if (r.id) await env.DB.prepare("DELETE FROM posts WHERE id = ?1").bind(r.id).run();
    } else {
      console.error("copyMessage failed:", res.description);
    }
  }

  if (!sent.length) {
    await sendMessage(
      env,
      chatId,
      dead
        ? "این فایل از چنل آرشیو حذف شده و دیگه در دسترس نیست 🗑"
        : "ارسال فایل ناموفق بود. بعداً دوباره امتحان کن."
    );
    return;
  }

  const delay = Math.max(5, Number(env.DELETE_AFTER) || 30);
  const dueMs = Date.now() + delay * 1000;
  const ins = await env.DB.prepare(
    "INSERT INTO pending_deletes (chat_id, ids, warn_id, at) VALUES (?1, ?2, NULL, ?3)"
  ).bind(chatId, JSON.stringify(sent), Math.floor(dueMs / 1000)).run();

  const warn = await tg(env, "sendMessage", {
    chat_id: chatId,
    text: `⚠️ این فایل تا ${delay} ثانیه دیگه از اینجا پاک میشه.\nهمین الان اون رو ذخیره کن یا به جای دیگه‌ای فوروارد کن (Saved Messages).`,
  });
  const warnId = warn.result?.message_id;
  const rowId = ins.meta?.last_row_id;
  if (warnId && rowId) {
    await env.DB.prepare("UPDATE pending_deletes SET warn_id = ?1 WHERE id = ?2").bind(warnId, rowId).run();
  }

  // ── شروع تایمر مستقل برای همین فایل ──
  // /api/tick بلافاصله جواب می‌ده و خودش تو پس‌زمینه تا موعد صبر می‌کنه و فقط همین ردیف رو پاک می‌کنه.
  // هر فایل تایمر خودش رو داره، پس به فایل قبلی/بعدی ربطی نداره.
  // اگه این مرحله شکست بخوره، ردیف تو دیتابیس هست و cron/آپدیت بعدی پاکش می‌کنه.
  if (rowId && ORIGIN) {
    try {
      await fetch(`${ORIGIN}/api/tick?id=${rowId}&key=${encodeURIComponent(env.WEBHOOK_SECRET)}`, {
        signal: AbortSignal.timeout(8000),
      });
    } catch (e) {
      console.error("start tick error:", e);
    }
  }
}

// ── جوین اجباری ──────────────────────────────────────────────
function getJoinConfig(env) {
  const raw = String(env.REQUIRED_CHANNEL_ID || env.FORCE_JOIN_CHANNEL || "").trim();
  if (!raw) return null;

  let chatId = raw;
  let url = env.REQUIRED_CHANNEL_URL || null;

  const link = raw.match(/^https?:\/\/t\.me\/([A-Za-z][\w]{3,})\/?$/);
  if (link) {
    chatId = "@" + link[1];
    url = url || raw;
  } else if (/^[A-Za-z][\w]{3,}$/.test(raw)) {
    chatId = "@" + raw;
  }
  if (!url && chatId.startsWith("@")) url = `https://t.me/${chatId.slice(1)}`;

  return { chatId, url };
}

async function isMember(env, userId) {
  const cfg = getJoinConfig(env);
  if (!cfg) return true;

  const res = await tg(env, "getChatMember", { chat_id: cfg.chatId, user_id: userId });
  if (!res.ok) {
    console.error("getChatMember failed:", res.description);
    return true;
  }

  const status = res.result?.status;
  return (
    ["creator", "administrator", "member"].includes(status) ||
    (status === "restricted" && res.result.is_member === true)
  );
}
