// @ts-check

/**
 * Puts `lines` between `begin` and `end` marker comments, replacing what is there or appending the block.
 * Everything outside the markers is left exactly as it was.
 * @param {string} text current file content
 * @param {string} comment comment prefix of the file type (`//`, `#`)
 * @param {string[]} lines
 * @returns {string}
 */
export function patchBlock(text, comment, lines) {
  const begin = `${comment} mcdevtools:begin`;
  const end = `${comment} mcdevtools:end`;
  const block = [begin, ...lines, end].join('\n');
  const from = text.indexOf(begin);
  const to = text.indexOf(end);
  if (from !== -1 && to > from) {
    return `${text.slice(0, from)}${block}${text.slice(to + end.length)}`;
  }
  const separator = text === '' || text.endsWith('\n\n') ? '' : text.endsWith('\n') ? '\n' : '\n\n';
  return `${text}${separator}${block}\n`;
}
