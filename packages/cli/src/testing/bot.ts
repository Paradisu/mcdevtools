import { spawn } from 'node:child_process';
import { closeSync, existsSync, openSync, readFileSync, readdirSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { connect } from 'node:net';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import type { Command } from '../command.ts';
import type { DevConfig } from '../config.ts';
import { ensureTestkit } from '../java.ts';
import { next, status, table } from '../output.ts';
import { socketPath } from '../supervisor.ts';
import type { Instance } from '../templates.ts';
import { RUN, capture, fail, log, sleep } from '../util.ts';
import { writeTestEnv } from './env.ts';

/**
 * `mcdev bot`: headless players. Each bot is a long-running Java process (the testkit's bot daemon, see
 * java/testkit/.../daemon/BotDaemon.java) that serves commands on a unix socket, so a shell or an LLM can drive a
 * player over many separate invocations. State lives in `.mcdevtools/run/.test/bots/<name>/`.
 */

const BOTS = join(RUN, '.test', 'bots');
const NAME = /^[A-Za-z0-9_]{3,16}$/;

interface BotState {
  name: string;
  pid: number;
  socket: string;
  startedAt: string;
}

function botDir(name: string): string {
  return join(BOTS, name);
}

/** Bot sockets sit next to the instances' sockets; `socketPath` only reads the name. */
function botSocket(name: string): string {
  return socketPath({ name: `bot-${name}` } as Instance);
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readState(name: string): BotState | undefined {
  try {
    return JSON.parse(readFileSync(join(botDir(name), 'state.json'), 'utf8')) as BotState;
  } catch {
    return undefined;
  }
}

function botNames(): string[] {
  return existsSync(BOTS) ? readdirSync(BOTS).filter((entry) => existsSync(join(BOTS, entry, 'state.json'))) : [];
}

export interface BotReply {
  ok: boolean;
  output?: string;
  error?: string;
}

/** Sends one command line to a bot daemon and returns its reply. */
export function botRequest(name: string, line: string, timeoutMs: number): Promise<BotReply> {
  return new Promise((resolve, reject) => {
    const socket = connect(botSocket(name));
    let buffer = '';
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error(`no answer within ${Math.round(timeoutMs / 1000)} s`));
    }, timeoutMs);
    socket.on('connect', () => socket.write(`${JSON.stringify({ id: 1, line })}\n`));
    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      const end = buffer.indexOf('\n');
      if (end >= 0) {
        clearTimeout(timer);
        socket.end();
        try {
          resolve(JSON.parse(buffer.slice(0, end)) as BotReply);
        } catch (error) {
          reject(error);
        }
      }
    });
    socket.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

function tail(file: string, lines = 15): string {
  return existsSync(file) ? readFileSync(file, 'utf8').trimEnd().split('\n').slice(-lines).join('\n') : '(no log)';
}

async function startBot(
  config: DevConfig,
  name: string,
  options: { to?: string; via?: string; account?: string; wait: number },
): Promise<void> {
  if (!NAME.test(name)) {
    fail(`"${name}" is not a valid player name (3 to 16 letters, digits or underscores)`);
  }
  const existing = readState(name);
  if (existing && alive(existing.pid)) {
    fail(`Bot ${name} is already running (pid ${existing.pid}); use \`mcdev bot do ${name} status\` or \`mcdev bot stop ${name}\``);
  }
  if (options.via && options.via !== 'proxy' && options.via !== 'direct') {
    fail('--via must be "proxy" or "direct"');
  }
  const bin = ensureTestkit();
  const envFile = await writeTestEnv(config);
  const dir = botDir(name);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  const socket = botSocket(name);
  const args = ['daemon', '--env', envFile, '--socket', socket, '--name', name];
  if (options.via) args.push('--via', options.via);
  if (options.to) args.push('--to', options.to);
  if (options.account) args.push('--account', options.account);
  const logPath = join(dir, 'bot.log');
  const fd = openSync(logPath, 'a');
  const child = spawn(bin, args, { detached: true, stdio: ['ignore', fd, fd] });
  closeSync(fd);
  child.unref();
  const pid = child.pid ?? fail(`Could not start ${bin}`);
  const state: BotState = { name, pid, socket, startedAt: new Date().toISOString() };
  await writeFile(join(dir, 'state.json'), JSON.stringify(state, null, 2));

  const deadline = Date.now() + options.wait * 1000;
  while (Date.now() < deadline) {
    if (!alive(pid)) {
      await rm(join(dir, 'state.json'), { force: true });
      fail(`Bot ${name} could not join:\n${tail(logPath)}`);
    }
    try {
      const reply = await botRequest(name, 'status', 2000);
      if (reply.ok) {
        log(`${status('running')} ${reply.output}`);
        next(`mcdev bot do ${name} help`, `mcdev bot stop ${name}`);
        return;
      }
    } catch {
      // the socket is created once the bot is in the game
    }
    await sleep(300);
  }
  process.kill(pid, 'SIGTERM');
  await rm(join(dir, 'state.json'), { force: true });
  fail(`Bot ${name} did not join within ${options.wait} s:\n${tail(logPath)}`);
}

