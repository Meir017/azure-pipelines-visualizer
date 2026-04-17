# Azure Pipelines Dependency Viewer — Chrome Extension

A Chrome extension that adds pipeline dependency visualization directly into Azure DevOps commit pages.

## Features

- **Inline Sidebar Enhancement**: Injects directly into ADO's build status sidebar — adds "Show triggered pipelines" toggles to each pipeline row
- **Recursive Dependency Tree**: Discovers downstream triggered pipelines via BFS traversal (`buildCompletion` and `resourceTrigger` mechanisms)
- **Cross-Project Discovery**: Searches related ADO projects for cross-project resource triggers (configured via Options page)
- **Progressive Loading**: Polls in-progress builds and expands their children as they complete
- **Pipeline Status Summary**: Shows a summary bar with total count and per-status chips (succeeded, failed, running, etc.)
- **ADO-Native Styling**: Uses Azure DevOps CSS custom properties for seamless light/dark theme integration
- **No Server Required**: Calls the ADO REST API directly using your browser session cookies

## Install (Developer Mode)

1. Build the extension:
   ```bash
   # From the repository root
   bun install
   cd packages/chrome-extension && node build.mjs
   ```

2. Open Chrome and navigate to `chrome://extensions/`

3. Enable **Developer mode** (toggle in the top right)

4. Click **Load unpacked** and select the `packages/chrome-extension/dist` folder

5. Navigate to any Azure DevOps commit page and click the build status column to open the sidebar

## Configuration

### Cross-Project Discovery

To discover triggered pipelines across related ADO projects:

1. Right-click the extension icon → **Options**
2. Add a project group with related projects (name + GUID pairs)
3. Save — the extension will search all projects in the group when expanding triggered pipelines

Project GUIDs can be found via the ADO REST API: `https://dev.azure.com/{org}/_apis/projects`

## How It Works

1. A content script runs on `dev.azure.com` pages
2. A `MutationObserver` watches for the build status sidebar dialog to appear
3. For each pipeline row in the sidebar, a "Show triggered pipelines" toggle is injected
4. Clicking the toggle fetches the build details and runs a BFS traversal:
   - Queries for `buildCompletion` and `resourceTrigger` builds within a time window around the parent build
   - Filters by `upstreamBuildId` and `triggerInfo.projectId` to match the correct parent
   - Recursively expands up to 5 levels deep
   - Polls in-progress builds every 15 seconds until completion (max 10 minutes)
5. Results are rendered as an indented tree with ADO-native status icons and a summary bar

## Development

```bash
# Build once
cd packages/chrome-extension
node build.mjs

# Watch mode (auto-rebuild on changes — reload extension in chrome://extensions/)
```

After rebuilding, click the refresh icon on the extension card in `chrome://extensions/`.
