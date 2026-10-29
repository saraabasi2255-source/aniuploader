const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

let DATA = [];

function toast(t) {
  const e = $("toast");
  e.textContent = t;
  e.style.display = "block";
  setTimeout(() => e.style.display = "none", 1500);
}

async function load() {
  try {
    const r = await fetch("/api/admin/list");
    DATA = await r.json();
    render();
  } catch (err) {
    console.error(err);
    $("list").innerHTML = '<p class="empty-state">خطا در دریافت اطلاعات</p>';
  }
}

function render() {
  const q  = $("q").value.trim().toLowerCase();
  const t  = $("ftype").value;   // video | subtitle | ""
  const st = $("fstate").value;

  // گروه‌بندی بر اساس name + category
  const groups = {};
  DATA
    .filter(p => (!t || p.category === t) && (!q || p.name.toLowerCase().includes(q)))
    .forEach(p => {
      const key = p.name + "||" + p.category;
      (groups[key] ??= []).push(p);
    });

  let html = "";
  let count = 0;

  for (const [, eps] of Object.entries(groups)) {
    // حذف تکراری‌های واقعی بر اساس id
    const uniqueEps = [];
    const seenIds = new Set();
    for (const e of eps) {
      if (!seenIds.has(e.id)) {
        seenIds.add(e.id);
        uniqueEps.push(e);
      }
    }

    const first = uniqueEps[0];

    // برچسب دسته
    let categoryLabel = "📁 سایر";
    if (first.category === "video") categoryLabel = "🎬 ویدیو";
    else if (first.category === "subtitle") categoryLabel = "📝 زیرنویس";

    // محاسبه قسمت‌های ناقص (بر اساس ep)
    const nums = uniqueEps.map(e => e.ep).filter(n => n != null);
    const missing = [];
    if (nums.length) {
      const mx = Math.max(...nums);
      for (let i = 1; i <= mx; i++) if (!nums.includes(i)) missing.push(i);
    }
    if (st === "gap" && !missing.length) continue;

    count++;
    uniqueEps.sort((a, b) => (a.ep ?? 0) - (b.ep ?? 0));

    html += `
      <div class="card">
        <h3>${esc(first.name)} <span class="mut" style="font-size:12px">(${categoryLabel})</span></h3>
        <div class="mut">${uniqueEps.length} پست</div>
        ${missing.length ? `<div class="miss">${missing.map(n => `<span>قسمت ${n} نیست</span>`).join("")}</div>` : ""}
        ${uniqueEps.map(e => `
          <div class="ep">
            <b>${e.ep != null ? "قسمت " + e.ep : (e.ext ? "." + e.ext : "—")}</b>
            <span class="mut">${e.ext ? "." + e.ext : e.type}${e.files > 1 ? " ×" + e.files : ""}</span>
            <div class="btns">
              <a href="${e.archive_link}" target="_blank">📂 آرشیو</a>
              <a class="go" href="${e.bot_link}" target="_blank">🤖 بات</a>
              <button type="button" data-copy="${e.bot_link}">📋 کپی</button>
              <button type="button" data-del="${e.id}">🗑</button>
            </div>
          </div>
        `).join("")}
      </div>
    `;
  }

  $("list").innerHTML = count > 0 ? html : '<p class="empty-state">چیزی پیدا نشد 🎬</p>';

  document.querySelectorAll("[data-copy]").forEach(btn => {
    btn.addEventListener("click", () => {
      navigator.clipboard.writeText(btn.dataset.copy).then(() => toast("لینک کپی شد ✅"));
    });
  });

  document.querySelectorAll("[data-del]").forEach(btn => {
    btn.addEventListener("click", () => del(btn.dataset.del));
  });
}

async function del(id) {
  if (!confirm("از دیتابیس حذف شود؟ (پیام کانال دست نمی‌خورد)")) return;
  try {
    await fetch("/api/admin/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: Number(id) })
    });
    load();
  } catch (e) {
    toast("خطا در حذف ❌");
  }
}

// رویدادها
$("q").addEventListener("input", render);
$("ftype").addEventListener("change", render);
$("fstate").addEventListener("change", render);
$("refresh-btn").addEventListener("click", load);

// شروع
load();
