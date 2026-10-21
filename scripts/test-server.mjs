// Dedicated Vite server: no predev hook or writes to public/ or the user's maps.
import { createServer } from 'vite';
import { statSync } from 'node:fs';
import { resolve } from 'node:path';
const port = 4180;
const endurance = process.env.WFP_TEST_ENDURANCE === '1';
const file = resolve(`tests/fixtures/player/${endurance ? 'endurance' : 'demo'}.mp4`);
process.env.WFP_TEST_MEDIA = file;
const metadata = {
  available: true,
  fileName: 'demo.mp4',
  size: statSync(file).size,
  lastModified: 0,
  durationMs: endurance ? 267000 : 60000,
  url: '/demo.mp4',
};
const server = await createServer({
  server: { host: '127.0.0.1', port, strictPort: true },
  plugins: [
    {
      name: 'isolated-test-media',
      configureServer(instance) {
        instance.middlewares.use((req, res, next) => {
          if (req.url === '/__test/owner') {
            res.end(process.env.WFP_TEST_TOKEN);
            return;
          }
          if (req.url === '/__test/shutdown' && req.method === 'POST') {
            if (req.headers['x-wfp-test-owner'] !== process.env.WFP_TEST_TOKEN) {
              res.statusCode = 403;
              res.end();
              return;
            }
            res.end('closing');
            setTimeout(() => void instance.close().then(() => process.exit(0)), 20);
            return;
          }
          if (req.url?.split('?')[0] === '/demo-media.json') {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(metadata));
            return;
          }
          // Vite serves byte ranges and MIME type for the fixed local MP4.
          if (req.url?.split('?')[0] === '/demo.mp4')
            req.url = '/@fs/' + file.replaceAll('\\', '/');
          next();
        });
      },
    },
  ],
});
await server.listen();
console.log(`Isolated test server: http://127.0.0.1:${port}`);
