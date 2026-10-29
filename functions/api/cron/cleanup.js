// GET /api/cron/cleanup?key=WEBHOOK_SECRET
// باید هر ۱ دقیقه توسط یه cron بیرونی (مثلا cron-job.org) صدا زده بشه —
// Cloudflare Pages خودش Cron Trigger نداره.

import { isAuthorized, json } from "../../_lib/auth.js";
import { runCleanup } from "../../_lib/cleanup.js";

export async function onRequestGet({ request, env }) {
  if (!isAuthorized(request, env)) {
    return new Response("forbidden", { status: 403 });
  }
  try {
    const r = await runCleanup(env, 50);
    return json({ ok: true, ...r });
  } catch (e) {
    console.error("cleanup error:", e);
    return json({ ok: false, error: String(e) }, 500);
  }
}
