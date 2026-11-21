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
