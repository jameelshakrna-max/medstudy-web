import { chromium } from 'playwright';
import { execSync, spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '..', 'screenshots');
fs.mkdirSync(outDir, { recursive: true });

const PAGES = [
  { name: 'Landing', url: '/' },
  { name: 'Login', url: '/login' },
  { name: 'Dashboard', url: '/dashboard' },
  { name: 'Pomodoro', url: '/pomodoro' },
  { name: 'TrackingHub', url: '/tracking' },
  { name: 'Anki', url: '/anki' },
  { name: 'Settings', url: '/settings' },
  { name: 'Goals', url: '/goals' },
];

async function waitForServer(url, maxRetries = 30) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const resp = await fetch(url);
      if (resp.ok) return;
    } catch {}
    await new Promise(r => setTimeout(r, 1000));
  }
  throw new Error('Server did not start');
}

async function main() {
  console.log('Starting dev server...');
  const server = spawn('npx', ['vite', '--port', '5179', '--strictPort'], {
    cwd: path.join(__dirname, '..'),
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true,
  });
  server.stderr.on('data', d => process.stderr.write(d));

  await waitForServer('http://localhost:5179');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  // Login
  console.log('Logging in...');
  await page.goto('http://localhost:5179/login', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  // Fill login form
  const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]').first();
  const passwordInput = page.locator('input[type="password"]').first();
  await emailInput.fill('220140@ppu.edu.ps');
  await passwordInput.fill('Jameel2003');

  const submitBtn = page.locator('button[type="submit"], button:has-text("Sign In"), button:has-text("Log In"), button:has-text("Login")').first();
  await submitBtn.click();
  await page.waitForTimeout(3000);
  await page.waitForLoadState('networkidle');

  // Check if login succeeded
  const currentUrl = page.url();
  console.log('After login URL:', currentUrl);

  // Screenshot pages in dark mode first, then light mode
  for (const theme of ['dark', 'light']) {
    console.log(`\n=== ${theme} mode ===`);

    // Set theme via localStorage
    await page.evaluate((t) => {
      localStorage.setItem('theme', t);
      document.documentElement.setAttribute('data-theme', t);
    }, theme);
    await page.waitForTimeout(500);

    for (const { name, url } of PAGES) {
      console.log(`  Screenshotting ${name}...`);
      try {
        await page.goto(`http://localhost:5179${url}`, { waitUntil: 'networkidle', timeout: 15000 });
        await page.waitForTimeout(1000);

        // Re-apply theme after navigation (React effect might override)
        await page.evaluate((t) => {
          localStorage.setItem('theme', t);
          document.documentElement.setAttribute('data-theme', t);
        }, theme);
        await page.waitForTimeout(500);

        const filePath = path.join(outDir, `${name}-${theme}.png`);
        await page.screenshot({ path: filePath, fullPage: true });
        console.log(`    -> saved ${name}-${theme}.png`);
      } catch (err) {
        console.log(`    -> FAILED: ${err.message}`);
      }
    }
  }

  await browser.close();
  server.kill();
  console.log('\nDone! Screenshots saved to screenshots/');
}

main().catch(err => { console.error(err); process.exit(1); });
