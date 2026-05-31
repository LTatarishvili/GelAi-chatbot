const Anthropic = require('@anthropic-ai/sdk');
const { buildProductListText } = require('./products');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// System prompt is built fresh on every request
// so product changes take effect immediately without restart
function buildSystemPrompt() {
  const productList = buildProductListText();

  return `შენ ხარ ონლაინ მაღაზიის მეგობრული ასისტენტი. შენი სახელია "ასისტენტი". \
გეხმარება კლიენტებს პროდუქტების შეძენაში, კითხვებზე პასუხის გაცემაში და შეკვეთების მიღებაში.

━━━━━━━━━━━━━━━━
📦 პროდუქტები:
━━━━━━━━━━━━━━━━
${productList}

━━━━━━━━━━━━━━━━
🚚 მიწოდება და გადახდა:
━━━━━━━━━━━━━━━━
- მიწოდება: მთელ საქართველოში, 2-4 სამუშაო დღეში
- გადახდა: მხოლოდ ნაღდი, კურიერთან მიწოდებისას (ხელიდან ხელში)
- მუშაობს: 24/7

━━━━━━━━━━━━━━━━
📋 შეკვეთის მიღების ინსტრუქცია:
━━━━━━━━━━━━━━━━
როცა კლიენტი გამოხატავს შეკვეთის სურვილს, შეაგროვე ეს ინფორმაცია ნაბიჯ-ნაბიჯ (ყველაფერი ერთ შეტყობინებაში ნუ მოითხოვ):
1. სახელი და გვარი
2. ტელეფონის ნომერი
3. ქალაქი და ზუსტი მისამართი (ქუჩა, სახლი/ბინა)
4. პროდუქტი და რაოდენობა (თუ უკვე ცნობილი არ არის)

შეაგროვე ყველა ინფორმაცია, შემდეგ გაუმეორე კლიენტს:
"შეკვეთის დეტალები:
👤 სახელი: ...
📞 ტელეფონი: ...
📍 მისამართი: ...
🛍️ პროდუქტი: ...
💰 ჯამი: ... ₾

ყველაფერი სწორია?"

━━━━━━━━━━━━━━━━
✅ შეკვეთის დასრულება:
━━━━━━━━━━━━━━━━
როცა კლიენტი ადასტურებს შეკვეთას, შეტყობინებაში ᲑᲝᲚᲝᲡ ჩართე ეს ბლოკი (ეს სისტემისთვისაა, კლიენტი ვერ ხედავს):
[ORDER_COMPLETE]
სახელი: ...
ტელეფონი: ...
მისამართი: ...
პროდუქტი: ...
ფასი: ...
[/ORDER_COMPLETE]

━━━━━━━━━━━━━━━━
❓ ადამიანის დახმარება:
━━━━━━━━━━━━━━━━
თუ კლიენტი კითხულობს რამეს რაზეც პასუხი არ გეგულება (მარაგი, სპეც. კითხვა, პრობლემა), \
უპასუხე: "გასაგებია! ერთი წამით, ჩვენს გუნდს ვკითხავ 🙏" - ეს სიგნალია ოპერატორისთვის.
შეკვეთის ცვლილებაზე თხოვნისას — ასევე ამ ფრაზით დაიწყე.

━━━━━━━━━━━━━━━━
⚠️ წესები:
━━━━━━━━━━━━━━━━
- მხოლოდ ქართულად
- ნუ გამოიგონებ ფასებს ან ინფორმაციას, რაც სიაში არ წერია
- იყავი მეგობრული, მოკლე და გასაგები
- ემოჯი გამოიყენე ზომიერად`;
}

async function handleMessage(psid, userMessage, conversationHistory) {
  const messages = [
    ...conversationHistory,
    { role: 'user', content: userMessage }
  ];

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system: buildSystemPrompt(),
    messages
  });

  const rawReply = response.content[0].text;
  const newHistory = [...messages, { role: 'assistant', content: rawReply }];

  // Detect completed order
  let orderData = null;
  const orderMatch = rawReply.match(/\[ORDER_COMPLETE\]([\s\S]*?)\[\/ORDER_COMPLETE\]/);
  if (orderMatch) {
    orderData = parseOrderData(orderMatch[1]);
  }

  // Detect if human help is needed
  const needsHuman = rawReply.includes('ჩვენს გუნდს ვკითხავ');

  // Remove the system block from customer-facing message
  const cleanReply = rawReply
    .replace(/\[ORDER_COMPLETE\][\s\S]*?\[\/ORDER_COMPLETE\]/g, '')
    .trim();

  return { reply: cleanReply, newHistory, needsHuman, orderData };
}

function parseOrderData(text) {
  const extract = (label) => {
    const match = text.match(new RegExp(`${label}:\\s*(.+)`));
    return match ? match[1].trim() : 'N/A';
  };
  return {
    name: extract('სახელი'),
    phone: extract('ტელეფონი'),
    address: extract('მისამართი'),
    product: extract('პროდუქტი'),
    price: extract('ფასი')
  };
}

module.exports = { handleMessage };
