#!/usr/bin/env node
import { chromium } from 'playwright';

const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
const qaEmail = process.env.QA_USER_EMAIL || 'qa-user@keyatlas.local';
const qaPassword = process.env.QA_USER_PASSWORD || 'TestPassw0rd!';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function signIn(page) {
  console.log('[qa-rich-text] Sign-in required, authenticating with QA user...');
  await page.waitForSelector('#email', { timeout: 15000 });
  await page.fill('#email', qaEmail);
  await page.fill('#password', qaPassword);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.includes('/sign-in'), { timeout: 15000 });
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    console.log(`[qa-rich-text] Opening ${baseUrl}/projects/submit`);
    const response = await page.goto(`${baseUrl}/projects/submit`, { waitUntil: 'networkidle' });
    assert(response && response.ok(), 'Submit project page did not load successfully');

    if (page.url().includes('/sign-in')) {
      await signIn(page);
      await page.goto(`${baseUrl}/projects/submit`, { waitUntil: 'networkidle' });
    }

    await page.waitForSelector('.ProseMirror', { timeout: 20000 });
    const editor = page.locator('.ProseMirror').first();

    await editor.click();
    await editor.fill('Alpha Beta Gamma');

    await page.evaluate(() => {
      const root = document.querySelector('.ProseMirror');
      if (!root) throw new Error('Editor root not found');
      const textNode = root.firstChild?.firstChild;
      if (!textNode || textNode.nodeType !== Node.TEXT_NODE) {
        throw new Error('Expected first paragraph text node for selection');
      }
      const range = document.createRange();
      range.setStart(textNode, 6);
      range.setEnd(textNode, 10);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    });

    await page.getByTestId('rte-font-size-input').fill('28');
    await page.getByTestId('rte-font-size-apply').click();

    let html = await editor.evaluate((el) => el.innerHTML);
    console.log(`[qa-rich-text] HTML after font size: ${html}`);
    assert(/font-size:\s*28px/i.test(html), 'Expected font-size: 28px in editor HTML');

    await page.getByTestId('rte-color-input').fill('#ff0000');

    html = await editor.evaluate((el) => el.innerHTML);
    console.log(`[qa-rich-text] HTML after color: ${html}`);
    assert(
      /color:\s*(#ff0000|rgb\(255,\s*0,\s*0\))/i.test(html),
      'Expected text color #ff0000 (or rgb equivalent) in editor HTML'
    );

    console.log('QA PASS: rich text font size + color formatting works on selected text.');
    process.exitCode = 0;
  } catch (error) {
    console.error(`QA FAIL: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  } finally {
    await page.close();
    await browser.close();
  }
})();
