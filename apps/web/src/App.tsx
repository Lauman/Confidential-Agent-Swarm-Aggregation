import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchCurrentRound,
  fetchLocalTeePub,
  fetchRecentRounds,
  fetchStatus,
  fetchVerdict,
  runDemoRound,
} from './api.js';
import { agentEnsName, readTeeSignPub } from './ens.js';
import { verifyVerdictSignature } from './verify.js';
import { assignPersona } from '@private-signal-swarm/confidential-core';
import { findProposal } from './data/proposals.js';
import {
  CHECKPOINT_TX,
  PRESET_PROPOSALS,
  hashscanTxUrl,
  type RoundView,
  type StatusEntry,
  type VerdictView,
} from './types.js';

const USE_CASE = 'deliberation.v1';
const SHORT_HASH = 12;

function shortHash(value: string): string {
  return value.length > SHORT_HASH ? `${value.slice(0, SHORT_HASH)}…` : value;
}

function CheckIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M2 7.5 5.5 11 12 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SealIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <rect x="2.5" y="6" width="9" height="6.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M4.5 6V4.5a2.5 2.5 0 0 1 5 0V6" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function readProposalFromUrl(): string {
  try {
    const ref = new URLSearchParams(window.location.search).get('proposal');
    return ref && ref.trim().length > 0 ? ref : PRESET_PROPOSALS[0].ref;
  } catch {
    return PRESET_PROPOSALS[0].ref;
  }
}

