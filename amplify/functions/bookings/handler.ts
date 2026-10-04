import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import { getAmplifyDataClientConfig } from '@aws-amplify/backend/function/runtime';
import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';
import { addDays, addMonths, startOfDay } from 'date-fns';
import { env } from '$amplify/env/bookings';

import { gymLocation } from '../../../src/domain/models';
import { isSlotInFuture, next14Days, slotLabel } from '../../../src/domain/rules';
import { isValidEmail, isValidFullName, toQatarE164 } from '../../../src/domain/validation';
import type { Schema } from '../../data/resource';
import {
  check,
  fail,
  isAdmin,
  isConditionalFailure,
  mutateIf,
  ownerOf,
  qatarNow,
  sameOwner,
  sha256,
  text,
  unwrap,
  ymd,
  type Args,
  type ResolverEvent,
} from '../shared/data';
import { applyTrainerAvailability, resolveDay, type AvailabilityRuleData } from './availability';

const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(env);
Amplify.configure(resourceConfig, libraryOptions);
const client = generateClient<Schema>();

const slotStart = (date: string, minutes: number) =>
  `${date}T${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}:00`;

// "yyyy-MM-dd" that is a real calendar date → local midnight.
const parseDay = (value: unknown) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const day = new Date(`${value}T00:00:00`);
  return ymd(day) === value ? day : null;
};

const PAYMENT_METHODS = ['card', 'applePay', 'googlePay'];

type BookingRecord = Schema['Booking']['type'];

// ── Availability (AvailabilityRule) ──

async function loadRules(trainerId: string) {
  const rules: AvailabilityRuleData[] = [];
  for (const owner of ['*', trainerId]) {
    let nextToken: string | null | undefined;
    do {
      const page = check(await client.models.AvailabilityRule.list({ trainerId: owner, nextToken }));
      rules.push(...page.data);
      nextToken = page.nextToken;
    } while (nextToken);
  }
  return rules;
}

const loadTrainerAvailability = (trainerId: string) => unwrap(client.models.TrainerAvailability.get({ trainerId }));

// ── Draft validation (shared by quote and create) ──

async function hasActiveMembership(guestPhone: string, gymId: string, today: string) {
  let nextToken: string | null | undefined;
  do {
    const page = check(await client.models.Booking.listBookingsByGuestPhone({ guestPhone, gymId: { eq: gymId } }, { nextToken }));
    if (page.data.some((b) => b.type === 'membership' && b.status === 'confirmed' && (b.membershipEnd ?? '') >= today)) return true;
    nextToken = page.nextToken;
  } while (nextToken);
  return false;
}

