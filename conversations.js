// In-memory conversation store
// History is kept per customer (by Facebook PSID)
// Resets if server restarts — this is fine for a shop chatbot

const conversations = new Map();
const MAX_MESSAGES = 30; // keep last 30 messages to avoid token bloat

function getConversation(psid) {
  return conversations.get(psid) || [];
}

function updateConversation(psid, history) {
  const trimmed = history.slice(-MAX_MESSAGES);
  conversations.set(psid, trimmed);
}

function clearConversation(psid) {
  conversations.delete(psid);
}

module.exports = { getConversation, updateConversation, clearConversation };
