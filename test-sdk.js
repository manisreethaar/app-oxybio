import { streamText } from 'ai';
import { google } from '@ai-sdk/google';

async function main() {
  try {
    const result = streamText({
      model: google('gemini-2.5-flash'),
      messages: [
        { role: 'user', parts: [{ type: 'text', text: 'hi' }] }
      ]
    });
    console.log("No error!");
  } catch (e) {
    console.log("Error:", e.message);
  }
}
main();
