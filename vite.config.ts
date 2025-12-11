import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    // Cette ligne dit à Vite : "Si tu trouves 'process.env.API_KEY' dans le code, remplace-le par la valeur de VITE_API_KEY"
    'process.env.API_KEY': JSON.stringify(process.env.VITE_API_KEY || process.env.API_KEY),
    
    // Pareil pour le mot de passe professeur
    'process.env.TEACHER_PASSWORD': JSON.stringify(process.env.VITE_TEACHER_PASSWORD || process.env.TEACHER_PASSWORD),
  },
});
