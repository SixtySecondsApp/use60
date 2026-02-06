# Playwriter Migration Guide

This guide explains how to migrate test files from `@playwright/test` to `playwriter` MCP with `vitest`.

## Overview

We've migrated from `@playwright/test` to `playwriter` (MCP server) with `vitest` as the test framework. Playwriter connects to Chrome via CDP (Chrome DevTools Protocol) using a Chrome extension.

## Key Changes

### 1. Package Changes
- **Removed**: `@playwright/test`
- **Added**: `playwriter`, `playwright-core`

### 2. Test Framework
- Tests now use `vitest` instead of Playwright's test runner
- Browser automation uses `playwright-core` via `playwriter` CDP connection

### 3. Import Changes

**Before:**
```typescript
import { test, expect } from '@playwright/test';
```

**After:**
```typescript
import { describe, test, expect as vitestExpect, beforeAll, afterAll, beforeEach } from 'vitest';
import { expect as playwrightExpect } from '../fixtures/playwright-assertions';
import { setupPlaywriter, teardownPlaywriter } from '../fixtures/playwriter-setup';
import type { Page } from 'playwright-core';
```

### 4. Test Structure Changes

**Before:**
```typescript
test.describe('Test Suite', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('my test', async ({ page }) => {
    await expect(page.locator('button')).toBeVisible();
  });
});
```

**After:**
```typescript
describe('Test Suite', () => {
  let page: Page;

  beforeAll(async () => {
    const setup = await setupPlaywriter();
    page = setup.page;
  });

  afterAll(async () => {
    await teardownPlaywriter();
  });

  beforeEach(async () => {
    await page.goto('/');
  });

  test('my test', async () => {
    await playwrightExpect(page.locator('button')).toBeVisible();
  });
});
```

### 5. Assertion Changes

- Use `vitestExpect()` for standard assertions (arrays, values, etc.)
- Use `playwrightExpect()` for Playwright-specific assertions (toBeVisible, toHaveURL, etc.)

**Before:**
```typescript
expect(array).toHaveLength(0);
await expect(locator).toBeVisible();
```

**After:**
```typescript
vitestExpect(array).toHaveLength(0);
await playwrightExpect(locator).toBeVisible();
```

### 6. Configuration Files

- `playwright.config.ts` and `playwright.staging.config.ts` are deprecated but kept for reference
- Tests now run via `vitest` with playwriter setup

### 7. Package.json Scripts

**Before:**
```json
"test:e2e": "playwright test"
```

**After:**
```json
"test:e2e": "vitest run tests/e2e"
```

## Migration Steps for Remaining Files

1. **Update imports** - Replace `@playwright/test` imports with vitest + playwriter imports
2. **Wrap tests in describe block** - Convert `test.describe()` to `describe()` and add setup/teardown
3. **Update test functions** - Remove `{ page }` parameter, use shared `page` variable
4. **Update assertions** - Replace `expect()` with `playwrightExpect()` or `vitestExpect()` as appropriate
5. **Add setup/teardown** - Add `beforeAll`/`afterAll` hooks for playwriter setup

## Files Already Migrated

- ✅ `tests/e2e/01-critical-flows.spec.ts`
- ✅ `tests/e2e/pipeline.spec.ts`
- ✅ `tests/e2e/global-setup.ts`
- ✅ `tests/e2e/global-teardown.ts`
- ✅ `tests/fixtures/playwriter-setup.ts` (new)
- ✅ `tests/fixtures/playwright-assertions.ts` (new)

## Files Still Needing Migration

- `tests/e2e/calendar-export-import.spec.ts`
- `tests/regression/regression-tests.spec.ts`
- `tests/fixtures/auth.setup.ts`
- `tests/e2e/version-update-workflow.spec.ts`
- `tests/e2e/performance.spec.ts`
- `tests/e2e/03-contact-management.spec.ts`
- `tests/e2e/error-handling.spec.ts`
- `tests/e2e/02-quickadd-functionality.spec.ts`
- `tests/api-keys/e2e/userWorkflow.spec.ts`
- `tests/e2e/quick-add.spec.ts`
- `tests/e2e/quick-add-basic.spec.ts`
- `tests/e2e/foreign-key-constraint-fix.spec.ts`
- `tests/e2e/navigation.spec.ts`
- `tests/e2e/functionality.spec.ts`
- `tests/e2e/company-profile.spec.ts`
- `src/tests/reconciliation/e2e-playwright.test.ts`
- `src/tests/e2e-playwright.spec.ts`

## Running Tests

**Important**: Before running E2E tests, make sure:
1. The dev server is running: `npm run dev` (in a separate terminal)
2. Playwriter Chrome extension is active (green icon)
3. You have at least one Chrome tab open

```bash
# Run all E2E tests (dev server must be running separately)
npm run test:e2e

# Run with UI
npm run test:e2e:ui

# Run tests and start dev server automatically
npm run test:e2e:all

# Run staging tests
npm run test:e2e:staging
```

## Playwriter Setup Requirements

1. **Install Chrome Extension**: Install the Playwriter MCP Chrome extension from the Chrome Web Store
2. **Connect Extension**: Open Chrome, navigate to the tab you want to automate, and click the Playwriter extension icon (should turn green when connected)
3. **Run Tests**: Tests will connect via CDP to the connected Chrome tab

## Troubleshooting

- **Connection errors**: Ensure the Playwriter Chrome extension is installed and connected (green icon)
- **Timeout errors**: Increase timeout values in test assertions
- **Import errors**: Ensure `playwriter` and `playwright-core` are installed
