const axios = require('axios');

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// Maps telegram message_id → facebook psid
// So when you reply to a Telegram message, we know which customer to answer
const pendingReplies = new Map();

async function sendTelegramMessage(text, attempt = 1) {
  try {
    const res = await axios.post(
      `https://api.telegram.org/bot${TOKEN}/sendMessage`,
      {
        chat_id: CHAT_ID,
        text,
        parse_mode: 'Markdown'
      }
    );
    return res.data.result; // includes message_id
  } catch (err) {
    // If Markdown parsing failed (bad/unmatched * or _ characters), retry as plain text
    const isMarkdownError = err.response?.data?.description?.includes("can't parse entities");
    if (isMarkdownError) {
      console.warn('⚠️ Telegram Markdown parse failed, retrying as plain text');
      const res = await axios.post(
        `https://api.telegram.org/bot${TOKEN}/sendMessage`,
        { chat_id: CHAT_ID, text }
      );
      return res.data.result;
    }

    // Telegram's own servers had a hiccup (502/503/504) — retry a couple of times
    const isServerError = err.response?.status >= 500;
    if (isServerError && attempt < 3) {
      console.warn(`⚠️ Telegram ${err.response.status} — retrying (attempt ${attempt + 1}/3)...`);
      await new Promise(r => setTimeout(r, 1500 * attempt)); // 1.5s, then 3s
      return sendTelegramMessage(text, attempt + 1);
    }

    throw err;
  }
}

// Register that a telegram message is waiting for your reply → links to a customer
function setPendingReply(telegramMsgId, psid) {
  pendingReplies.set(String(telegramMsgId), psid);
  // Auto-remove after 48 hours
  setTimeout(() => pendingReplies.delete(String(telegramMsgId)), 48 * 60 * 60 * 1000);
}

function getPendingReply(telegramMsgId) {
  return pendingReplies.get(String(telegramMsgId));
}

module.exports = { sendTelegramMessage, setPendingReply, getPendingReply };
