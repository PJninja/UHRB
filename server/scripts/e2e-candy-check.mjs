// One-shot E2E check of the candy flow against a TEST_MODE server.
// Usage: node scripts/e2e-candy-check.mjs [baseUrl]
const BASE = process.argv[2] || 'http://localhost:3999';

const api = async (method, path, body) => {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    // Fastify rejects an empty body when Content-Type is JSON — always send one
    body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
};

const fail = msg => { console.error(`FAIL: ${msg}`); process.exit(1); };
const ok = msg => console.log(`ok: ${msg}`);

// 1. Create session
const sess = await api('POST', '/api/session');
if (sess.json.candyBalance !== 100) fail(`starting balance ${sess.json.candyBalance} !== 100`);
const sessionId = sess.json.sessionId;
ok(`session created, balance 100`);

// 2. Get current race; force into waiting state if needed
let race = (await api('GET', '/api/race/current')).json;
if (race.state !== 'waiting') {
  await api('POST', '/api/test/reset');
  race = (await api('GET', '/api/race/current')).json;
}
if (race.state !== 'waiting') fail(`race not in waiting state: ${race.state}`);
const monsterId = race.monsters[0].id;
const odds = race.odds[monsterId];
ok(`race ${race.raceId} waiting, betting on ${monsterId} at odds ${odds}`);

// 3. Hidden value must not leak in public payloads
if (race.monsters.some(m => 'value' in (m.traits ?? {}))) fail('hidden value leaked in race payload');
ok('no hidden value in race payload');

// 4. Reject bad amounts
for (const amount of [10.5, '10', 0, -5]) {
  const r = await api('POST', `/api/race/${race.raceId}/bet`, { sessionId, monsterId, amount });
  if (r.status !== 400) fail(`amount ${JSON.stringify(amount)} accepted (status ${r.status})`);
}
ok('non-integer / invalid amounts rejected');

// 5. Place a valid bet
const bet = await api('POST', `/api/race/${race.raceId}/bet`, { sessionId, monsterId, amount: 40 });
if (bet.status !== 200) fail(`bet rejected: ${bet.status} ${JSON.stringify(bet.json)}`);
if (bet.json.candyBalance !== 60) fail(`post-bet balance ${bet.json.candyBalance} !== 60`);
ok('bet placed, balance 60');

// 6. Duplicate bet must 409 and not deduct
const dup = await api('POST', `/api/race/${race.raceId}/bet`, { sessionId, monsterId, amount: 40 });
if (dup.status !== 409) fail(`duplicate bet status ${dup.status} !== 409`);
const v1 = await api('GET', `/api/session/${sessionId}/validate`);
if (v1.json.candyBalance !== 60) fail(`balance after duplicate ${v1.json.candyBalance} !== 60`);
ok('duplicate bet rejected without deduction');

// 7. Advance race: waiting → racing → finished (server resolves bets at finish)
await api('POST', '/api/test/advance');
await api('POST', '/api/test/advance');
const finished = (await api('GET', '/api/race/current')).json;
if (finished.state !== 'finished') fail(`race state ${finished.state} !== finished`);
if (!finished.winner) fail('no winner in finished payload');
if (!finished.rankings?.length) fail('no rankings in finished payload');
if (finished.rankings[0].monster.id !== finished.winner.id) fail('rankings[0] !== winner');
ok(`race finished, winner ${finished.winner.id}, rankings consistent`);

// 8. Validate payout — must reflect the resolution that already happened
const won = finished.winner.id === monsterId;
const expectedPayout = won ? Math.floor(40 * odds) : 0;
const expectedBalance = Math.max(60 + expectedPayout, 10); // mercy floor 10
const p1 = await api('POST', `/api/race/${race.raceId}/payout/validate`, {
  sessionId, bet: { monsterId, amount: 40 },
});
if (p1.json.won !== won) fail(`won ${p1.json.won} !== ${won}`);
if (p1.json.payout !== expectedPayout) fail(`payout ${p1.json.payout} !== ${expectedPayout}`);
if (p1.json.candyBalance !== expectedBalance) fail(`balance ${p1.json.candyBalance} !== ${expectedBalance}`);
if (p1.json.winner && 'value' in (p1.json.winner.traits ?? {})) fail('hidden value leaked in payout winner');
ok(`payout validated: won=${won}, payout=${expectedPayout}, balance=${p1.json.candyBalance}`);

// 9. Repeat validate — must be idempotent (no double credit)
const p2 = await api('POST', `/api/race/${race.raceId}/payout/validate`, {
  sessionId, bet: { monsterId, amount: 40 },
});
if (p2.json.candyBalance !== expectedBalance) fail(`second validate changed balance: ${p2.json.candyBalance}`);
if (p2.json.payout !== expectedPayout) fail(`second validate payout ${p2.json.payout} !== ${expectedPayout}`);
ok('repeat validate idempotent — no double credit');

// 10. Balance token round-trip: new session restores the balance
const tok = p2.json.balanceToken;
const sess2 = await api('POST', '/api/session', { balanceToken: tok });
if (sess2.json.candyBalance !== expectedBalance) fail(`token restore ${sess2.json.candyBalance} !== ${expectedBalance}`);
ok('balance token restores balance in a fresh session');

console.log('\nE2E candy flow: ALL CHECKS PASSED');
