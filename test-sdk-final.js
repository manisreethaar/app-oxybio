import { streamText, tool, stepCountIs } from 'ai';
import { google } from '@ai-sdk/google';
import fs from 'fs';
import { z } from 'zod';

// Get the key correctly
const env = fs.readFileSync('.env.local', 'utf-8');
const match = env.match(/GOOGLE_GENERATIVE_AI_API_KEY="(.*)"/);
if (match) {
  process.env.GOOGLE_GENERATIVE_AI_API_KEY = match[1];
}

async function main() {
  try {
    const result = streamText({
      model: google('gemini-2.5-flash'),
      system: 'You are a test bot. Say hello.',
      messages: [{ role: 'user', content: 'hello' }],
      tools: {
        get_weather: tool({
          description: 'Get weather',
          parameters: z.object({ location: z.string() }),
          execute: async ({location}) => ({ temperature: 22 })
        })
      }
    });

    // Test DataStreamResponse parsing which is what we use in route.js now
    const response = result.toDataStreamResponse();
    console.log("Stream initiated successfully. Status code:", response.status);
    
    // Read the stream
    const reader = response.body.getReader();
    const dec = new TextDecoder();
    while(true) {
      const {value, done} = await reader.read();
      if(done) break;
      const chunk = dec.decode(value);
      console.log('STREAM CHUNK:', chunk.replace(/\n/g, '\\n'));
    }
    
    console.log("Stream successfully completed!");
  } catch (e) {
    console.log("Error:", e.message);
  }
}
main();
