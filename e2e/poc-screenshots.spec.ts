import { test, type Page } from '@playwright/test';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Test data — real ADO resources used to get meaningful screenshots
// ---------------------------------------------------------------------------
const ADO = {
  org: 'microsoft',
  project: 'WDATP',
  buildId: '144737743',
  definitionId: '62804',
  pipelineUrl:
    'https://dev.azure.com/microsoft/WDATP/_git/WDATP.Infra.System.Cluster?path=/.pipelines/onebranch.official.pkg.yml',
  commitUrl:
    'https://dev.azure.com/microsoft/WDATP/_git/WDATP.Infra.System.Cluster/commit/a5a3c990e7985537cff9dba301683c7ddec44119',
  repoName: 'WDATP.Infra.System.Cluster',
  commitSha: 'a5a3c990e7985537cff9dba301683c7ddec44119',
};

const SCREENSHOT_DIR = path.resolve(__dirname, '..', 'poc-screenshots');
if (!existsSync(SCREENSHOT_DIR)) mkdirSync(SCREENSHOT_DIR, { recursive: true });

async function screenshot(page: Page, name: string) {
  const filePath = path.join(SCREENSHOT_DIR, `${name}.png`);
  await page.screenshot({ path: filePath, fullPage: true });
  console.log(`  📸 ${name}.png`);
}

async function waitForApp(page: Page) {
  await page.waitForSelector('.app__header', { timeout: 20_000 });
}

/** Fill an input by placeholder text */
async function fillInput(page: Page, placeholder: string, value: string) {
  const input = page.locator(`input[placeholder*="${placeholder}" i]`);
  await input.waitFor({ state: 'visible', timeout: 5_000 });
  await input.fill(value);
}

/** Click the first visible button matching any of the given exact text patterns */
async function clickButton(page: Page, ...texts: string[]) {
  for (const text of texts) {
    // Use text= with exact to avoid partial matches (e.g. "Flatten" matching "Flattener")
    const btn = page.locator(`button:text-is("${text}")`).first();
    if (await btn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await btn.click();
      return true;
    }
    // Fallback to has-text for buttons with icons/loading text
    const btnAlt = page.locator(`button:has-text("${text}")`).first();
    if (await btnAlt.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await btnAlt.click();
      return true;
    }
  }
  return false;
}

/**
 * Wait for data to load: either a success selector appears or loading finishes.
 * Never throws — we always want to take a screenshot even on error/timeout.
 */
async function waitForData(
  page: Page,
  opts: { successSelector?: string; loadingGoneSelector?: string; timeout?: number },
) {
  const timeout = opts.timeout ?? 90_000;

  if (!opts.successSelector && !opts.loadingGoneSelector) {
    await page.waitForTimeout(3_000);
    return;
  }

  try {
    const checks: Promise<unknown>[] = [];
    if (opts.successSelector) {
      checks.push(
        page.locator(opts.successSelector).first().waitFor({ state: 'visible', timeout }),
      );
    }
    if (opts.loadingGoneSelector) {
      checks.push(
        page.locator(opts.loadingGoneSelector).waitFor({ state: 'hidden', timeout }),
      );
    }
    await Promise.race([
      Promise.all(checks),
      page.waitForTimeout(timeout),
    ]);
  } catch {
    console.log('  ⏰ waitForData timed out or selector not found — screenshotting current state');
  }

  // Settle UI
  await page.waitForTimeout(1_000);
}

// ==================== POC 1: Build Timeline Gantt ====================
test('POC 01 - Build Timeline Gantt', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/#/build-timeline');
  await waitForApp(page);

  // Fill build URL
  const input = page.locator('input[type="text"]').first();
  await input.fill(`${ADO.org}/${ADO.project}/${ADO.buildId}`);
  await clickButton(page, 'Load Timeline');
  await waitForData(page, {
    successSelector: '.gantt-bar, .gantt-chart, svg rect, canvas',
    timeout: 90_000,
  });
  await screenshot(page, '01-build-timeline-gantt');
});

