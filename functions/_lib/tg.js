// توابع مشترک تلگرام (همه‌ی فایل‌ها از اینجا استفاده می‌کنن)

export async function tg(env, method, body) {
  try {
    const res = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return await res.json();
  } catch (e) {
    console.error(`tg ${method} error:`, e);
    return { ok: false, description: String(e) };
  }
}

export function sendMessage(env, chatId, text, reply_markup, parse_mode) {
  const payload = { chat_id: chatId, text };
  if (reply_markup) payload.reply_markup = reply_markup;
  if (parse_mode) payload.parse_mode = parse_mode;
  return tg(env, "sendMessage", payload);
}

export function editMessageText(env, chatId, messageId, text, reply_markup, parse_mode) {
  const payload = { chat_id: chatId, message_id: messageId, text };
  if (reply_markup) payload.reply_markup = reply_markup;
  if (parse_mode) payload.parse_mode = parse_mode;
  return tg(env, "editMessageText", payload);
}

export function answerCallbackQuery(env, callbackQueryId, text) {
  return tg(env, "answerCallbackQuery", { callback_query_id: callbackQueryId, text });
}

export function deleteMessage(env, chatId, messageId) {
  return tg(env, "deleteMessage", { chat_id: chatId, message_id: messageId });
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
