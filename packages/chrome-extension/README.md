# Azure Pipelines Dependency Viewer — Chrome Extension

A Chrome extension that adds pipeline dependency visualization directly into Azure DevOps commit pages.

## Features

- **Sidebar Enhancement**: Adds a 🔗 button next to each pipeline in the build status sidebar on ADO commit pages
- **Dependency Tree**: Click the button to see the full pipeline trigger chain in a modal overlay
- **Progressive Loading**: Discovers downstream triggered pipelines via BFS, rendering them as they're found
- **Native Look & Feel**: Styled to match Azure DevOps UI using ADO's CSS variables (supports dark mode)
- **No Server Required**: Calls the ADO REST API directly using your browser session cookies

## Install (Developer Mode)

1. Build the extension:
   ```bash
   # From the repository root
   bun install
   bun run build:extension
   ```

2. Open Chrome and navigate to `chrome://extensions/`

3. Enable **Developer mode** (toggle in the top right)

4. Click **Load unpacked** and select the `packages/chrome-extension/dist` folder

5. Navigate to any Azure DevOps commits page (e.g., `https://dev.azure.com/org/project/_git/repo/commits`)

6. Click the status column on a commit to open the build sidebar — you'll see 🔗 buttons next to each pipeline

## How It Works

1. A content script runs on `dev.azure.com` pages
2. A MutationObserver watches for the build status sidebar to appear
3. When pipeline links are detected, a dependency button is injected next to each one
4. Clicking the button fetches the build details and runs a BFS traversal to find all downstream triggered pipelines
5. Results are rendered as a left-to-right tree in a modal overlay

## Development

```bash
# Watch mode (auto-rebuild on changes)
cd packages/chrome-extension
bun run watch
```

After rebuilding, click the refresh icon on the extension card in `chrome://extensions/`.
