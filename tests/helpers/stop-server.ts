import type { FullConfig } from '@playwright/test';
export default async function stopServer(config: FullConfig) {
  const baseURL = config.projects[0].use.baseURL;
  if (baseURL !== 'http://127.0.0.1:4180') return;
  const token = String(config.metadata.testServerToken);
  const owner = await fetch(`${baseURL}/__test/owner`)
    .then((response) => response.text())
    .catch(() => '');
  if (owner === token)
    await fetch(`${baseURL}/__test/shutdown`, {
      method: 'POST',
      headers: { 'x-wfp-test-owner': token },
    }).catch(() => {});
}
