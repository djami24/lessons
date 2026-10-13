const functions = require("firebase-functions");
const https = require("https");
const admin = require("firebase-admin");

admin.initializeApp();

exports.sendTelegram = functions.https.onCall(async (data, context) => {
  const { token, chatId, studentName, studentPhone, date, note } = data;

  if (!token || !chatId || !studentName) {
    throw new functions.https.HttpsError("invalid-argument", "Token, chatId va studentName kerak");
  }

  const dateLabel = date
    ? new Date(date + "T00:00:00").toLocaleDateString("uz-UZ", {
        day: "numeric", month: "long", year: "numeric"
      })
    : date;

  let text = `🚫 <b>O'quvchi darsga kelmadi</b>\n\n`;
  text += `👤 Ism: ${studentName}\n`;
  text += `📞 Tel: ${studentPhone || "—"}\n`;
  text += `📅 Sana: ${dateLabel || "—"}`;
  if (note) text += `\n📝 Izoh: ${note}`;

  const body = JSON.stringify({
    chat_id: chatId,
    text: text,
    parse_mode: "HTML"
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: "api.telegram.org",
      path: `/bot${token}/sendMessage`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body)
      }
    }, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        const parsed = JSON.parse(data);
        if (parsed.ok) resolve({ ok: true });
        else reject(new functions.https.HttpsError("unknown", parsed.description || "Telegram xatosi"));
      });
    });
    req.on("error", e => reject(new functions.https.HttpsError("unknown", e.message)));
    req.write(body);
    req.end();
  });
});

// ============================================================
// Faollik jurnali (activity_log) — avtomatik tozalash
// ------------------------------------------------------------
// activity_log kolleksiyasiga har safar yangi yozuv qo'shilganda
// (talaba yoki ota-ona kirishi/ro'yxatdan o'tishi) ishga tushadi va
// eng so'nggi 30 tadan boshqasini o'chiradi — shunda jurnal
// cheksiz o'sib ketmaydi va admin panelda doim so'nggi 30 ta
// faollik ko'rinadi.
// ============================================================
const ACTIVITY_LOG_LIMIT = 30;

exports.trimActivityLog = functions.firestore
  .document("activity_log/{logId}")
  .onCreate(async () => {
    const db = admin.firestore();
    const col = db.collection("activity_log");

    const extraDocs = await col
      .orderBy("at", "desc")
      .offset(ACTIVITY_LOG_LIMIT)
      .get();

    if (extraDocs.empty) return null;

    const batch = db.batch();
    extraDocs.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    return null;
  });

// ============================================================
// Kirishlar haqida Telegram xabari
// ------------------------------------------------------------
// Talaba yoki ota-ona profiliga kirsa (activity_log ga yozuv tushsa),
// ismi va emaili bilan Telegram kanal/chatga xabar yuboriladi.
// Bot tokeni va chat ID Firestore'dagi telegramConfig/bot hujjatidan
// o'qiladi (token, visitChatId) — ularni admin paneldagi
// "Telegram bot" sozlamalarida kiritasiz.
// Bir xil odam 30 daqiqa ichida qayta kirsa, qayta xabar yuborilmaydi.
// ============================================================
const VISIT_NOTIFY_COOLDOWN_MS = 30 * 60 * 1000;

function tgEscape(v) {
  return String(v == null ? "" : v)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function tgSend(token, chatId, text) {
  const body = JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" });
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: "api.telegram.org",
      path: `/bot${token}/sendMessage`,
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) }
    }, (res) => {
      let out = "";
      res.on("data", (ch) => out += ch);
      res.on("end", () => {
        try {
          const parsed = JSON.parse(out);
          parsed.ok ? resolve() : reject(new Error(parsed.description || "Telegram xatosi"));
        } catch (e) { reject(e); }
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

exports.notifyVisitTelegram = functions.firestore
  .document("activity_log/{logId}")
  .onCreate(async (snap) => {
    const d = snap.data() || {};
    if (d.role !== "student" && d.role !== "parent") return null;
    try {
      const db = admin.firestore();
      const cfgSnap = await db.collection("telegramConfig").doc("bot").get();
      const cfg = cfgSnap.exists ? cfgSnap.data() : {};
      if (!cfg.token || !cfg.visitChatId) return null;

      // Spam himoyasi: profilga qayta-qayta kirsa, 30 daqiqada bir marta
      if (d.action === "dashboard_visit" && d.uid) {
        const ref = db.collection("visitNotify").doc(String(d.uid));
        const prev = await ref.get();
        const now = Date.now();
        if (prev.exists && now - (prev.data().at || 0) < VISIT_NOTIFY_COOLDOWN_MS) return null;
        await ref.set({ at: now });
      }

      const who = d.role === "parent" ? "Ota-ona" : "Talaba";
      const what = d.action === "register" ? "ro'yxatdan o'tdi"
        : d.action === "login" ? "tizimga kirdi"
        : "profiliga kirdi";
      const when = new Date().toLocaleString("en-GB", { timeZone: "Asia/Tashkent", hour12: false });

      const text =
        `👀 <b>${who} ${what}</b>\n\n` +
        `👤 Ism: ${tgEscape(d.name || "—")}\n` +
        `✉️ Email: ${tgEscape(d.email || "—")}\n` +
        `🕐 Vaqt: ${tgEscape(when)}`;

      await tgSend(cfg.token, cfg.visitChatId, text);
    } catch (e) {
      console.error("notifyVisitTelegram xatosi:", e && e.message ? e.message : e);
    }
    return null;
  });
