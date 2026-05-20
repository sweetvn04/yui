// bot.mjs
import { GoogleGenAI } from "@google/genai";
import { Zalo, ThreadType } from "zca-js";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";

if (!GEMINI_API_KEY) {
  console.error("Set GEMINI_API_KEY (get one at https://aistudio.google.com/apikey)");
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

async function replyWithGemini(userText, isGroup) {
  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: userText,
    config: {
      systemInstruction: isGroup
        ? "You are a helpful assistant in a Zalo group chat. Reply concisely in the same language the user used. Keep answers short unless they ask for detail."
        : "You are a helpful assistant in a Zalo private chat. Reply concisely in the same language the user used.",
    },
  });

  const text = response.text?.trim();
  if (!text) throw new Error("Empty response from Gemini");
  return text.length > 2000 ? text.slice(0, 1997) + "..." : text;
}

const zalo = new Zalo();
const api = await zalo.loginQR();

api.listener.on("message", (message) => {
  const isPlainText = typeof message.data.content === "string";
  if (message.isSelf || !isPlainText) return;

  const userText = message.data.content;
  const threadType = message.type;
  const isGroup = threadType === ThreadType.Group;

  void (async () => {
    try {
      const reply = await replyWithGemini(userText, isGroup);
      await api.sendMessage({ msg: reply }, message.threadId, threadType);
    } catch (err) {
      console.error("Gemini error:", err);
      await api
        .sendMessage(
          { msg: "Sorry, I couldn't reply right now. Please try again." },
          message.threadId,
          threadType
        )
        .catch((sendErr) => console.error("Send error:", sendErr));
    }
  })();
});

api.listener.start();
