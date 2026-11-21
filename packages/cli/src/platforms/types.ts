import type { DevConfig, InstanceConfig, Platform, ResolvedForwarding } from '../config.ts';
import type { Artifact } from '../versions.ts';

/** A proxy fronts a network; a server is a backend or a standalone server. */
export type Role = 'proxy' | 'server';

/** A server jar resolved to a download, before it is fetched. */
export interface ServerArtifact extends Artifact {
  /** Display and pin version of the product (Velocity 3.4.0-SNAPSHOT, a Limbo build, a Minecraft version) */
  version: string;
  build?: string;
}

export interface PrepareCtx {
  config: DevConfig;
  instance: InstanceConfig;
  /** The instance directory */
  dir: string;
  /** The `java` binary the instance runs on */
  javaBin: string;
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
  /** The log file relative to the instance directory (default `logs/latest.log`) */
  logFile?: string;
  /** Logs are named after the start time instead of `logs/latest.log` */
  timestampedLogs: boolean;
  /** Also wait for the port to open right after launch */
  waitForPort: boolean;
  /** HotswapAgent can run in it */
  hotswap: boolean;
  /** Has world folders (reset-world, profile worlds, player data) */
  worlds: boolean;
  /** Forwarding modes it can take part in (default: only `none`). A network picks the best one all its members share */
  forwarding?: ResolvedForwarding[];
  /** Folder under the instance directory that holds plugin or mod jars (default `plugins`) */
  pluginsDir?: string;
  /** Folder under the instance directory that holds plugin config folders (default: `pluginsDir`) */
  configDir?: string;
  /**
   * How packet capture hooks in: `plugin` installs the capture plugin (Paper-family, Velocity, Limbo), `agent` starts
   * the JVM with the capture Java agent (platforms without a capture plugin), `none` has no capture (default)
   */
  capture?: 'plugin' | 'agent' | 'none';
  /**
   * Runs once after the server file was copied into the instance directory, and again when the server file changed:
   * installers (Forge, NeoForge) write their libraries here. Returns nothing; throw (or `fail`) on error.
   */
  prepare?(ctx: PrepareCtx): Promise<void>;
  /** Arguments after the JVM flags; default `-jar server.jar` plus `--nogui` when `nogui` is set */
  launch?(ctx: PrepareCtx): string[];
  /** Console command that re-reads the proxy's config (after a share tunnel changed its addresses) */
  reloadCommand?: string;
  /** The project's own artifacts (build.artifacts) and the capture plugin are copied into it */
  installsProjectArtifacts: boolean;
}
