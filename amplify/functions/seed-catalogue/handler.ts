import { getAmplifyDataClientConfig } from '@aws-amplify/backend/function/runtime';
import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';
import { env } from '$amplify/env/seed-catalogue';

import { buildPlans, PLAN_MONTHS } from '../../../src/domain/rules';
import type { Schema } from '../../data/resource';
import { DEFAULT_AVAILABILITY, GYMS, REVIEWS, TRAINERS } from '../../seed/catalogue';
import {
  SAMPLE_CLINIC,
  SAMPLE_DEPARTMENTS,
  SAMPLE_PLANS,
  SAMPLE_SALON,
  SAMPLE_TRAINERS,
  sampleActivity,
  sampleAppointmentFacility,
  sampleAppointments,
  sampleGym,
  samplePractitioners,
  sampleServices,
} from '../../seed/samples';
import { SECTIONS } from '../../seed/sections';
import { check, unwrap } from '../shared/data';
import { listAll } from '../shared/facilities';

const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(env);
Amplify.configure(resourceConfig, libraryOptions);
const client = generateClient<Schema>();

type Result = { data: unknown; errors?: readonly { message: string }[] };

// Keyed by the fixed catalogue ids, so running the seed again never duplicates records. Existing records are
// left alone (admins may have edited them) unless the payload is { "overwrite": true }.
let overwrite = false;

async function upsert(label: string, get: () => Promise<Result>, create: () => Promise<Result>, update: () => Promise<Result>) {
  const found = await get();
  if (found.errors?.length) throw new Error(`${label}: ${found.errors.map((e) => e.message).join(', ')}`);
  if (found.data && !overwrite) return 'unchanged';
  const result = found.data ? await update() : await create();
  if (result.errors?.length) throw new Error(`${label}: ${result.errors.map((e) => e.message).join(', ')}`);
  return found.data ? 'updated' : 'created';
}

const ratingSum = (rating: number, count: number) => Math.round(rating * count * 10) / 10;

async function backfillRatingSums() {
  let n = 0;
  const gyms = check(await client.models.Gym.list({ limit: 1000 })).data;
  for (const g of gyms.filter((x) => x.ratingSum == null && x.reviewCount != null)) {
    check(await client.models.Gym.update({ id: g.id, ratingSum: ratingSum(g.rating ?? 0, g.reviewCount ?? 0) }));
    n += 1;
  }
  const trainers = check(await client.models.Trainer.list({ limit: 1000 })).data;
  for (const t of trainers.filter((x) => x.ratingSum == null && x.reviewCount != null)) {
    check(await client.models.Trainer.update({ id: t.id, ratingSum: ratingSum(t.rating ?? 0, t.reviewCount ?? 0) }));
    n += 1;
  }
  return n;
}

// Preset sections and their categories (category ids are derived from the section and position).
async function seedSections(count: (r: 'created' | 'updated' | 'unchanged') => void) {
  for (const { categories, ...section } of SECTIONS) {
    count(
      await upsert(
        `Section ${section.slug}`,
        () => client.models.Section.get({ slug: section.slug }),
        () => client.models.Section.create(section),
        () => client.models.Section.update(section),
      ),
    );
    for (const [order, c] of categories.entries()) {
      const category = { id: `${section.slug}-cat-${order + 1}`, sectionId: section.slug, nameAr: c.nameAr, nameEn: c.nameEn, order: order + 1 };
      count(
        await upsert(
          `SectionCategory ${category.id}`,
          () => client.models.SectionCategory.get({ id: category.id }),
          () => client.models.SectionCategory.create(category),
          () => client.models.SectionCategory.update(category),
        ),
      );
    }
  }
}

// Approximate area centres in Doha, so facilities from before locations existed appear on the map until their
// owner places the pin.
const AREA_CENTRES: Record<string, { lat: number; lng: number }> = {
  'West Bay': { lat: 25.3215, lng: 51.531 },
  Lusail: { lat: 25.4207, lng: 51.4904 },
  'The Pearl': { lat: 25.3714, lng: 51.551 },
  'Al Waab': { lat: 25.2602, lng: 51.4458 },
  Msheireb: { lat: 25.2866, lng: 51.5258 },
  'Al Sadd': { lat: 25.2846, lng: 51.4947 },
};

