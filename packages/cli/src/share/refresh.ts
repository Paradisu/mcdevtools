import type { DevConfig } from '../config.ts';
import { emit } from '../extension/hooks.ts';
import { isRunning, rerender } from '../instances.ts';
import { sendLine } from '../supervisor.ts';
import { instancesOf } from '../templates.ts';
import { logLine } from './state.ts';
import { shareAddresses } from './state.ts';

/**
 * Re-renders every proxy's preset configs with the current public addresses, then tells the running ones to reload
 * (extension hooks first, then the platform's own reload command). Returns the proxies that were reloaded.
 */
export async function refreshProxies(config: DevConfig): Promise<string[]> {
  const reloaded: string[] = [];
  for (const proxy of instancesOf(config).filter((i) => i.enabled && i.def.role === 'proxy')) {
    if (!(await rerender(config, proxy.name)) || !isRunning(proxy)) {
      continue;
    }
    await emit('shareAddressesChanged', config, proxy, shareAddresses());
    if (proxy.def.reloadCommand) {
      await sendLine(proxy, proxy.def.reloadCommand);
    }
    reloaded.push(proxy.name);
  }
  if (reloaded.length > 0) {
    logLine(`reloaded ${reloaded.join(', ')} with the new transfer addresses`);
  }
  return reloaded;
}
