import { GoogleGenAI } from "@google/genai"
import { Zalo, ThreadType } from "zca-js"
import "dotenv/config"
import fs from "node:fs"

/**
 * CẤU HÌNH CƠ BẢN
 */
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = "gemini-3.1-flash-lite";
const SESSION_FILE = "session.json"; // Tên file lưu thông tin đăng nhập

// Kiểm tra API Key
if (!GEMINI_API_KEY) {
  console.error("APIKEY không hoạt động! Hãy kiểm tra file .env");
  process.exit(1)
}

// Khởi tạo instance cho Gemini AI
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

/**
 * HÀM XỬ LÝ AI - Gửi văn bản cho Gemini và nhận câu trả lời
 * @param {string} userText Nội dung tin nhắn của người dùng
 * @param {boolean} isGroup Tin nhắn đến từ nhóm hay cá nhân
 */
async function replyFromGemini(userText, isGroup) {
  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: userText,
    config: {
      // System Instruction: Định hình "nhân cách" cho Bot
      systemInstruction: `M tên là Hoshino, hãy trả lời theo kiểu genz nhắn tin, ngắn gọn trong 1 câu,
        có thể viết tắt thoải mái. Không cần nói chuyện lịch sự trang trọng, trả lời như những người bạn thân nói chuyện với nhau thôi.
        nên ưu tiên dùng từ ngữ miền Tây Nam Bộ`
    },
  });

  const text = response.text?.trim();
  if (!text) throw new Error("Empty response from Gemini!");

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
    // Đăng nhập bằng Cookies và IMEI đã lưu
    api = await zalo.login(session);
    console.log("Đăng nhập thành công bằng session!");
  } catch (err) {
    // Nếu session hết hạn, yêu cầu quét QR lại
    console.error("Session hết hạn hoặc lỗi, yêu cầu quét QR mới:", err.message);
    api = await zalo.loginQR();
  }
} else {
  // Nếu chưa bao giờ đăng nhập, hiện mã QR
  console.log("Chưa có session, vui lòng quét mã QR để đăng nhập.");
  api = await zalo.loginQR();
}

// Lấy ID của chính con bot (dùng để kiểm tra khi có người quote tin nhắn của bot)
const botId = api.getOwnId();

// Bước 2: Lưu lại Session sau khi đăng nhập thành công để lần sau không cần quét QR
const ctx = api.getContext();
const sessionData = {
  imei: ctx.imei,
  cookie: ctx.cookie.serializeSync(), // Serialize cookie jar thành chuỗi để lưu vào file
  userAgent: ctx.userAgent,
};
fs.writeFileSync(SESSION_FILE, JSON.stringify(sessionData, null, 2));
console.log("Đã lưu session vào", SESSION_FILE);

/**
 * XỬ LÝ SỰ KIỆN TIN NHẮN ĐẾN
 */
api.listener.on("message", (message) => {
  // Lọc tin nhắn: Chỉ trả lời tin nhắn văn bản và KHÔNG trả lời tin nhắn của chính mình
  const isPlainText = typeof message.data.content === "string";
  if (message.isSelf || !isPlainText) return;

  const threadType = message.type;
  const isGroup = threadType === ThreadType.Group;

  // ĐIỀU KIỆN TRẢ LỜI TRONG GROUP:
  // 1. Có nhắc tên bot (@Hoshino)
  // 2. Hoặc người dùng đang "Trả lời" (Quote) một tin nhắn của bot
  const isMentioned = message.data.content.includes("@Hoshino");
  const isQuoted = message.data.quote && message.data.quote.ownerId === botId;

  // Nếu trong Group mà không được tag hoặc không được quote thì bỏ qua
  if (isGroup && !isMentioned && !isQuoted) return;

  const userText = message.data.content;

  // Xử lý bất đồng bộ (Async) trong Event Listener
  void (async () => {
    try {
      let reply = await replyFromGemini(userText, isGroup);
      let mentions = [];

      /**
       * XỬ LÝ TAG (MENTION) TRONG GROUP
       */
      if (isGroup) {
        const mentionName = `@${message.data.dName}`;
        // Cấu hình metadata cho mention để Zalo hiện màu xanh và có thể click được
        mentions = [{
          pos: 0, // Vị trí bắt đầu tag (đầu câu)
          uid: message.data.uidFrom, // ID người được tag
          len: mentionName.length // Độ dài của chuỗi tag
        }];
        // Thêm tên vào đầu câu trả lời
        reply = `${mentionName} ${reply}`;
      }

      /**
       * GỬI TIN NHẮN PHẢN HỒI
       * - quote: message.data -> Trích dẫn lại tin nhắn của người dùng
       * - mentions -> Dữ liệu để tag tên người dùng
       */
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

// Bắt đầu lắng nghe các sự kiện từ Zalo
api.listener.start();
