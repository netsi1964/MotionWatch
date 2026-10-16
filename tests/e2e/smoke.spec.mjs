import { test, expect, open, ev, APP, CS, selectTab } from "./helpers.mjs";

test("loads without console errors and shows the privacy gate", async ({ page, errors }) => {
  await open(page);
  await expect(page).toHaveTitle("MotionWatch");
  expect(await ev(page, `${CS}.querySelector('.privacy').hidden`)).toBe(false);
  expect(await ev(page, `${APP}.querySelector('.app-title').textContent`)).toBe("MotionWatch");
  expect(errors).toEqual([]);
});

test("tabs follow the WAI-ARIA tab pattern incl. arrow keys", async ({ page }) => {
  await open(page);
  const tabs = await ev(page, `[...${APP}.querySelector('app-tabs').shadowRoot.querySelectorAll('[role=tab]')].map(t => [t.id, t.getAttribute('aria-controls'), t.getAttribute('aria-selected'), t.tabIndex])`);
  expect(tabs).toEqual([
    ["tab-camera", "panel-camera", "true", 0],
    ["tab-recordings", "panel-recordings", "false", -1],
    ["tab-settings", "panel-settings", "false", -1],
  ]);
  await ev(page, `${APP}.querySelector('app-tabs').shadowRoot.querySelector('#tab-camera').focus()`);
  await page.keyboard.press("ArrowRight");
  const active = await ev(page, `[...${APP}.querySelectorAll('.panel')].filter(p => p.hasAttribute('active')).map(p => p.id)`);
  expect(active).toEqual(["panel-recordings"]);
  await page.keyboard.press("End");
  expect(await ev(page, `${APP}.querySelector('app-tabs').active`)).toBe("settings");
});

for (const [name, w, h] of [["phone", 360, 740], ["landscape phone", 740, 360], ["tablet", 820, 1100], ["desktop", 1400, 900]]) {
  test(`no horizontal overflow on ${name}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await open(page, "area=Door~e~20~20~40~50&sched=Night~0123456~2200~0600~1");
    for (const tab of ["camera", "recordings", "settings"]) {
      await selectTab(page, tab);
      const overflow = await ev(page, `document.documentElement.scrollWidth - innerWidth`);
      expect(overflow, `${tab} tab`).toBeLessThanOrEqual(0);
    }
  });
}

test("wide screens get a navigation rail, phones a bottom bar", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await open(page);
  expect(await ev(page, `${APP}.querySelector('app-tabs').getAttribute('orientation')`)).toBe("vertical");
  await page.setViewportSize({ width: 390, height: 780 });
  await expect.poll(() => ev(page, `${APP}.querySelector('app-tabs').getAttribute('orientation')`)).toBe("horizontal");
});

test("theme can be forced from the URL and from Settings", async ({ page }) => {
  await open(page, "theme=light");
  expect(await ev(page, `document.documentElement.dataset.theme`)).toBe("light");
  await selectTab(page, "settings");
  await ev(page, `(() => { const r = [...${APP}.querySelector('motion-settings').shadowRoot.querySelectorAll('input[name=theme]')].find(i => i.value === 'dark'); r.checked = true; r.dispatchEvent(new Event('change')); })()`);
  expect(await ev(page, `document.documentElement.dataset.theme`)).toBe("dark");
});

test("the language switches at runtime", async ({ page }) => {
  await open(page, "lang=da");
  expect(await ev(page, `document.documentElement.lang`)).toBe("da");
  expect(await ev(page, `${CS}.querySelector('.privacy h2').textContent`)).not.toBe("Privacy first");
});

test("coffee link is present and safe", async ({ page }) => {
  await page.goto("/");
  const a = await ev(page, `(() => { const e = ${APP}.querySelector('.coffee'); return { href: e.href, target: e.target, rel: e.rel, text: e.textContent.trim() }; })()`);
  expect(a.href).toBe("https://www.buymeacoffee.com/netsi1964");
  expect(a.target).toBe("_blank");
  expect(a.rel).toContain("noopener");
  expect(a.text).toBe("Buy me a coffee");
});

test("settings show the version stamp", async ({ page }) => {
  await open(page);
  await selectTab(page, "settings");
  const text = await ev(page, `${APP}.querySelector('motion-settings').shadowRoot.querySelector('.version').textContent`);
  expect(text).toMatch(/version\d{4}-\d{2}-\d{2}-\d{2}-\d{2}/);
});

test.describe("service worker updates", () => {
  const banner = (page) => ev(page, `(() => { const b = ${APP}.querySelector('.update-banner'); return { hidden: b.hidden, text: b.textContent.trim() }; })()`);

  test("the first install does not nag; a later takeover offers a reload", async ({ page }) => {
    await open(page);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForTimeout(500);
    expect((await banner(page)).hidden, "first install (clients.claim) is silent").toBe(true);

    await page.reload();                                   // now the page has a controller, like a returning visitor
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    await ev(page, `navigator.serviceWorker.dispatchEvent(new Event('controllerchange'))`);   // a new worker takes over
    const b = await banner(page);
    expect(b.hidden).toBe(false);
    expect(b.text).toBe("A new version is available. Reload");

    const reloaded = page.waitForEvent("load");
    await ev(page, `${APP}.querySelector('.update-btn').click()`);
    await reloaded;
    await expect.poll(async () => (await banner(page)).hidden).toBe(true);
  });

  test("network first: a new deploy shows on the next load, and the cache still works offline", async ({ page, context }) => {
    const server = "http://localhost:4173";
    const override = (path, body) => page.request.post(`${server}/__override`, { data: { path, body } });
    try {
      await open(page);
      await page.evaluate(() => navigator.serviceWorker.ready);
      await page.reload();                                           // the worker now controls the page
      await page.waitForFunction(() => !!navigator.serviceWorker.controller);
      const before = await ev(page, `${APP}.querySelector('.version-stamp').textContent`);
      expect(before).toMatch(/^version\d{4}-/);

      // "deploy" a new version.js: a cache-first worker would keep serving the old one
      const fresh = (await page.request.get(`${server}/src/version.js`)).text();
      await override("/src/version.js", (await fresh).replace(/"version[^"]*"/, '"version2099-01-01-00-00"'));
      await page.reload();
      await expect.poll(() => ev(page, `${APP}.querySelector('.version-stamp').textContent`)).toBe("version2099-01-01-00-00");

      // offline: the last fetched files come from the cache
      await context.setOffline(true);
      await page.reload();
      await page.waitForFunction(() => !!document.querySelector("motion-app")?.shadowRoot?.querySelector("camera-monitor"));
      expect(await ev(page, `${APP}.querySelector('.version-stamp').textContent`)).toBe("version2099-01-01-00-00");
      await context.setOffline(false);
    } finally {
      await page.request.post(`${server}/__override/clear`);
    }
  });

  test("the worker is registered with a versioned cache", async ({ page }) => {
    await open(page);
    await page.evaluate(() => navigator.serviceWorker.ready);
    const keys = await page.evaluate(() => caches.keys());
    expect(keys.some((k) => /^motionwatch-shell-version\d{4}-\d{2}-\d{2}-\d{2}-\d{2}$/.test(k))).toBe(true);
  });
});
