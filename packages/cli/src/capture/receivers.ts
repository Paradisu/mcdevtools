import type { DevConfig } from '../config.ts';
import { platformOf } from '../platforms/index.ts';
import type { Instance } from '../templates.ts';
import { proxiesOf } from '../topology.ts';
import type { ConnMeta } from './store.ts';

/**
 * Who receives a packet. `dir` is 0 for serverbound, 1 for clientbound.
 *
 * - proxy frontend (client link): serverbound reaches the proxy, clientbound reaches the client
 * - proxy backend link: serverbound reaches the backend (found by its port), clientbound reaches the proxy
 * - backend in a network: its peer is the network's proxy
 * - standalone server (Limbo): players are transferred straight to it, so its peer is the client
 */
export function receiverOf(config: DevConfig, instance: Instance, conn: ConnMeta, dir: number): string {
  if (instance.def.role === 'proxy') {
    if (conn.leg === 0) {
      return dir === 0 ? instance.name : 'client';
    }
    return dir === 0 ? backendName(config, conn.remote) : instance.name;
  }
  if (dir === 0) {
    return instance.name;
  }
  return (instance.network ? proxiesOf(config, instance.network.name)[0]?.name : undefined) ?? 'client';
}

/** `from→to` for a packet; the sender is whoever receives the opposite direction on the same link. */
export function linkOf(config: DevConfig, instance: Instance, conn: ConnMeta, dir: number): string {
  return `${receiverOf(config, instance, conn, 1 - dir)}→${receiverOf(config, instance, conn, dir)}`;
}

/** Names of the proxies, which sort right after the client in capture tables. */
export function proxyNames(config: DevConfig): Set<string> {
  return new Set(config.instances.filter((i) => platformOf(i.type).role === 'proxy').map((i) => i.name));
}

function backendName(config: DevConfig, remote: string): string {
  const port = Number(remote.slice(remote.lastIndexOf(':') + 1));
  return config.instances.find((i) => i.enabled && i.port === port)?.name ?? remote;
}
