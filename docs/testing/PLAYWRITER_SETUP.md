# Playwriter Setup Guide

## Quick Start

1. **Install Playwriter Chrome Extension**
   - Install from [Chrome Web Store](https://chromewebstore.google.com/detail/playwriter-mcp/jfeammnjpkecdekppnclgkkffahnhfhe)
   - Pin the extension to your Chrome toolbar

2. **Connect Extension**
   - Open Chrome
   - Navigate to any tab
   - Click the Playwriter extension icon
   - Icon should turn **green** when connected ✅

3. **Start Dev Server**
   ```bash
   npm run dev
   ```
   Keep this running in a separate terminal.

4. **Run Tests**
   ```bash
   # Run all E2E tests
   npm run test:e2e

   # Or start dev server and tests together
   npm run test:e2e:all
   ```

## Verification

Verify your setup is working:
```bash
npm run verify:playwriter
```

This will check:
- ✅ CDP server connection
- ✅ Browser connectivity
- ✅ Page accessibility

## Troubleshooting

### "ERR_CONNECTION_REFUSED"
- **Solution**: Start the dev server with `npm run dev` before running tests

### "No test files found"
- **Solution**: Make sure you're using the E2E config: `npm run test:e2e` (not `vitest run tests/e2e`)

### Extension icon is gray
- **Solution**: Click the extension icon to connect it (should turn green)

### Tests can't find elements
- **Solution**: Make sure you've navigated to the correct tab in Chrome before running tests
- Playwriter controls the currently active Chrome tab

## How It Works

1. Playwriter Chrome extension runs a CDP (Chrome DevTools Protocol) server
2. Tests connect to this server via `playwright-core`
3. Tests control the browser tab that's connected to the extension
4. No need to launch separate browser instances - uses your existing Chrome

## Environment Variables

Set these if needed:
```bash
PLAYWRIGHT_TEST_BASE_URL=http://127.0.0.1:5175  # Default dev server URL
VITE_BASE_URL=http://127.0.0.1:5175            # Alternative
```

## Test Structure

Tests use:
- **vitest** as the test framework
- **playwright-core** for browser automation
- **playwriter** MCP server for CDP connection

See `docs/PLAYWRITER_MIGRATION_GUIDE.md` for migration details.
