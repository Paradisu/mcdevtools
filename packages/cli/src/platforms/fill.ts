import { fail, getJson } from '../util.ts';
import type { Artifact } from '../versions.ts';

export const FILL = 'https://fill.papermc.io/v3/projects';

export interface FillBuild {
  id: number;
  downloads: Record<string, { name: string; url: string; checksums: { sha256: string } }>;
}

export function fillArtifact(build: FillBuild): Artifact {
  const download = build.downloads['server:default'];
  if (!download) {
    fail(`Fill build ${build.id} has no server:default download`);
  }
  return { name: download.name, url: download.url, sha256: download.checksums.sha256 };
}

/** One build of a PaperMC project (velocity, paper, folia, waterfall); `build` is a build id or "latest". */
export async function fillBuild(project: string, version: string, build: string): Promise<FillBuild> {
  try {
    return await getJson<FillBuild>(`${FILL}/${project}/versions/${version}/builds/${build === 'auto' ? 'latest' : build}`);
  } catch (error) {
    const index = await getJson<{ versions: Record<string, string[]> }>(`${FILL}/${project}`);
    const available = Object.values(index.versions).flat().join(', ');
    fail(`${(error as Error).message}\n${project} ${version} not found. Available: ${available}`);
  }
}

/** The newest version of a PaperMC Fill project that has no Minecraft version of its own (Waterfall). */
export async function fillLatestVersion(project: string): Promise<string> {
  const index = await getJson<{ versions: Record<string, string[]> }>(`${FILL}/${project}`);
  const all = Object.values(index.versions).flat();
  const key = (version: string) => version.split(/[.-]/).map((part) => Number(part) || 0);
  const newest = all.sort((a, b) => {
    const x = key(a);
    const y = key(b);
    for (let i = 0; i < Math.max(x.length, y.length); i++) {
      if ((x[i] ?? 0) !== (y[i] ?? 0)) return (y[i] ?? 0) - (x[i] ?? 0);
    }
    return 0;
  })[0];
  return newest ?? fail(`Fill project ${project} has no versions`);
}
