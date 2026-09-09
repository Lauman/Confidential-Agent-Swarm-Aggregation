import { deliberationModule } from './deliberation.js';
import { signalEstimateModule } from './signal-estimate.js';
const modules = [deliberationModule, signalEstimateModule];
export const USE_CASE_REGISTRY = Object.fromEntries(modules.map((m) => [m.id, m]));
export function isKnownUseCase(id) {
    return id in USE_CASE_REGISTRY;
}
export function getUseCase(id) {
    return USE_CASE_REGISTRY[id];
}
export const SUPPORTED_USE_CASES = Object.keys(USE_CASE_REGISTRY);
//# sourceMappingURL=registry.js.map