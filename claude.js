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
- თბილისსა და რუსთავში მიწოდება: 3:00-დან 11:00 საათამდე
- გადახდა: მხოლოდ ნაღდი, კურიერთან მიწოდებისას (ხელიდან ხელში)
- მუშაობს: 24/7

━━━━━━━━━━━━━━━━
📋 შეკვეთის მიღების ინსტრუქცია:
━━━━━━━━━━━━━━━━
როცა კლიენტი გამოხატავს შეკვეთის სურვილს, შეაგროვე ეს ინფორმაცია ნაბიჯ-ნაბიჯ (ყველაფერი ერთ შეტყობინებაში ნუ მოითხოვ):
1. სახელი და გვარი (თუ კლიენტი არ მოგაწვდის, შეკვეთის დასრულება მაინც შეიძლება; მოგვიანებით ხელმისაწვდომი იქნება მის პროფილის სახელი)
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
📝 დამატებითი ინფორმაცია შეკვეთაზე (ᲐᲪ საჭიროებს ადამიანს):
━━━━━━━━━━━━━━━━
თუ კლიენტი შეკვეთის შემდეგ მატებს მარტივ, ფაქტობრივ დეტალს — მაგალითად: \
მეორე საკონტაქტო ნომერი, კარის კოდი, ეტაჯი/ბინის ნომერი, "დარეკეთ მანამდე", \
სასურველი მიწოდების დრო, მისამართის დაკონკრეტება — ᲐᲘᲦ ᲐᲡᲣᲠᲘ ᲗᲐᲕᲘ:
1. დაუდასტურე კლიენტს მოკლედ და მეგობრულად (მაგ: "ჩანიშნულია ✅" ან "მადლობა, დავამატე ✅")
2. ჩასვი ეს ბლოკი (სისტემისთვისაა, კლიენტი ვერ ხედავს):
[ORDER_UPDATE]
ინფორმაცია: ...
[/ORDER_UPDATE]

ეს ᲐᲠ არის "ადამიანის დახმარების" შემთხვევა — თავად გააგრძელე საუბარი ჩვეულებრივად.

━━━━━━━━━━━━━━━━
❓ ადამიანის დახმარება (მხოლოდ ნამდვილი გაურკვევლობისას):
━━━━━━━━━━━━━━━━
გამოიყენე ეს ᲘᲘ მაშინ, როცა კლიენტის კითხვაზე პასუხი ამ ინსტრუქციაში ნამდვილად არ მოიძებნება — \
მაგალითად: კონკრეტული პროდუქტის მარაგი/რაოდენობა, ფასდაკლების მოთხოვნა, საჩივარი, წუნი, \
შეკვეთის გაუქმება, პროდუქტის შეცვლა სხვა პროდუქტში, ან რაიმე არასტანდარტული თხოვნა.
ამ შემთხვევაში არაფერი არ უპასუხო, დაელოდე ადამიანის დახმარებას და მისი პასუხი გაუგზავნე.

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

  // Detect order update (extra info added to an existing order)
  let orderUpdate = null;
  const updateMatch = rawReply.match(/\[ORDER_UPDATE\]([\s\S]*?)\[\/ORDER_UPDATE\]/);
  if (updateMatch) {
    orderUpdate = updateMatch[1].trim();
  }

  // Detect if human help is needed
  const needsHuman = rawReply.includes('ჩვენს გუნდს ვკითხავ');

  // Remove the system blocks from customer-facing message
  const cleanReply = rawReply
    .replace(/\[ORDER_COMPLETE\][\s\S]*?\[\/ORDER_COMPLETE\]/g, '')
    .replace(/\[ORDER_UPDATE\][\s\S]*?\[\/ORDER_UPDATE\]/g, '')
    .trim();

  return { reply: cleanReply, newHistory, needsHuman, orderData, orderUpdate };
}

function parseOrderData(text) {
  const extract = (label) => {
    const match = text.match(new RegExp(`${label}:\\s*([^\\n\\r]+)`));
    return match ? match[1].trim() : '';
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
