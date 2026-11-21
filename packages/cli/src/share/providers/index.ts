import type { DevConfig } from '../../config.ts';
import { fail } from '../../util.ts';
import type { ProviderFactory, TunnelProvider } from '../provider.ts';
import { pinggyFactory } from './pinggy.ts';

const FACTORIES: ProviderFactory[] = [pinggyFactory];

/** Adds a tunnel provider (extensions call this through `api.registerShareProvider`). */
export function registerProviderFactory(factory: ProviderFactory): void {
  if (FACTORIES.some((candidate) => candidate.name === factory.name)) {
    fail(`Share provider "${factory.name}" is registered twice`);
  }
  FACTORIES.push(factory);
}

export function providers(): ProviderFactory[] {
  return FACTORIES;
}

export function providerNames(): string[] {
  return FACTORIES.map((factory) => factory.name);
}

export function factory(name: string): ProviderFactory {
  return FACTORIES.find((candidate) => candidate.name === name) ?? fail(`Unknown share provider "${name}". Available: ${providerNames().join(', ')}`);
}

/** The configured provider (or the named override), created from its [share.providers.<name>] table. */
export function createProvider(config: DevConfig, override?: string): Promise<TunnelProvider> {
  const name = override ?? config.share.provider;
  return factory(name).create(config.share.providers?.[name] ?? {});
}
