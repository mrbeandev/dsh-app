import { createContext } from 'react';
import type { WireEvent } from '../lib/protocol';

/**
 * Loads a folded step's full events on demand (chat screen provides it). Rows built from lite
 * events call this when expanded: phone DB first, the Harness once if that range was never stored.
 */
export type StepLoader = { load: (fromSeq: number, toSeq: number) => Promise<WireEvent[]> };
export const StepDetailContext = createContext<StepLoader | null>(null);
