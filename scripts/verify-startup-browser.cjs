// Deterministically hold the native launch callback to exercise slow startup.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      window.androidBridge = {};
      window.Capacitor = {
        PluginHeaders: [{ name: 'App', methods: [
          { name: 'getLaunchUrl', rtype: 'promise' },
          { name: 'addListener' }, { name: 'removeListener', rtype: 'promise' }
        ] }],
        nativePromise: (_plugin, method) => method === 'getLaunchUrl'
          ? new Promise(resolve => { window.finishLaunch = () => resolve(undefined); })
          : Promise.resolve(),
        nativeCallback: () => 'test-listener'
      };
    });
    await page.goto(process.env.CASA_TEST_URL || 'http://127.0.0.1:4175');
    await page.getByRole('status').filter({ hasText: 'Opening Casa Michele' }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Bartender access', exact: true }).count(), 0);
    await page.waitForFunction(() => typeof window.finishLaunch === 'function');
    await page.evaluate(() => window.finishLaunch());
    await page.getByRole('button', { name: 'Bartender access', exact: true }).click();
    await page.getByRole('button', { name: 'Start a local offline bar', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Start a local offline bar', exact: true }).click();
    await page.getByText('Local bar on this device', { exact: false }).waitFor();
    assert.deepEqual(errors, []);
    console.log('PASS delayed native startup and immediate bartender navigation');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
