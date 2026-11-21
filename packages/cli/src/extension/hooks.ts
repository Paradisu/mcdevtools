import type { DevConfig } from '../config.ts';
import type { TunnelAddress } from '../share/provider.ts';
import type { ShareState } from '../share/state.ts';
import type { Instance } from '../templates.ts';

/** Lifecycle events an extension can listen to with `api.on(event, handler)`. Handlers run in registration order. */
export interface Hooks {
  /** `mcdev setup` finished downloading */
  afterSetup(config: DevConfig): void | Promise<void>;
  /** Instances were selected for `start`, before anything is prepared or launched */
  beforeStart(config: DevConfig, instances: Instance[]): void | Promise<void>;
  /** Every started instance reported ready */
  afterStart(config: DevConfig, instances: Instance[]): void | Promise<void>;
  /** A live share tunnel changed the public addresses; `proxy` was re-rendered and is running (reload it here) */
  shareAddressesChanged(config: DevConfig, proxy: Instance, addresses: Record<string, TunnelAddress>): void | Promise<void>;
  /** `mcdev share start` opened its tunnels; print warnings here */
  afterShareStart(config: DevConfig, state: ShareState): void | Promise<void>;
  beforeDbReset(config: DevConfig): void | Promise<void>;
  /** The database was reset (and migrated up to `through`, when given) and seeded */
  afterDbReset(config: DevConfig, through: string | undefined): void | Promise<void>;
}

type Handlers = { [E in keyof Hooks]: Hooks[E][] };

const handlers: Handlers = {
  afterSetup: [],
  beforeStart: [],
  afterStart: [],
  shareAddressesChanged: [],
  afterShareStart: [],
  beforeDbReset: [],
  afterDbReset: [],
};

export function on<E extends keyof Hooks>(event: E, handler: Hooks[E]): void {
  handlers[event].push(handler);
}

export async function emit<E extends keyof Hooks>(event: E, ...args: Parameters<Hooks[E]>): Promise<void> {
  for (const handler of handlers[event] as ((...a: Parameters<Hooks[E]>) => void | Promise<void>)[]) {
    await handler(...args);
  }
}