// ==================== POC 2: Run History Dashboard ====================
test('POC 02 - Run History Dashboard', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/#/run-history');
  await waitForApp(page);

  await fillInput(page, 'Organization', ADO.org);
  await fillInput(page, 'Project', ADO.project);
  await fillInput(page, 'Definition', ADO.definitionId);
  await clickButton(page, 'Load History');
  await waitForData(page, {
    successSelector: '.rh-chart, .rh-dashboard, svg, canvas, table',
    timeout: 90_000,
  });
  await screenshot(page, '02-run-history-dashboard');
});

// ==================== POC 3: Pipeline Flattener ====================
test('POC 03 - Pipeline Flattener', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/#/flattener');
  await waitForApp(page);

  const input = page.locator('input[type="text"]').first();
  await input.fill(ADO.pipelineUrl);
  await page.waitForTimeout(500); // Let React state settle
  // Click the Flatten button (exact text, not the "Flattener" nav tab)
  const flattenBtn = page.locator('button.pipeline-url-bar__btn').first();
  await flattenBtn.waitFor({ state: 'visible', timeout: 5_000 });
  await flattenBtn.click();
  await waitForData(page, {
    successSelector: '.flattener-yaml, .flattener-page__error, pre, code, .monaco-editor',
    timeout: 90_000,
  });
  await screenshot(page, '03-pipeline-flattener');
});

// ==================== POC 4: Why Did This Run ====================
test('POC 04 - Why Did This Run', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/#/commit-flow');
  await waitForApp(page);

  // Commit flow selector takes a URL
  const input = page.locator('input[type="text"]').first();
  await input.fill(ADO.commitUrl);
  await clickButton(page, 'Load Builds', 'Load');
  await waitForData(page, {
    successSelector:
      '.commit-flow-page__summary, .react-flow__node, [class*="build-node"]',
    timeout: 90_000,
  });
  await screenshot(page, '04-why-did-this-run');

  // Try clicking a build node to show the popup with "Why did this run?"
  const node = page.locator('.react-flow__node').first();
  if (await node.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await node.click();
    await page.waitForTimeout(2_000);
    await screenshot(page, '04-why-did-this-run-popup');
  }
});

// ==================== POC 5: Environment Map ====================
test('POC 05 - Environment Map', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/#/environments');
  await waitForApp(page);

  await fillInput(page, 'Organization', ADO.org);
  await fillInput(page, 'Project', ADO.project);
  await clickButton(page, 'Load Environments');
  await waitForData(page, {
    successSelector: '.env-card, .env-map, [class*="environment"]',
    timeout: 90_000,
  });
  await screenshot(page, '05-environment-map');
});

// ==================== POC 6: Test Results Viz ====================
test('POC 06 - Test Results Viz', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/#/test-results');
  await waitForApp(page);

  // POC 06 has inputs inside <label> tags with simple placeholders
  const inputs = page.locator('input');
  await inputs.nth(0).fill(ADO.org);
  await inputs.nth(1).fill(ADO.project);
  await inputs.nth(2).fill(ADO.buildId);
  await clickButton(page, 'Load Test Results', 'Load');
  // Wait for the dashboard component (not the page container)
  await waitForData(page, {
    successSelector: '.tr-dashboard, .test-results-page__error',
    timeout: 90_000,
  });
  await screenshot(page, '06-test-results-viz');
});

// ==================== POC 7: Artifact Lineage ====================
test('POC 07 - Artifact Lineage', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/#/artifacts');
  await waitForApp(page);

  await fillInput(page, 'Organization', ADO.org);
  await fillInput(page, 'Project', ADO.project);
  await fillInput(page, 'Build ID', ADO.buildId);
  await clickButton(page, 'Load Artifacts');
  // Wait for the diagram or graph (not page container which also has "artifact" in class)
  await waitForData(page, {
    successSelector: '.artifact-lineage-page__diagram, .artifact-lineage-graph, .artifact-lineage-page__error',
    timeout: 90_000,
  });
  await screenshot(page, '07-artifact-lineage');
});

