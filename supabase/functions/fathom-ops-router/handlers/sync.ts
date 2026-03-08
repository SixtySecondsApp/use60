/**
 * Handler: sync
 * Delegates to the exported handleSync from fathom-sync/index.ts.
 *
 * The fathom-sync function is 2200+ lines with complex imports from its own
 * services/ subdirectory. Rather than duplicating all that code, we import the
 * exported handler directly.
 */

export { handleSync } from '../../fathom-sync/index.ts';
