
import { Blob } from '@google/genai';

// --- Code importé de l'Appli A (Reference) ---

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

export async function decodeAudioData(
  base64String: string,
  audioContext: AudioContext
): Promise<AudioBuffer> {
  const arrayBuffer = base64ToArrayBuffer(base64String);
  
  // The Gemini API sends raw PCM 16-bit LE, 24kHz, 1 channel.
  const dataView = new DataView(arrayBuffer);
  // We divide by 2 because 16-bit = 2 bytes per sample
  const float32Array = new Float32Array(arrayBuffer.byteLength / 2);
  
  for (let i = 0; i < float32Array.length; i++) {
    // Force Little Endian reading (true) which is crucial for cross-platform compatibility
    const int16 = dataView.getInt16(i * 2, true); 
    float32Array[i] = int16 / 32768.0;
  }

  // Create the buffer at Gemini's native output rate (24kHz)
  const audioBuffer = audioContext.createBuffer(1, float32Array.length, 24000);
  audioBuffer.getChannelData(0).set(float32Array);
  
  return audioBuffer;
}

export function float32ToInt16(float32Array: Float32Array): Int16Array {
  const int16Array = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  return int16Array;
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

export function createPcmBlob(data: Float32Array): Blob {
  const int16Array = float32ToInt16(data);
  const base64 = arrayBufferToBase64(int16Array.buffer);
  return {
    data: base64,
    mimeType: 'audio/pcm;rate=16000', // Gemini expects 16kHz input
  };
}

// --- Fin du code de l'Appli A ---

// --- Utilitaire conservé pour l'Appli B (Nécessaire pour le micro mobile) ---
// Les navigateurs mobiles capturent souvent en 44.1/48kHz, on doit réduire à 16kHz pour Gemini.
export function downsampleBuffer(buffer: Float32Array, inputRate: number, targetRate: number): Float32Array {
  if (inputRate === targetRate) {
    return buffer;
  }
  if (inputRate < targetRate) {
    // Fallback: return as is if upsampling needed (shouldn't happen with std mics)
    return buffer;
  }
  
  const sampleRateRatio = inputRate / targetRate;
  const newLength = Math.floor(buffer.length / sampleRateRatio);
  const result = new Float32Array(newLength);
  
  for (let i = 0; i < newLength; i++) {
    const startOffset = Math.floor(i * sampleRateRatio);
    const endOffset = Math.floor((i + 1) * sampleRateRatio);
    
    let sum = 0;
    let count = 0;
    
    const finalOffset = Math.min(endOffset, buffer.length);
    
    for (let j = startOffset; j < finalOffset; j++) {
      sum += buffer[j];
      count++;
    }
    
    result[i] = count > 0 ? sum / count : buffer[startOffset];
  }
  
  return result;
}
