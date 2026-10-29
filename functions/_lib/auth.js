// احراز هویت ساده‌ی ادمین: ?key=WEBHOOK_SECRET (یا هدر X-Admin-Key)

function safeEqual(a, b) {
  a = String(a);
  b = String(b);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function isAuthorized(request, env) {
  if (!env.WEBHOOK_SECRET) return false;
  const url = new URL(request.url);
  const key = url.searchParams.get("key") || request.headers.get("X-Admin-Key") || "";
  return safeEqual(key, env.WEBHOOK_SECRET);
}

export function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
