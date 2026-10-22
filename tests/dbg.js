const { chromium } = require('/opt/node-tools/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1360, height: 800 } });
  page.on('pageerror', e => console.log('PAGEERR', e.message));
  await page.goto('file://' + process.cwd() + '/index.html');
  await page.click('#m-build'); await page.click('#b-new'); 
  const cv = await page.locator('#b-canvas').boundingBox();
  const cx = cv.x + cv.width / 2, cy = cv.y + cv.height / 2;
  await page.click('#b-tabs .tab:text-is("Command")'); await page.locator('#b-parts .part').nth(1).click();
  await page.mouse.move(cx, cy - 100); await page.mouse.click(cx, cy - 100);
  console.log(await page.evaluate(() => JSON.stringify({ cam: SS.Builder.cam, held: SS.Builder.held, parts: SS.Builder.doc.parts })));
  await page.click('#b-tabs .tab:text-is("Fuel")'); await page.locator('#b-parts .part').nth(2).click();
  await page.mouse.move(cx + 5, cy + 40, { steps: 3 });
  console.log(await page.evaluate(() => JSON.stringify({ mouse: SS.Builder.mouse, snap: SS.Builder.snap, held: SS.Builder.held && SS.Builder.held.parts[0].type })));
  await browser.close();
})();
