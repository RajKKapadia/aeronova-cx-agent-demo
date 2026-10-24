/**
 * AeroNova demo API (fictional airline). Zero npm dependencies.
 * Run: bun src/server.ts
 * Also testable with: node --experimental-strip-types src/server.ts
 * WARNING: No authentication or persistence. NOT for production/public real data.
 */
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? '0.0.0.0';

function seed() {
  return {
    bookings: {
      AV2048: {
        bookingRef: 'AV2048', passenger: 'Neha Shah',
        origin: 'BOM', destination: 'DEL',
        originalFlightId: 'AV302', currentFlightId: 'AV302',
        rebooked: false, rebookedAt: null
      },
      AV9000: {
        bookingRef: 'AV9000', passenger: 'Arjun Mehta',
        origin: 'DEL', destination: 'BLR',
        originalFlightId: 'AV886', currentFlightId: 'AV886',
        rebooked: false, rebookedAt: null
      }
    },
    flights: {
      AV302: {
        flightId: 'AV302', origin: 'BOM', destination: 'DEL',
        date: '2026-12-15', scheduledDeparture: '09:00',
        estimatedDeparture: '15:30', delayMinutes: 390,
        status: 'delayed', availableSeats: 0
      },
      AV418: {
        flightId: 'AV418', origin: 'BOM', destination: 'DEL',
        date: '2026-12-15', scheduledDeparture: '11:15',
        estimatedDeparture: '11:15', delayMinutes: 0,
        status: 'on_time', availableSeats: 1
      },
      AV520: {
        flightId: 'AV520', origin: 'BOM', destination: 'DEL',
        date: '2026-12-15', scheduledDeparture: '12:40',
        estimatedDeparture: '12:40', delayMinutes: 0,
        status: 'on_time', availableSeats: 3
      },
      AV886: {
        flightId: 'AV886', origin: 'DEL', destination: 'BLR',
        date: '2026-12-15', scheduledDeparture: '14:00',
        estimatedDeparture: null, delayMinutes: null,
        status: 'cancelled', availableSeats: 0
      },
      AV918: {
        flightId: 'AV918', origin: 'DEL', destination: 'BLR',
        date: '2026-12-15', scheduledDeparture: '16:30',
        estimatedDeparture: '16:30', delayMinutes: 0,
        status: 'on_time', availableSeats: 0
      }
    },
    vouchers: [],
    cases: [],
    events: []
  };
}

let db = seed();
let nextVoucher = 1;
let nextCase = 1;

function json(res, status, value) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'Content-Type'
  });
  res.end(JSON.stringify(value, null, 2));
}
function err(res, status, code, message) {
  json(res, status, { error: { code, message } });
}
function lookup(ref) {
  return db.bookings[ref];
}
function flight(id) {
  return db.flights[id];
}
function publicBooking(booking) {
  return {
    ...booking,
    originalFlight: flight(booking.originalFlightId),
    currentFlight: flight(booking.currentFlightId)
  };
}
function log(type, details) {
  db.events.unshift({ type, details, timestamp: new Date().toISOString() });
}
function getAlternatives(booking) {
  const original = flight(booking.originalFlightId);
  return Object.values(db.flights)
    .filter(f => f.origin === booking.origin &&
      f.destination === booking.destination &&
      f.date === original.date &&
      f.status === 'on_time' && f.availableSeats > 0 &&
      f.flightId !== booking.currentFlightId)
    .sort((a, b) => a.scheduledDeparture.localeCompare(b.scheduledDeparture));
}
function getEligibility(booking) {
  const original = flight(booking.originalFlightId);
  const eligible = original.status === 'cancelled' ||
    (original.status === 'delayed' && original.delayMinutes >= 180);
  const issued = db.vouchers.some(v => v.bookingRef === booking.bookingRef && v.type === 'meal');
  return {
    bookingRef: booking.bookingRef,
    originalFlightId: booking.originalFlightId,
    disruption: original.status,
    delayMinutes: original.delayMinutes,
    policy: 'Fictional AeroNova demo policy: one INR 800 meal voucher per disrupted booking for cancellations or delays of 180 minutes or more. Not a legal entitlement.',
    mealVoucher: {
      eligible,
      alreadyIssued: issued,
      currency: 'INR',
      amount: eligible ? 800 : 0
    }
  };
}
async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 64_000) throw new Error('Request body too large');
    chunks.push(chunk);
  }
  if (!size) return {};
  const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Body must be a JSON object');
  }
  return parsed;
}

