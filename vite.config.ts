import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { viteSingleFile } from 'vite-plugin-singlefile';

// SINGLE=1 produces one self-contained index.html (worker inlined) for publishing.
const single = process.env.SINGLE === '1';

// `npm run phone` serves over HTTPS on your Wi-Fi so a phone can open it.
// HTTPS matters: password hashing (Web Crypto) only works on secure pages.
export default defineConfig(({ mode }) => ({
  plugins: [react(), ...(single ? [viteSingleFile()] : []), ...(mode === 'phone' ? [basicSsl()] : [])],
  server: { host: mode === 'phone' ? true : undefined },
  worker: { format: 'es' },
  build: { target: 'es2020', chunkSizeWarningLimit: 4000 },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
}) as never);