// ==================== POC 8: Parameter Explorer ====================
test('POC 08 - Parameter Explorer', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/#/parameters');
  await waitForApp(page);

  // This POC has SAMPLE_YAML built-in — it renders immediately
  await waitForData(page, {
    successSelector: '.param-explorer__ref-list, .param-explorer__results',
    timeout: 15_000,
  });
  await screenshot(page, '08-parameter-explorer');

  // Change a parameter value to show the "changes from defaults" feature
  const envSelect = page.locator('select, [class*="param-form"] input').first();
  if (await envSelect.isVisible({ timeout: 3_000 }).catch(() => false)) {
    if ((await envSelect.evaluate((el) => el.tagName)) === 'SELECT') {
      await envSelect.selectOption('prod');
    } else {
      await envSelect.fill('prod');
    }
    await page.waitForTimeout(1_000);
    await screenshot(page, '08-parameter-explorer-changed');
  }
});

// ==================== POC 9: Export Diagrams ====================
test('POC 09 - Export Diagrams', async ({ page }) => {
  test.setTimeout(120_000);
  // Load a pipeline first so there's a diagram to export
  await page.goto('/#/commit-flow');
  await waitForApp(page);

  const input = page.locator('input[type="text"]').first();
  await input.fill(ADO.commitUrl);
  await clickButton(page, 'Load Builds', 'Load');
  await waitForData(page, {
    successSelector: '.react-flow__node, .commit-flow-page__summary',
    timeout: 90_000,
  });

  // Look for export button
  const exportBtn = page.locator(
    'button:has-text("Export"), [class*="export"], button:has-text("Download"), button:has-text("Copy")',
  ).first();
  if (await exportBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await screenshot(page, '09-export-with-data');
    await exportBtn.click();
    await page.waitForTimeout(1_000);
    await screenshot(page, '09-export-menu-open');
  } else {
    await screenshot(page, '09-export-diagram-view');
  }
});

// ==================== POC 10: Org Topology ====================
test('POC 10 - Org Topology', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/#/topology');
  await waitForApp(page);

  // Use user's personal org (smaller than 'microsoft' which has thousands of projects)
  const input = page.locator('input[type="text"]').first();
  await input.fill('meblachm');
  await clickButton(page, 'Load Topology');
  await waitForData(page, {
    successSelector: '.react-flow__node, svg circle, [class*="topology"], canvas, [class*="error"]',
    timeout: 120_000,
  });
  await screenshot(page, '10-org-topology');
});

// ==================== POC 11: Approval Gates ====================
test('POC 11 - Approval Gates', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/#/approvals');
  await waitForApp(page);

  await fillInput(page, 'Organization', ADO.org);
  await fillInput(page, 'Project', ADO.project);
  await fillInput(page, 'Build ID', ADO.buildId);
  await clickButton(page, 'Load Timeline');
  // Wait for actual timeline content, not the page container
  await waitForData(page, {
    successSelector: '.approval-timeline, .approval-gates-error',
    timeout: 90_000,
  });
  await screenshot(page, '11-approval-gates');
});

// ==================== POC 12: Condition Truth Table ====================
test('POC 12 - Condition Truth Table', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/#/conditions');
  await waitForApp(page);

  // This POC has SAMPLE_YAML built-in — it renders immediately
  await waitForData(page, {
    successSelector: 'table, [class*="condition-table"], [class*="truth"]',
    timeout: 15_000,
  });
  await screenshot(page, '12-condition-truth-table');

  // Fill in an override value to show evaluation
  const overrideInput = page.locator('[class*="override"] input, input[placeholder*="value" i]').first();
  if (await overrideInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await overrideInput.fill('production');
    await page.waitForTimeout(1_000);
    await screenshot(page, '12-condition-truth-table-evaluated');
  }
});

// ==================== POC 13: Build Page Injection (skip) ====================
test.skip('POC 13 - Build Page Injection - Chrome extension', async () => {});

// ==================== POC 14: Health Scorecard ====================
test('POC 14 - Health Scorecard', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/#/health');
  await waitForApp(page);

  await fillInput(page, 'Organization', ADO.org);
  await fillInput(page, 'Project', ADO.project);
  await fillInput(page, 'Definition', ADO.definitionId);
  await clickButton(page, 'Analyze', 'Load');
  await waitForData(page, {
    successSelector: 'svg circle, [class*="scorecard"], [class*="health"], [class*="score"], [class*="error"]',
    timeout: 90_000,
  });
  await screenshot(page, '14-health-scorecard');
});
