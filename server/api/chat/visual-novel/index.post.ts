// server/api/chat/visual-novel/index.post.ts
import { getOpenAI } from '../../../utils/openai';
import { TOOLS, generateSceneImage, generateSpeech, transcribeAudio } from '../../../utils/tools';
import { ChatMessage, VisualNovelResponse } from '../../../types/chat';
import { z } from 'zod';

const SYSTEM_PROMPT = `You are a Language Tutor AI acting as a Travel Companion in an immersive visual novel.
Your Goal: Teach the user their target language through an engaging, evolving story.

Core Persona:
- You are NOT just a chatbot; you are a character in the story (a local guide, a friend, or a fellow traveler).
- Be warm, encouraging, and expressive.
- Drive the narrative forward. Don't just answer; ask questions about the scene or the user's preferences to trigger the next plot point.

Pedagogical Strategy (Input Hypothesis):
- Assess the user's language level (Beginner/Intermediate/Advanced) based on their first few messages.
- ADAPT your vocabulary and grammar to be slightly above their level (i+1).
- Correction Policy: Do NOT explicitly say "You made a mistake." Instead, naturally RECAST their sentence correctly in your response.
  * Bad: "You said 'I goed', but it is 'went'."
  * Good: "Oh, you *went* to the market yesterday? That sounds fun!"

Scene Management & Tools:
- You have access to a 'generate_scene' tool.
- You MUST use this tool whenever the location changes or a new scene is established.
- Image prompts must be atmospheric and consistent with the story (e.g., "A cozy rainy cafe in Paris, warm lighting, croissant on table").

Output Format (CRITICAL):
Your response MUST be a valid JSON object with three fields:
1. "response": Your character's dialogue (PLAIN TEXT ONLY). Keep it conversational. Max 2-3 sentences.
2. "suggested_responses": Array of exactly 3 short practice phrases in the target language.
   - Option 1: A direct answer or action.
   - Option 2: A follow-up question.
   - Option 3: A surprising or creative choice.
3. "language_code": ISO 639-1 code matching the user's language.

Text Formatting Rules:
- Use PLAIN TEXT ONLY - no emojis, no markdown, no asterisks.
- Punctuation and accented characters are allowed.

Language Rules:
- ALWAYS respond in the SAME language as the user's most recent message.
- If the user switches language, switch with them, but try to maintain the immersion of the target language practice if possible.

Examples of Correct Output:

User: "Hola, quiero un café."
{
  "response": "¡Excelente elección! Este café es famoso por su espresso. ¿Te gustaría pedir algo para comer también?",
  "suggested_responses": [
    "Sí, un croissant, por favor.",
    "No, solo café.",
    "¿Qué me recomiendas?"
  ],
  "language_code": "es"
}
`;

