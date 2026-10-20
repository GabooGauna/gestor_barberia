// Image/HTTP-client prerequisites only. No backup, key, database connection,
// credential-store import, Auth account, migration, network or published port.
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';

const endpoint = 'npipe:////./pipe/dockerDesktopLinuxEngine';
const postgresImage = 'public.ecr.aws/supabase/postgres:17.11.0.004@sha256:06ddc7962e11ab0f4f0334fd05671e97c30ea202f6e6a7113800bd3d6e416108';
const authImage = 'ghcr.io/supabase/gotrue:v2.197.0@sha256:1736a63078f5922b198c4cbe50f80ab9a2d3b54fe8b7b6cfb2e9dc5dbbc12c6b';
const names = [];
let stage = 'validate_local_docker';
let failure;
let result;

function docker(args, allowFailure = false) {
  const r = spawnSync('docker', ['--host', endpoint, ...args], {
    encoding: 'utf8', timeout: 90000, maxBuffer: 1024 * 1024,
    windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  // Neither errors nor Docker/image output are forwarded to the console.
  if (!allowFailure && (r.error || r.status !== 0)) throw Error('local_operation_failed');
  return r;
}

function probe(image, user, shell) {
  const name = `stage04-auth-recovery-preflight-${randomBytes(12).toString('hex')}`;
  names.push(name);
  const args = ['run', '--detach', '--pull', 'never', '--name', name,
    '--network', 'none', '--log-driver', 'none', '--read-only',
    '--user', user, '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
    '--memory', '128m', '--memory-swap', '128m', '--pids-limit', '32',
    '--entrypoint', 'sh', image, '-c', 'sleep 90'];
  docker(args);
  const state = JSON.parse(docker(['inspect', '--format', '{{json .}}', name]).stdout);
  if (state.HostConfig.NetworkMode !== 'none' || state.HostConfig.LogConfig.Type !== 'none' ||
      !state.HostConfig.ReadonlyRootfs || (state.HostConfig.Binds ?? []).length ||
      Object.keys(state.HostConfig.PortBindings ?? {}).length ||
      (state.Mounts ?? []).length ||
      state.HostConfig.Memory !== 134217728 || state.HostConfig.MemorySwap !== state.HostConfig.Memory) {
    throw Error('isolation_verification_failed');
  }
  const response = docker(['exec', '--user', user, name, 'sh', '-c', shell]);
  if (response.stdout.trim() !== 'AVAILABLE') throw Error('required_binary_unavailable');
}

try {
  if (process.argv.length !== 2 || process.platform !== 'win32') throw Error('windows_no_arguments_required');
  if (process.env.DOCKER_HOST && process.env.DOCKER_HOST !== endpoint) throw Error('docker_host_override_forbidden');
  const context = JSON.parse(docker(['context', 'inspect']).stdout);
  if (context.length !== 1 || context[0].Endpoints?.docker?.Host !== endpoint) throw Error('local_context_required');
  stage = 'verify_cached_images';
  for (const image of [postgresImage, authImage]) {
    const metadata = JSON.parse(docker(['image', 'inspect', image]).stdout);
    if (metadata.length !== 1 || metadata[0].Os !== 'linux') throw Error('cached_linux_image_required');
  }
  stage = 'probe_postgres_curl';
  // curl --config - permits the future probe to supply HTTP headers and JSON
  // through stdin, rather than command arguments or Docker-config environment.
  probe(postgresImage, 'postgres', 'command -v curl >/dev/null 2>&1 && printf AVAILABLE');
  stage = 'probe_auth_executable';
  probe(authImage, '65534:65534', 'command -v auth >/dev/null 2>&1 && printf AVAILABLE');
  result = {
    phase: 'auth_recovery_prerequisites_only', postgresCurlAvailable: true,
    authExecutableAvailable: true, authVersionPinned: 'v2.197.0',
    cachedImagesOnly: true, network: 'none', publishedPorts: false,
    logs: 'none', containerSwapDisabled: true, hostPagingExcluded: false,
    backupOrKeysRead: false, databaseConnectionAttempted: false,
    authRecoveryVerified: false, fullSupabaseRecoveryVerified: false,
  };
} catch {
  failure = `Auth recovery prerequisite stopped at ${stage}; raw diagnostics suppressed.`;
} finally {
  for (const name of names) {
    docker(['rm', '--force', name], true);
    const remaining = docker(['container', 'ls', '--all', '--filter', `name=^/${name}$`, '--format', '{{.Names}}'], true);
    if (remaining.error || remaining.status !== 0 || remaining.stdout.trim()) {
      failure = `${failure ? `${failure} ` : ''}Cleanup unconfirmed for ${name}.`;
    }
  }
}
if (failure) {
  console.error(failure);
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ ...result, exactContainerCleanupVerified: true }));
}
