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
// (talaba/ota-ona kirishi yoki mehmon tashrifi) ishga tushadi va
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
