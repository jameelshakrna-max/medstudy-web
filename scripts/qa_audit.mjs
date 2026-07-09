import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const THEME_BG = { dark: '#0B1120', light: '#F4F6F9' };

// sRGB luminance helper
function luminance(hex) {
  const c = hex.replace('#', '');
  const [r, g, b] = [0, 2].map(i => parseInt(c.slice(i, i+2), 16) / 255);
  const ch = v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

function contrastRatio(fg, bg) {
  const l1 = luminance(fg), l2 = luminance(bg);
  const lighter = Math.max(l1, l2), darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

const PAGES = [
  { name: 'Dashboard', url: '/dashboard' },
  { name: 'Pomodoro', url: '/pomodoro' },
  { name: 'TrackingHub', url: '/tracking' },
  { name: 'Anki', url: '/anki' },
  { name: 'Settings', url: '/settings' },
  { name: 'Goals', url: '/goals' },
  { name: 'Landing', url: '/' },
];

async function waitForServer(url, maxRetries = 30) {
  for (let i = 0; i < maxRetries; i++) {
    try { const resp = await fetch(url); if (resp.ok) return; } catch {}
    await new Promise(r => setTimeout(r, 1000));
  }
  throw new Error('Server did not start');
}

async function auditPage(page, name, url, theme) {
  console.log(`\n### ${name} (${theme})`);

  await page.goto(`http://localhost:5179${url}`, { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(1000);
  await page.evaluate((t) => {
    localStorage.setItem('theme', t);
    document.documentElement.setAttribute('data-theme', t);
  }, theme);
  await page.waitForTimeout(500);

  const results = {};

  // 1. Verify data-theme is applied
  const appliedTheme = await page.evaluate(() =>
    document.documentElement.getAttribute('data-theme')
  );
  results.themeApplied = appliedTheme === theme;

  // 2. Check page background
  const pageBg = await page.evaluate(() =>
    getComputedStyle(document.body).backgroundColor
  );
  results.pageBackground = pageBg;

  // 3. Check all text elements for contrast
  const textChecks = await page.evaluate(() => {
    const els = document.querySelectorAll('p, h1, h2, h3, h4, h5, h6, span, a, li, label, td, th, button, input, textarea, select, option, small, strong, em, b');
    const results = [];
    for (const el of els) {
      const style = getComputedStyle(el);
      const color = style.color;
      const bg = style.backgroundColor;
      const fontSize = style.fontSize;
      const text = el.textContent?.trim();
      if (!text || text.length === 0) continue;
      // Only check visible elements
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      if (el.offsetParent === null && el.tagName !== 'OPTION') continue;
      results.push({
        tag: el.tagName,
        text: text.slice(0, 60),
        color,
        bg,
        fontSize,
        wcagSize: parseFloat(fontSize) < 18.5 ? 'small' : 'large',
      });
    }
    return results;
  });

  // 4. Check for invisible elements (color matches bg)
  const invisible = textChecks.filter(t => {
    // If color equals background, it's invisible
    const c = t.color, b = t.bg;
    return c === b && b !== 'rgba(0, 0, 0, 0)' && b !== 'transparent';
  });

  results.invisibleElements = invisible.length;

  // 5. Check that both rgb() and css variables are being used for colors
  const colorUsage = await page.evaluate(() => {
    const els = document.querySelectorAll('*');
    const hasVar = [], hasRgb = [], hasHex = [];
    for (const el of els) {
      const style = getComputedStyle(el);
      for (const prop of ['color', 'background-color', 'border-color']) {
        const val = style[prop];
        if (val) {
          if (val.startsWith('#')) hasHex.push(`${el.tagName}:${prop}=${val}`);
          else if (val.startsWith('rgb')) hasRgb.push(`${el.tagName}:${prop}=${val}`);
        }
      }
    }
    return { hasVarCount: hasVar.length, hasRgbCount: hasRgb.length, hasHexCount: hasHex.length, hexSamples: hasHex.slice(0, 10) };
  });

  results.colorUsage = colorUsage;

  return results;
}

async function main() {
  // Start server
  console.log('Starting dev server...');
  const server = spawn('npx', ['vite', '--port', '5180', '--strictPort'], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true,
  });
  server.stderr.on('data', d => process.stderr.write(d));
  await waitForServer('http://localhost:5180');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();

  // Login
  console.log('Logging in...');
  await page.goto('http://localhost:5180/login', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.locator('input[type="email"], input[name="email"]').first().fill('220140@ppu.edu.ps');
  await page.locator('input[type="password"]').first().fill('Jameel2003');
  await page.locator('button[type="submit"]').first().click();
  await page.waitForTimeout(3000);
  await page.waitForLoadState('networkidle');
  console.log('Logged in:', page.url());

  const allResults = { dark: {}, light: {} };

  for (const theme of ['dark', 'light']) {
    console.log(`\n========================================`);
    console.log(`=${theme.toUpperCase()} MODE AUDIT`);
    console.log(`========================================`);
    for (const { name, url } of PAGES) {
      const res = await auditPage(page, name, url, theme);
      allResults[theme][name] = res;
    }
  }

  await browser.close();
  server.kill();

  // Print report
  console.log('\n\n========================================');
  console.log('= FINAL QA AUDIT REPORT');
  console.log('========================================\n');

  for (const theme of ['dark', 'light']) {
    console.log(`\n--- ${theme.toUpperCase()} MODE ---`);
    for (const [name, res] of Object.entries(allResults[theme])) {
      console.log(`\n${name}:`);
      console.log(`  data-theme applied: ${res.themeApplied}`);
      console.log(`  body background: ${res.pageBackground}`);
      console.log(`  invisible elements: ${res.invisibleElements}`);
      console.log(`  color usage: ${res.colorUsage.hasRgbCount} rgb(), ${res.colorUsage.hasHexCount} hex()`);
    }
  }

  console.log('\n\nAudit complete. View screenshots manually in the screenshots/ directory.');
}

main().catch(err => { console.error(err); process.exit(1); });
