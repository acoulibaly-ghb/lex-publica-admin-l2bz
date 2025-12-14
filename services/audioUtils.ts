/**
 * Convertit un Buffer Audio (ArrayBuffer ou SharedArrayBuffer) en chaîne Base64.
 * CORRECTION CRITIQUE VERCEL : Utilisation de "ArrayBufferLike" pour accepter
 * tous les types de buffers mémoire sans erreur de compilation.
 */
export function arrayBufferToBase64(buffer: ArrayBufferLike): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

/**
 * Convertit des données audio brutes (Float32 du micro) en PCM 16-bit.
 * Format attendu par l'API Gemini.
 */
export function floatTo16BitPCM(input: Float32Array): ArrayBufferLike {
  const output = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    // Clamp des valeurs entre -1 et 1 pour éviter la saturation audio
    const s = Math.max(-1, Math.min(1, input[i]));
    // Conversion en entier 16 bits signé
    output[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  return output.buffer;
}

/**
 * Réduit la fréquence d'échantillonnage (Downsampling).
 * Indispensable pour Mobile (44.1/48kHz) vers Gemini (16kHz).
 */
export function downsampleBuffer(buffer: Float32Array, inputRate: number, targetRate: number): Float32Array {
  if (inputRate === targetRate) {
    return buffer;
  }
  if (inputRate < targetRate) {
    // Pas d'upsampling nécessaire, on renvoie tel quel
    return buffer;
  }
  
  const sampleRateRatio = inputRate / targetRate;
  const newLength = Math.floor(buffer.length / sampleRateRatio);
  const result = new Float32Array(newLength);
  
  let offsetResult = 0;
  let offsetBuffer = 0;

  while (offsetResult < result.length) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
    
    // Moyenne simple pour éviter le crénelage (aliasing)
    let accum = 0;
    let count = 0;
    
    for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
      accum += buffer[i];
      count++;
    }
    
    result[offsetResult] = count > 0 ? accum / count : 0;
    offsetResult++;
    offsetBuffer = nextOffsetBuffer;
  }
  
  return result;
}
