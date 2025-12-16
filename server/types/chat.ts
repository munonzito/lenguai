// server/types/chat.ts
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  name?: string;
  tool_call_id?: string;
}

export interface VisualNovelResponse {
  text: string;
  suggested_responses: string[];
  audio_url?: string; // URL of the generated TTS
  image_url?: string; // URL if a scene change happened
  language_detected?: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
  audioBase64?: string; // Optional user voice input
  currentContext?: string; // Description of current scene/image
}
