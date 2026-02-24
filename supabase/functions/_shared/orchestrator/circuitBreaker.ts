/**
 * Circuit Breaker — Per-Adapter Failure Protection
 *
 * Prevents cascading failures when an adapter is consistently failing.
 * Three states: closed (normal) → open (failing) → half-open (testing).
 *
 * Story: FLT-010
 */

// =============================================================================
// Types
// =============================================================================

type CircuitState = 'closed' | 'open' | 'half-open';

interface CircuitStats {
  state: CircuitState;
  failures: number;
  lastFailureAt: number;
  lastSuccessAt: number;
  openedAt: number;
}

// =============================================================================
// Configuration
// =============================================================================

const FAILURE_THRESHOLD = 5;    // failures within window to trip
const FAILURE_WINDOW_MS = 60_000;  // 60 seconds
const COOLDOWN_MS = 30_000;     // 30 seconds before half-open

// In-memory state per edge function invocation
const circuits = new Map<string, CircuitStats>();

// =============================================================================
// Core Functions
// =============================================================================

function getCircuit(adapterName: string): CircuitStats {
  let circuit = circuits.get(adapterName);
  if (!circuit) {
    circuit = {
      state: 'closed',
      failures: 0,
      lastFailureAt: 0,
      lastSuccessAt: 0,
      openedAt: 0,
    };
    circuits.set(adapterName, circuit);
  }
  return circuit;
}

/**
 * Check if a request should be allowed through the circuit breaker.
 */
export function isCircuitAllowed(adapterName: string): { allowed: boolean; state: CircuitState } {
  const circuit = getCircuit(adapterName);
  const now = Date.now();

  switch (circuit.state) {
    case 'closed':
      return { allowed: true, state: 'closed' };

    case 'open': {
      // Check if cooldown has elapsed → transition to half-open
      if (now - circuit.openedAt >= COOLDOWN_MS) {
        circuit.state = 'half-open';
        console.log(`[circuitBreaker] ${adapterName}: open → half-open (cooldown elapsed)`);
        return { allowed: true, state: 'half-open' };
      }
      return { allowed: false, state: 'open' };
    }

    case 'half-open':
      // Allow exactly one request through to test
      return { allowed: true, state: 'half-open' };

    default:
      return { allowed: true, state: 'closed' };
  }
}

/**
 * Record a successful execution. Resets the circuit to closed.
 */
export function recordSuccess(adapterName: string): void {
  const circuit = getCircuit(adapterName);
  const previousState = circuit.state;

  circuit.state = 'closed';
  circuit.failures = 0;
  circuit.lastSuccessAt = Date.now();

  if (previousState !== 'closed') {
    console.log(`[circuitBreaker] ${adapterName}: ${previousState} → closed (success)`);
  }
}

/**
 * Record a failed execution. May trip the circuit to open.
 */
export function recordFailure(adapterName: string): void {
  const circuit = getCircuit(adapterName);
  const now = Date.now();

  // If in half-open state, a failure immediately trips back to open
  if (circuit.state === 'half-open') {
    circuit.state = 'open';
    circuit.openedAt = now;
    circuit.lastFailureAt = now;
    console.log(`[circuitBreaker] ${adapterName}: half-open → open (test request failed)`);
    return;
  }

  // Clean stale failures (outside the window)
  if (now - circuit.lastFailureAt > FAILURE_WINDOW_MS) {
    circuit.failures = 0;
  }

  circuit.failures++;
  circuit.lastFailureAt = now;

  // Check if threshold exceeded
  if (circuit.failures >= FAILURE_THRESHOLD) {
    circuit.state = 'open';
    circuit.openedAt = now;
    console.log(`[circuitBreaker] ${adapterName}: closed → open (${circuit.failures} failures in ${FAILURE_WINDOW_MS}ms)`);
  }
}

/**
 * Get current circuit breaker stats for all adapters.
 * Used by fleet-admin for inspection.
 */
export function getCircuitBreakerStats(): Record<string, CircuitStats> {
  const stats: Record<string, CircuitStats> = {};
  for (const [name, circuit] of circuits) {
    stats[name] = { ...circuit };
  }
  return stats;
}

/**
 * Load persisted circuit breaker state from a sequence job's context.
 * Called at the start of a sequence to restore cross-invocation state.
 */
export function loadPersistedState(
  persistedCircuits: Record<string, CircuitStats> | undefined,
): void {
  if (!persistedCircuits) return;

  const now = Date.now();
  for (const [name, state] of Object.entries(persistedCircuits)) {
    // Only restore circuits that are still in open/half-open state
    // and whose cooldown hasn't already elapsed
    if (state.state === 'open' && now - state.openedAt < COOLDOWN_MS) {
      circuits.set(name, { ...state });
    } else if (state.state === 'half-open') {
      circuits.set(name, { ...state });
    }
    // Closed circuits don't need restoration
  }
}

/**
 * Get circuit breaker state to persist in sequence job context.
 * Only includes non-closed circuits (to minimize stored data).
 */
export function getStateToPersist(): Record<string, CircuitStats> | undefined {
  const nonClosed: Record<string, CircuitStats> = {};
  let hasEntries = false;

  for (const [name, circuit] of circuits) {
    if (circuit.state !== 'closed') {
      nonClosed[name] = { ...circuit };
      hasEntries = true;
    }
  }

  return hasEntries ? nonClosed : undefined;
}