async function validateDraft(args: Args) {
  const { type } = args;
  if (type !== 'membership' && type !== 'session') fail('VALIDATION');
  const gymId = text(args.gymId, 64) ?? fail('VALIDATION');

  const fullName = typeof args.guestName === 'string' ? args.guestName.trim() : '';
  const phone = typeof args.guestPhone === 'string' ? toQatarE164(args.guestPhone) : null;
  const email = typeof args.guestEmail === 'string' ? args.guestEmail.trim() : '';
  if (!isValidFullName(fullName) || !phone || (email !== '' && !isValidEmail(email))) fail('VALIDATION');
  const guest = { fullName, phone, email: email || null };

  const gym = (await unwrap(client.models.Gym.get({ id: gymId }))) ?? fail('INVALID_BOOKING');
  const now = qatarNow();

  if (type === 'membership') {
    const planId = text(args.planId, 64) ?? fail('VALIDATION');
    const plan = await unwrap(client.models.MembershipPlan.get({ id: planId }));
    if (!plan || plan.gymId !== gym.id) fail('INVALID_BOOKING');
    // Hidden plans cannot be bought; the facility's direct discount (percent or amount) lowers the price.
    if (plan.visible === false) fail('INVALID_BOOKING');
    // Fast check for the quote; placeBooking also takes the atomic MembershipLock.
    if (await hasActiveMembership(phone, gym.id, ymd(now))) fail('DUPLICATE_BOOKING');
    return { kind: 'membership' as const, gym, plan, guest, priceQar: discounted(plan) };
  }

  const trainerId = text(args.trainerId, 64) ?? fail('VALIDATION');
  const day = parseDay(args.date) ?? fail('VALIDATION');
  const minutes = typeof args.minutes === 'number' ? args.minutes : NaN;
  if (!Number.isInteger(minutes) || minutes < 0 || minutes >= 1440 || minutes % 5 !== 0) fail('VALIDATION');

  const trainer = await unwrap(client.models.Trainer.get({ id: trainerId }));
  if (!trainer || trainer.gymId !== gym.id) fail('INVALID_BOOKING');

  const date = ymd(day);
  const schedule = applyTrainerAvailability(
    resolveDay(await loadRules(trainerId), trainerId, date, day.getDay()),
    await loadTrainerAvailability(trainerId),
    date,
    day.getDay(),
  );
  const bookable =
    next14Days(now).some((d) => ymd(d) === date) && !schedule.closed && schedule.slots.includes(minutes) && isSlotInFuture(day, minutes, now);
  if (!bookable) fail('SLOT_UNAVAILABLE');

  const startAt = slotStart(date, minutes);
  if (await unwrap(client.models.SlotReservation.get({ trainerId, startAt }))) fail('SLOT_TAKEN');
  return { kind: 'session' as const, gym, trainer, date, minutes, startAt, guest, priceQar: trainer.pricePerSession };
}

const discounted = (p: { price: number; discountType?: string | null; discountValue?: number | null }) =>
  !p.discountType || !p.discountValue
    ? p.price
    : p.discountType === 'percent'
      ? Math.round(p.price * (1 - Math.min(90, p.discountValue) / 100))
      : Math.max(0, p.price - p.discountValue);

// ── Membership freeze (customer, when the plan allows it): at most 2 per membership, each up to 30 days. The
// membership end moves by the frozen days. A request beyond the limit is refused and the facility is notified,
// so it can contact the customer. ──

const FREEZE_LIMIT = { count: 2, days: 30 };

async function freezeMembership(args: Args, owner: string | null) {
  if (!owner) fail('UNAUTHORIZED');
  const bookingId = text(args.bookingId, 64) ?? fail('VALIDATION');
  const days = typeof args.days === 'number' && Number.isInteger(args.days) && args.days >= 1 && args.days <= FREEZE_LIMIT.days ? args.days : fail('VALIDATION');
  const start = parseDay(args.startDate) ?? fail('VALIDATION');
  const booking = (await unwrap(client.models.Booking.get({ id: bookingId }))) ?? fail('NOT_FOUND');
  if (!sameOwner(booking.owner, owner)) fail('NOT_FOUND');
  const today = ymd(qatarNow());
  if (booking.type !== 'membership' || booking.status !== 'confirmed' || !booking.membershipEnd || booking.membershipEnd < today) fail('INVALID_BOOKING');
  if (ymd(start) < today || ymd(start) > booking.membershipEnd) fail('VALIDATION');
  const plan = booking.planId ? await unwrap(client.models.MembershipPlan.get({ id: booking.planId })) : null;
  if (!plan?.allowFreeze) fail('FREEZE_NOT_ALLOWED');
  const freezes = check(await client.models.MembershipFreeze.listFreezesByBooking({ bookingId })).data;
  if (freezes.length >= FREEZE_LIMIT.count) {
    const gym = await unwrap(client.models.Gym.get({ id: booking.gymId }));
    if (gym?.ownerId) {
      check(
        await client.models.Notification.create({
          recipient: gym.ownerId,
          kind: 'freezeLimit',
          params: JSON.stringify({ bookingId, customerName: booking.guest.fullName, planName: booking.planName, facilityId: gym.id }),
        }),
      );
    }
    fail('FREEZE_LIMIT');
  }
  const endDate = ymd(addDays(start, days - 1));
  check(await client.models.MembershipFreeze.create({ bookingId, gymId: booking.gymId, owner, startDate: ymd(start), endDate, days }));
  const membershipEnd = ymd(addDays(new Date(`${booking.membershipEnd}T00:00:00`), days));
  check(await client.models.Booking.update({ id: booking.id, membershipEnd }));
  // Keep the duplicate-membership lock in step with the new end date.
  await mutateIf(client, 'update', 'MembershipLock', { guestPhone: booking.guestPhone, gymId: booking.gymId, membershipEnd }, { bookingId: { eq: booking.id } });
  return { freezesUsed: freezes.length + 1, membershipEnd };
}

