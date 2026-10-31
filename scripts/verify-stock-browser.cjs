// Run against a production build preview with Playwright available in the environment.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const base = process.env.CASA_TEST_URL || 'http://127.0.0.1:4175';
const output = process.env.CASA_TEST_OUTPUT || 'test-results/stock-policy';
const event = 'S' + Date.now().toString(36).toUpperCase();

(async () => {
  await fs.mkdir(output, { recursive: true });
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
  const barContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const guestContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const bar = await barContext.newPage();
  const guest = await guestContext.newPage();
  const failures = [];
  const accessibility = [];
  const audit = async (page, screen) => {
    // Inject through the test driver so the app's strict CSP remains enabled.
    await page.evaluate(await fs.readFile(require.resolve('axe-core/axe.min.js', { paths: [process.cwd()] }), 'utf8'));
    const result = await page.evaluate(async () => window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } }));
    accessibility.push({ screen, violations: result.violations.map(v => ({ id: v.id, impact: v.impact, description: v.description, nodes: v.nodes.map(n => ({ target: n.target, summary: n.failureSummary })) })), passes: result.passes.length });
    await fs.writeFile(`${output}/accessibility.json`, JSON.stringify(accessibility, null, 2));
    assert.deepEqual(accessibility.at(-1).violations, []);
  };
  for (const page of [bar, guest]) {
    page.on('pageerror', error => failures.push(error.message));
    // Precaching can finish during any action on a remote preview.
    const notice = page.getByRole('button', { name: 'Dismiss', exact: true });
    await page.addLocatorHandler(notice, () => notice.click());
  }
  const policy = () => bar.getByRole('button', { name: 'Allow out-of-stock drinks for guests to order', exact: true });
  const dismiss = async page => { const button = page.getByRole('button', { name: 'Dismiss', exact: true }); if (await button.isVisible()) await button.click(); };
  const synced = async () => bar.getByText('Everything is synced', { exact: true }).waitFor({ timeout: 20000 });
  try {
    await bar.goto(base);
    await bar.getByRole('button', { name: 'Bartender access', exact: true }).click();
    await bar.getByLabel('Event code', { exact: true }).fill(event);
    await bar.getByLabel('Bartender password', { exact: true }).fill('shake');
    await bar.getByRole('button', { name: 'Open event', exact: true }).click();
    await bar.getByRole('button', { name: 'Stock', exact: true }).waitFor();
    await dismiss(bar);
    await bar.getByRole('button', { name: 'Stock', exact: true }).click();
    assert.equal(await policy().getAttribute('aria-pressed'), 'false');
    await bar.getByRole('switch', { name: 'Gin in stock', exact: true }).click();
    await bar.waitForFunction(() => document.querySelector('[aria-label="Gin in stock"]').getAttribute('aria-checked') === 'false');
    await synced();
    await bar.getByRole('button', { name: 'Recipes', exact: true }).click();
    const negroni = bar.getByRole('button', { name: 'View Negroni', exact: true });
    assert.match(await negroni.innerText(), /Missing: Gin/);
    assert.deepEqual(await negroni.evaluate(e => [getComputedStyle(e).borderTopColor, getComputedStyle(e).borderTopWidth]), ['rgb(248, 113, 113)', '2px']);
    await bar.getByLabel('Find a recipe').fill('Negroni');
    await bar.screenshot({ path: `${output}/recipes-unavailable.png` });
    await audit(bar, 'recipes with missing stock');
    await bar.getByRole('button', { name: 'Makeable only', exact: true }).click();
    assert.equal(await negroni.count(), 0);
    await bar.getByText('No recipes match.', { exact: false }).waitFor();
    await bar.getByLabel('Find a recipe').fill('Rum');
    assert.ok(await bar.getByRole('button', { name: /^View / }).count() > 0);
    console.log('Recipe borders, missing ingredients and combined filters passed');

    await guest.goto(`${base}/?code=${event}`);
    await guest.getByLabel('Your name', { exact: true }).fill('Stock QA guest');
    await guest.getByLabel('Email address', { exact: true }).fill('stock-qa@example.invalid');
    await dismiss(guest);
    await guest.getByRole('button', { name: 'Join event', exact: true }).click();
    await guest.getByRole('heading', { name: 'The cocktail menu' }).waitFor();
    assert.equal(await guest.getByRole('button', { name: 'View Negroni', exact: true }).count(), 0);

    await bar.getByRole('button', { name: 'Stock', exact: true }).click();
    // Wait for precaching before testing a production offline reload.
    await bar.evaluate(async () => { await navigator.serviceWorker.ready; });
    await barContext.setOffline(true);
    await policy().click();
    await bar.waitForFunction(() => document.querySelector('[aria-label="Allow out-of-stock drinks for guests to order"]').getAttribute('aria-pressed') === 'true');
    await bar.reload();
    await bar.getByRole('button', { name: 'Stock', exact: true }).click();
    assert.equal(await policy().getAttribute('aria-pressed'), 'true');
    assert.match(await bar.locator('body').innerText(), /1 saved change/);
    assert.equal(await guest.getByRole('button', { name: 'View Negroni', exact: true }).count(), 0);
    await bar.screenshot({ path: `${output}/setting-offline.png` });
    await audit(bar, 'offline guest ordering setting');
    await barContext.setOffline(false);
    await synced();
    await guest.getByRole('button', { name: 'View Negroni', exact: true }).waitFor({ timeout: 20000 });
    await guest.getByRole('button', { name: 'View Negroni', exact: true }).click();
    assert.match(await guest.locator('body').innerText(), /accepting orders.*missing stock/);
    assert.equal(await guest.getByRole('button', { name: 'Order This Cocktail', exact: true }).isEnabled(), true);
    await guest.screenshot({ path: `${output}/guest-override.png` });
    await audit(guest, 'guest out-of-stock detail');
    await guest.getByRole('button', { name: 'Order This Cocktail', exact: true }).click();
    await guest.getByRole('button', { name: 'Confirm Order', exact: true }).click();
    await guest.getByText('Last order', { exact: false }).waitFor();
    await bar.getByRole('button', { name: /Orders$/, exact: false }).click();
    await bar.getByRole('heading', { name: 'Negroni', exact: true }).waitFor({ timeout: 20000 });
    console.log('Offline policy persistence, reconnect and allowed guest order passed');

    await bar.getByRole('button', { name: 'Stock', exact: true }).click();
    await policy().click();
    await bar.waitForFunction(() => document.querySelector('[aria-label="Allow out-of-stock drinks for guests to order"]').getAttribute('aria-pressed') === 'false');
    await synced();
    await guest.getByRole('button', { name: 'View Negroni', exact: true }).waitFor({ state: 'detached', timeout: 20000 });
    await guest.getByRole('button', { name: 'Show All', exact: true }).click();
    await guest.getByRole('button', { name: 'View Negroni', exact: true }).click();
    assert.equal(await guest.getByRole('button', { name: 'Currently Unavailable', exact: true }).isDisabled(), true);
    await guest.screenshot({ path: `${output}/guest-restricted.png` });
    await bar.getByRole('switch', { name: 'Gin in stock', exact: true }).click();
    await synced();
    await bar.getByRole('button', { name: 'Recipes', exact: true }).click();
    await bar.getByLabel('Find a recipe').fill('Negroni');
    await negroni.waitFor();
    assert.match(await negroni.innerText(), /Ready to make/);
    assert.doesNotMatch(await negroni.getAttribute('class'), /stock-unavailable/);
    for (const page of [bar, guest]) assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.deepEqual(failures, []);
    await fs.writeFile(`${output}/accessibility.json`, JSON.stringify(accessibility, null, 2));
    await fs.writeFile(`${output}/result.json`, JSON.stringify({ event, base, passed: true, checks: ['recipe red border', 'missing ingredient labels', 'makeable search/filter', 'default restrictive policy', 'offline setting and reload', 'guest sees change only after sync', 'allowed out-of-stock guest order', 'disable blocks ordering', 'stock recovery', 'mobile overflow', 'no page errors'] }, null, 2));
    console.log('PASS', event);
  } catch (error) {
    await bar.screenshot({ path: `${output}/failure-bar.png` });
    await guest.screenshot({ path: `${output}/failure-guest.png` });
    console.error((await bar.locator('body').innerText()).slice(0,1600));
    console.error((await guest.locator('body').innerText()).slice(0,1600));
    throw error;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
