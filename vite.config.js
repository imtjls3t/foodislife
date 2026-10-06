import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import basicSsl from '@vitejs/plugin-basic-ssl';

const appVersion = Date.now().toString(36);

// Emits version.json so a running app can tell when a newer build has been deployed.
function versionFile() {
  return {
    name: 'version-file',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({ version: appVersion }),
      });
    },
  };
}

export default defineConfig({
  plugins: [svelte(), basicSsl(), versionFile()],
  base: '/foodislife/',
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  server: {
    allowedHosts: ['sandbox.orb.local'],
  },
});
