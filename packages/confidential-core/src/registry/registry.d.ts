import type { UseCaseModule } from './types.js';
export declare const USE_CASE_REGISTRY: Record<string, UseCaseModule<unknown>>;
export declare function isKnownUseCase(id: string): boolean;
export declare function getUseCase(id: string): UseCaseModule<unknown> | undefined;
export declare const SUPPORTED_USE_CASES: string[];
//# sourceMappingURL=registry.d.ts.map