// Facilities from before sections become approved gyms. Only missing fields are written; the owner is the
// platform admin account when one is given (temporary until each gym has its own owner account).
async function migrateFacilities(adminOwnerKey: string | null) {
  let migrated = 0;
  for (const g of await listAll((nextToken) => client.models.Gym.list({ nextToken, limit: 100 }))) {
    const centre = g.lat == null ? AREA_CENTRES[g.area] : undefined;
    const patch = {
      ...(g.sectionId == null ? { sectionId: 'gym' } : {}),
      ...(g.status == null ? { status: 'approved' as const } : {}),
      ...(g.createdBy == null ? { createdBy: 'owner' as const } : {}),
      ...(g.ownerId == null && adminOwnerKey ? { ownerId: adminOwnerKey } : {}),
      ...(centre ? { lat: centre.lat, lng: centre.lng, region: g.region ?? g.area } : {}),
    };
    if (Object.keys(patch).length === 0) continue;
    check(await client.models.Gym.update({ id: g.id, ...patch }));
    migrated += 1;
  }
  return migrated;
}

// Fixtures for scripts/isolation-check.mjs: a hidden section and facilities that customers must never read.
// Owned by the two test owner accounts the script creates; never approved in a visible section.
const fixtureFacility = (id: string, name: string, ownerId: string, status: 'pending' | 'suspended' | 'approved', sectionId: string, sortOrder: number) => ({
  id,
  name,
  area: 'Isolation test',
  description: 'Automated isolation test record (scripts/isolation-check.mjs).',
  address: 'Isolation test',
  monthlyPrice: 0,
  trainerFromMonthly: 0,
  images: [],
  amenities: [],
  openingHours: [],
  isFeatured: false,
  isNearby: false,
  sortOrder,
  sectionId,
  ownerId,
  status,
  createdBy: 'admin' as const,
  categoryIds: [],
});

async function seedIsolationFixtures({ ownerA, ownerB }: { ownerA: string; ownerB: string }) {
  const section = {
    slug: 'isolation-hidden',
    nameAr: 'قسم اختبار العزل',
    nameEn: 'Isolation test section',
    icon: 'flask-outline',
    colorKey: 'slate',
    order: 99,
    status: 'hidden' as const,
    bookingMode: 'appointment' as const,
    hasPractitioners: false,
    hasServices: false,
    hasDepartments: false,
    hasPackages: false,
    hasGallery: false,
    presetType: 'other' as const,
  };
  const saved = overwrite;
  overwrite = true;
  await upsert('Section isolation-hidden', () => client.models.Section.get({ slug: section.slug }), () => client.models.Section.create(section), () => client.models.Section.update(section));
  const records = [
    fixtureFacility('isolation-a-pending', 'Isolation A (pending)', ownerA, 'pending', 'gym', 901),
    fixtureFacility('isolation-b-suspended', 'Isolation B (suspended)', ownerB, 'suspended', 'gym', 902),
    fixtureFacility('isolation-b-hidden', 'Isolation B (hidden section)', ownerB, 'approved', 'isolation-hidden', 903),
  ];
  for (const r of records) {
    await upsert(`Gym ${r.id}`, () => client.models.Gym.get({ id: r.id }), () => client.models.Gym.create(r), () => client.models.Gym.update(r));
  }
  overwrite = saved;
  return records.map((r) => r.id);
}

