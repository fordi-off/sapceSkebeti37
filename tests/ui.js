// UI smoke test: node tests/ui.js <outdir>
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const out = process.argv[2];
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1360, height: 800 } });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERR ' + e.message + '\n' + (e.stack || '')));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
  await page.goto('file://' + process.cwd() + '/index.html');
  await page.waitForTimeout(600);
  await page.screenshot({ path: out + '/menu.png' });
  await page.click('#m-build');
  await page.waitForTimeout(500);
  await page.screenshot({ path: out + '/builder.png' });
  await page.click('#b-launch');
  await page.waitForTimeout(800);
  await page.screenshot({ path: out + '/flight0.png' });
  await page.keyboard.press('Space');
  await page.keyboard.press('z');
  await page.waitForTimeout(4000);
  await page.screenshot({ path: out + '/flight1.png' });
  console.log(errors.join('\n') || 'no errors');
  await browser.close();
})();