const server = createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return json(res, 200, { ok: true });
  const url = new URL(req.url || '/', 'http://localhost');
  const pathname = decodeURIComponent(url.pathname);
  const getBookingMatch = pathname.match(/^\/api\/bookings\/([A-Za-z0-9]+)$/);
  const rebookMatch = pathname.match(/^\/api\/bookings\/([A-Za-z0-9]+)\/rebook$/);
  const eligibilityMatch = pathname.match(/^\/api\/care\/eligibility\/([A-Za-z0-9]+)$/);

  try {
    if (req.method === 'GET' && pathname === '/health') {
      return json(res, 200, { ok: true, service: 'aeronova-demo' });
    }
    if (req.method === 'GET' && pathname === '/admin') {
      const html = readFileSync(new URL('./dashboard.html', import.meta.url), 'utf8');
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      return res.end(html);
    }
    if (req.method === 'GET' && pathname === '/admin/state') {
      return json(res, 200, db);
    }
    if (req.method === 'POST' && pathname === '/admin/reset') {
      db = seed(); nextVoucher = 1; nextCase = 1;
      return json(res, 200, { reset: true, message: 'Demo state restored.' });
    }
    if (req.method === 'GET' && getBookingMatch) {
      const booking = lookup(getBookingMatch[1]);
      if (!booking) return err(res, 404, 'BOOKING_NOT_FOUND', 'No booking exists with this reference.');
      return json(res, 200, publicBooking(booking));
    }
    if (req.method === 'GET' && pathname === '/api/flights/alternatives') {
      const ref = url.searchParams.get('bookingRef');
      if (!ref) return err(res, 400, 'BOOKING_REQUIRED', 'bookingRef query parameter is required.');
      const booking = lookup(ref);
      if (!booking) return err(res, 404, 'BOOKING_NOT_FOUND', 'No booking exists with this reference.');
      return json(res, 200, {
        bookingRef: booking.bookingRef,
        alternatives: getAlternatives(booking),
        note: 'AvailableSeats can change; rebooking endpoint checks inventory again.'
      });
    }
    if (req.method === 'POST' && rebookMatch) {
      const booking = lookup(rebookMatch[1]);
      if (!booking) return err(res, 404, 'BOOKING_NOT_FOUND', 'No booking exists with this reference.');
      const body = await readBody(req);
      if (body.confirmed !== true) {
        return err(res, 400, 'CONFIRMATION_REQUIRED', 'An explicit user confirmation is required before rebooking.');
      }
      if (typeof body.flightId !== 'string') {
        return err(res, 400, 'FLIGHT_REQUIRED', 'flightId must be provided.');
      }
      if (booking.currentFlightId === body.flightId && booking.rebooked) {
        return json(res, 200, { status: 'already_rebooked', booking: publicBooking(booking) });
      }
      if (booking.rebooked) {
        return err(res, 409, 'ALREADY_REBOOKED', 'Booking was already changed in this demo. Escalate further changes.');
      }
      const selected = getAlternatives(booking).find(f => f.flightId === body.flightId);
      if (!selected) {
        return err(res, 409, 'FLIGHT_UNAVAILABLE', 'Requested flight is not a valid available alternative.');
      }
      // One synchronous Node event loop handler prevents duplicate capacity updates in this demo.
      selected.availableSeats -= 1;
      booking.currentFlightId = selected.flightId;
      booking.rebooked = true;
      booking.rebookedAt = new Date().toISOString();
      log('rebooking', `${booking.bookingRef} moved to ${selected.flightId}`);
      return json(res, 200, {
        status: 'confirmed', bookingRef: booking.bookingRef,
        confirmationCode: `RB-${booking.bookingRef}`,
        newFlight: selected, remainingSeats: selected.availableSeats
      });
    }
    if (req.method === 'GET' && eligibilityMatch) {
      const booking = lookup(eligibilityMatch[1]);
      if (!booking) return err(res, 404, 'BOOKING_NOT_FOUND', 'No booking exists with this reference.');
      return json(res, 200, getEligibility(booking));
    }
    if (req.method === 'POST' && pathname === '/api/care/vouchers') {
      const body = await readBody(req);
      if (typeof body.bookingRef !== 'string') {
        return err(res, 400, 'BOOKING_REQUIRED', 'bookingRef is required.');
      }
      const booking = lookup(body.bookingRef);
      if (!booking) return err(res, 404, 'BOOKING_NOT_FOUND', 'No booking exists with this reference.');
      if (body.type !== 'meal') {
        return err(res, 400, 'UNSUPPORTED_VOUCHER', 'Only type meal is supported in this demo.');
      }
      if (body.confirmed !== true) {
        return err(res, 400, 'CONFIRMATION_REQUIRED', 'Ask the user to confirm before issuing a voucher.');
      }
      const existing = db.vouchers.find(v => v.bookingRef === body.bookingRef && v.type === 'meal');
      if (existing) return json(res, 200, { status: 'already_issued', voucher: existing });
      const eligibility = getEligibility(booking);
      if (!eligibility.mealVoucher.eligible) {
        return err(res, 422, 'NOT_ELIGIBLE', 'This booking does not qualify for a meal voucher under demo policy.');
      }
      const voucher = {
        voucherCode: `MEAL-${String(nextVoucher++).padStart(4, '0')}`,
        bookingRef: body.bookingRef, type: 'meal', amount: 800,
        currency: 'INR', status: 'issued'
      };
      db.vouchers.push(voucher);
      log('voucher', `${voucher.voucherCode} issued for ${body.bookingRef}`);
      return json(res, 201, { status: 'issued', voucher });
    }
    if (req.method === 'POST' && pathname === '/api/cases/escalate') {
      const body = await readBody(req);
      if (typeof body.bookingRef !== 'string' || !lookup(body.bookingRef)) {
        return err(res, 404, 'BOOKING_NOT_FOUND', 'Provide a valid bookingRef.');
      }
      if (typeof body.reason !== 'string' || !['no_alternatives', 'customer_requested', 'exception'].includes(body.reason)) {
        return err(res, 400, 'INVALID_REASON', 'reason must be no_alternatives, customer_requested or exception.');
      }
      if (typeof body.summary !== 'string' || body.summary.trim().length < 12) {
        return err(res, 400, 'SUMMARY_REQUIRED', 'summary must describe the passenger issue in at least 12 characters.');
      }
      const existing = db.cases.find(c => c.bookingRef === body.bookingRef && c.reason === body.reason && c.status === 'open');
      if (existing) return json(res, 200, { status: 'already_open', case: existing });
      const ticket = {
        caseId: `CASE-${String(nextCase++).padStart(4, '0')}`,
        bookingRef: body.bookingRef, reason: body.reason,
        summary: body.summary.trim().slice(0, 400), status: 'open',
        queue: 'human_airline_support'
      };
      db.cases.push(ticket);
      log('escalation', `${ticket.caseId} opened for ${body.bookingRef}`);
      return json(res, 201, { status: 'created', case: ticket });
    }
    err(res, 404, 'NOT_FOUND', 'Endpoint does not exist.');
  } catch (error) {
    err(res, 400, 'INVALID_REQUEST', String(error instanceof Error ? error.message : error));
  }
});

server.listen(PORT, HOST, () => {
  console.log(`AeroNova dummy airline API listening on http://${HOST}:${PORT}`);
  console.log(`Open http://localhost:${PORT}/admin to see live demo state.`);
});
