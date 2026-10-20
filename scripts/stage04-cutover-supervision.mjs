// Importable supervision only: no SQL, shell, filesystem, credential, Docker,
// network or production adapter. Default CLI runs synthetic adapter tests.
import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const hash = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
const backupId = value => typeof value === 'string' && /^[0-9a-f]{32}$/.test(value);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const failure = code => Object.assign(new Error(code), { supervisionCode: code });

async function settledWithin(promise, milliseconds) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve(promise).then(value => ({ settled: true, value }), () => ({ settled: true, rejected: true })),
      new Promise(resolve => { timer = setTimeout(() => resolve({ settled: false }), milliseconds); }),
    ]);
  } finally { clearTimeout(timer); }
}

export class CutoverSupervision {
  constructor({ protocol, capture, verifyRestore, confirmCleanup, freshControlObservation,
    expectedControlFingerprint, projectRef = 'ucmwykzrepmjucssjnum',
    checkpointIntervalMs = 1000, checkpointTimeoutMs = 5000,
    captureTimeoutMs = 600000, restoreTimeoutMs = 600000, settlementTimeoutMs = 30000 }) {
    if (!protocol?.signal?.addEventListener || ['begin', 'checkpoint', 'continueExpand', 'abort'].some(k => typeof protocol[k] !== 'function') ||
        [capture, verifyRestore, confirmCleanup, freshControlObservation].some(v => typeof v !== 'function') || !hash(expectedControlFingerprint)) {
      throw failure('supervision_adapters_required');
    }
    for (const ms of [checkpointIntervalMs, checkpointTimeoutMs, captureTimeoutMs, restoreTimeoutMs, settlementTimeoutMs]) {
      if (!Number.isSafeInteger(ms) || ms < 1) throw failure('bounded_timeouts_required');
    }
    Object.assign(this, { protocol, capture, verifyRestore, confirmCleanup, freshControlObservation, expectedControlFingerprint, projectRef,
      checkpointIntervalMs, checkpointTimeoutMs, captureTimeoutMs, restoreTimeoutMs, settlementTimeoutMs });
    this.runId = randomBytes(16).toString('hex'); this.controller = new AbortController();
    this.workers = []; this.pendingChecks = new Set(); this.queue = Promise.resolve();
    this.state = 'prepared'; this.reason = null; this.monitorStop = false; this.monitor = null;
    this.expandAcknowledged = false;
    this.onHolderAbort = () => this.fail('holder_or_freeze_aborted');
    protocol.signal.addEventListener('abort', this.onHolderAbort);
    if (protocol.signal.aborted) this.onHolderAbort();
  }
  fail(code) {
    if (!this.reason) this.reason = code;
    if (!this.controller.signal.aborted) this.controller.abort(failure(code));
    this.wakeMonitor?.();
  }
  async checkpoint() {
    const work = this.queue.then(async () => {
      if (this.controller.signal.aborted) throw failure('supervision_aborted');
      // protocol.checkpoint checks holder PID/locks; its catalog observer and
      // freshControlObservation MUST use separate, fresh connections/processes.
      // Never import an observer BEGIN/ROLLBACK into the holder session.
      await this.protocol.checkpoint();
      const control = await this.freshControlObservation({ runId: this.runId, signal: this.controller.signal });
      if (!hash(control?.fingerprint) || control.fingerprint !== this.expectedControlFingerprint) throw failure('control_plane_drift');
      if (this.controller.signal.aborted) throw failure('supervision_aborted');
      return true;
    });
    this.queue = work.catch(() => {}); this.pendingChecks.add(work);
    work.finally(() => this.pendingChecks.delete(work)).catch(() => {});
    const outcome = await settledWithin(work, this.checkpointTimeoutMs);
    if (!outcome.settled) { this.fail('checkpoint_timeout'); throw failure('checkpoint_timeout'); }
    if (outcome.rejected) {
      let code = 'holder_or_control_checkpoint_failed';
      try { await work; } catch (error) { if (error.supervisionCode === 'control_plane_drift') code = error.supervisionCode; }
      this.fail(code); throw failure(code);
    }
    return true;
  }
  startMonitoring() {
    this.monitor = (async () => {
      while (!this.monitorStop && !this.controller.signal.aborted) {
        await new Promise(resolve => {
          const timer = setTimeout(resolve, this.checkpointIntervalMs);
          this.wakeMonitor = () => { clearTimeout(timer); resolve(); };
        });
        this.wakeMonitor = null;
        if (this.monitorStop || this.controller.signal.aborted) break;
        try { await this.checkpoint(); } catch { break; }
      }
    })();
  }
  worker(name, call) {
    const entry = { name, started: false, settled: false, cleanupConfirmed: false };
    entry.completion = Promise.resolve().then(() => {
      if (this.controller.signal.aborted) throw failure('supervision_aborted');
      entry.started = true; return call();
    }).then(
      value => { entry.settled = true; return { ok: true, value }; },
      () => { entry.settled = true; return { ok: false }; },
    );
    this.workers.push(entry); return entry;
  }
  async awaitWorker(entry, timeoutMs) {
    let timer, onAbort;
    try {
      const outcome = await Promise.race([
        entry.completion,
        new Promise(resolve => { timer = setTimeout(() => resolve({ timeout: true }), timeoutMs); }),
        new Promise(resolve => {
          onAbort = () => resolve({ aborted: true });
          this.controller.signal.addEventListener('abort', onAbort, { once: true });
          if (this.controller.signal.aborted) onAbort();
        }),
      ]);
      if (outcome.timeout) { this.fail(`${entry.name}_timeout`); throw failure(`${entry.name}_timeout`); }
      if (outcome.aborted || this.controller.signal.aborted) throw failure('supervision_aborted');
      if (!outcome.ok) { this.fail(`${entry.name}_failed`); throw failure(`${entry.name}_failed`); }
      return outcome.value;
    } finally {
      clearTimeout(timer); this.controller.signal.removeEventListener('abort', onAbort);
    }
  }
  async cleanup(entry) {
    if (entry.cleanupConfirmed) return true;
    if (!entry.started && entry.settled) { entry.cleanupConfirmed = true; return true; }
    const proof = await settledWithin(Promise.resolve().then(() => this.confirmCleanup({ runId: this.runId, worker: entry.name })), this.settlementTimeoutMs);
    const p = proof.value;
    // Future adapters must check an exact RunId ownership ledger and verify
    // absence of EVERY owned process/container. A killed PowerShell parent or
    // a fulfilled Promise is not such a proof. No real adapter is included.
    const valid = proof.settled && !proof.rejected && p?.runId === this.runId && p.worker === entry.name &&
      p.confirmed === true && Array.isArray(p.resources) && p.resources.length > 0 &&
      p.resources.every(r => r.ownerRunId === this.runId && typeof r.id === 'string' && r.id.length > 0 && r.absent === true);
    entry.cleanupConfirmed = entry.settled && valid;
    return entry.cleanupConfirmed;
  }
  validateCapture(value) {
    if (!value || value.kind !== 'stage04.capture.v1' || value.runId !== this.runId || value.projectRef !== this.projectRef ||
        !backupId(value.backupId) || value.snapshot !== this.snapshot || value.artifact == null ||
        !['manifestSha256', 'databaseCipherSha256', 'rolesCipherSha256'].every(k => hash(value[k]))) throw failure('capture_evidence_invalid');
    return value;
  }
  validateRestore(value, captured) {
    if (!value || value.kind !== 'stage04.restore.v1' || value.runId !== this.runId || value.projectRef !== this.projectRef ||
        ['backupId', 'snapshot', 'manifestSha256', 'databaseCipherSha256', 'rolesCipherSha256'].some(k => value[k] !== captured[k]) ||
        !['gcmAuthenticated', 'ciphertextHashesVerified', 'plaintextHashesVerified', 'postgresRestoreVerified'].every(k => value[k] === true)) {
      throw failure('restore_evidence_invalid');
    }
  }
  async stopAndDrain() {
    this.monitorStop = true; this.wakeMonitor?.();
    const monitor = await settledWithin(this.monitor ?? Promise.resolve(), this.settlementTimeoutMs);
    const checks = await settledWithin(Promise.allSettled([...this.pendingChecks]), this.settlementTimeoutMs);
    let confirmed = monitor.settled && checks.settled;
    for (const entry of this.workers) {
      const outcome = await settledWithin(entry.completion, this.settlementTimeoutMs);
      const clean = await this.cleanup(entry);
      confirmed = confirmed && outcome.settled && clean;
    }
    return confirmed;
  }
  async run() {
    if (this.state !== 'prepared') throw failure('supervision_single_run_only');
    let captured, cancellationConfirmed = false;
    try {
      if (this.controller.signal.aborted) throw failure('supervision_aborted');
      this.state = 'beginning'; const frozen = await this.protocol.begin(); this.snapshot = frozen.snapshot;
      if (typeof this.snapshot !== 'string' || !/^[0-9A-Fa-f]+-[0-9A-Fa-f]+-[0-9]+$/.test(this.snapshot)) throw failure('snapshot_evidence_invalid');
      await this.checkpoint(); this.startMonitoring();
      this.state = 'capturing';
      const capture = this.worker('capture', () => this.capture({ runId: this.runId, snapshot: this.snapshot, signal: this.controller.signal }));
      captured = this.validateCapture(await this.awaitWorker(capture, this.captureTimeoutMs));
      if (!await this.cleanup(capture)) throw failure('capture_cleanup_unconfirmed');
      await this.checkpoint(); this.state = 'restoring';
      const restore = this.worker('restore', () => this.verifyRestore(captured.artifact, {
        runId: this.runId, snapshot: this.snapshot, backupId: captured.backupId, signal: this.controller.signal,
        expectedEvidence: { manifestSha256: captured.manifestSha256, databaseCipherSha256: captured.databaseCipherSha256, rolesCipherSha256: captured.rolesCipherSha256 },
      }));
      this.validateRestore(await this.awaitWorker(restore, this.restoreTimeoutMs), captured);
      if (!await this.cleanup(restore)) throw failure('restore_cleanup_unconfirmed');
      this.monitorStop = true; this.wakeMonitor?.();
      if (!await this.stopAndDrain()) throw failure('worker_or_observer_cancellation_unconfirmed');
      await this.checkpoint();
      if (this.controller.signal.aborted) throw failure('supervision_aborted');
      this.state = 'expanding';
      // This boolean is internal only, after structured, RunId/snapshot/hash-
      // bound evidence AND confirmed worker cleanup. A bare true from a worker
      // cannot reach this line. Trusted adapters must actually do verification;
      // this coordinator cannot prove that a dishonest adapter did so.
      await this.protocol.continueExpand({ checkpointVerified: true });
      this.expandAcknowledged = true;
      // A final fresh control-plane read is required AFTER COMMIT ACK. Its
      // failure cannot undo or classify the acknowledged expansion as rollback.
      const postCommitRead = Promise.resolve().then(() => this.freshControlObservation({ runId: this.runId, signal: this.controller.signal }));
      this.pendingChecks.add(postCommitRead);
      postCommitRead.finally(() => this.pendingChecks.delete(postCommitRead)).catch(() => {});
      const postCommit = await settledWithin(postCommitRead, this.checkpointTimeoutMs);
      if (!postCommit.settled) throw failure('postcommit_control_timeout');
      if (postCommit.rejected) throw failure('postcommit_control_observation_failed');
      if (!hash(postCommit.value?.fingerprint) || postCommit.value.fingerprint !== this.expectedControlFingerprint) throw failure('postcommit_control_drift');
      this.state = 'expanded_closed'; cancellationConfirmed = true;
    } catch (error) {
      this.fail(error.supervisionCode ?? 'supervision_failed');
      cancellationConfirmed = await this.stopAndDrain();
      const outcomeUnknown = this.protocol.state === 'expand_outcome_unknown';
      const committedIncident = this.expandAcknowledged || ['expanded_drift_incident', 'expanded_reconciliation_required'].includes(this.protocol.state);
      if (!outcomeUnknown && !committedIncident) {
        const stopped = await settledWithin(Promise.resolve().then(() => this.protocol.abort()), this.settlementTimeoutMs);
        cancellationConfirmed = cancellationConfirmed && stopped.settled && !stopped.rejected;
      }
      this.state = outcomeUnknown ? 'expand_outcome_unknown' : committedIncident ? 'expanded_reconciliation_required' :
        cancellationConfirmed ? 'aborted_cleanup_confirmed' : 'cancellation_unconfirmed';
    } finally {
      this.protocol.signal.removeEventListener('abort', this.onHolderAbort);
    }
    return { runId: this.runId, state: this.state, reason: this.reason, snapshot: this.snapshot ?? null,
      backupId: captured?.backupId ?? null, workerSettlementAndCleanupConfirmed: cancellationConfirmed,
      reconciliationRequired: ['expand_outcome_unknown', 'expanded_reconciliation_required'].includes(this.state),
      cutoverEvidenceAccepted: this.state === 'expanded_closed', remoteAdapterReady: false,
      ControlledCutoverResidualRiskAccepted: this.protocol.controlledCutoverResidualRiskAccepted===true, RpoZeroVerified: false };
  }
}

