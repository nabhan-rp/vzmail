import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';

/**
 * Keeps PHP source files stored as `*.php.txt` inside the repository (GitHub & AI Studio),
 * while automatically renaming `*.php.txt` -> `*.php` inside the production build output (`dist/`)
 * and serving `/<file>.php` cleanly from `public/<file>.php.txt` during local dev.
 */
function renamePhpTxtOnBuildPlugin(): Plugin {
  let outDirAbs = path.resolve(__dirname, 'dist');
  const publicDirAbs = path.resolve(__dirname, 'public');

  const renamePhpTxtRecursive = (dirPath: string) => {
    if (!fs.existsSync(dirPath)) return;
    for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        renamePhpTxtRecursive(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.php.txt')) {
        const renamedPath = fullPath.slice(0, -'.txt'.length);
        fs.renameSync(fullPath, renamedPath);
      }
    }
  };

  return {
    name: 'vz-rename-php-txt-on-build',
    configResolved(config) {
      outDirAbs = path.resolve(config.root, config.build.outDir);
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const rawUrl = (req.url || '').split('?')[0];
        if (!rawUrl.endsWith('.php')) {
          next();
          return;
        }
        const safeRelPath = rawUrl.replace(/^\/+/, '');
        const candidateAbs = path.resolve(publicDirAbs, `${safeRelPath}.txt`);
        if (
          !candidateAbs.startsWith(publicDirAbs + path.sep) ||
          !fs.existsSync(candidateAbs)
        ) {
          next();
          return;
        }
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Cache-Control', 'no-store');
        fs.createReadStream(candidateAbs).pipe(res);
      });
    },
    closeBundle() {
      renamePhpTxtRecursive(outDirAbs);
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), renamePhpTxtOnBuildPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      target: 'es2022',
      sourcemap: false,
      reportCompressedSize: true,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (
              id.includes('node_modules/react') ||
              id.includes('node_modules/react-dom')
            ) {
              return 'react-vendor';
            }
            if (id.includes('node_modules/@auth0')) {
              return 'auth0-vendor';
            }
            if (id.includes('node_modules/lucide-react')) {
              return 'icons-vendor';
            }
          },
        },
      },
    },
    server: {
      port: 5173,
      strictPort: true,
      // HMR can be disabled via DISABLE_HMR=true when needed.
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
