// server/utils/tools.ts
import { getReplicate } from './replicate';
import { getOpenAI } from './openai';

export const TOOLS = [
  {
    type: "function",
    function: {
      name: "generate_scene",
      description: "Generates a visual background image for the scene. Use this when: starting a conversation, the user requests or describes a location/scene, or the story moves to a new setting. Creates an immersive visual novel experience.",
      parameters: {
        type: "object",
        properties: {
          prompt: {
            type: "string",
            description: "A highly descriptive, vivid visual prompt for the image. Include: location type, time of day, lighting, atmosphere, key visual elements, colors, and style details. Example: 'Sunny beach in Miami, turquoise water, white sand, palm trees, late afternoon golden light, people relaxing'"
          }
        },
        required: ["prompt"]
      }
    }
  }
];

export async function generateSceneImage(prompt: string): Promise<string | null> {
  try {
    console.log('[IMAGE GEN] Starting generation');
    const replicate = getReplicate();

    const output = await replicate.run("prunaai/z-image-turbo", {
      input: {
        prompt: `${prompt}`,
        num_inference_steps: 8,
        guidance_scale: 0
      }
    });

    // Consume iterator to wait for file upload
    if (output && typeof output === 'object' && Symbol.asyncIterator in output) {
      for await (const _chunk of output as any) { }

      if ('url' in output && typeof (output as any).url === 'function') {
        const urlObj = (output as any).url();
        const urlString = typeof urlObj === 'string' ? urlObj : urlObj.href || String(urlObj);
        console.log('[IMAGE GEN] ✅ Generated:', urlString);
        return urlString;
      }
    }

    console.log('[IMAGE GEN] ⚠️ Unexpected output format');
    return null;
  } catch (error) {
    console.error('[IMAGE GEN] ❌ Error:', error);
    return null;
  }
}

// Voice mapping for Azure OpenAI gpt-audio
const VOICE_MAP: Record<string, string> = {
  'en': 'alloy',
  'es': 'echo',
  'pt': 'shimmer',
  'fr': 'alloy',
  'zh': 'echo',
  'th': 'shimmer',
};

/**
 * Generate speech using Azure OpenAI gpt-audio via Chat Completions
 * The gpt-audio model uses chat completions with audio modalities
 */
export async function generateSpeech(text: string, languageCode: string = 'en'): Promise<string | null> {
  try {
    console.log('[TTS] Generating speech with gpt-audio chat completions');
    const openai = getOpenAI();
    
    const voice = VOICE_MAP[languageCode] || 'alloy';
    const audioModel = process.env.AZURE_OPENAI_AUDIO_DEPLOYMENT || 'gpt-audio';

    console.log('[TTS] Using model:', audioModel, 'with voice:', voice);

    // Use chat completions with audio modality for gpt-audio
    const response = await openai.chat.completions.create({
      model: audioModel,
      modalities: ['text', 'audio'],
      audio: { 
        voice: voice as any, 
        format: 'mp3' 
      },
      max_completion_tokens: 32000,
      messages: [
        {
          role: 'system',
          content: 'You are a text-to-speech system. Your ONLY job is to repeat the exact text provided by the user. Do not add, modify, or interpret the text in any way. Just read it exactly as written.'
        },
        {
          role: 'user',
          content: `Please read the following text exactly as written:\n\n${text}`
        }
      ]
    } as any); // Cast to any to bypass TypeScript validation

    console.log('[TTS] Response received, checking for audio data...');

    // Extract base64 audio data from response
    if (response.choices?.[0]?.message?.audio?.data) {
      const base64Audio = (response.choices[0].message as any).audio.data;
      const audioUrl = `data:audio/mp3;base64,${base64Audio}`;
      console.log('[TTS] ✅ Generated with audio data');
      return audioUrl;
    }

    console.log('[TTS] ⚠️ No audio data in response, got:', JSON.stringify(response.choices?.[0]?.message).substring(0, 200));
    return null;
  } catch (error: any) {
    console.error('[TTS] ❌ Error:', error?.message || error);
    console.error('[TTS] Full error:', JSON.stringify(error, null, 2));
    return null;
  }
}

/* 
 * LEGACY: Minimax TTS implementation (kept for reference)
 * Uncomment and replace the function above if you want to use Minimax instead
 * 
// Map ISO 639-1 language codes to Minimax language_boost values
const LANGUAGE_BOOST_MAP: Record<string, string> = {
  'en': 'English',
  'es': 'Spanish',
  'fr': 'French',
  'pt': 'Portuguese',
  'zh': 'Chinese',
  'th': 'Thai',
};

export async function generateSpeech(text: string, languageCode: string = 'en', emotion: string = 'auto'): Promise<string | null> {
  try {
    const languageBoost = LANGUAGE_BOOST_MAP[languageCode] || 'English';
    console.log('[TTS] Generating speech:', languageBoost);

    const replicate = getReplicate();

    const output = await replicate.run("minimax/speech-02-turbo", {
      input: {
        text,
        emotion,
        voice_id: 'Deep_Voice_Man',
        language_boost: languageBoost,
        english_normalization: languageBoost === 'English'
      }
    });

    // Consume iterator and get URL
    if (output && typeof output === 'object' && Symbol.asyncIterator in output) {
      for await (const _chunk of output as any) { }

      if ('url' in output && typeof (output as any).url === 'function') {
        const urlObj = (output as any).url();
        const urlString = typeof urlObj === 'string' ? urlObj : urlObj.href || String(urlObj);
        console.log('[TTS] ✅ Generated');
        return urlString;
      }
    }

    return null;
  } catch (error) {
    console.error('[TTS] ❌ Error:', error);
    return null;
  }
}
*/

export async function transcribeAudio(audioUrl: string): Promise<string | null> {
  try {
    console.log('[STT] Transcribing audio');
    const replicate = getReplicate();

    const output = await replicate.run(
      "vaibhavs10/incredibly-fast-whisper:3ab86df6c8f54c11309d4d1f930ac292bad43ace52d10c80d87eb258b3c9f79c",
      {
        input: {
          audio: audioUrl,
          task: "transcribe",
          batch_size: 64
        }
      }
    );

    if (output && typeof output === 'object' && 'text' in output) {
      const transcription = (output as any).text.trim();
      console.log('[STT] ✅ Transcribed');
      return transcription;
    }
    return null;
  } catch (error) {
    console.error('[STT] ❌ Error:', error);
    return null;
  }
}