export async function syntheticSupervisionTests() {
  const checks = [];
  async function scenario(mode) {
    const holder = new AbortController(), ledger = new Map(); let continues = 0, abortCalls = 0, checksInFlight = 0, maximumChecks = 0, controlCalls = 0;
    let releaseIgnored;
    const protocol = { signal: holder.signal, state: 'prepared',
      async begin() { this.state = 'frozen'; return { snapshot: '00000003-0000002A-1' }; },
      async checkpoint() { if (holder.signal.aborted) throw Error('synthetic_holder_lost'); },
      async abort() { abortCalls++; if (this.state !== 'expand_outcome_unknown') this.state = 'aborted'; },
      async continueExpand() { continues++; if (mode === 'ambiguous_commit') { this.state = 'expand_outcome_unknown'; throw Error('synthetic_commit_ack_lost'); } this.state = 'expanded_closed'; },
    };
    const evidence = { projectRef: 'ucmwykzrepmjucssjnum', backupId: 'a'.repeat(32), manifestSha256: 'b'.repeat(64), databaseCipherSha256: 'c'.repeat(64), rolesCipherSha256: 'd'.repeat(64) };
    async function job(name, context) {
      ledger.set(name, { runId: context.runId, absent: false });
      try {
        if ((['loss_capture','loss_cleanup_unconfirmed','loss_ignored'].includes(mode) && name === 'capture') || mode === 'loss_restore' && name === 'restore') setTimeout(() => holder.abort(), 5);
        if (mode === 'loss_ignored') await new Promise(resolve => { releaseIgnored = resolve; });
        else await new Promise((resolve, reject) => {
          const timer = setTimeout(resolve, 18); const cancelled = () => { clearTimeout(timer); reject(Error('synthetic_cancelled')); };
          context.signal.addEventListener('abort', cancelled, { once: true });
          if (context.signal.aborted) cancelled();
        });
        if (name === 'restore' && mode === 'restore_failed') throw Error('synthetic_restore_failed');
      } finally { ledger.get(name).absent = true; }
    }
    const instance = new CutoverSupervision({ protocol, expectedControlFingerprint: 'e'.repeat(64), checkpointIntervalMs: 3,
      checkpointTimeoutMs: 50, captureTimeoutMs: mode === 'capture_timeout' ? 5 : 100, restoreTimeoutMs: 100, settlementTimeoutMs: 12,
      capture: async context => { await job('capture', context); return { kind: 'stage04.capture.v1', ...evidence, runId: context.runId, snapshot: context.snapshot, artifact: { synthetic: true } }; },
      verifyRestore: async (_artifact, context) => {
        await job('restore', context);
        if (mode === 'bare_boolean') return true;
        return { kind: 'stage04.restore.v1', ...evidence, backupId: mode === 'wrong_backup' ? 'f'.repeat(32) : evidence.backupId,
          runId: context.runId, snapshot: context.snapshot, gcmAuthenticated: true, ciphertextHashesVerified: true, plaintextHashesVerified: true, postgresRestoreVerified: true };
      },
      confirmCleanup: async ({ runId, worker }) => ({ runId, worker, confirmed: mode !== 'loss_cleanup_unconfirmed',
        resources: [{ id: `synthetic-${worker}`, ownerRunId: runId, absent: ledger.get(worker)?.absent === true }] }),
      freshControlObservation: async () => {
        checksInFlight++; maximumChecks = Math.max(maximumChecks, checksInFlight); await sleep(1); checksInFlight--; controlCalls++;
        if (mode === 'postcommit_failure' && protocol.state === 'expanded_closed') throw Error('synthetic_postcommit_observation_failed');
        return { fingerprint: mode === 'control_drift' && controlCalls > 1 || mode === 'postcommit_drift' && protocol.state === 'expanded_closed' ? 'f'.repeat(64) : 'e'.repeat(64) };
      },
    });
    const result = await instance.run();
    if (releaseIgnored) { releaseIgnored(); await Promise.all(instance.workers.map(w => w.completion)); }
    assert.equal(maximumChecks, 1, 'control observations must be serial');
    return { result, continues, abortCalls, ledger };
  }
  let s = await scenario('success'); assert.equal(s.result.state, 'expanded_closed'); assert.equal(s.continues, 1); checks.push('bound_evidence_and_cleanup_admit_once');
  s = await scenario('loss_capture'); assert.equal(s.result.state, 'aborted_cleanup_confirmed'); assert.equal(s.continues, 0); assert.equal(s.ledger.get('capture').absent, true); checks.push('holder_loss_waits_for_worker_and_cleanup');
  s = await scenario('loss_restore'); assert.equal(s.result.state, 'aborted_cleanup_confirmed'); assert.equal(s.continues, 0); assert.equal(s.ledger.get('restore').absent, true); checks.push('holder_loss_during_restore_waits_for_cleanup');
  s = await scenario('capture_timeout'); assert.equal(s.result.state, 'aborted_cleanup_confirmed'); assert.equal(s.result.reason, 'capture_timeout'); assert.equal(s.continues, 0); checks.push('worker_timeout_cancels_and_waits');
  s = await scenario('loss_cleanup_unconfirmed'); assert.equal(s.result.state, 'cancellation_unconfirmed'); assert.equal(s.continues, 0); checks.push('missing_cleanup_confirmation_blocks_continuation');
  s = await scenario('loss_ignored'); assert.equal(s.result.state, 'cancellation_unconfirmed'); assert.equal(s.continues, 0); checks.push('ignored_cancellation_never_claimed_stopped');
  s = await scenario('control_drift'); assert.equal(s.result.state, 'aborted_cleanup_confirmed'); assert.equal(s.continues, 0); checks.push('control_plane_drift_cancels_worker');
  s = await scenario('restore_failed'); assert.equal(s.result.state, 'aborted_cleanup_confirmed'); assert.equal(s.continues, 0); checks.push('failed_restore_blocks_expand');
  s = await scenario('bare_boolean'); assert.equal(s.result.cutoverEvidenceAccepted, false); assert.equal(s.continues, 0); checks.push('bare_boolean_restore_not_evidence');
  s = await scenario('wrong_backup'); assert.equal(s.result.cutoverEvidenceAccepted, false); assert.equal(s.continues, 0); checks.push('snapshot_backup_manifest_binding_required');
  s = await scenario('ambiguous_commit'); assert.equal(s.result.state, 'expand_outcome_unknown'); assert.equal(s.result.reconciliationRequired, true); assert.equal(s.continues, 1); checks.push('ambiguous_commit_propagated_no_retry');
  s = await scenario('postcommit_drift'); assert.equal(s.result.state, 'expanded_reconciliation_required'); assert.equal(s.result.reason, 'postcommit_control_drift'); assert.equal(s.abortCalls, 0); checks.push('postcommit_control_drift_never_reported_rollback');
  s = await scenario('postcommit_failure'); assert.equal(s.result.state, 'expanded_reconciliation_required'); assert.equal(s.result.reason, 'postcommit_control_observation_failed'); assert.equal(s.abortCalls, 0); checks.push('postcommit_control_failure_requires_reconciliation');
  return { checks, count: checks.length, adapters: 'synthetic_only', protocolOrBackupSuitesRepeated: false,
    realHolderDisconnectTested: false, realProcessCancellationTested: false,
    remoteOperations: false, credentialsRead: false, remoteAdapterReady: false };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.length !== 2) throw failure('arguments_forbidden');
    console.log(JSON.stringify(await syntheticSupervisionTests()));
  } catch { console.error('Synthetic supervision validation failed; raw adapter diagnostics suppressed.'); process.exitCode = 1; }
}
