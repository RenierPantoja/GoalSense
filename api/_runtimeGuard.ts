export type GoalsenseRuntimeEnvironment = 'local_worker' | 'local_dev' | 'vercel_preview' | 'vercel_production' | 'unknown';

export type WorkerCommand =
  | 'start_worker'
  | 'stop_worker'
  | 'resume_worker'
  | 'recovery_sweep'
  | 'post_match_sweeper'
  | 'live_monitoring_session'
  | 'long_polling_loop'
  | 'read_status'
  | 'read_reports'
  | 'read_sessions'
  | 'readiness';

const truthy = (value: unknown) => String(value).toLowerCase() === 'true';

export function detectRuntimeEnvironment(env: NodeJS.ProcessEnv = process.env): GoalsenseRuntimeEnvironment {
  const explicit = String(env.GOALSENSE_RUNTIME || '').toLowerCase();
  if (explicit === 'local_worker') return 'local_worker';
  if (explicit === 'local_dev') return 'local_dev';
  if (explicit === 'vercel_control_plane') return env.VERCEL_ENV === 'production' ? 'vercel_production' : 'vercel_preview';
  if (env.VERCEL === '1' || env.VERCEL_ENV) return env.VERCEL_ENV === 'production' ? 'vercel_production' : 'vercel_preview';
  return 'unknown';
}

export function isReadOnlyControlPlane(env: NodeJS.ProcessEnv = process.env): boolean {
  const runtime = detectRuntimeEnvironment(env);
  return runtime === 'vercel_preview' || runtime === 'vercel_production';
}

export function isPersistentWorkerAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  const runtime = detectRuntimeEnvironment(env);
  if (runtime === 'vercel_preview' || runtime === 'vercel_production') return truthy(env.ENABLE_VERCEL_WORKER_COMMANDS);
  if (runtime === 'local_worker') return truthy(env.ENABLE_LOCAL_WORKER_COMMANDS ?? 'true');
  return false;
}

export function isWorkerCommandAllowed(command: WorkerCommand, env: NodeJS.ProcessEnv = process.env): boolean {
  if (command.startsWith('read_') || command === 'readiness') return true;
  const runtime = detectRuntimeEnvironment(env);
  if (runtime === 'vercel_preview' || runtime === 'vercel_production') return truthy(env.ENABLE_VERCEL_WORKER_COMMANDS);
  if (runtime === 'local_worker') return truthy(env.ENABLE_LOCAL_WORKER_COMMANDS ?? 'true');
  return false;
}

export function explainRuntimeGuardDecision(command: WorkerCommand, env: NodeJS.ProcessEnv = process.env) {
  const environment = detectRuntimeEnvironment(env);
  const allowed = isWorkerCommandAllowed(command, env);
  return {
    command,
    allowed,
    environment,
    persistentWorkerAllowed: isPersistentWorkerAllowed(env),
    readOnlyControlPlane: isReadOnlyControlPlane(env),
    reason: allowed ? 'allowed_by_runtime_guard' : `blocked_in_${environment}`,
    safeAction: allowed ? 'continue' : 'run locally via CLI or configure a dedicated worker runtime; use read-only status in Vercel',
    limitations: isReadOnlyControlPlane(env)
      ? ['Vercel is a read-only control plane for persistent worker operations.']
      : [],
  };
}
