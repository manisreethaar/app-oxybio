import { streamText } from 'ai';
import { google } from '@ai-sdk/google';
import fs from 'fs';

// Read api key from .env.local
const env = fs.readFileSync('.env.local', 'utf-8');
const match = env.match(/GOOGLE_GENERATIVE_AI_API_KEY=(.*)/);
if (match) {
  process.env.GOOGLE_GENERATIVE_AI_API_KEY = match[1].trim();
}

async function main() {
  try {
    const res = streamText({
      model: google('gemini-2.5-flash'),
      messages: [{ role: 'user', content: 'hello' }]
    });
    
    const responseObj = res.toUIMessageStreamResponse();
    const reader = responseObj.body.getReader();
    const dec = new TextDecoder();
    while(true) {
      const {value, done} = await reader.read();
      if(done) break;
      console.log('CHUNK:', dec.decode(value));
    }
  } catch (e) {
    console.log("Error:", e.message);
  }
}
main();