export default function App() {
  const [round, setRound] = useState<RoundView | null>(null);
  const [feed, setFeed] = useState<RoundView[]>([]);
  const [verdict, setVerdict] = useState<VerdictView | null>(null);
  const [statusEntries, setStatusEntries] = useState<StatusEntry[]>([]);
  const [reachable, setReachable] = useState<boolean | null>(null);
  const [proposalRef, setProposalRef] = useState(readProposalFromUrl);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; tone: 'info' | 'error' } | null>(null);
  const [verifiedRounds, setVerifiedRounds] = useState<Record<string, boolean>>({});
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [teeKey, setTeeKey] = useState<string | null>(null);
  const seenRound = useRef<string | null>(null);
  const failures = useRef(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('proposal', proposalRef);
      window.history.replaceState(null, '', url);
    } catch {
      /* URL sync is best-effort */
    }
  }, [proposalRef]);

  const doVerify = useCallback(
    async (v: VerdictView): Promise<boolean> => {
      setVerifying(true);
      setVerifyError(null);
      try {
        let key = teeKey;
        if (!key) {
          key = await readTeeSignPub();
          if (mounted.current) {
            setTeeKey(key);
          }
        }
        if (key && verifyVerdictSignature(v, key)) {
          if (mounted.current) {
            setVerifiedRounds((m) => ({ ...m, [v.roundId]: true }));
          }
          return true;
        }
        const local = await fetchLocalTeePub();
        if (local?.signPub && verifyVerdictSignature(v, local.signPub)) {
          if (mounted.current) {
            setVerifiedRounds((m) => ({ ...m, [v.roundId]: true }));
          }
          return true;
        }
        if (!key && !local?.signPub) {
          if (mounted.current) {
            setVerifyError(
              'TEE key unreachable (keys.bombus.eth via Sepolia). Check connection and retry.'
            );
          }
          return false;
        }
        if (mounted.current) {
          setVerifyError('Signature mismatch — do not trust this verdict.');
        }
        return false;
      } finally {
        if (mounted.current) {
          setVerifying(false);
        }
      }
    },
    [teeKey]
  );

  useEffect(() => {
    const tick = async () => {
      if (document.hidden) {
        return;
      }
      const [current, status, recent] = await Promise.all([
        fetchCurrentRound(USE_CASE),
        fetchStatus(),
        fetchRecentRounds(5),
      ]);
      if (!mounted.current) {
        return;
      }
      if (!current && status.length === 0) {
        failures.current += 1;
        if (failures.current >= 3) {
          setRound(null);
          setReachable(false);
        }
        return;
      }
      failures.current = 0;
      setReachable(true);
      if (current) {
        setRound(current);
      }
      setStatusEntries(status);
      setFeed(recent);

      const available = status.find((s) => s.useCase === USE_CASE);
      if (available && available.roundId !== seenRound.current) {
        const v = await fetchVerdict(USE_CASE);
        if (v && mounted.current) {
          seenRound.current = v.roundId;
          setVerdict(v);
        }
      }
    };

    void tick();
    const timer = setInterval(() => void tick(), 1200);
    const onVis = () => {
      if (!document.hidden) {
        void tick();
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      mounted.current = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  // Auto-prove each new verdict: belief follows evidence, never precedes it.
  useEffect(() => {
    if (verdict && !verifiedRounds[verdict.roundId] && !verifying) {
      void doVerify(verdict);
    }
  }, [verdict, verifiedRounds, verifying, doVerify]);

  async function deliberate() {
    const ref = proposalRef.trim();
    if (!ref || busy) {
      return;
    }
    setBusy(true);
    setNotice(null);
    const result = await runDemoRound(ref);
    if (!mounted.current) {
      return;
    }
    setNotice({ text: result.message, tone: result.ok ? 'info' : 'error' });
    setBusy(false);
  }

  const noticeRef = useRef<HTMLParagraphElement | null>(null);

  useEffect(() => {
    if (notice && notice.tone === 'error') {
      noticeRef.current?.focus();
    }
  }, [notice]);

  const slots = round ? Array.from({ length: Math.max(round.quorum, 0) }) : [];
  const filled = round ? (round.submittedAgents ?? []) : [];
  const verdictKind = verdict?.payload.verdict;
  const revealed = verdict && verdictKind && verifiedRounds[verdict.roundId] === true;
  const activeProposal = findProposal(proposalRef);

  return (
    <div className="shell">
      <a className="skip" href="#main">
        Skip to swarm
      </a>
      <header className="masthead load-in">
        <div>
          <h1 className="wordmark">Bombus</h1>
          <p className="descriptor">Confidential Swarm Deliberation</p>
          <p className="tagline">
            Agents vote in secret. Only the verdict comes out. Hear the swarm, never the bee.
          </p>
        </div>
        <div className={`health ${reachable ? 'up' : ''}`} role="status">
          <span className="dot" aria-hidden="true" />
          {reachable === null ? 'probing…' : reachable ? 'swarm reachable' : 'swarm unreachable'}
        </div>
      </header>

      {reachable === false && (
        <p className="notice" role="alert">
          Coordinator and resource server are unreachable. Start them on :3001 and :3000, then this
          page comes alive — nothing here is mocked.
        </p>
      )}

      <div className="grid" id="main">
        <section className="panel load-in d1" aria-label="Swarm">
          <h2>Swarm</h2>
          <p className="lede">
            Pick a proposal, open deliberation, watch the slots fill. Each sealed cell is one
            encrypted ballot — identity and proof of encryption, never content. A round needs{' '}
            {round ? `${round.quorum} sealed ballots` : 'a quorum of sealed ballots'} to close.
          </p>

          <div className="proposals" role="group" aria-label="Proposals">
            {PRESET_PROPOSALS.map((p) => (
              <button
                key={p.ref}
                type="button"
                className={`preset${proposalRef === p.ref ? ' active' : ''}`}
                aria-pressed={proposalRef === p.ref}
                onClick={() => setProposalRef(p.ref)}
              >
                {p.label} <span className="expect">→ {p.expect}</span>
              </button>
            ))}
          </div>

          <div className="deliberate-row">
            <input
              aria-label="Proposal reference"
              name="proposalRef"
              autoComplete="off"
              value={proposalRef}
              onChange={(e) => setProposalRef(e.target.value)}
              placeholder="dao-grants-007…"
              spellCheck={false}
            />
            <button type="button" className="deliberate" disabled={busy || !proposalRef.trim()} onClick={deliberate}>
              {busy ? 'Deliberating…' : 'Deliberate'}
            </button>
          </div>

          {notice && (
            <p className="notice" role="status" tabIndex={-1} ref={noticeRef}>
              {notice.text}
            </p>
          )}

          {activeProposal && (
            <div className="proposal-card">
              <div className="proposal-title">{activeProposal.title}</div>
              <p className="proposal-body">{activeProposal.body}</p>
            </div>
          )}

          {round ? (
            <>
              <div className="slots">
                {slots.map((_, i) => {
                  const agent = filled[i];
                  return agent ? (
                    <div className="slot filled" key={agent.agentId}>
                      <div className="who" title={agent.agentId} translate="no">
                        {agentEnsName(agent.agentId)}
                      </div>
                      <div className="persona">{assignPersona(agent.agentId).name}</div>
                      <div className="state">sealed</div>
                      <div className="hash" title={agent.envelopeHash} translate="no">
                        {shortHash(agent.envelopeHash)}
                      </div>
                    </div>
                  ) : (
                    <div className="slot ghost" key={`ghost-${i}`}>
                      awaiting agent
                    </div>
                  );
                })}
                {slots.length === 0 && (
                  <div className="slot ghost">quorum not configured</div>
                )}
              </div>
              <div
                className="quorumbar"
                role="progressbar"
                aria-valuemin={0}
                aria-valuenow={round.submissionCount}
                aria-valuemax={Math.max(round.quorum, 0)}
                aria-label="Quorum progress"
              >
                <div
                  style={{ transform: `scaleX(${round.quorum > 0 ? round.submissionCount / round.quorum : 0})` }}
                />
              </div>
              <div className="quorumlabel" translate="no">
                {round.submissionCount}/{round.quorum} sealed · {round.status} · {round.roundId}
              </div>
            </>
          ) : (
            <div className="empty-state">
              No open round yet. Pick a proposal above and press Deliberate — the swarm's first
              round opens and these slots start filling.
            </div>
          )}

          <ul className="feed" aria-label="Recent rounds">
            {feed.length === 0 && <li className="empty">No completed rounds yet — finished rounds land here.</li>}
            {feed.map((r) => (
              <li key={r.roundId} translate="no">
                <b>{r.roundId.slice(-8)}</b>
                <span>
                  {r.submissionCount} sealed · {r.status} ·{' '}
                  {r.batchHash ? shortHash(r.batchHash) : 'open'}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <div className="sidecol">
          <section className="panel load-in d2" aria-label="Verdict" aria-live="polite">
            <h2>Verdict</h2>
            {!verdict ? (
              <div className="empty-state">
                No verdict yet. Verdicts appear here the moment a round reaches quorum.
              </div>
            ) : !revealed ? (
              <div>
                <p className="lede">
                  Round <b translate="no">{verdict.roundId.slice(-8)}</b> closed with{' '}
                  {verdict.participantCount} sealed ballots. The outcome stays sealed until its TEE
                  signature checks out.
                </p>
                <button
                  type="button"
                  className="deliberate"
                  disabled={verifying}
                  onClick={() => void doVerify(verdict)}
                >
                  {verifying ? 'Verifying…' : 'Verify & reveal'}
                </button>
                {verifyError && (
                  <p className="proof bad" role="alert">
                    {verifyError}
                  </p>
                )}
              </div>
            ) : (
              verdictKind && (
                <div key={verdict.roundId} className="verdict-enter">
                  <div className={`verdict-badge ${verdictKind}`}>{verdictKind}</div>
                  <div className="verdict-meta">
                    <span>
                      proposal <b translate="no">{verdict.payload.proposalRef}</b>
                    </span>
                    <span>
                      participants <b>{verdict.participantCount}</b>
                    </span>
                    <span>
                      round <b translate="no">{verdict.roundId.slice(-8)}</b>
                    </span>
                    <span>
                      sealed{' '}
                      <b>
                        {new Intl.DateTimeFormat(undefined, {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        }).format(new Date(verdict.timestamp))}
                      </b>
                    </span>
                  </div>
                  <div className="sigrow">
                    <span className="sig" title={verdict.teeSignature} translate="no">
                      <SealIcon /> {shortHash(verdict.teeSignature)}
                    </span>
                    <button
                      type="button"
                      className="mini"
                      disabled={verifying}
                      onClick={() => void doVerify(verdict)}
                    >
                      Re-check
                    </button>
                  </div>
                  <p className="proof ok" role="status">
                    <CheckIcon /> Signature valid — computed inside the TEE, untampered.
                  </p>
                  <p className="absence">
                    {verdict.participantCount} agents voted. This page cannot show you how — that
                    information never left the TEE.
                  </p>
                </div>
              )
            )}
          </section>

          <section className="panel load-in d2" aria-label="Receipt">
            <h2>Receipt</h2>
            <p className="lede">Every verdict served here was paid for on Hedera testnet.</p>
            <div className="receipt-tx" translate="no">
              <a href={hashscanTxUrl(CHECKPOINT_TX)} target="_blank" rel="noreferrer">
                {CHECKPOINT_TX}
              </a>
            </div>
            <p className="receipt-meta">
              10,000 test-USDC · Blocky402 facilitator ·{' '}
              {verdict ? (
                <>
                  now serving <b translate="no">{verdict.roundId.slice(-8)}</b>
                </>
              ) : (
                'no verdict on the shelf yet'
              )}{' '}
              · {statusEntries.length} on the shelf
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
