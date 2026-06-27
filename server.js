require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { handleMessage } = require('./ai');
const { sendTelegramMessage, setPendingReply, getPendingReply } = require('./telegram');
const { getConversation, updateConversation } = require('./conversations');

const app = express();
app.use(express.json());

const PAGE_ACCESS_TOKEN = process.env.FB_PAGE_ACCESS_TOKEN;
const VERIFY_TOKEN = process.env.FB_VERIFY_TOKEN;

// ─────────────────────────────────────────────
// FACEBOOK WEBHOOK
// ─────────────────────────────────────────────

// Facebook calls this to verify your webhook URL
app.get('/webhook', (req, res) => {
  if (
    req.query['hub.mode'] === 'subscribe' &&
    req.query['hub.verify_token'] === VERIFY_TOKEN
  ) {
    console.log('✅ Facebook webhook verified');
    res.send(req.query['hub.challenge']);
  } else {
    res.sendStatus(403);
  }
});

// Facebook sends messages here
app.post('/webhook', async (req, res) => {
  res.sendStatus(200); // always reply fast so Facebook doesn't retry

  const body = req.body;
  if (body.object !== 'page') return;

  for (const entry of body.entry) {
    const events = entry.messaging || [];
    for (const event of events) {
      // Skip echo messages (sent by the page itself)
      if (event.message && !event.message.is_echo) {
        await handleIncomingMessage(event).catch(err =>
          console.error('❌ Error handling message:', err)
        );
      }
    }
  }
});

// ─────────────────────────────────────────────
// TELEGRAM WEBHOOK
// ─────────────────────────────────────────────

// Telegram sends updates here
app.post('/telegram', async (req, res) => {
  res.sendStatus(200);

  const update = req.body;
  if (!update.message) return;

  const msg = update.message;

  // If you replied to one of the bot's notifications → forward answer to customer
  if (msg.reply_to_message) {
    const replyToId = msg.reply_to_message.message_id;
    const psid = getPendingReply(replyToId);

    if (psid) {
      const yourAnswer = msg.text;
      await sendMessengerMessage(
        psid,
        `💬 ოპერატორი: ${yourAnswer}`
      );
      await sendTelegramMessage(`✅ პასუხი გაეგზავნა კლიენტს.`);
      console.log(`📤 Admin reply forwarded to customer ${psid}`);
    } else {
      await sendTelegramMessage(`⚠️ ვერ ვიპოვე კლიენტი ამ შეტყობინებისთვის (შეიძლება 48 საათზე მეტი გავიდა).`);
    }
  }
});

// ─────────────────────────────────────────────
// HEALTH CHECK
// ─────────────────────────────────────────────

app.get('/', (req, res) => {
  res.send('Allsale chatbot is running ✅');
});

// ─────────────────────────────────────────────
// CORE LOGIC
// ─────────────────────────────────────────────

async function handleIncomingMessage(event) {
  const psid = event.sender.id;
  const messageText = event.message.text;

  if (!messageText) return; // ignore stickers, images etc

  console.log(`📨 [${psid}]: ${messageText}`);

  await sendTypingOn(psid);

  const history = getConversation(psid);
  const { reply, newHistory, needsHuman, orderData, orderUpdate } = await handleMessage(psid, messageText, history);

  updateConversation(psid, newHistory);

  // 🛒 New order completed
  if (orderData) {
    const orderText =
      `🛒 *ახალი შეკვეთა!*\n\n` +
      `👤 სახელი: ${orderData.name}\n` +
      `📞 ტელეფონი: ${orderData.phone}\n` +
      `📍 მისამართი: ${orderData.address}\n` +
      `🛍️ პროდუქტი: ${orderData.product}\n` +
      `💰 ფასი: ${orderData.price}\n\n` +
      `_PSID: ${psid}_`;
    await sendTelegramMessage(orderText);
    console.log('✅ Order sent to Telegram');
  }

  // ✏️ Existing order updated (extra info added) — no human needed, just notify
  if (orderUpdate) {
    const updateText =
      `✏️ *შეკვეთის დამატება/ცვლილება*\n\n` +
      `${orderUpdate}\n\n` +
      `_PSID: ${psid}_`;
    await sendTelegramMessage(updateText);
    console.log('✏️ Order update sent to Telegram');
  }

  // ❓ Human help needed
  if (needsHuman) {
    const questionText =
      `❓ *კლიენტი ელოდება პასუხს*\n\n` +
      `"${messageText}"\n\n` +
      `↩️ *Reply-ით* გიპასუხე ამ შეტყობინებაზე — კლიენტს ავტომატურად გაეგზავნება.\n\n` +
      `_PSID: ${psid}_`;
    const tgMsg = await sendTelegramMessage(questionText);
    setPendingReply(tgMsg.message_id, psid);
    console.log(`🆘 Human help requested for ${psid}`);
  }

  await sendMessengerMessage(psid, reply);
}

async function sendMessengerMessage(psid, text) {
  await axios.post(
    `https://graph.facebook.com/v19.0/me/messages`,
    { recipient: { id: psid }, message: { text } },
    { params: { access_token: PAGE_ACCESS_TOKEN } }
  );
}

async function sendTypingOn(psid) {
  await axios.post(
    `https://graph.facebook.com/v19.0/me/messages`,
    { recipient: { id: psid }, sender_action: 'typing_on' },
    { params: { access_token: PAGE_ACCESS_TOKEN } }
  ).catch(() => {}); // ignore if this fails
}

// ─────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
