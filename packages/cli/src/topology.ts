import type { DevConfig, InstanceConfig, NetworkConfig } from './config.ts';
import { platformOf } from './platforms/index.ts';
import { fail } from './util.ts';

export function networkOf(config: DevConfig, instance: InstanceConfig): NetworkConfig | undefined {
  return instance.network ? config.networks.find((network) => network.name === instance.network) : undefined;
}

/** The enabled proxies of a network. */
export function proxiesOf(config: DevConfig, network: string): InstanceConfig[] {
  return config.instances.filter((i) => i.enabled && i.network === network && platformOf(i.type).role === 'proxy');
}

/** The enabled backends a network's proxies route to, in config order. */
export function serversOf(config: DevConfig, network: string): InstanceConfig[] {
  return config.instances.filter((i) => i.enabled && i.network === network && platformOf(i.type).role === 'server');
}

/** Instances outside every network: standalone servers. */
export function standalone(config: DevConfig): InstanceConfig[] {
  return config.instances.filter((i) => !i.network);
}

/** Name used in template variables: `lobby-2` -> `LOBBY_2`. */
export function varName(name: string): string {
  return name.toUpperCase().replace(/[^A-Z0-9]/g, '_');
}

/**
 * Checks names, types, networks and ports. Runs after extensions registered their platforms, so every `type`
 * can be looked up. Messages name the offending instance and key.
 */
export function validateTopology(config: DevConfig): void {
  const names = new Set<string>();
  for (const instance of config.instances) {
    if (!/^[A-Za-z0-9_-]+$/.test(instance.name ?? '')) {
      fail(`Invalid instance name "${instance.name}" (letters, digits, - and _ only)`);
    }
    if (names.has(instance.name)) {
      fail(`Duplicate instance name "${instance.name}" in the config`);
    }
    names.add(instance.name);
    if (typeof instance.type !== 'string') {
      fail(`Instance "${instance.name}" has no type`);
    }
    platformOf(instance.type);
    for (const key of ['port', 'debug_port'] as const) {
      if (!Number.isInteger(instance[key])) {
        fail(`Instance "${instance.name}" needs an integer ${key}`);
      }
    }
  }

  const networks = new Set<string>();
  for (const network of config.networks) {
    if (networks.has(network.name)) {
      fail(`Duplicate network "${network.name}"`);
    }
    networks.add(network.name);
    if (network.forwarding !== 'auto' && network.forwarding !== 'modern') {
      fail(`Network "${network.name}": forwarding = "${network.forwarding}" is not supported yet (use "auto" or "modern")`);
    }
  }

  for (const instance of config.instances) {
    const def = platformOf(instance.type);
    if (instance.network && !networks.has(instance.network)) {
      fail(`Instance "${instance.name}" is in network "${instance.network}", which is not defined ([[networks]])`);
    }
    if (def.role === 'proxy' && !instance.network) {
      fail(`Proxy "${instance.name}" needs a network (network = "...")`);
    }
  }

  for (const network of config.networks) {
    const proxies = config.instances.filter((i) => i.network === network.name && platformOf(i.type).role === 'proxy');
    if (proxies.length === 0) {
      fail(`Network "${network.name}" has no proxy`);
    }
  }

  const ports = new Map<number, string>();
  for (const instance of config.instances.filter((i) => i.enabled)) {
    for (const [key, port] of [['port', instance.port], ['debug_port', instance.debug_port]] as const) {
      const other = ports.get(port);
      if (other) {
        fail(`Port ${port} is used by both ${other} and ${instance.name} ${key}`);
      }
      ports.set(port, `${instance.name} ${key}`);
    }
  }
}
