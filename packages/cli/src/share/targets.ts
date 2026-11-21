import type { DevConfig, ShareTarget } from '../config.ts';
import { platformOf } from '../platforms/index.ts';
import { fail } from '../util.ts';
import type { TunnelAddress, TunnelProtocol } from './provider.ts';

export interface TargetSpec {
  name: ShareTarget;
  protocol: TunnelProtocol;
  /** Players connect here with a Minecraft client, so the real address is worth forwarding (PROXY protocol) */
  clientFacing: boolean;
  port(config: DevConfig): number;
  /** Why it can't be shared right now, or undefined */
  unavailable(config: DevConfig): string | undefined;
  /** Help text printed next to the address */
  describe(address: TunnelAddress, config: DevConfig): string;
}

/** Every proxy and standalone instance can be shared (backends are reached through their proxy), plus the web console. */
export function targetSpecs(config: DevConfig): Record<ShareTarget, TargetSpec> {
  const specs: Record<ShareTarget, TargetSpec> = {};
  for (const instance of config.instances) {
    const def = platformOf(instance.type);
    if (def.role !== 'proxy' && instance.network) {
      continue;
    }
    specs[instance.name] = {
      name: instance.name,
      protocol: 'tcp',
      clientFacing: def.role === 'proxy',
      port: () => instance.port,
      unavailable: () => (instance.enabled ? undefined : `${instance.name} is disabled in the mcdev config`),
      describe: (address) => address.display,
    };
  }
  specs.web = {
    name: 'web',
    protocol: 'http',
    clientFacing: false,
    port: (c) => c.web.port,
    unavailable: (c) =>
      c.web.bind === '127.0.0.1' ? undefined : 'the web target needs web.bind = "127.0.0.1" (the tunnel provides the HTTPS)',
    describe: (address, c) => `${address.url}/${c.ui.session}`,
  };
  return specs;
}

/** What `share start` opens without arguments: [share].targets, or every enabled proxy and standalone instance. */
export function defaultTargets(config: DevConfig): ShareTarget[] {
  if (config.share.targets.length > 0) {
    return config.share.targets;
  }
  return config.instances.filter((i) => i.enabled && (platformOf(i.type).role === 'proxy' || !i.network)).map((i) => i.name);
}

/** Validates target names; keeps first occurrences only. */
export function parseTargets(config: DevConfig, names: string[]): ShareTarget[] {
  const specs = targetSpecs(config);
  const targets: ShareTarget[] = [];
  for (const name of names) {
    if (!(name in specs)) {
      fail(`Unknown share target "${name}". Available: ${Object.keys(specs).join(', ')}`);
    }
    if (!targets.includes(name)) {
      targets.push(name);
    }
  }
  return targets;
}
