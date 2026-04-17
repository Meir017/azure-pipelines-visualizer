/**
 * Sequential POC screenshot test runner.
 * For each worktree: start combined dev server on :3000, verify health,
 * run Playwright for that POC, stop, move on.
 */
const { execSync, spawn } = require('child_process');
const { existsSync, mkdirSync, readdirSync, unlinkSync } = require('fs');
const path = require('path');
const http = require('http');

const WT_BASE = 'D:\\github\\Meir017\\apv-worktrees';
const MAIN = 'D:\\github\\Meir017\\azure-pipelines-visualizer';
const SS_DIR = path.join(MAIN, 'poc-screenshots');
mkdirSync(SS_DIR, { recursive: true });

const POCS = [
  { num: 1, dir: '01-build-timeline-gantt' },
  { num: 2, dir: '02-run-history-dashboard' },
  { num: 3, dir: '03-pipeline-flattener' },
  { num: 4, dir: '04-why-did-this-run' },
  { num: 5, dir: '05-environment-deployment-map' },
  { num: 6, dir: '06-test-results-viz' },
  { num: 7, dir: '07-artifact-lineage' },
  { num: 8, dir: '08-parameter-explorer' },
  { num: 9, dir: '09-export-diagrams' },
  { num: 10, dir: '10-org-topology' },
  { num: 11, dir: '11-approval-gates' },
  { num: 12, dir: '12-condition-truth-table' },
  // 13 is chrome extension - skip
  { num: 14, dir: '14-health-scorecard' },
];

/** Check if /health endpoint responds 200 */
function checkHealth() {
  return new Promise((resolve) => {
    const req = http.get('http://127.0.0.1:3000/health', (res) => {
      let body = '';
      res.on('data', (d) => (body += d));
      res.on('end', () => resolve(res.statusCode === 200));
    });
    req.on('error', () => resolve(false));
    req.setTimeout(3000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForServer(timeout = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await checkHealth()) return true;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

function killByPort(port) {
  try {
    const out = execSync(
      `netstat -ano | findstr :${port} | findstr LISTENING`,
      { encoding: 'utf8' },
    );
    const pids = [
      ...new Set(
        out
          .trim()
          .split('\n')
          .map((l) => l.trim().split(/\s+/).pop())
          .filter(Boolean),
      ),
    ];
    for (const pid of pids) {
      try {
        execSync(`taskkill /PID ${pid} /F /T 2>nul`, { stdio: 'pipe' });
      } catch {}
    }
  } catch {}
}

async function main() {
  console.log('🎬 POC Screenshot Runner\n');
  const results = [];

  // Clear old screenshots
  try {
    for (const f of readdirSync(SS_DIR)) {
      if (f.endsWith('.png')) unlinkSync(path.join(SS_DIR, f));
    }
    console.log('🗑️  Cleared old screenshots\n');
  } catch {}

  for (const poc of POCS) {
    const nn = String(poc.num).padStart(2, '0');
    console.log(`\n${'═'.repeat(50)}`);
    console.log(`📋 POC ${nn}: ${poc.dir}`);
    console.log('═'.repeat(50));
    const wtDir = path.join(WT_BASE, poc.dir);

    if (!existsSync(wtDir)) {
      console.log('  ⚠️  worktree not found, skip');
      results.push({ poc: nn, status: 'skip' });
      continue;
    }

    // Make sure port is free
    killByPort(3000);
    await new Promise((r) => setTimeout(r, 1500));

    // Start combined dev server (vite + API on :3000)
    console.log('  Starting dev server...');
    const proc = spawn('bun', ['run', 'dev'], {
      cwd: wtDir,
      stdio: 'pipe',
      shell: true,
    });

    let serverOutput = '';
    proc.stdout.on('data', (d) => {
      serverOutput += d.toString();
    });
    proc.stderr.on('data', (d) => {
      serverOutput += d.toString();
    });

    const ready = await waitForServer(60000);
    if (!ready) {
      console.log('  ❌ Dev server failed — /health not responding');
      console.log('  Last output:', serverOutput.slice(-500));
      proc.kill();
      results.push({ poc: nn, status: 'fail-start' });
      killByPort(3000);
      continue;
    }
    console.log('  ✅ Server ready (health check passed)');

    // Run playwright test for this POC
    try {
      const testTimeout = poc.num === 10 ? 240000 : 180000;
      execSync(
        `npx playwright test poc-screenshots.spec.ts -g "POC ${nn}" --reporter=line`,
        {
          cwd: MAIN,
          stdio: 'inherit',
          timeout: testTimeout,
          env: { ...process.env, PLAYWRIGHT_SKIP_BROWSER_GC: '1' },
        },
      );
      console.log(`  📸 Screenshot done`);
      results.push({ poc: nn, status: 'ok' });
    } catch (e) {
      console.log(`  ⚠️  Test issue (screenshot may still exist)`);
      results.push({ poc: nn, status: 'test-error' });
    }

    // Cleanup
    proc.kill();
    killByPort(3000);
    await new Promise((r) => setTimeout(r, 2000));
  }

  console.log('\n\n📊 Results:');
  console.log('─'.repeat(50));
  let okCount = 0;
  for (const r of results) {
    const icon =
      r.status === 'ok' ? '✅' : r.status === 'skip' ? '⏭️' : '❌';
    console.log(`  ${icon} POC ${r.poc}: ${r.status}`);
    if (r.status === 'ok') okCount++;
  }
  console.log(`\n  ${okCount}/${results.length} succeeded`);

  // List screenshots
  try {
    const screenshots = readdirSync(SS_DIR).filter((f) => f.endsWith('.png'));
    console.log(`\n📸 ${screenshots.length} screenshots in ${SS_DIR}:`);
    for (const s of screenshots) console.log(`  • ${s}`);
  } catch {}
}

main().catch(console.error);
