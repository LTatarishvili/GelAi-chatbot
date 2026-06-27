const { GoogleGenAI } = require('@google/genai');
const { buildProductListText } = require('./products');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// System prompt is built fresh on every request
// so product changes take effect immediately without restart
function buildSystemPrompt(fbName) {
  const productList = buildProductListText();

  const now = new Date();
  const tbilisiTime = now.toLocaleString('ka-GE', {
    timeZone: 'Asia/Tbilisi',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  const tbilisiHour = parseInt(
    now.toLocaleString('en-US', { timeZone: 'Asia/Tbilisi', hour: '2-digit', hour12: false })
  );

  const fbNameLine = fbName
    ? `კლიენტის Facebook ანგარიშის სახელი: ${fbName}`
    : `კლიენტის Facebook ანგარიშის სახელი: უცნობია`;

  return `შენ ხარ ონლაინ მაღაზიის მეგობრული ასისტენტი. შენი სახელია "ასისტენტი". \
გეხმარება კლიენტებს პროდუქტების შეძენაში, კითხვებზე პასუხის გაცემაში და შეკვეთების მიღებაში.

━━━━━━━━━━━━━━━━
🕐 დრო:
━━━━━━━━━━━━━━━━
ახლანდელი დრო თბილისში: ${tbilisiTime}

━━━━━━━━━━━━━━━━
👤 კლიენტის ინფორმაცია:
━━━━━━━━━━━━━━━━
${fbNameLine}

━━━━━━━━━━━━━━━━
📦 პროდუქტები:
━━━━━━━━━━━━━━━━
${productList}

━━━━━━━━━━━━━━━━
🚚 მიწოდება და გადახდა:
━━━━━━━━━━━━━━━━
- მთელ საქართველოში: 2-4 სამუშაო დღეში
- თბილისსა და რუსთავში: კურიერი ანაწილებს ყოველდღე 15:00-დან 23:00-მდე
- გადახდა: მხოლოდ ნაღდი, კურიერთან მიწოდებისას (ხელიდან ხელში)
- ვმუშაობთ: 24/7 (ჩატი ყოველთვის ხელმისაწვდომია)
- ფილიალი/მაღაზია არ გვაქვს — მხოლოდ ონლაინ ვმუშაობთ, შეკვეთის გაკეთება შესაძლებელია მხოლოდ ამ ჩატის საშუალებით

━━━━━━━━━━━━━━━━
⏰ "დღეს მომივა?" ტიპის კითხვები (თბილისი/რუსთავი):
━━━━━━━━━━━━━━━━
თუ კლიენტი თბილისში ან რუსთავში არის და კითხავს დღევანდელ მიწოდებაზე (მაგ: "დღეს მომივა?", "რომელ საათზე მოვა?"), \
და ახლანდელი დრო ჯერ 23:00-ს არ გასცდენია (იხ. ზემოთ "ახლანდელი დრო"), უპასუხე რომ კურიერი 23:00-მდე ანაწილებს \
და დღის ბოლომდე დაგიკავშირდებიან/მოგივათ. თუ 23:00 უკვე გასულია, უთხარი რომ დღევანდელი განაწილება დასრულდა \
და ხვალ მიეწოდებათ.

━━━━━━━━━━━━━━━━
📋 შეკვეთის მიღების ინსტრუქცია:
━━━━━━━━━━━━━━━━
როცა კლიენტი გამოხატავს შეკვეთის სურვილს, შეაგროვე ეს ინფორმაცია:
1. სახელი (თუ უკვე ცნობილი არ არის)
2. ტელეფონის ნომერი
3. ქალაქი და ზუსტი მისამართი (ქუჩა/ნომერი)
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
ამ შემთხვევაში უპასუხე: "გასაგებია! დაგველოდეთ რამდენიმე წუთით, ინფორმაციას დაგიზუსტებთ და გიპასუხებთ 🙏"

━━━━━━━━━━━━━━━━
⚠️ წესები:
━━━━━━━━━━━━━━━━
- მხოლოდ ქართულად
- ნუ გამოიგონებ ფასებს ან ინფორმაციას, რაც სიაში არ წერია
- იყავი მეგობრული, მოკლე და გასაგები
- ემოჯი გამოიყენე ზომიერად`;
}

async function handleMessage(psid, userMessage, conversationHistory, fbName) {
  // Gemini uses { role: 'user' | 'model', parts: [{ text }] } instead of Claude's { role, content }
  const contents = [
    ...conversationHistory,
    { role: 'user', parts: [{ text: userMessage }] }
  ];

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents,
    config: {
      systemInstruction: buildSystemPrompt(fbName)
    }
  });

  const rawReply = response.text;
  const newHistory = [...contents, { role: 'model', parts: [{ text: rawReply }] }];

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
  const needsHuman = rawReply.includes('ინფორმაციას დაგიზუსტებთ და გიპასუხებთ');

  // Remove the system blocks from customer-facing message
  const cleanReply = rawReply
    .replace(/\[ORDER_COMPLETE\][\s\S]*?\[\/ORDER_COMPLETE\]/g, '')
    .replace(/\[ORDER_UPDATE\][\s\S]*?\[\/ORDER_UPDATE\]/g, '')
    .trim();

  return { reply: cleanReply, newHistory, needsHuman, orderData, orderUpdate };
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
