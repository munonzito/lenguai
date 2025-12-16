// server/utils/replicate.ts
import Replicate from 'replicate';

let replicateInstance: Replicate | null = null;

export const getReplicate = () => {
  if (!replicateInstance) {
    const token = process.env.REPLICATE_API_TOKEN;
    if (!token) {
      throw new Error('REPLICATE_API_TOKEN is not configured');
    }
    replicateInstance = new Replicate({
      auth: token,
    });
  }
  return replicateInstance;
};
