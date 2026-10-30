import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
export default defineConfig({
  plugins: [react()],
  server: {port:1420,strictPort:true},
  build: {outDir:'dist-mobile',rollupOptions:{input:resolve(__dirname,'mobile.html')}},
});