// Sample dashboard data (test branch only): a sample gym with plans, trainers, members, sessions, freezes and
// reviews. Records are keyed by fixed "sample-" ids and rewritten on every run; nothing else is touched.
async function seedSamples(adminOwnerKey: string | null) {
  const saved = overwrite;
  overwrite = true;
  const put = (label: string, get: () => Promise<Result>, create: () => Promise<Result>, update: () => Promise<Result>) => upsert(label, get, create, update);
  const gym = sampleGym(adminOwnerKey);
  await put('sample gym', () => client.models.Gym.get({ id: gym.id }), () => client.models.Gym.create(gym), () => client.models.Gym.update(gym));
  for (const plan of SAMPLE_PLANS) {
    await put(plan.id, () => client.models.MembershipPlan.get({ id: plan.id }), () => client.models.MembershipPlan.create(plan), () => client.models.MembershipPlan.update(plan));
  }
  for (const trainer of SAMPLE_TRAINERS) {
    await put(trainer.id, () => client.models.Trainer.get({ id: trainer.id }), () => client.models.Trainer.create(trainer), () => client.models.Trainer.update(trainer));
  }
  const { memberships, sessions, freezes, reviews } = sampleActivity(new Date(Date.now() + 3 * 3_600_000));
  for (const booking of [...memberships, ...sessions]) {
    await put(booking.id, () => client.models.Booking.get({ id: booking.id }), () => client.models.Booking.create(booking), () => client.models.Booking.update(booking));
  }
  // Upcoming sample sessions hold their trainer slot like real bookings.
  for (const s of sessions.filter((x) => x.status === 'confirmed')) {
    const key = { trainerId: s.trainerId, startAt: s.date };
    const lock = { ...key, bookingId: s.id };
    await put(`slot ${s.id}`, () => client.models.SlotReservation.get(key), () => client.models.SlotReservation.create(lock), () => client.models.SlotReservation.update(lock));
  }
  for (const f of freezes) {
    await put(f.id, () => client.models.MembershipFreeze.get({ id: f.id }), () => client.models.MembershipFreeze.create(f), () => client.models.MembershipFreeze.update(f));
  }
  for (const r of reviews) {
    await put(r.id, () => client.models.Review.get({ id: r.id }), () => client.models.Review.create(r), () => client.models.Review.update(r));
  }
  // Sample salon and clinic: services, specialists / doctors, departments, appointments and reviews.
  const appointmentTotals: Record<string, number> = {};
  for (const [i, f] of [SAMPLE_SALON, SAMPLE_CLINIC].entries()) {
    const facility = sampleAppointmentFacility(f, adminOwnerKey, 810 + i);
    await put(f.id, () => client.models.Gym.get({ id: f.id }), () => client.models.Gym.create(facility), () => client.models.Gym.update(facility));
    for (const s of sampleServices(f)) {
      await put(s.id, () => client.models.Service.get({ id: s.id }), () => client.models.Service.create(s), () => client.models.Service.update(s));
    }
    for (const p of samplePractitioners(f)) {
      await put(p.id, () => client.models.Trainer.get({ id: p.id }), () => client.models.Trainer.create(p), () => client.models.Trainer.update(p));
    }
    const { appointments, reviews: facilityReviews } = sampleAppointments(f, new Date(Date.now() + 3 * 3_600_000), 4100 + i);
    for (const a of appointments) {
      await put(a.id, () => client.models.Booking.get({ id: a.id }), () => client.models.Booking.create(a), () => client.models.Booking.update(a));
    }
    for (const r of facilityReviews) {
      await put(r.id, () => client.models.Review.get({ id: r.id }), () => client.models.Review.create(r), () => client.models.Review.update(r));
    }
    appointmentTotals[f.id] = appointments.length;
  }
  for (const d of SAMPLE_DEPARTMENTS) {
    await put(d.id, () => client.models.Department.get({ id: d.id }), () => client.models.Department.create(d), () => client.models.Department.update(d));
  }
  overwrite = saved;
  return {
    sampleGym: gym.id,
    plans: SAMPLE_PLANS.length,
    trainers: SAMPLE_TRAINERS.length,
    memberships: memberships.length,
    sessions: sessions.length,
    freezes: freezes.length,
    reviews: reviews.length,
    appointments: appointmentTotals,
  };
}

