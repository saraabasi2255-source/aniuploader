// استخراج نام انیمه، شماره قسمت، فصل و دسته از نام فایل/کپشن

const VIDEO_EXT = new Set(["mkv", "mp4", "avi", "mov", "webm", "m4v", "ts", "flv", "wmv", "mpg", "mpeg"]);
const SUB_EXT = new Set(["srt", "ass", "ssa", "sub", "vtt", "zip", "rar", "7z"]);
const OTHER_EXT = new Set(["mka", "aac", "mp3", "flac", "txt", "nfo", "pdf", "jpg", "jpeg", "png"]);

const faToEn = (s) =>
  s
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));

// از اولین تگ کیفیت/ریلیز به بعد رو حذف می‌کنه
const TAGS_RE =
  /[\s._\-[(]*\b(?:\d{3,4}x\d{3,4}|2160p|1080p|720p|576p|480p|4k|web[-_. ]?dl|web[-_. ]?rip|blu[-_. ]?ray|bdrip|brrip|hdtv|hdrip|dvdrip|x26[45]|h[-_. ]?26[45]|hevc|avc|aac|flac|ac3|10[-_. ]?bit|dual[-_. ]?audio|multi[-_. ]?sub|hardsub|softsub)\b.*$/i;

function cleanTitle(t) {
  return t
    .replace(TAGS_RE, "")
    .replace(/[._]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s\-–—:|]+|[\s\-–—:|]+$/g, "")
    .trim();
}

export function parseFileName(raw) {
  const rawName = String(raw || "").trim();
  // فقط خط اول (کپشن‌های چندخطی رو نادیده بگیر)
  let s = faToEn(rawName.split(/\r?\n/).map((x) => x.trim()).find(Boolean) || "");

  // پسوند — فقط پسوندهای شناخته‌شده (تا چیزی مثل «v1.5» یا «Ep.1» پسوند حساب نشه)
  let ext = "";
  const em = s.match(/\.([a-zA-Z0-9]{2,4})$/);
  if (em) {
    const e = em[1].toLowerCase();
    if (VIDEO_EXT.has(e) || SUB_EXT.has(e) || OTHER_EXT.has(e)) {
      ext = e;
      s = s.slice(0, -(e.length + 1));
    }
  }

  const title = s.trim(); // نام کامل بدون پسوند

  // محتوای داخل [] () {} حذف می‌شه (گروه سابتایتر، CRC، سال، ...) تا شماره‌ی
  // قسمت اشتباهی از اون‌ها برداشته نشه
  const plain = s.replace(/\[[^\]]*\]|\([^)]*\)|\{[^}]*\}/g, " ");

  let season = null;
  let ep = null;
  let cut = -1;

  let m;
  if ((m = plain.match(/(?<![A-Za-z])S(\d{1,2})[\s._-]*E(?:P)?[\s._-]*(\d{1,4})(?!\d)/i))) {
    season = Number(m[1]); ep = Number(m[2]); cut = m.index;
  } else if ((m = plain.match(/(?<![\dA-Za-z])(\d{1,2})x(\d{2,3})(?![\dA-Za-z])/i))) {
    season = Number(m[1]); ep = Number(m[2]); cut = m.index;
  } else if ((m = plain.match(/(?<![A-Za-z])(?:E(?:P(?:ISODE)?)?\.?|Episode|قسمت|اپیزود)[\s._-]*(\d{1,4})(?!\d)/i))) {
    ep = Number(m[1]); cut = m.index;
  } else if ((m = plain.match(/(?:^|\s)[-–—#]\s*(\d{1,4})(?:v\d)?(?=\s|\.|$)/i))) {
    ep = Number(m[1]); cut = m.index;
  }

  let name;
  if (cut >= 0) {
    name = cleanTitle(plain.slice(0, cut));
    if (!name) name = cleanTitle(plain.slice(cut).replace(m[0], " "));
  } else {
    name = cleanTitle(plain);
  }
  if (!name) name = cleanTitle(s) || "بدون نام";
  if (season && season > 1) name += ` S${season}`;

  let category = "other";
  if (VIDEO_EXT.has(ext)) category = "video";
  else if (SUB_EXT.has(ext)) category = "subtitle";

  return { rawName, title: title || "بدون نام", name, ep, season, ext, category };
}
