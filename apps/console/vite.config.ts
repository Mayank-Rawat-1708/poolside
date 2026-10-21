import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// `npm run dev` proxies to the compose stack the same way nginx does in
// production, including the admin token (read here, never bundled).
const adminToken = process.env.ADMIN_TOKEN ?? 'local-dev-admin-token';
const withAdmin = { Authorization: `Bearer ${adminToken}` };

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api/admin': { target: 'http://localhost:3000', rewrite: (p) => p.replace(/^\/api/, ''), headers: withAdmin },
      '/api': { target: 'http://localhost:3000', rewrite: (p) => p.replace(/^\/api/, '') },
      '/downstream/admin': { target: 'http://localhost:4001', rewrite: (p) => p.replace(/^\/downstream/, ''), headers: withAdmin },
      '/prom': { target: 'http://localhost:9090', rewrite: (p) => p.replace(/^\/prom/, '') },
    },
  },
});
