/**
 * Reading and writing JUnit XML, the common format of Gradle, Maven and `mcdev manual`. Only the parts a test
 * run needs: suites, cases, and whether a case failed, errored or was skipped. No dependency: the reports are
 * machine-written and regular.
 */

export interface TestCase {
  className: string;
  name: string;
  seconds: number;
  result: 'passed' | 'failed' | 'skipped';
  /** The failure message (its first lines), when it failed */
  message?: string;
}

/** Lines of a failure message kept: assertion messages list what did arrive, which is the point */
const MESSAGE_LINES = 12;

const ENTITIES: Record<string, string> = { '&lt;': '<', '&gt;': '>', '&amp;': '&', '&quot;': '"', '&apos;': "'" };

function unescapeXml(text: string): string {
  return text
    .replace(/&(lt|gt|amp|quot|apos);/g, (entity) => ENTITIES[entity]!)
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)));
}

function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function attributes(source: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const match of source.matchAll(/([\w:.-]+)="([^"]*)"/g)) {
    out[match[1]!] = unescapeXml(match[2]!);
  }
  return out;
}

/** The test cases of one JUnit XML document. */
export function parseJunit(xml: string): TestCase[] {
  const cases: TestCase[] = [];
  for (const match of xml.matchAll(/<testcase\b([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/g)) {
    const attrs = attributes(match[1]!);
    const body = match[2] ?? '';
    const problem = /<(failure|error)\b([^>]*?)(?:\/>|>)/.exec(body);
    const skipped = /<skipped\b/.test(body);
    const message = problem ? attributes(problem[2]!).message : undefined;
    cases.push({
      className: attrs.classname ?? '',
      name: attrs.name ?? '',
      seconds: Number(attrs.time ?? 0),
      result: problem ? 'failed' : skipped ? 'skipped' : 'passed',
      message: message?.split('\n').slice(0, MESSAGE_LINES).join('\n'),
    });
  }
  return cases;
}

/** A JUnit XML document with one suite. */
export function writeJunit(suite: string, cases: TestCase[], secondsTotal = 0): string {
  const failures = cases.filter((c) => c.result === 'failed').length;
  const skipped = cases.filter((c) => c.result === 'skipped').length;
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<testsuite name="${escapeXml(suite)}" tests="${cases.length}" skipped="${skipped}" failures="${failures}" errors="0" time="${secondsTotal.toFixed(3)}">`,
  ];
  for (const c of cases) {
    const open = `  <testcase name="${escapeXml(c.name)}" classname="${escapeXml(c.className)}" time="${c.seconds.toFixed(3)}"`;
    if (c.result === 'passed') lines.push(`${open}/>`);
    else if (c.result === 'skipped') lines.push(`${open}><skipped/></testcase>`);
    else lines.push(`${open}><failure message="${escapeXml(c.message ?? 'failed')}"/></testcase>`);
  }
  lines.push('</testsuite>', '');
  return lines.join('\n');
}
