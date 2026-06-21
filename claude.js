const Anthropic = require('@anthropic-ai/sdk');
const { buildProductListText } = require('./products');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const KA_WEEKDAYS = ['კვირა', 'ორშაბათი', 'სამშაბათი', 'ოთხშაბათი', 'ხუთშაბათი', 'პარასკევი', 'შაბათი']; // index 0 = Sunday
const KA_MONTHS = ['იანვარი', 'თებერვალი', 'მარტი', 'აპრილი', 'მაისი', 'ივნისი', 'ივლისი', 'აგვისტო', 'სექტემბერი', 'ოქტომბერი', 'ნოემბერი', 'დეკემბერი'];

// Builds a live "current Tbilisi time" block for the system prompt so the bot can
// give accurate "today / tomorrow" delivery estimates. Delivery days are Mon–Sat
// (Sunday excluded), 15:00–23:00. If today can no longer deliver (Sunday, or the
// 23:00 window already closed), today is dropped from the nearest-days list.
function buildTimingContext() {
  const tz = 'Asia/Tbilisi';
  const now = new Date();
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const hm = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(now);
  const hour = parseInt(hm.slice(0, 2), 10);

  const [y, m, d] = ymd.split('-').map(Number);
  const anchor = new Date(Date.UTC(y, m - 1, d, 12, 0, 0)); // noon UTC keeps the calendar date stable
  const todayDow = anchor.getUTCDay();
  const todayIsSunday = todayDow === 0;
  const afterWindow = hour >= 23;

  const fmtDay = (date) => `${KA_WEEKDAYS[date.getUTCDay()]}, ${date.getUTCDate()} ${KA_MONTHS[date.getUTCMonth()]}`;

  const startOffset = (todayIsSunday || afterWindow) ? 1 : 0;
  const deliveryDays = [];
  const cursor = new Date(anchor);
  cursor.setUTCDate(cursor.getUTCDate() + startOffset);
  while (deliveryDays.length < 2) {
    if (cursor.getUTCDay() !== 0) deliveryDays.push(fmtDay(new Date(cursor)));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  let todayNote;
  if (todayIsSunday) todayNote = 'დღეს კვირაა — დღეს მიწოდება არ ხდება.';
  else if (afterWindow) todayNote = 'დღევანდელი მიწოდების ფანჯარა (15:00–23:00) დასრულდა.';
  else todayNote = 'დღეს მიწოდების დღეა (15:00–23:00).';

  return `🕒 მიმდინარე დრო (თბილისი): ${KA_WEEKDAYS[todayDow]}, ${d} ${KA_MONTHS[m - 1]}, ${hm}.
- ${todayNote}
- უახლოესი მიწოდების დღეები თბილისი/რუსთავისთვის (კვირის გარდა): ${deliveryDays.join('; ')}.`;
}

// System prompt is built fresh on every request so product changes take effect
// immediately without restart. fbName (the customer's Facebook name) is injected
// so the bot can address the customer naturally and avoid re-asking for the name.
function buildSystemPrompt(fbName) {
  const productList = buildProductListText();
  const timingContext = buildTimingContext();

  const nameBlock = fbName
    ? `
━━━━━━━━━━━━━━━━
👤 კლიენტის შესახებ:
━━━━━━━━━━━━━━━━
- კლიენტის სახელია: ${fbName} (აღებულია Facebook-დან).
- მიმართე მას სახელით ბუნებრივად, საუბრის დასაწყისში ან საჭიროებისას.
- შეკვეთის გაფორმებისას სახელი ხელახლა ნუ ჰკითხავ — უკვე იცი. გამოიყენე ეს სახელი, თუ კლიენტი თავად არ მიუთითებს სხვას.
`
    : '';

  return `შენ ხარ ონლაინ მაღაზიის მეგობრული ასისტენტი. შენი სახელია "ასისტენტი". გეხმარები კლიენტებს პროდუქტების შეძენაში, კითხვებზე პასუხის გაცემაში და შეკვეთების მიღებაში.
${nameBlock}
━━━━━━━━━━━━━━━━
📦 პროდუქტები:
━━━━━━━━━━━━━━━━
${productList}

━━━━━━━━━━━━━━━━
🚚 მიწოდება და გადახდა:
━━━━━━━━━━━━━━━━
- მიწოდება ხდება მთელ საქართველოში. ზოგადად მიწოდებას სჭირდება 1-3 სამუშაო დღე.
- თბილისსა და რუსთავში დარიგება ხდება დღის 15:00-დან 23:00 საათამდე, სამუშაო დღეებში (კვირის გარდა). ფასი: თბილისი 6₾, რუსთავი 8₾.
- რეგიონებში ქალაქებში: 2-3 სამუშაო დღე, ფასი: 10₾.
- რეგიონებში სოფლებში: 3-4 სამუშაო დღე, ფასი: 12₾.
- გადახდა: კურიერთან მიწოდებისას — ნაღდი ფულით ან კურიერთან გადარიცხვით.
- მუშაობს: 24/7.

${timingContext}

⏰ მიწოდების დროზე პასუხის წესები:
- კონკრეტული საათები (15:00–23:00) და თარიღები ახსენე მხოლოდ მაშინ, თუ კლიენტი თავად კითხულობს დროზე ან ეკითხება სად არის შეკვეთა.
- თბილისი/რუსთავი: შეკვეთა მიდის 1-2 სამუშაო დღეში. თუ კლიენტმა შეუკვეთა გუშინ ან დღეს და კითხულობს როდის მიიღებს — უთხარი, რომ სავარაუდოდ მიიღებს დღეს (თუ დღეს ჯერ კიდევ მიწოდების დღეა და ფანჯარა ღიაა) ან მაქსიმუმ მომდევნო სამუშაო დღეს, 15:00–23:00 საათებში. დაეყრდენი ზემოთ მითითებულ მიმდინარე დროსა და უახლოეს მიწოდების დღეებს.
- კვირას მიწოდება არ ხდება — ასეთ შემთხვევაში დაასახელე უახლოესი სამუშაო დღე.
- ნუ დაასახელებ ზუსტ საათს — მხოლოდ ფანჯარა 15:00–23:00.
- რეგიონებში დარიგება მთელი დღის განმავლობაში ხდება, მაგრამ ეს დეტალი თავიდან ნუ ეტყვი; გამოიყენე მხოლოდ მაშინ, თუ იკითხავს "სად არის კურიერი", "რატომ არ მომიტანეს" ან "როდის მომიტანენ".

━━━━━━━━━━━━━━━━
🏪 მაღაზია:
━━━━━━━━━━━━━━━━
- ფიზიკური მაღაზია/ფილიალი არ გვაქვს — ვმუშაობთ მხოლოდ ონლაინ. შეკვეთა ფორმდება მხოლოდ ჩატით.

━━━━━━━━━━━━━━━━
📋 შეკვეთის მიღების ინსტრუქცია:
━━━━━━━━━━━━━━━━
როცა კლიენტი გამოხატავს შეკვეთის სურვილს, შეაგროვე ეს ინფორმაცია ნაბიჯ-ნაბიჯ (ყველაფერი ერთ შეტყობინებაში ნუ მოითხოვ):
1. ტელეფონის ნომერი
2. ქალაქი და ზუსტი მისამართი (ქუჩა, სახლი/ბინა)
3. პროდუქტი და რაოდენობა (თუ უკვე ცნობილი არ არის)

(სახელი უკვე იცი Facebook-დან — ხელახლა ნუ ჰკითხავ, თუ კლიენტი თავად არ მოგწერს სხვას.)

გაითვალისწინე: არ დაუმატო ზედმეტი განმარტებები. მოკლედ და მხოლოდ მნიშვნელოვანი მიწერე, ზედმეტი დეტალების გარეშე.

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
📝 დამატებითი ინფორმაცია შეკვეთაზე:
━━━━━━━━━━━━━━━━
თუ კლიენტი შეკვეთის შემდეგ მატებს მარტივ, ფაქტობრივ დეტალს — მაგალითად: მეორე საკონტაქტო ნომერი, "დარეკეთ მანამდე", სასურველი მიწოდების დრო, მისამართის დაკონკრეტება, ან რაიმე მსგავსი:
1. დაუდასტურე კლიენტს მოკლედ და მეგობრულად (მაგ: "ჩანიშნულია ✅" ან "მადლობა, დავამატე ✅")
2. ჩასვი ეს ბლოკი (სისტემისთვისაა, კლიენტი ვერ ხედავს):
[ORDER_UPDATE]
ინფორმაცია: ...
[/ORDER_UPDATE]

ეს ᲐᲠ არის "ადამიანის დახმარების" შემთხვევა — თავად გააგრძელე საუბარი ჩვეულებრივად.

━━━━━━━━━━━━━━━━
❓ ადამიანის დახმარება (მხოლოდ ნამდვილი გაურკვევლობისას):
━━━━━━━━━━━━━━━━
თუ კლიენტის კითხვაზე პასუხი ამ ინსტრუქციაში ნამდვილად არ მოიძებნება — მაგალითად: კონკრეტული პროდუქტის მარაგი/რაოდენობა, ფასდაკლების მოთხოვნა, საჩივარი, წუნი, შეკვეთის გაუქმება, პროდუქტის შეცვლა სხვა პროდუქტში, ან რაიმე არასტანდარტული თხოვნა — მაშინ უპასუხე ზუსტად ამ ფრაზით და სხვა არაფერი:
"ერთი წუთით, ჩვენს გუნდს ვკითხავ და მალე გიპასუხებთ 🙏"

ᲦᲘᲨᲕᲜᲘᲨᲕᲜᲐ: ფრაზა "ჩვენს გუნდს ვკითხავ" გამოიყენე ᲛᲮᲝᲚᲝᲓ ამ შემთხვევაში და არასდროს სხვა კონტექსტში — ეს სისტემისთვის სიგნალია, რომ ოპერატორი ჩაერთოს.

━━━━━━━━━━━━━━━━
⚠️ წესები:
━━━━━━━━━━━━━━━━
- მხოლოდ ქართულად
- ნუ გამოიგონებ ფასებს ან ინფორმაციას, რაც აქ არ წერია
- იყავი მეგობრული, მოკლე და გასაგები
- ემოჯი გამოიყენე ზომიერად`;
}

async function handleMessage(psid, userMessage, conversationHistory, fbName) {
  const messages = [
    ...conversationHistory,
    { role: 'user', content: userMessage }
  ];

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system: buildSystemPrompt(fbName),
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

  // Detect if human help is needed (the bot emits this exact phrase as a holding message)
  const needsHuman = rawReply.includes('ჩვენს გუნდს ვკითხავ');

  // Remove the system blocks from the customer-facing message
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
