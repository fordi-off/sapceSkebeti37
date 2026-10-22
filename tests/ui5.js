const { chromium } = require('/opt/node-tools/node_modules/playwright');
const out = process.argv[2];
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1360, height: 800 } });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERR ' + e.message + '\n' + (e.stack || '')));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
  await page.goto('file://' + process.cwd() + '/index.html');
  await page.click('#m-quick'); await page.waitForTimeout(300);
  await page.keyboard.press('g');
  const adv = async (s) => { await page.evaluate(s => { const w = SS.Flight.world; for (let i = 0; i < s * 30; i++) w.update(1 / 30); }, s); await page.waitForTimeout(150); };
  await adv(30); await page.screenshot({ path: out + '/d0.png' });
  await adv(440);
  // separate capsule, deorbit, reenter
  await page.evaluate(() => {
    const w = SS.Flight.world; let a = w.active;
    while (a.nextStage() >= 0 && a.parts.length > 5) a.stage();
    a = w.active; a.vx *= 0.98; a.vy *= 0.98;
    const P = SS.Planet; let s = [a.x, a.y, a.vx, a.vy], t = 0;
    while (Math.hypot(s[0], s[1]) - P.R > 100000 && t < 6000) s = SS.orbit.propagate(a.x, a.y, a.vx, a.vy, t += 5);
    a.x = s[0]; a.y = s[1]; a.vx = s[2]; a.vy = s[3]; w.time += t; w.vessels = [a];
    a.sasOn = true; a.sasMode = 'retrograde'; a.sasRef = 'surface'; a.theta = Math.atan2(a.vx, -a.vy);
    SS.Flight.world.setWarp(0);
  });
  await adv(1);
  for (const [n, s] of [['d1', 150], ['d2', 50], ['d3', 40], ['d4', 40]]) { await adv(s); await page.screenshot({ path: out + '/' + n + '.png' }); }
  console.log(await page.evaluate(() => JSON.stringify({ alt: SS.Flight.world.active.tel.alt, spd: SS.Flight.world.active.tel.speed, heat: SS.Flight.world.active.tel.heat })));
  await page.keyboard.press('p');
  for (const [n, s] of [['d5', 60], ['d6', 100]]) { await adv(s); await page.screenshot({ path: out + '/' + n + '.png' }); }
  console.log(await page.evaluate(() => JSON.stringify({ alt: SS.Flight.world.active.tel.alt, spd: SS.Flight.world.active.tel.speed, heat: SS.Flight.world.active.tel.heat })));
  console.log(errors.join('\n') || 'no errors');
  await browser.close();
})();