// Schema for structured output
const ResponseSchema = z.object({
  response: z.string().describe("The text response to the user in the SAME language as their input."),
  suggested_responses: z.array(z.string()).describe("Exactly 3 short suggested replies in the SAME language as the user's input."),
  language_code: z.string().describe("The ISO 639-1 language code matching the user's input language. Examples: 'en' for English, 'es' for Spanish, 'pt' for Portuguese, 'fr' for French, 'zh' for Chinese, 'th' for Thai.")
});

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  let { messages, audioUrl } = body;
  
  if (!messages) {
    throw createError({ statusCode: 400, message: "Messages are required" });
  }

  // Set up SSE headers
  setResponseHeaders(event, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
  });

  const sendEvent = (eventType: string, data: any) => {
      const message = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
      console.log(`[SSE] Sending event: ${eventType}`, JSON.stringify(data).substring(0, 100));
      if (!event.node.res.writableEnded) {
          event.node.res.write(message);
          // Flush is not needed in modern Node.js for SSE, but doesn't hurt
          if (typeof (event.node.res as any).flush === 'function') {
              (event.node.res as any).flush();
          }
      }
  };

  try {

  // 1. Handle Audio Input (Transcription)
  let userTranscription: string | undefined;

  if (audioUrl) {
      // Send transcription status
      sendEvent('status', { type: 'transcribing', message: '👂 Listening...' });
      
      // If the frontend sends a URL (e.g. from a blob storage or replicate upload), transribe it.
      // NOTE: If frontend sends raw base64, we'd need to upload it somewhere first or use an API that accepts base64.
      // Assuming for now the frontend handles the upload and sends a public URL, 
      // OR we interpret this as a future integration point.
      // For this implementation, let's assume 'audioUrl' is passed.
      
      const transcription = await transcribeAudio(audioUrl);
      if (transcription) {
          userTranscription = transcription;
          messages.push({ role: 'user', content: transcription });
      }
  }

  const openai = getOpenAI();
  // Using manual tool loop instead of runTools to ensure compatibility with Azure and JSON output

  const modelName = process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-5.1';
  const completionParams = {
      model: modelName,
      messages: [
          { 
            role: 'system', 
            content: SYSTEM_PROMPT + "\n\nREMINDER: Your response must be valid JSON with these exact fields:\n- response (string): Your reply in plain text, no emojis or special characters\n- suggested_responses (array): Exactly 3 strings in the user's language\n- language_code (string): ISO 639-1 code matching the user's input language" 
          },
          ...messages
      ],
      tools: TOOLS as any,
      response_format: { type: "json_object" } // Enforce JSON
  };

  // We need to handle tool calls manually because we want `response_format: json_object` 
  // AND we want to support tools. 
  // WARNING: `json_object` mode requires the word "JSON" in the prompt (added above).
  
  let currentMessages = [...completionParams.messages];
  let turnCount = 0;
  let finalResponseJSON: any = null;
  let generatedImageUrl: string | null = null;

  // Send thinking status
  sendEvent('status', { type: 'thinking', message: '🤔 Thinking...' });

  while (turnCount < 5) {
      const response = await openai.chat.completions.create({
          ...completionParams,
          messages: currentMessages as any
      });
      
      const message = response.choices[0].message;
      
      // If tool calls
      if (message.tool_calls && message.tool_calls.length > 0) {
          currentMessages.push(message);
          
          for (const toolCall of message.tool_calls) {
              if (toolCall.function.name === 'generate_scene') {
                  // Send scene generation status
                  sendEvent('status', { type: 'generating_scene', message: '🎨 Painting scene...' });
                  
                  const args = JSON.parse(toolCall.function.arguments);
                  const imageUrl = await generateSceneImage(args.prompt);
                  generatedImageUrl = imageUrl;
                  
                  // Send image immediately when ready (progressive feedback)
                  if (imageUrl) {
                      sendEvent('image', { image_url: imageUrl });
                  }
                  
                  currentMessages.push({
                      role: 'tool',
                      tool_call_id: toolCall.id,
                      content: JSON.stringify({ success: true, image_url: imageUrl })
                  });
              }
          }
          turnCount++;
          // Reset status to thinking after tool execution
          sendEvent('status', { type: 'thinking', message: '🤔 Thinking...' });
      } else {
          // Final text response
          try {
              if (message.content) {
                  finalResponseJSON = JSON.parse(message.content);
              }
          } catch (e) {
              // Fallback if model fails to output JSON despite instructions
              console.error("Failed to parse JSON response:", e);
              finalResponseJSON = { 
                  response: message.content || "", 
                  suggested_responses: [], 
                  language_code: "en" 
              };
          }
          break; 
      }
  }

  if (!finalResponseJSON) {
      throw createError({ statusCode: 500, message: "Failed to generate valid response" });
  }

  // Send text response immediately (progressive feedback)
  sendEvent('text', {
      text: finalResponseJSON.response,
      language_detected: finalResponseJSON.language_code,
      user_transcription: userTranscription
  });

  // 3. Generate Speech for the textual response
  let audioOutputUrl: string | null = null;
  if (finalResponseJSON.response) {
      // Send speech generation status
      sendEvent('status', { type: 'generating_audio', message: '🗣️ Speaking...' });
      audioOutputUrl = await generateSpeech(finalResponseJSON.response, finalResponseJSON.language_code || 'en');
  }

  // Send audio when ready (progressive feedback)
  if (audioOutputUrl) {
      sendEvent('audio', {
          audio_url: audioOutputUrl,
          suggested_responses: finalResponseJSON.suggested_responses
      });
  } else {
      // If no audio, still send suggested responses
      sendEvent('audio', {
          suggested_responses: finalResponseJSON.suggested_responses
      });
  }
  
  // Send done event (consistent with preuai.com pattern)
  sendEvent('done', { success: true });
  
  } catch (error: any) {
      console.error('Error in visual novel chat streaming:', error);
      sendEvent('error', {
          message: 'Error processing message',
          details: error.message
      });
  } finally {
      // End stream
      event.node.res.end();
  }
});
