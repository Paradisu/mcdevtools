import type { Command, Ctx, OptionDoc } from '../command.ts';
import type { DevConfig, InstanceConfig, NetworkConfig, PluginConfig, Platform } from '../config.ts';
import type { Exporter } from '../capture/exporters/types.ts';
import type { MigrationProvider } from '../db-migrations.ts';
import type { PlatformDef, ResolveCtx, ServerArtifact } from '../platforms/index.ts';
import type { Project } from '../project.ts';
import type { ProviderFactory } from '../share/provider.ts';
import type { Instance, TemplateVarProvider } from '../templates.ts';
import type { PluginSourceResolver, ResolvedPlugin } from '../versions.ts';
import type { PlayerResolver } from '../mc/players.ts';
import type { Hooks } from './hooks.ts';

export type {
  Command, Ctx, DevConfig, Exporter, Hooks, Instance, InstanceConfig, MigrationProvider, NetworkConfig, OptionDoc,
  Platform, PlatformDef, PlayerResolver, PluginConfig, PluginSourceResolver, ProviderFactory, Project, ResolvedPlugin, ResolveCtx,
  ServerArtifact, TemplateVarProvider,
};

/** What an extension registers itself with. Everything goes through this object, never through direct imports. */
export interface ExtensionApi {
  readonly project: Project;
  /** The effective config. Settings of this extension are in a table named after it: see `settings()` */
  readonly config: DevConfig;
  /** The `[<extension name>]` table of the config, or an empty object */
  settings<T extends Record<string, unknown> = Record<string, unknown>>(): T;
  /** Adds a command; names are one or two words (`hello`, `mc players`) */
  registerCommand(command: Command): void;
  /** Lists commands whose first word is in `prefixes` under a heading in `mcdev help` */
  registerHelpSection(title: string, prefixes: string[]): void;
  /** Adds a server type that `[[instances]] type = "<type>"` can select */
  registerPlatform(def: PlatformDef): void;
  /** Adds a `source = "<name>"` for [[plugins]] */
  registerPluginSource(name: string, resolve: PluginSourceResolver): void;
  /** Adds a `mcdev capture export --format <name>` format */
  registerExporter(exporter: Exporter): void;
  /** Adds a `mcdev share` tunnel provider */
  registerShareProvider(factory: ProviderFactory): void;
  /** Adds variables for `${NAME}` in templates; later providers win */
  registerTemplateVars(provider: TemplateVarProvider): void;
  /** Adds a `[db.migrations] tool = "<name>"` */
  registerMigrationProvider(name: string, provider: MigrationProvider): void;
  /** Replaces how \`mc nbt playerdata:<player>\` finds a player (for projects with their own player database) */
  registerPlayerResolver(resolver: PlayerResolver): void;
  /** Listens to a lifecycle event */
  on<E extends keyof Hooks>(event: E, handler: Hooks[E]): void;
  /** Sends a line to a running instance's console */
  sendConsole(instance: Instance, line: string): Promise<void>;
}

export interface Extension {
  name: string;
  setup(api: ExtensionApi): void | Promise<void>;
}

/** The default export of an extension's entry point. */
export function defineExtension(extension: Extension): Extension {
  return extension;
}
