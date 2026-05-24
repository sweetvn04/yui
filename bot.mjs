import { GoogleGenAI } from "@google/genai"
import { Zalo, ThreadType} from "zca-js"
import "dotenv/config"
import fs from "node:fs"

// reading the env file
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = "gemma-4-26b-a4b-it"
const SESSION_FILE = "session.json";

// check apikey working?
if (!GEMINI_API_KEY) {
  console.error("APIKEY not working!");
  process.exit(1)
}

// create a gemini ai instance 
const ai = new GoogleGenAI({apiKey: GEMINI_API_KEY});

// function to ask gemini for a reply
async function replyFromGemini(userText, isGroup){
  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: userText,
    config: {
      systemInstruction: `M tên là Hoshino, hãy trả lời theo kiểu genz nhắn tin, ngắn gọn trong 1 câu,
        có thể viết tắt thoải mái. Không cần nói chuyện lịch sự trang trọng, trả lời như những người bạn thân nói chuyện với nhau thôi.
        nên ưu tiên dùng từ ngữ miền Tây Nam Bộ`
    },
  });
  
  const text = response.text?.trim(); // check if respone is not null then delete the space on start and end of respone with trim()
  if(!text) throw new Error("Empty response from Gemini!") // if text is null, throw Error and exit
  return text.length > 2000 ? text.slice(0, 1500) + "(... Tu bi không tình yêu!)" : text; // check if the response is too long, it will keep from 0 to 1500 word and add ... in the end to avoid banned from Zalo.
}

// login to zalo
const zalo = new Zalo();
let api;

if (fs.existsSync(SESSION_FILE)) {
  try {
    const session = JSON.parse(fs.readFileSync(SESSION_FILE, "utf-8"));
    console.log("Đang đăng nhập bằng session cũ...");
    api = await zalo.login(session);
    console.log("Đăng nhập thành công bằng session!");
  } catch (err) {
    console.error("Session hết hạn hoặc lỗi, yêu cầu quét QR mới:", err.message);
    api = await zalo.loginQR();
  }
} else {
  console.log("Chưa có session, vui lòng quét mã QR để đăng nhập.");
  api = await zalo.loginQR();
}

// Save session for next time
const ctx = api.getContext();
const sessionData = {
  imei: ctx.imei,
  cookie: ctx.cookie.serializeSync(),
  userAgent: ctx.userAgent,
};
fs.writeFileSync(SESSION_FILE, JSON.stringify(sessionData, null, 2));
console.log("Đã lưu session vào", SESSION_FILE);

// register an event handle when a message coming
// (message) => will run every time when a message arrive
api.listener.on("message", (message) => { // "message" is event when someone send message
  // only reply to text message from others
  const isPlainText = typeof message.data.content === "string";
  if (message.isSelf || !isPlainText) return;
  
  // create a variable check if the message comes from group or private chat
  const threadType = message.type;
  const isGroup = threadType === ThreadType.Group;

  const isMentioned = message.data.content.includes("@Hoshino");
  if (!isMentioned && isGroup) return;

  //prepare data fpr Gemini and for sending back
  const userText = message.data.content;

  // it's also sync right here so we cannot use await

  void (async () => { // create a async context for await function below. Void function say we ignore the return that is Promise of async function
    try {
      let reply = await replyFromGemini(userText, isGroup);
      let mentions = [];

      // If it's a group chat, add a clickable mention (@Name)
      if (isGroup) {
        const mentionName = `@${message.data.dName}`;
        mentions = [{
          pos: 0,
          uid: message.data.uidFrom,
          len: mentionName.length
        }];
        reply = `${mentionName} ${reply}`;
      }

      await api.sendMessage({ msg: reply, quote: message.data, mentions }, message.threadId, threadType);
    } catch (err) { // just say error if cannot send a message of gemini back to user
      // add console write the error to log
      console.error("Gemini error: ", err);
      await api.sendMessage(
        { msg: "Sorry, I couldn't reply right now. Please try again." },
        message.threadId,
        threadType
      );
    }
  })();
})

// start listening
api.listener.start();