// Test branch: the sample facilities become visible to customers (the client app's sections and map).
async function publishSamples() {
  const ids = ['sample-gym', 'sample-salon', 'sample-clinic'];
  for (const id of ids) {
    const g = await unwrap(client.models.Gym.get({ id }));
    if (g && g.status !== 'approved') check(await client.models.Gym.update({ id, status: 'approved', statusReason: 'sample' }));
  }
  return ids;
}

type SeedEvent = {
  overwrite?: boolean;
  adminOwnerKey?: string | null;
  isolationFixtures?: { ownerA: string; ownerB: string };
  samples?: boolean;
  publishSamples?: boolean;
};

export const handler = async (event?: SeedEvent) => {
  overwrite = event?.overwrite === true;
  if (event?.isolationFixtures) return { isolationFixtures: await seedIsolationFixtures(event.isolationFixtures) };
  if (event?.samples) return { samples: await seedSamples(event.adminOwnerKey ?? null) };
  if (event?.publishSamples) return { published: await publishSamples() };
  const outcome = { created: 0, updated: 0, unchanged: 0 };
  const count = (r: 'created' | 'updated' | 'unchanged') => (outcome[r] += 1);

  await seedSections(count);

  for (const [sortOrder, { id, ...gym }] of GYMS.entries()) {
    // ratingSum = the imported average × count, so later verified reviews update the average correctly.
    const record = {
      id,
      ...gym,
      sortOrder,
      ratingSum: ratingSum(gym.rating, gym.reviewCount),
      sectionId: 'gym',
      status: 'approved' as const,
      createdBy: 'owner' as const,
      categoryIds: [],
    };
    count(await upsert(`Gym ${id}`, () => client.models.Gym.get({ id }), () => client.models.Gym.create(record), () => client.models.Gym.update(record)));

    for (const { id: planId, kind, name, price, description, badge } of buildPlans(id, gym.monthlyPrice)) {
      const plan = { id: planId, gymId: id, kind, name, price, description, badge, durationMonths: PLAN_MONTHS[kind] };
      count(
        await upsert(
          `MembershipPlan ${planId}`,
          () => client.models.MembershipPlan.get({ id: planId }),
          () => client.models.MembershipPlan.create(plan),
          () => client.models.MembershipPlan.update(plan),
        ),
      );
    }
  }

  for (const [sortOrder, trainer] of TRAINERS.entries()) {
    const record = { ...trainer, sortOrder, ratingSum: ratingSum(trainer.rating, trainer.reviewCount) };
    count(
      await upsert(
        `Trainer ${trainer.id}`,
        () => client.models.Trainer.get({ id: trainer.id }),
        () => client.models.Trainer.create(record),
        () => client.models.Trainer.update(record),
      ),
    );
  }

  for (const { gymId, trainerId, ...review } of REVIEWS) {
    // Null index keys are omitted, not written.
    const record = { ...review, ...(gymId ? { gymId } : {}), ...(trainerId ? { trainerId } : {}) };
    count(
      await upsert(
        `Review ${review.id}`,
        () => client.models.Review.get({ id: review.id }),
        () => client.models.Review.create(record),
        () => client.models.Review.update(record),
      ),
    );
  }

  for (const rule of DEFAULT_AVAILABILITY) {
    const key = { trainerId: rule.trainerId, key: rule.key };
    count(
      await upsert(
        `AvailabilityRule ${rule.key}`,
        () => client.models.AvailabilityRule.get(key),
        () => client.models.AvailabilityRule.create(rule),
        () => client.models.AvailabilityRule.update(rule),
      ),
    );
  }

  // Records created before rating aggregates existed get their ratingSum (nothing else is touched).
  const backfilled = await backfillRatingSums();
  const migrated = await migrateFacilities(event?.adminOwnerKey ?? null);

  const plans = GYMS.length * 3;
  return {
    ...outcome,
    backfilled,
    migrated,
    sections: SECTIONS.length,
    gyms: GYMS.length,
    plans,
    trainers: TRAINERS.length,
    reviews: REVIEWS.length,
    availabilityRules: DEFAULT_AVAILABILITY.length,
  };
};
