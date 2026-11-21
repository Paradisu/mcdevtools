import type { Platform } from '../config.ts';

export interface FamilyDef {
  /** Modrinth loaders; Modrinth ORs values, so Bukkit plugins that only tag spigot/bukkit are found too */
  modrinthLoaders: string[];
  /** Plugins of this family tag Minecraft versions on Modrinth (Velocity and Limbo plugins mostly do not) */
  tagsMinecraft: boolean;
}

export const FAMILIES: Record<Platform, FamilyDef> = {
  paper: { modrinthLoaders: ['purpur', 'paper', 'spigot', 'bukkit'], tagsMinecraft: true },
  velocity: { modrinthLoaders: ['velocity'], tagsMinecraft: false },
  limbo: { modrinthLoaders: ['java-agent'], tagsMinecraft: false },
};
