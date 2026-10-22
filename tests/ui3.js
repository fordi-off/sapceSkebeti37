const { chromium } = require('/opt/node-tools/node_modules/playwright');
const out = process.argv[2];
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1360, height: 800 } });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERR ' + e.message + '\n' + (e.stack || '')));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
  page.on('dialog', d => d.accept());
  await page.goto('file://' + process.cwd() + '/index.html');
  await page.click('#m-build');
  await page.click('#b-new');
  await page.waitForTimeout(200);
  const info = () => page.evaluate(() => SS.Builder.doc.parts.map(p => p.type + '@' + p.x.toFixed(2) + ',' + p.y.toFixed(2) + (p.parent ? ' par' + p.parent : '')).join('\n'));
  const cv = await page.locator('#b-canvas').boundingBox();
  const cx = cv.x + cv.width / 2, cy = cv.y + cv.height / 2;
  const pick = async (cat, idx) => { await page.click(`#b-tabs .tab:text-is("${cat}")`); await page.locator('#b-parts .part').nth(idx).click(); };
  // capsule
  await pick('Command', 1); await page.mouse.move(cx, cy - 100); await page.mouse.click(cx, cy - 100);
  await page.evaluate(() => { SS.Builder.cam.s = 30; });
  // tank below
  await pick('Fuel', 2); await page.mouse.move(cx + 5, cy + 20, { steps: 5 }); await page.mouse.click(cx + 5, cy + 20);
  await page.mouse.move(cx + 5, cy + 130, { steps: 5 }); await page.mouse.click(cx + 5, cy + 130);
  console.log('after tanks:\n' + await info());
  await page.keyboard.press('Escape');
  // engine
  await pick('Engines', 1); await page.mouse.move(cx, cy + 260, { steps: 5 }); await page.mouse.click(cx, cy + 260);
  await page.keyboard.press('Escape');
  console.log('after engine:\n' + await info());
  // fin on side of lower tank
  await pick('Aero', 7); const bb = await page.evaluate(() => { const B = SS.Builder; const p = B.doc.parts[2]; return [p.x, p.y]; });
  console.log('tank2', bb);
  await page.screenshot({ path: out + '/b1.png' });
  await page.mouse.move(cx + 40, cy + 150, { steps: 5 }); await page.screenshot({ path: out + '/b2.png' });
  await page.mouse.click(cx + 40, cy + 150);
  await page.keyboard.press('Escape');
  console.log('after fin:\n' + await info());
  // undo / redo
  await page.click('#b-undo'); console.log('after undo parts', await page.evaluate(() => SS.Builder.doc.parts.length));
  await page.click('#b-redo'); console.log('after redo parts', await page.evaluate(() => SS.Builder.doc.parts.length));
  // pick up the engine & cancel
  await page.mouse.click(cx, cy + 260 - 5); await page.waitForTimeout(100);
  console.log('held?', await page.evaluate(() => !!SS.Builder.held), 'parts', await page.evaluate(() => SS.Builder.doc.parts.length));
  await page.keyboard.press('Escape');
  console.log('after cancel parts', await page.evaluate(() => SS.Builder.doc.parts.length));
  // right-click delete tank 2
  await page.mouse.click(cx + 5, cy + 130, { button: 'right' });
  console.log('after delete parts', await page.evaluate(() => SS.Builder.doc.parts.length));
  await page.screenshot({ path: out + '/b3.png' });
  // save / load
  await page.click('#b-save'); await page.waitForTimeout(100);
  await page.click('#b-load'); await page.waitForTimeout(200); await page.screenshot({ path: out + '/b4.png' });
  console.log(errors.join('\n') || 'no errors');
  await browser.close();
})();
