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
      : "You are a helpful bot in a Zalo private chat, Just reply in 1-2 sentences",
    },
  });
  
  const text = response.text?.trim(); // check if respone is not null then delete the space on start and end of respone with trim()
  if(!text) throw new Error("Empty response from Gemini!") // if text is null, throw Error and exit
  return text.length > 2000 ? text.slice(0, 1500) + "(... Tu bi không tình yêu!)" : text; // check if the response is too long, it will keep from 0 to 1500 word and add ... in the end to avoid banned from Zalo.
}

// login to zalo
const zalo = new Zalo();
const api = await zalo.loginQR(); // the object api will handle all things after

// register an event handle when a message coming
// (message) => will run every time when a message arrive
api.listener.on("message", (message) => { // "message" is event when someone send message
  // only reply to text message from others
  const isPlainText = typeof message.data.content === "string";
  if (message.isSelf || !isPlainText) return;

  //prepare data fpr Gemini and for sending back
  const userText = message.data.content;
  const threadType = message.type;
  const isGroup = threadType === ThreadType.Group;
  
  void (async () => {
    try {
      const reply = await replyFromGemini(userText, isGroup);
      await api.sendMessage({msg: reply}, message.threadId, threadType);
    } catch (err) {
      // add console write the error to log
      console.error("Gemini error: ", err);
      await api.sendMessage(
        { msg: "Sorry, I couldn't reply right now. Please try again."},
        message.threadId,
        ThreadType
      );
    }
  })();
})

// start listening
api.listener.start();

