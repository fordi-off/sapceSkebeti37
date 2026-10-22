const { chromium } = require('/opt/node-tools/node_modules/playwright');
const out = process.argv[2];
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1360, height: 800 } });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERR ' + e.message + '\n' + (e.stack || '')));
  await page.goto('file://' + process.cwd() + '/index.html');
  await page.click('#m-examples');
  await page.locator('#modal-body .li').nth(1).locator('button.go').click();
  await page.waitForTimeout(400);
  await page.evaluate(() => { SS.Flight.world.paused = false; });
  // stage & fly the Orbiter-1 straight up 55 s then abuse: full steer to tumble at max-Q
  await page.keyboard.press('Space');
  await page.evaluate(() => { const w = SS.Flight.world; const v = w.active; v.throttle = 1; for (let i = 0; i < 30 * 38; i++) w.update(1 / 30); v.sasOn = false; v.theta += 0.9; w.settings.jointStrength = 0.12; });
  for (let i = 0; i < 14; i++) { await page.evaluate(() => { const w = SS.Flight.world; for (let i = 0; i < 6; i++) w.update(1 / 30); }); await page.waitForTimeout(60); if (i % 3 === 2) await page.screenshot({ path: out + '/f' + i + '.png' }); }
  console.log(await page.evaluate(() => SS.Flight.world.events.filter(e => e.text).map(e => e.text).join(' | ')));
  console.log(errors.join('\n') || 'no errors');
  await browser.close();
})();