async function stopBot(name: string): Promise<boolean> {
  const state = readState(name);
  if (!state) {
    return false;
  }
  if (alive(state.pid)) {
    await botRequest(name, 'quit', 3000).catch(() => undefined);
    for (let i = 0; i < 10 && alive(state.pid); i++) await sleep(300);
    if (alive(state.pid)) {
      process.kill(state.pid, 'SIGKILL');
    }
  }
  await rm(botDir(name), { recursive: true, force: true });
  return true;
}

export const BOT_COMMANDS: Command[] = [
  {
    name: 'bot start',
    usage: '<name>',
    summary: 'Start a headless player that joins the network',
    details:
      'Starts a bot process (the testkit bot daemon) and waits until the player is in the game. By default it joins ' +
      'through an offline-mode proxy, or straight to the first running backend when the proxy is online-mode: the ' +
      'bot then answers Velocity modern forwarding with the network secret, so any name works without an account.',
    options: [
      { flag: '--to <instance>', summary: 'Instance to join (default: the proxy, or the first backend)' },
      { flag: '--via proxy|direct', summary: 'Through the proxy, or straight to a backend' },
      { flag: '--account <name>', summary: 'Microsoft account saved with `mcdev bot login` (online-mode proxies)' },
      { flag: '--wait <seconds>', summary: 'How long to wait for the join (default 60)' },
    ],
    run: async ({ config }, args) => {
      const { values, positionals } = parseArgs({
        args,
        options: { to: { type: 'string' }, via: { type: 'string' }, account: { type: 'string' }, wait: { type: 'string' } },
        allowPositionals: true,
      });
      const name = positionals[0] ?? fail('Which bot? `mcdev bot start <name>`');
      await startBot(config, name, { to: values.to, via: values.via, account: values.account, wait: Number(values.wait ?? 60) });
    },
  },
  {
    name: 'bot do',
    usage: '<name> <command...>',
    summary: 'Run a command on a bot (try "help")',
    details:
      'Sends one command to a running bot and prints its answer, for example `mcdev bot do alice cmd warps`, ' +
      '`mcdev bot do alice gui`, `mcdev bot do alice click 13`, `mcdev bot do alice wait-chat "teleported" 10`. ' +
      'Options go before the command. Exits 1 when the command fails. `mcdev bot do <name> help` lists everything.',
    options: [
      { flag: '--json', summary: 'Print the raw reply as JSON' },
      { flag: '--timeout <seconds>', summary: 'How long to wait for the answer (default 30)' },
    ],
    passthrough: true,
    run: async (_ctx, args) => {
      const rest = [...args];
      const name = rest.shift() ?? fail('Which bot? `mcdev bot do <name> <command...>`');
      let json = false;
      let timeout = 30;
      while (rest[0] === '--json' || rest[0] === '--timeout') {
        if (rest.shift() === '--json') json = true;
        else timeout = Number(rest.shift() ?? timeout);
      }
      if (rest.length === 0) {
        fail('Which command? Try `mcdev bot do ' + name + ' help`');
      }
      const state = readState(name);
      if (!state || !alive(state.pid)) {
        fail(`Bot ${name} is not running; start it with \`mcdev bot start ${name}\``);
      }
      const reply = await botRequest(name, rest.join(' '), (timeout + 5) * 1000).catch((error: Error) => fail(`Bot ${name}: ${error.message}`));
      if (json) {
        console.log(JSON.stringify(reply));
      } else {
        console.log(reply.ok ? reply.output : `error: ${reply.error}`);
      }
      if (!reply.ok) {
        process.exitCode = 1;
      }
    },
  },
  {
    name: 'bot list',
    usage: '',
    summary: 'List running bots',
    run: async () => {
      const rows: string[][] = [];
      for (const name of botNames()) {
        const state = readState(name)!;
        if (!alive(state.pid)) {
          rows.push([name, status('stopped'), '', 'process exited']);
          continue;
        }
        const reply = await botRequest(name, 'status', 2000).catch(() => undefined);
        rows.push([name, status('running'), String(state.pid), reply?.output ?? 'not answering']);
      }
      log(rows.length ? table(['bot', 'state', { header: 'pid', align: 'right' }, 'status'], rows) : 'No bots are running.');
      next('mcdev bot start <name>');
    },
  },
  {
    name: 'bot stop',
    usage: '[name]',
    summary: 'Stop a bot, or every bot with --all',
    options: [{ flag: '--all', summary: 'Stop every bot' }],
    run: async (_ctx, args) => {
      const { values, positionals } = parseArgs({ args, options: { all: { type: 'boolean' } }, allowPositionals: true });
      const names = values.all ? botNames() : positionals.length ? positionals : fail('Which bot? `mcdev bot stop <name>` or `--all`');
      for (const name of names) {
        log(`${(await stopBot(name)) ? 'Stopped' : 'No such bot:'} ${name}`);
      }
    },
  },
  {
    name: 'bot logs',
    usage: '<name>',
    summary: 'Show the log of a bot process',
    run: (_ctx, args) => {
      const name = args[0] ?? fail('Which bot? `mcdev bot logs <name>`');
      const file = join(botDir(name), 'bot.log');
      if (!existsSync(file)) fail(`No log for bot ${name}`);
      console.log(capture('tail', ['-n', '200', file]).stdout);
    },
  },
];

/** Stops every bot; used when a test run or the network ends. */
export async function stopAllBots(): Promise<void> {
  for (const name of botNames()) {
    await stopBot(name);
  }
}

