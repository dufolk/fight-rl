// Headless training server: one FightEnv per TCP connection, newline-delimited JSON.
//
//   node rl/server.js [port=5555] [host=127.0.0.1]
//
// Requests (one JSON object per line) and replies:
//   {"cmd":"spec"}                                    -> {"ok":true, actionCount, neutralAction, observationSize, config, moves}
//   {"cmd":"reset", "seed"?:int, "config"?:{...}}     -> {"ok":true, obs, obs2, info}
//   {"cmd":"step", "action":int, "action2"?:int}      -> {"ok":true, obs, obs2, reward, reward2, terminated, truncated, info}
//   {"cmd":"close"}                                   -> {"ok":true} and the socket is closed
// Errors reply {"ok":false, "error":"..."}.
import net from 'node:net';
import { FightEnv } from './env.js';

const port = parseInt(process.argv[2] || '5555', 10);
const host = process.argv[3] || '127.0.0.1';

function handle(env, msg) {
  switch (msg.cmd) {
    case 'spec':
      return env.spec();
    case 'reset':
      return env.reset(Number.isFinite(msg.seed) ? msg.seed : undefined, msg.config || null);
    case 'step':
      if (!env.game) throw new Error('call reset before step');
      return env.step(msg.action, msg.action2 ?? null);
    case 'close':
      return {};
    default:
      throw new Error(`unknown cmd: ${msg.cmd}`);
  }
}

const server = net.createServer((sock) => {
  sock.setNoDelay(true);
  const env = new FightEnv();
  let buf = '';
  sock.on('data', (chunk) => {
    buf += chunk.toString('utf8');
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      let reply;
      let close = false;
      try {
        const msg = JSON.parse(line);
        reply = { ok: true, ...handle(env, msg) };
        close = msg.cmd === 'close';
      } catch (e) {
        reply = { ok: false, error: String(e && e.message ? e.message : e) };
      }
      sock.write(JSON.stringify(reply) + '\n');
      if (close) {
        sock.end();
        return;
      }
    }
  });
  sock.on('error', () => {});
});

server.listen(port, host, () => {
  console.log(`[fight-rl] env server on ${host}:${port}  (obs ${FightEnv.observationSize}, actions ${FightEnv.actionCount})`);
});