// ── Operations ──

const toView = (b: BookingRecord, guestToken: string | null) => ({
  id: b.id,
  type: b.type,
  gymId: b.gymId,
  gymName: b.gymName,
  gymLocation: b.gymLocation,
  trainerId: b.trainerId ?? null,
  trainerName: b.trainerName ?? null,
  planId: b.planId ?? null,
  planName: b.planName ?? null,
  date: b.date ?? null,
  timeLabel: b.timeLabel ?? null,
  sessionCount: b.sessionCount,
  priceQar: b.priceQar,
  status: b.status,
  guest: { fullName: b.guest.fullName, phone: b.guest.phone, email: b.guest.email ?? null },
  createdAt: b.createdAt,
  membershipStart: b.membershipStart ?? null,
  membershipEnd: b.membershipEnd ?? null,
  paymentMethod: b.paymentMethod,
  paymentId: b.paymentId,
  guestToken,
});

// Payment boundary: the only place a payment is trusted. A real provider verifies paymentId + amount here
// (and later reconciles via its webhook). Mock payment ids are accepted only when PAYMENT_PROVIDER is "mock".
async function verifyPayment(paymentId: string, _amountQar: number) {
  if (process.env.PAYMENT_PROVIDER === 'mock' && paymentId.startsWith('mock-')) return;
  fail('PAYMENT_FAILED');
}

