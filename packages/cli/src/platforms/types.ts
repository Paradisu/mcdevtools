import type { DevConfig, InstanceConfig, Platform } from '../config.ts';
import type { Artifact } from '../versions.ts';

/** A proxy fronts a network; a server is a backend or a standalone server. */
export type Role = 'proxy' | 'server';

/** A server jar resolved to a download, before it is fetched. */
export interface ServerArtifact extends Artifact {
  /** Display and pin version of the product (Velocity 3.4.0-SNAPSHOT, a Limbo build, a Minecraft version) */
  version: string;
  build?: string;
}

export interface ResolveCtx {
  config: DevConfig;
  /** The Minecraft version the network targets ([versions].minecraft, or derived from the catalog) */
  minecraft(): Promise<string>;
  /** Version keys of the Gradle catalog named in [versions.auto]; empty when the project has none */
  catalog(): Promise<Record<string, string>>;
}

/**
 * Everything the CLI needs to know about one kind of server. Register one with `registerPlatform`; the built-ins
 * are purpur, velocity and limbo (see platforms/index.ts). Config selects it with `type = "<type>"` on an instance.
 */
export interface PlatformDef {
  /** The `type` of [[instances]]: purpur, velocity, limbo */
  type: string;
  /** Shown in `status` and downloads */
  label: string;
  /** Plugin family: selects `plugins = [{ platforms }]`, `plugins/<key>/<family>/` templates and Modrinth loaders */
  family: Platform;
  role: Role;
  /** Instances start in ascending order (Limbo before proxies before backends) */
  startOrder: number;
  resolve(ctx: ResolveCtx, instance: InstanceConfig): Promise<ServerArtifact>;
  /** File name in the download cache */
  cacheName(artifact: ServerArtifact): string;
  /** `eula.txt` is written and `accept_eula` is required */
  needsEula: boolean;
  /** -Dterminal.jline=false -Dterminal.ansi=true: stdin is a pipe, not a terminal */
  terminalFlags: boolean;
  /** Pass `--nogui` */
  nogui: boolean;
  /** Console command that stops the server */
  stopCommand: string;
  /** Appears in the log once the server accepts commands */
  readyPattern: RegExp;
  /** Logs are named after the start time instead of `logs/latest.log` */
  timestampedLogs: boolean;
  /** Also wait for the port to open right after launch */
  waitForPort: boolean;
  /** HotswapAgent can run in it */
  hotswap: boolean;
  /** Has world folders (reset-world, profile worlds, player data) */
  worlds: boolean;
  /** Console command that re-reads the proxy's config (after a share tunnel changed its addresses) */
  reloadCommand?: string;
  /** The project's own artifacts (build.artifacts) and the capture plugin are copied into it */
  installsProjectArtifacts: boolean;
}
