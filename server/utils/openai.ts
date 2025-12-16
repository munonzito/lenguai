// server/utils/openai.ts
import { AzureOpenAI, OpenAI } from 'openai';

let openaiInstance: OpenAI | AzureOpenAI | null = null;

export const getOpenAI = () => {
  if (!openaiInstance) {
    // Check for Azure configuration first
    const azureKey = process.env.AZURE_OPENAI_API_KEY;
    const azureEndpoint = process.env.AZURE_OPENAI_ENDPOINT;
    // Audio modalities support requires API version 2025-01-01-preview or later
    const azureVersion = process.env.AZURE_OPENAI_API_VERSION || '2025-01-01-preview';

    if (azureKey && azureEndpoint) {
      console.log('Initializing Azure OpenAI client...');
      openaiInstance = new AzureOpenAI({
        apiKey: azureKey,
        endpoint: azureEndpoint,
        apiVersion: azureVersion,
        // Don't set default deployment - let each API call specify its own
      });
    } else {
      // Fallback to standard OpenAI
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new Error('Neither AZURE_OPENAI_API_KEY nor OPENAI_API_KEY is configured');
      }
      openaiInstance = new OpenAI({
        apiKey: apiKey,
      });
    }
  }
  return openaiInstance;
};
