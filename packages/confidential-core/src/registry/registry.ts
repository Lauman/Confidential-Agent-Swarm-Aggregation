import { USE_CASES } from '@private-signal-swarm/types';
import { deliberationModule } from './deliberation.js';
import { signalEstimateModule } from './signal-estimate.js';
import type { UseCaseModule } from './types.js';

const modules = [deliberationModule, signalEstimateModule];

export const USE_CASE_REGISTRY: Record<string, UseCaseModule<unknown>> = Object.fromEntries(
  modules.map((m) => [m.id, m as UseCaseModule<unknown>])
);

export function isKnownUseCase(id: string): boolean {
  return id in USE_CASE_REGISTRY;
}

export function getUseCase(id: string): UseCaseModule<unknown> | undefined {
  return USE_CASE_REGISTRY[id];
}

export const SUPPORTED_USE_CASES = Object.keys(USE_CASE_REGISTRY);
