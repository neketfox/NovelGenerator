/**
 * Cover art via Gemini's image-output model (gemini-2.5-flash-image). This needs the newer
 * @google/genai SDK: the deprecated @google/generative-ai (used everywhere else in this repo)
 * has no responseModalities option and predates image-output models, so it cannot return an
 * image from generateContent at all. withApiKeyRotation still supplies the rotating key —
 * only the SDK constructing the client differs.
 */
import { GoogleGenAI } from '@google/genai';
import { withApiKeyRotation, GEMINI_REQUEST_OPTIONS } from '../../services/geminiKeyPool';

const IMAGE_MODEL = 'gemini-2.5-flash-image';

/** Returns a data: URL (base64 inline image) suitable for <img src> and for coverHistory. */
export async function generateCoverImage(prompt: string): Promise<string> {
  return withApiKeyRotation(async (apiKey) => {
    const client = new GoogleGenAI({ apiKey, httpOptions: GEMINI_REQUEST_OPTIONS });
    const result = await client.models.generateContent({
      model: IMAGE_MODEL,
      contents: `Book cover illustration, no text or typography, portrait aspect ratio: ${prompt}`,
      config: { responseModalities: ['IMAGE'] },
    });
    const parts = result.candidates?.[0]?.content?.parts ?? [];
    const imagePart = parts.find((p): p is { inlineData: { data: string; mimeType: string } } => !!p.inlineData);
    if (!imagePart?.inlineData?.data) throw new Error('Gemini did not return an image for this prompt.');
    return `data:${imagePart.inlineData.mimeType ?? 'image/png'};base64,${imagePart.inlineData.data}`;
  });
}
