import { test } from '@playwright/test';

const COMMIT_URL =
  'https://dev.azure.com/microsoft/DefenderCommon/_git/Infra.K8s.Clusters/commit/07d164d3f0dbcf0810f05a08e0708bb496c7b585';

/** Explicit pause so the video captures a human-viewable moment. */
const pause = (page: import('@playwright/test').Page, ms = 2000) =>
  page.waitForTimeout(ms);

test('Commit Flow walkthrough with Gantt timeline', async ({ page }) => {
  test.setTimeout(180_000);

  // 1. Navigate to the Commit Flow page
  await page.goto('/#/commit-flow');
  await page.waitForLoadState('networkidle');
  await pause(page, 1500);

  // 2. Paste the commit URL and load builds
  await page.locator('.commit-flow-selector__input--url').fill(COMMIT_URL);
  await pause(page, 800);
  await page.locator('.commit-flow-selector__btn').click();

  // 3. Wait for build nodes to stream in via SSE
  await page.waitForSelector('.react-flow__node', { timeout: 60_000 });

  // Give SSE time to stream all builds — minimum 8s, then poll until stable
  await pause(page, 8000);
  let prevCount = 0;
  for (let i = 0; i < 6; i++) {
    const count = await page.locator('.react-flow__node').count();
    if (count === prevCount && count > 0) break;
    prevCount = count;
    await pause(page, 2000);
  }
  const nodeCount = await page.locator('.react-flow__node').count();
  console.log(`Found ${nodeCount} build nodes`);

  // Helper: open a build popup, show Gantt, click a bar, then close
  async function inspectBuild(index: number) {
    const node = page.locator('.react-flow__node').nth(index);
    await node.click({ timeout: 5000 });
    await page.waitForSelector('.build-popup', { timeout: 10_000 });
    await pause(page, 1500);

    // Open Gantt
    await page.locator('.build-popup__gantt-toggle').click({ timeout: 5000 });
    try {
      await page.waitForSelector('.gantt-row', { timeout: 30_000 });
      await pause(page);

      // Click a Gantt bar to show detail panel — use force:true since bars may be small
      const bars = page.locator('.gantt-bar');
      const barCount = await bars.count();
      console.log(`Build ${index}: ${barCount} Gantt bars`);
      if (barCount > 2) {
        await bars.nth(2).click({ force: true, timeout: 5000 });
      } else if (barCount > 0) {
        await bars.first().click({ force: true, timeout: 5000 });
      }
      await pause(page, 2000);
    } catch (e) {
      console.log(
        `Build ${index}: Gantt issue — ${e instanceof Error ? e.message.split('\n')[0] : e}`,
      );
      await pause(page, 1000);
    }

    // Close popup
    await page.locator('.build-popup__close').click({ timeout: 5000 });
    await pause(page, 1000);
  }

  // 4. Inspect up to 3 builds
  const buildsToInspect = Math.min(nodeCount, 3);
  for (let i = 0; i < buildsToInspect; i++) {
    await inspectBuild(i);
  }

  // Final pause for video
  await pause(page, 2000);
});
