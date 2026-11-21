import { DevError } from '../util.ts';
import { looksLikeUuid, offlineUuid, parseUuid } from './uuid.ts';

export interface ResolvedPlayer {
  uuid: string;
  name: string;
  /** Not known to the project's player store (only possible for `offline:Name`) */
  missing: boolean;
}

/** Turns what the user typed (a name, UUID, ...) into a player; without input it may prompt. */
export type PlayerResolver = (input?: string) => Promise<ResolvedPlayer>;

/** Understands UUIDs and `offline:Name` (the UUID an offline-mode server assigns). */
const DEFAULT: PlayerResolver = async (input) => {
  if (!input) {
    throw new DevError('A player UUID (or offline:<name>) is required');
  }
  if (input.toLowerCase().startsWith('offline:')) {
    const name = input.slice('offline:'.length);
    return { uuid: offlineUuid(name), name, missing: true };
  }
  if (looksLikeUuid(input)) {
    const uuid = parseUuid(input);
    return { uuid, name: uuid, missing: true };
  }
  throw new DevError(`Cannot resolve "${input}": use a UUID or offline:<name> (a project extension can add name lookup)`);
};

let resolver: PlayerResolver = DEFAULT;

/** Replaces the resolver; extensions that know a player database register theirs here. */
export function setPlayerResolver(replacement: PlayerResolver): void {
  resolver = replacement;
}

export function resolvePlayer(input?: string): Promise<ResolvedPlayer> {
  return resolver(input);
}
