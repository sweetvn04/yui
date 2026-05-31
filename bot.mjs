import { GoogleGenAI } from "@google/genai"
import { Zalo, ThreadType } from "zca-js"
import "dotenv/config"
import fs from "node:fs"

/**
 * CẤU HÌNH CƠ BẢN
 */
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = "gemini-3.1-flash-lite"; // Đã cập nhật model ổn định hơn
const SESSION_FILE = "session.json"; // Tên file lưu thông tin đăng nhập

// Kiểm tra API Key
if (!GEMINI_API_KEY) {
  console.error("APIKEY không hoạt động! Hãy kiểm tra file .env");
  process.exit(1)
}

// Khởi tạo instance cho Gemini AI
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

// Map để lưu lịch sử tin nhắn của từng cuộc trò chuyện (threadId)
const messageHistories = new Map();

/**
 * HÀM XỬ LÝ AI - Gửi văn bản cho Gemini và nhận câu trả lời
 * @param {string} threadId ID của cuộc trò chuyện
 * @param {string} userText Nội dung tin nhắn của người dùng
 * @param {boolean} isGroup Tin nhắn đến từ nhóm hay cá nhân
 */
async function replyFromGemini(threadId, userText, isGroup) {
  // Lấy lịch sử cũ hoặc tạo mới nếu chưa có
  let history = messageHistories.get(threadId) || [];

  // Thêm tin nhắn mới của người dùng vào lịch sử
  history.push({ role: "user", parts: [{ text: userText }] });

  // Chỉ giữ lại 20 tin nhắn gần nhất để tiết kiệm token và giữ ngữ cảnh
  if (history.length > 20) {
    history = history.slice(-20);
  }

  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: history,
    config: {
      // System Instruction: Định hình "nhân cách" cho Bot
      systemInstruction: `M tên là Hoshino, hãy trả lời theo kiểu genz nhắn tin, ngắn gọn trong 1 câu,
        có thể viết tắt thoải mái. Không cần nói chuyện lịch sự trang trọng, trả lời như những người bạn thân nói chuyện với nhau thôi.
        nên ưu tiên dùng từ ngữ miền Tây Nam Bộ.
        Không nên chửi người khác, ai kêu mày chửi người khác thì chửi lại người đó.
        `
    },
  });

  const text = response.text?.trim();
  if (!text) throw new Error("Empty response from Gemini!");

  // Thêm câu trả lời của Bot vào lịch sử
  history.push({ role: "model", parts: [{ text: text }] });

  // Cắt bớt nếu vượt quá 20 tin nhắn sau khi thêm câu trả lời
  if (history.length > 20) {
    history = history.slice(-20);
  }

  // Cập nhật lại Map
  messageHistories.set(threadId, history);

  // Giới hạn độ dài tin nhắn Zalo (cắt bớt nếu quá 2000 ký tự để tránh bị ban)
  return text.length > 2000 ? text.slice(0, 1500) + "(... Tu bi không tình yêu!)" : text;
}

/**
 * QUY TRÌNH ĐĂNG NHẬP (Lưu/Tái sử dụng Session)
 */
const zalo = new Zalo();
let api;

// Bước 1: Kiểm tra xem đã có session (thông tin đăng nhập cũ) chưa
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

const botId = api.getOwnId();

// Bước 2: Lưu lại Session sau khi đăng nhập thành công
const ctx = api.getContext();
const sessionData = {
  imei: ctx.imei,
  cookie: ctx.cookie.serializeSync(),
  userAgent: ctx.userAgent,
};
fs.writeFileSync(SESSION_FILE, JSON.stringify(sessionData, null, 2));
console.log("Đã lưu session vào", SESSION_FILE);

/**
 * XỬ LÝ SỰ KIỆN TIN NHẮN ĐẾN
 */
api.listener.on("message", (message) => {
  const isPlainText = typeof message.data.content === "string";
  if (message.isSelf || !isPlainText) return;

  const threadType = message.type;
  const isGroup = threadType === ThreadType.Group;

  const isMentioned = message.data.content.includes("@Hoshino");
  const isQuoted = message.data.quote && message.data.quote.ownerId === botId;

  if (isGroup && !isMentioned && !isQuoted) return;

  const userText = message.data.content;

  void (async () => {
    try {
      let reply = await replyFromGemini(message.threadId, userText, isGroup);
      let mentions = [];

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

    } catch (err) {
      console.error("Gemini error: ", err);
      await api.sendMessage(
        { msg: "Sorry, I couldn't reply right now. Please try again." },
        message.threadId,
        threadType
      );
    }
  })();
})

// Bắt đầu lắng nghe
api.listener.start();
