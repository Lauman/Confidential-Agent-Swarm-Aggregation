import type { DemoActiveState, DemoStartResult, RoundView, StatusEntry, VerdictView } from './types.js';

const COORD = '/api/coordinator';
const RESOURCE = '/api/resource';

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      return null;
    }
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export function fetchCurrentRound(useCase: string): Promise<RoundView | null> {
  return getJson<RoundView>(`${COORD}/round/current?useCase=${encodeURIComponent(useCase)}`);
}

export function fetchRecentRounds(limit = 5): Promise<RoundView[]> {
  return getJson<{ rounds: RoundView[] }>(`${COORD}/rounds/recent?limit=${limit}`).then(
    (body) => body?.rounds ?? []
  );
}

export function fetchStatus(): Promise<StatusEntry[]> {
  return getJson<{ available: StatusEntry[] }>(`${RESOURCE}/api/status`).then(
    (body) => body?.available ?? []
  );
}

export function fetchVerdict(useCase: string): Promise<VerdictView | null> {
  return getJson<VerdictView>(`${RESOURCE}/api/verdict?useCase=${encodeURIComponent(useCase)}`);
}

export function fetchLocalTeePub(): Promise<{ keyId: string; signPub: string } | null> {
  return getJson<{ keyId: string; signPub: string }>(`${RESOURCE}/api/tee-pub`);
}

export function fetchDemoActive(useCase: string): Promise<DemoActiveState> {
  return getJson<DemoActiveState>(`${COORD}/api/demo/active?useCase=${encodeURIComponent(useCase)}`).then(
    (body) => body ?? { active: false }
  );
}

export async function resetDemoRound(): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await fetch(`${COORD}/api/demo/reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ useCase: 'deliberation' }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { message?: string } | null;
      return { ok: false, message: body?.message ?? `Coordinator refused (${res.status}).` };
    }
    return { ok: true, message: 'Stuck round cleared — press Deliberate to start fresh.' };
  } catch {
    return { ok: false, message: 'Coordinator unreachable at :3001 — is it running?' };
  }
}

export async function runDemoRound(proposalRef: string): Promise<DemoStartResult> {
  try {
    const res = await fetch(`${COORD}/api/demo/run-round`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ proposalRef, useCase: 'deliberation', staggerMs: 800 }),
    });
    if (res.status === 404) {
      return {
        ok: false,
        message: 'Demo endpoint missing on this coordinator — run the agents in a terminal instead.',
      };
    }
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { message?: string } | null;
      return { ok: false, message: body?.message ?? `Coordinator refused (${res.status}).` };
    }
    const body = (await res.json().catch(() => null)) as { roundId?: string } | null;
    return { ok: true, message: 'Round running — watch the slots fill.', roundId: body?.roundId };
  } catch {
    return { ok: false, message: 'Coordinator unreachable at :3001 — is it running?' };
  }
}
