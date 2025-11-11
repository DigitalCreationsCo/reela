import dotenv from "dotenv";
import {GoogleGenAI} from '@google/genai';

dotenv.config({ path: '.env.local' });

const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
console.log("API Key from .env.local:", apiKey);

if (!apiKey) {
  console.error("GOOGLE_GENERATIVE_AI_API_KEY is not set.");
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey });

async function run() {
  try {
    const prompt = "Write a short story about a magical cat.";
    const result = await ai.models.generateContent({
      model: "gemini-2.5-pro",
      contents: prompt,
    });
    const response = result.data;
    console.log("Generated content:", response);
  } catch (error) {
    console.error("Error calling Generative Language API:", error);
  }
}

run();