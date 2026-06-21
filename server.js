require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { handleMessage } = require('./claude');
const { sendTelegramMessage, setPendingReply, getPendingReply } = require('./telegram');
const { getConversation, updateConversation } = require('./conversations');

const app = express();
app.use(express.json());

const PAGE_ACCESS_TOKEN = process.env.FB_PAGE_ACCESS_TOKEN;
const VERIFY_TOKEN = process.env.FB_VERIFY_TOKEN;

// In-memory order tracking: psid -> orderId, orderId -> order details
const pendingOrders = new Map();
const orders = new Map();

// Cache of Facebook profile names: psid -> "First Last"
// Avoids hitting the Graph API on every single message from the same customer.
const profileNameCache = new Map();

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
      await sendMessengerMessage(psid, yourAnswer);
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
  res.send('GelAI chatbot is running ✅');
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

  // Fetch the customer's Facebook name once (cached) so we can:
  //  1) feed it into the LLM system prompt (personalised replies)
  //  2) show it in every Telegram notification to the operator
  const fbName = await getProfileName(psid);

  const history = getConversation(psid);
  const { reply, newHistory, needsHuman, orderData, orderUpdate } =
    await handleMessage(psid, messageText, history, fbName);

  updateConversation(psid, newHistory);

  // 🛒 New order completed
  if (orderData) {
    const orderName = orderData.name?.trim() ? orderData.name : (fbName || 'N/A');

    // create unique order id
    const orderId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    pendingOrders.set(psid, orderId);
    orders.set(orderId, { id: orderId, psid, profileName: fbName, ...orderData, createdAt: Date.now() });

    const orderText =
      `🛒 *ახალი შეკვეთა!*\n\n` +
      `🆔 შეკვეთის ID: ${orderId}\n` +
      `👤 სახელი: ${orderName}\n` +
      `📛 Facebook: ${fbName || '—'}\n` +
      `📞 ტელეფონი: ${orderData.phone}\n` +
      `📍 მისამართი: ${orderData.address}\n` +
      `🛍️ პროდუქტი: ${orderData.product}\n` +
      `🚚 მიწოდება: ${orderData.delivery || '—'}\n` +
      `💰 ასაღები ჯამი: ${orderData.price}\n\n` +
      `_PSID: ${psid}_`;
    await sendTelegramMessage(orderText);
    console.log(`✅ Order ${orderId} sent to Telegram`);
  }

  // ✏️ Existing order updated (extra info added) — attach to same order id
  if (orderUpdate) {
    const orderId = pendingOrders.get(psid);
    if (orderId && orders.has(orderId)) {
      const existing = orders.get(orderId);
      existing.updates = existing.updates || [];
      existing.updates.push({ text: orderUpdate, at: Date.now() });
      existing.updatedAt = Date.now();
      orders.set(orderId, existing);

      const updateText =
        `✏️ *შეკვეთის დამატება/ცვლილება*\n\n` +
        `🆔 შეკვეთის ID: ${orderId}\n` +
        `📛 Facebook: ${existing.profileName || fbName || '—'}\n` +
        `${orderUpdate}\n\n` +
        `_PSID: ${psid}_`;
      await sendTelegramMessage(updateText);
      console.log(`✏️ Order ${orderId} update sent to Telegram`);
    } else {
      // no existing order, create a new order id for this update
      const newId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      pendingOrders.set(psid, newId);
      orders.set(newId, { id: newId, psid, profileName: fbName, updates: [{ text: orderUpdate, at: Date.now() }], createdAt: Date.now() });

      const updateText =
        `✏️ *შეკვეთის დამატება/ცვლილება*\n\n` +
        `🆔 შეკვეთის ID: ${newId}\n` +
        `📛 Facebook: ${fbName || '—'}\n` +
        `${orderUpdate}\n\n` +
        `_PSID: ${psid}_`;
      await sendTelegramMessage(updateText);
      console.log(`✏️ Order ${newId} (created for update) sent to Telegram`);
    }
  }

  // ❓ Human help needed
  if (needsHuman) {
    const botSaid = (reply && reply.trim()) ? `🤖 ბოტმა უპასუხა: "${reply.trim()}"\n` : '';
    const questionText =
      `❓ *კლიენტი ელოდება პასუხს*\n\n` +
      `📛 Facebook: ${fbName || '—'}\n` +
      `კითხვა: "${messageText}"\n` +
      botSaid +
      `\n↩️ *Reply-ით* გიპასუხე ამ შეტყობინებაზე — კლიენტს ავტომატურად გაეგზავნება.\n\n` +
      `_PSID: ${psid}_`;
    const tgMsg = await sendTelegramMessage(questionText);
    setPendingReply(tgMsg.message_id, psid);
    console.log(`🆘 Human help requested for ${psid}`);
  }

  // Send the bot's reply to the customer (skip if empty to avoid a Facebook API error)
  if (reply && reply.trim()) {
    await sendMessengerMessage(psid, reply);
  }
}

async function sendMessengerMessage(psid, text) {
  await axios.post(
    `https://graph.facebook.com/v19.0/me/messages`,
    { recipient: { id: psid }, message: { text } },
    { params: { access_token: PAGE_ACCESS_TOKEN } }
  );
}

// Cached wrapper around the Graph API call
async function getProfileName(psid) {
  if (profileNameCache.has(psid)) {
    return profileNameCache.get(psid);
  }
  const name = await fetchMessengerProfileName(psid);
  if (name) {
    profileNameCache.set(psid, name);
  }
  return name;
}

async function fetchMessengerProfileName(psid) {
  try {
    const res = await axios.get(`https://graph.facebook.com/v19.0/${psid}`, {
      params: {
        fields: 'first_name,last_name',
        access_token: PAGE_ACCESS_TOKEN
      }
    });
    const user = res.data;
    if (user.first_name || user.last_name) {
      return `${user.first_name || ''}${user.first_name && user.last_name ? ' ' : ''}${user.last_name || ''}`.trim();
    }
  } catch (err) {
    console.warn('⚠️ Could not fetch Messenger profile name:', err.message);
  }
  return null;
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
