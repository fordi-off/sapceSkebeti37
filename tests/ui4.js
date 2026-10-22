const { chromium } = require('/opt/node-tools/node_modules/playwright');
const out = process.argv[2];
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1360, height: 800 } });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERR ' + e.message + '\n' + (e.stack || '')));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
  await page.goto('file://' + process.cwd() + '/index.html');
  await page.click('#m-quick');
  await page.waitForTimeout(300);
  await page.keyboard.press('g');
  const adv = async (s) => { await page.evaluate(s => { const w = SS.Flight.world; for (let i = 0; i < s * 30; i++) w.update(1 / 30); }, s); await page.waitForTimeout(200); };
  await adv(75); await page.screenshot({ path: out + '/c1.png' });  // staging moment
  await adv(380);
  console.log(await page.evaluate(() => { const w = SS.Flight.world; const a = w.active; const el = SS.orbit.elements(a.x, a.y, a.vx, a.vy); return JSON.stringify({ t: w.time, ap: el.ap - SS.Planet.R, pe: el.pe - SS.Planet.R, ap_on: w.autopilot.on }); }));
  await page.screenshot({ path: out + '/c2.png' });
  await page.keyboard.press('.'); await page.keyboard.press('.'); await page.keyboard.press('.'); await page.keyboard.press('.'); 
  await page.waitForTimeout(1500);
  console.log('warp label', await page.textContent('#f-warp'));
  await page.screenshot({ path: out + '/c3.png' });
  await page.keyboard.press('m'); await page.waitForTimeout(500); await page.screenshot({ path: out + '/c4.png' });
  await page.keyboard.press('/'); 
  console.log(errors.join('\n') || 'no errors');
  await browser.close();
})();
