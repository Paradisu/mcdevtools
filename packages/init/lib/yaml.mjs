// @ts-check

/**
 * Adds entries to the `packages:` list of a pnpm-workspace.yaml. Only block lists are edited; anything else
 * (a flow list, an anchor) is reported as `manual` instead of being rewritten.
 * @param {string} text
 * @param {string[]} entries
 * @returns {{ text: string, added: string[], manual: boolean }}
 */
export function addWorkspacePackages(text, entries) {
  const lines = text.split('\n');
  const at = lines.findIndex((line) => /^packages:\s*$/.test(line));
  if (at === -1) {
    if (lines.some((line) => /^packages:/.test(line))) {
      return { text, added: [], manual: true };
    }
    const block = ['packages:', ...entries.map((entry) => `  - ${entry}`)];
    const rest = text === '' ? [] : lines;
    return { text: `${[...block, ...rest].join('\n').replace(/\n*$/, '')}\n`, added: entries, manual: false };
  }
  let end = at + 1;
  const present = new Set();
  while (end < lines.length && /^\s+-\s+/.test(lines[end] ?? '')) {
    present.add((lines[end] ?? '').replace(/^\s+-\s+/, '').replace(/^['"]|['"]$/g, '').trim());
    end++;
  }
  const added = entries.filter((entry) => !present.has(entry));
  if (added.length === 0) {
    return { text, added, manual: false };
  }
  lines.splice(end, 0, ...added.map((entry) => `  - ${entry}`));
  return { text: lines.join('\n'), added, manual: false };
}

/**
 * Makes sure pnpm may run the install scripts of `names` (`allowBuilds`): pnpm refuses to install a dependency with a
 * build script that is not approved, and the consuming workspace root is where the approval has to live.
 * @param {string} text
 * @param {string[]} names
 * @returns {{ text: string, added: string[], manual: boolean }}
 */
export function addAllowBuilds(text, names) {
  const lines = text.split('\n');
  const at = lines.findIndex((line) => /^allowBuilds:\s*$/.test(line));
  const entry = (/** @type {string} */ name) => `  '${name}': true`;
  if (at === -1) {
    if (lines.some((line) => /^allowBuilds:/.test(line))) {
      return { text, added: [], manual: true };
    }
    const base = text.replace(/\n*$/, '');
    return { text: `${base}${base ? '\n' : ''}allowBuilds:\n${names.map(entry).join('\n')}\n`, added: names, manual: false };
  }
  let end = at + 1;
  const present = new Set();
  while (end < lines.length && /^\s+\S/.test(lines[end] ?? '')) {
    present.add((lines[end] ?? '').trim().replace(/^['"]|['"]?:.*$/g, ''));
    end++;
  }
  const added = names.filter((name) => !present.has(name));
  if (added.length === 0) {
    return { text, added, manual: false };
  }
  lines.splice(end, 0, ...added.map(entry));
  return { text: lines.join('\n'), added, manual: false };
}
