import type { Platform } from '../config.ts';

export interface FamilyDef {
  /** Modrinth loaders; Modrinth ORs values, so Bukkit plugins that only tag spigot/bukkit are found too */
  modrinthLoaders: string[];
  /** Plugins of this family tag Minecraft versions on Modrinth (proxy and Limbo plugins mostly do not) */
  tagsMinecraft: boolean;
}

export const FAMILIES: Record<Platform, FamilyDef> = {
  paper: { modrinthLoaders: ['purpur', 'paper', 'spigot', 'bukkit'], tagsMinecraft: true },
  velocity: { modrinthLoaders: ['velocity'], tagsMinecraft: false },
  limbo: { modrinthLoaders: ['java-agent'], tagsMinecraft: false },
  bungee: { modrinthLoaders: ['bungeecord', 'waterfall'], tagsMinecraft: false },
  viaproxy: { modrinthLoaders: ['viaproxy'], tagsMinecraft: false },
  fabric: { modrinthLoaders: ['fabric'], tagsMinecraft: true },
  forge: { modrinthLoaders: ['forge'], tagsMinecraft: true },
  neoforge: { modrinthLoaders: ['neoforge'], tagsMinecraft: true },
  sponge: { modrinthLoaders: ['sponge'], tagsMinecraft: true },
};
