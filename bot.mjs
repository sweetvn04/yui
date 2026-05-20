import { GoogleGenAI } from "@google/genai"
import { Zalo, ThreadType} from "zca-js"
import "dotenv/config"

// reading the env file
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = "gemma-4-26b-a4b-it"

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
      systemInstruction: isGroup ? "You are a helpful bot in a Zalo group chat. Just reply in 1-2 sentences"
      : "You are a helpful bo:workingt in a Zalo private chat, Just reply in 1-2 sentences",
    },
  });
  
  const text = response?.trim(); // check if respone is not null then delete the space on start and end of respone with trim()
  if(!text) throw new Error("Empty response from Gemini!") // if text is null, throw Error and exit
  return text.length > 2000 ? text.slice(0, 1500) + "(... Tu bi không tình yêu!)" : text; // check if the response is too long, it will keep from 0 to 1500 word and add ... in the end to avoid banned from Zalo.
}

// login to zalo
const zalo = new Zalo();
const api = await zalo.loginQR(); // the object api will handle all things after
// login via QR need a moment
