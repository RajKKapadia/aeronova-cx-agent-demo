import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const port = 39876;
const base = `http://127.0.0.1:${port}`;
let server;

async function call(method, path, data) {
  const response = await fetch(base + path, {
    method,
    ...(data ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) } : {})
  });
  return { code: response.status, data: await response.json() };
}
async function reset() {
  const result = await call('POST', '/admin/reset');
  assert.equal(result.code, 200);
}

before(async () => {
  server = spawn(process.execPath, ['--experimental-strip-types', 'src/server.ts'], {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try {
      const response = await fetch(base + '/health');
      if (response.ok) { ready = true; break; }
    } catch {}
    await sleep(100);
  }
  if (!ready) throw new Error('Demo server did not start');
});
after(() => { if (server) server.kill(); });

test('lookup, flight delay, inventory and no-options case', async () => {
  await reset();
  const b = await call('GET', '/api/bookings/AV2048');
  assert.equal(b.data.originalFlight.delayMinutes, 390);
  const a = await call('GET', '/api/flights/alternatives?bookingRef=AV2048');
  assert.deepEqual(a.data.alternatives.map(f => f.flightId), ['AV418', 'AV520']);
  const empty = await call('GET', '/api/flights/alternatives?bookingRef=AV9000');
  assert.deepEqual(empty.data.alternatives, []);
});

test('rebooking requires confirmed=true, validates stock and prevents second change', async () => {
  await reset();
  const denied = await call('POST', '/api/bookings/AV2048/rebook', { flightId: 'AV418', confirmed: false });
  assert.equal(denied.code, 400);
  const booked = await call('POST', '/api/bookings/AV2048/rebook', { flightId: 'AV418', confirmed: true });
  assert.equal(booked.data.status, 'confirmed');
  assert.equal(booked.data.confirmationCode, 'RB-AV2048');
  const duplicate = await call('POST', '/api/bookings/AV2048/rebook', { flightId: 'AV418', confirmed: true });
  assert.equal(duplicate.data.status, 'already_rebooked');
  const conflict = await call('POST', '/api/bookings/AV2048/rebook', { flightId: 'AV520', confirmed: true });
  assert.equal(conflict.code, 409);
});

test('meal eligibility remains after rebooking and issuing voucher is idempotent', async () => {
  await reset();
  const elig = await call('GET', '/api/care/eligibility/AV2048');
  assert.equal(elig.data.mealVoucher.eligible, true);
  assert.equal(elig.data.mealVoucher.amount, 800);
  const denied = await call('POST', '/api/care/vouchers', { bookingRef: 'AV2048', type: 'meal', confirmed: false });
  assert.equal(denied.code, 400);
  const issued = await call('POST', '/api/care/vouchers', { bookingRef: 'AV2048', type: 'meal', confirmed: true });
  assert.equal(issued.code, 201);
  assert.equal(issued.data.voucher.voucherCode, 'MEAL-0001');
  const again = await call('POST', '/api/care/vouchers', { bookingRef: 'AV2048', type: 'meal', confirmed: true });
  assert.equal(again.data.status, 'already_issued');
  assert.equal((await call('GET', '/admin/state')).data.vouchers.length, 1);
});

test('no available alternative can escalate once and produce one ticket', async () => {
  await reset();
  const casePayload = { bookingRef: 'AV9000', reason: 'no_alternatives', summary: 'Flight cancelled and there are no seats available on the route.' };
  const created = await call('POST', '/api/cases/escalate', casePayload);
  assert.equal(created.code, 201);
  assert.equal(created.data.case.caseId, 'CASE-0001');
  const same = await call('POST', '/api/cases/escalate', casePayload);
  assert.equal(same.data.status, 'already_open');
  assert.equal((await call('GET', '/admin/state')).data.cases.length, 1);
});