// One booking per payment: the id is derived from the payment id, so a retried request (e.g. after a lost
// response) finds the booking it already created instead of booking twice.
const bookingIdFor = (paymentId: string) => {
  const h = createHash('sha256').update(`oneq-booking:${paymentId}`).digest('hex');
  return `bk-${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
};

// Replays an existing booking to the caller that made it. A guest gets a fresh token (the old one was never
// received), which also invalidates any earlier token.
async function replay(existing: BookingRecord, owner: string | null) {
  if (!sameOwner(existing.owner, owner)) fail('VALIDATION');
  if (owner) return toView(existing, null);
  const secret = randomBytes(24).toString('base64url');
  const updated = await unwrap(client.models.Booking.update({ id: existing.id, guestTokenHash: sha256(secret).toString('hex') }));
  return toView(updated ?? existing, `${existing.id}.${secret}`);
}

// One active membership per phone number and gym, enforced atomically: the MembershipLock item is created
// with a conditional write, so of two simultaneous requests only one can hold it. A lock whose membership has
// ended is replaced only if nobody changed it in the meantime. Returns the booking id already holding the lock
// when it belongs to this same payment (a concurrent retry).
async function acquireMembershipLock(guestPhone: string, gymId: string, bookingId: string, membershipEnd: string, today: string) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const created = await client.models.MembershipLock.create({ guestPhone, gymId, bookingId, membershipEnd });
    if (!isConditionalFailure(created.errors)) {
      check(created);
      return null;
    }
    const holder = await unwrap(client.models.MembershipLock.get({ guestPhone, gymId }));
    if (!holder) continue;
    if (holder.bookingId === bookingId) return holder.bookingId;
    if (holder.membershipEnd >= today) fail('DUPLICATE_BOOKING');
    await mutateIf(client, 'delete', 'MembershipLock', { guestPhone, gymId }, { bookingId: { eq: holder.bookingId } });
  }
  fail('DUPLICATE_BOOKING');
}

const releaseMembershipLock = (guestPhone: string, gymId: string, bookingId: string) =>
  mutateIf(client, 'delete', 'MembershipLock', { guestPhone, gymId }, { bookingId: { eq: bookingId } });

async function createBooking(args: Args, owner: string | null) {
  // Malformed input is rejected before any lookup.
  const paymentMethod = typeof args.paymentMethod === 'string' && PAYMENT_METHODS.includes(args.paymentMethod) ? args.paymentMethod : fail('VALIDATION');
  const paymentId = text(args.paymentId) ?? fail('VALIDATION');
  const id = bookingIdFor(paymentId);

  const existing = await unwrap(client.models.Booking.get({ id }));
  if (existing) return replay(existing, owner);

  const draft = await validateDraft(args);
  await verifyPayment(paymentId, draft.priceQar);

  const secret = owner ? null : randomBytes(24).toString('base64url');
  const today = startOfDay(qatarNow());
  const session = draft.kind === 'session';
  const membershipEnd = session ? null : ymd(addDays(addMonths(today, draft.plan.durationMonths), -1));

  // Atomic locks: the trainer slot, or the (phone, gym) membership.
  if (session) {
    const lock = await client.models.SlotReservation.create({ trainerId: draft.trainer.id, startAt: draft.startAt, bookingId: id });
    if (isConditionalFailure(lock.errors)) {
      // The same payment racing itself: return the booking the other request created.
      const holder = await unwrap(client.models.SlotReservation.get({ trainerId: draft.trainer.id, startAt: draft.startAt }));
      const same = holder?.bookingId === id ? await unwrap(client.models.Booking.get({ id })) : null;
      if (same) return replay(same, owner);
      fail('SLOT_TAKEN');
    }
    check(lock);
  } else if (await acquireMembershipLock(draft.guest.phone, draft.gym.id, id, membershipEnd!, ymd(today))) {
    const same = await unwrap(client.models.Booking.get({ id }));
    if (same) return replay(same, owner);
    fail('CONFLICT'); // the concurrent request with this payment is still writing; a retry replays it
  }

  const created = await client.models.Booking.create({
    id,
    type: draft.kind,
    gymId: draft.gym.id,
    gymName: draft.gym.name,
    gymLocation: gymLocation(draft.gym),
    sectionId: draft.gym.sectionId ?? 'gym',
    trainerId: session ? draft.trainer.id : null,
    trainerName: session ? draft.trainer.name : null,
    planId: session ? null : draft.plan.id,
    planName: session ? null : draft.plan.name,
    date: session ? draft.startAt : null,
    timeLabel: session ? slotLabel(draft.minutes) : null,
    sessionCount: 1,
    priceQar: draft.priceQar,
    status: 'confirmed',
    guest: draft.guest,
    guestPhone: draft.guest.phone,
    membershipStart: session ? null : ymd(today),
    membershipEnd,
    paymentMethod,
    paymentId,
    // Index keys are omitted rather than null for guest bookings.
    ...(owner ? { owner } : { guestTokenHash: sha256(secret!).toString('hex') }),
  });

  if (created.errors?.length || !created.data) {
    // A concurrent request with the same payment won the conditional create: return that booking.
    if (isConditionalFailure(created.errors)) {
      const same = await unwrap(client.models.Booking.get({ id }));
      if (same) return replay(same, owner);
    }
    // Release the lock so a failed write never blocks the slot or the membership.
    if (session) await client.models.SlotReservation.delete({ trainerId: draft.trainer.id, startAt: draft.startAt });
    else await releaseMembershipLock(draft.guest.phone, draft.gym.id, id);
    check(created);
    throw new Error('DATA_ERROR: booking not created');
  }
  return toView(created.data, secret ? `${id}.${secret}` : null);
}

// Admin only (resolver rule + this check): mark cancelled (with an optional reason shown to the customer) and
// release the trainer slot / membership lock.
async function adminCancelBooking(id: unknown, reasonArg: unknown, identity: ResolverEvent['identity']) {
  if (!isAdmin(identity)) fail('UNAUTHORIZED');
  const bookingId = text(id, 64) ?? fail('VALIDATION');
  const reason = reasonArg == null || reasonArg === '' ? null : (text(reasonArg, 500) ?? fail('VALIDATION'));
  const booking = (await unwrap(client.models.Booking.get({ id: bookingId }))) ?? fail('NOT_FOUND');
  if (booking.type === 'session' && booking.trainerId && booking.date) {
    await mutateIf(client, 'delete', 'SlotReservation', { trainerId: booking.trainerId, startAt: booking.date }, { bookingId: { eq: booking.id } });
  } else if (booking.type === 'membership') {
    await releaseMembershipLock(booking.guestPhone, booking.gymId, booking.id);
  }
  const updated = await unwrap(client.models.Booking.update({ id: booking.id, status: 'cancelled', cancelReason: reason }));
  if (booking.owner) {
    check(
      await client.models.Notification.create({
        recipient: booking.owner,
        kind: 'bookingCancelled',
        params: JSON.stringify({ bookingId: booking.id, gymName: booking.gymName, reason }),
      }),
    );
  }
  return toView(updated ?? booking, null);
}

async function guestBookings(tokens: unknown) {
  if (!Array.isArray(tokens) || tokens.length > 50) fail('VALIDATION');
  const found = await Promise.all(
    tokens.map(async (token) => {
      const [id, secret] = typeof token === 'string' ? token.split('.') : [];
      if (!id || !secret || !/^bk-[0-9a-f-]{36}$/.test(id)) return null;
      const booking = await unwrap(client.models.Booking.get({ id }));
      if (!booking || booking.owner || !booking.guestTokenHash) return null;
      const matches = timingSafeEqual(Buffer.from(booking.guestTokenHash, 'hex'), sha256(secret));
      return matches ? toView(booking, null) : null;
    }),
  );
  return found.filter((b) => b !== null);
}

async function trainerAvailability(trainerId: unknown) {
  const id = text(trainerId, 64) ?? fail('VALIDATION');
  if (!(await unwrap(client.models.Trainer.get({ id })))) fail('NOT_FOUND');

  const now = qatarNow();
  const days = next14Days(now);
  const rules = await loadRules(id);
  const facilityAvailability = await loadTrainerAvailability(id);
  const booked = new Set<string>();
  let nextToken: string | null | undefined;
  do {
    const page = check(
      await client.models.SlotReservation.list({
        trainerId: id,
        startAt: { between: [`${ymd(days[0]!)}T00:00:00`, `${ymd(days[days.length - 1]!)}T23:59:59`] },
        nextToken,
      }),
    );
    page.data.forEach((r) => booked.add(r.startAt));
    nextToken = page.nextToken;
  } while (nextToken);

  const schedules = days.map((d) => applyTrainerAvailability(resolveDay(rules, id, ymd(d), d.getDay()), facilityAvailability, ymd(d), d.getDay()));
  // Every day shows the same grid of start times (unavailable ones disabled), as in the approved UI.
  const grid = [...new Set(schedules.flatMap((s) => s.slots))].sort((a, b) => a - b);
  return days.map((d, i) => {
    const date = ymd(d);
    const schedule = schedules[i]!;
    return {
      date,
      closed: schedule.closed,
      slots: grid.map((minutes, j) => ({
        id: `${date}-${j}`,
        minutes,
        available: schedule.slots.includes(minutes) && isSlotInFuture(d, minutes, now) && !booked.has(slotStart(date, minutes)),
      })),
    };
  });
}

export const handler = async (event: ResolverEvent) => {
  const args = event.arguments;
  switch (event.fieldName) {
    case 'trainerAvailability':
      return trainerAvailability(args.trainerId);
    case 'quoteBooking':
      return { priceQar: (await validateDraft(args)).priceQar };
    case 'placeBooking':
      return createBooking(args, ownerOf(event.identity));
    case 'guestBookings':
      return guestBookings(args.tokens);
    case 'adminCancelBooking':
      return adminCancelBooking(args.id, args.reason, event.identity);
    case 'freezeMembership':
      return freezeMembership(args, ownerOf(event.identity));
    default:
      throw new Error('UNSUPPORTED_OPERATION');
  }
};
