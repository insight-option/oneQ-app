import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Auth from 'aws-amplify/auth';
import { generateClient } from 'aws-amplify/data';

import type {
  Account,
  Address,
  AmenityKey,
  Department,
  FacilityService,
  MembershipFreeze,
  Section,
  ServiceMode,
  Booking,
  BookingDraft,
  BookingStatus,
  BookingType,
  Gym,
  MembershipPlan,
  PaymentMethod,
  PlanKind,
  Review,
  Specialty,
  Trainer,
  Weekday,
} from '@/domain/models';
import { isValidQatarMobile, normaliseQatarPhone, toQatarE164 } from '@/domain/validation';

import type { Schema } from '../../../amplify/data/resource';
import { RepositoryError, type Repository } from '../repository';
import { toRepositoryError } from './errors';

// ── Client & session ──

type Client = ReturnType<typeof generateClient<Schema>>;
let client: Client | undefined;
// Created lazily: Amplify.configure runs in the root layout, after this module is imported.
export const data = () => (client ??= generateClient<Schema>());

type AuthMode = 'userPool' | 'identityPool';
type Session = { mode: 'identityPool' } | { mode: 'userPool'; owner: string; claims: Record<string, unknown> };

// Signed-in calls use the Cognito user pool; everyone else uses the identity pool's guest role.
async function session(): Promise<Session> {
  let tokens;
  try {
    ({ tokens } = await Auth.fetchAuthSession());
  } catch (e) {
    const mapped = toRepositoryError(e);
    throw mapped instanceof RepositoryError && mapped.code === 'NETWORK' ? mapped : new RepositoryError('SESSION_EXPIRED', { cause: e });
  }
  if (!tokens?.idToken) return { mode: 'identityPool' };
  const { sub, username } = tokens.accessToken.payload;
  // Owner key format written by Amplify owner rules: "<sub>::<username>".
  return { mode: 'userPool', owner: `${sub}::${username}`, claims: tokens.idToken.payload };
}

async function signedInSession() {
  const s = await session();
  if (s.mode !== 'userPool') throw new RepositoryError('SESSION_EXPIRED');
  return s;
}

// The signed-in user's owner key ("<sub>::<username>").
export async function currentOwnerKey() {
  return (await signedInSession()).owner;
}

type Result<T> = { data: T; errors?: readonly { message: string; errorType?: string | null }[]; nextToken?: string | null };

// A request that hangs (captive portal, dead connection) surfaces as NETWORK instead of spinning forever.
// Retrying is safe: bookings are idempotent per payment.
const REQUEST_TIMEOUT_MS = 20_000;

function withTimeout<T>(request: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new RepositoryError('NETWORK')), REQUEST_TIMEOUT_MS);
  });
  return Promise.race([request, timeout]).finally(() => clearTimeout(timer));
}

export async function run<T>(request: Promise<Result<T>>): Promise<Result<T>> {
  let result: Result<T>;
  try {
    result = await withTimeout(request);
  } catch (e) {
    throw toRepositoryError(e);
  }
  if (result.errors?.length) throw toRepositoryError(result.errors);
  return result;
}

// Custom operations return non-null types; a missing payload means the call failed upstream.
export function required<T>(value: T | null | undefined): T {
  if (value == null) throw new Error('Empty response');
  return value;
}

export async function listAll<T>(page: (nextToken: string | undefined) => Promise<Result<T[]>>) {
  const items: T[] = [];
  let nextToken: string | undefined;
  do {
    const result = await run(page(nextToken));
    items.push(...result.data);
    nextToken = result.nextToken ?? undefined;
  } while (nextToken);
  return items;
}

// A get that the caller is not allowed to read is reported as "not found" (deep links to someone else's record).
async function getOrNull<T>(request: Promise<Result<T | null>>) {
  try {
    return (await run(request)).data;
  } catch (e) {
    if (e instanceof RepositoryError && e.code === 'UNAUTHORIZED') return null;
    throw e;
  }
}

const isConditionalFailure = (e: unknown) =>
  e instanceof Error && e.cause instanceof Array && e.cause.some((err: { errorType?: string }) => err.errorType?.includes('ConditionalCheckFailed'));

// ── Mapping (backend → domain) ──

type GymRecord = Schema['Gym']['type'] | Schema['FacilityView']['type'];
type PlanRecord = Schema['MembershipPlan']['type'];
type TrainerRecord = Schema['Trainer']['type'];
type ReviewRecord = Schema['Review']['type'] | Schema['ReviewView']['type'];
type BookingRecord = Schema['Booking']['type'] | Schema['BookingView']['type'];

const toGym = (g: GymRecord): Gym => ({
  id: g.id,
  name: g.name,
  area: g.area,
  description: g.description,
  address: g.address,
  // Aggregates are server-owned; a gym or trainer without reviews yet has none.
  rating: g.rating ?? 0,
  reviewCount: g.reviewCount ?? 0,
  monthlyPrice: g.monthlyPrice,
  trainerFromMonthly: g.trainerFromMonthly,
  images: [...g.images],
  amenities: g.amenities as AmenityKey[],
  isFeatured: g.isFeatured,
  isNearby: g.isNearby,
  openingHours: g.openingHours.map((h) => ({ day: h.day as Weekday, open: h.open, close: h.close })),
  sectionId: g.sectionId ?? 'gym',
  categoryIds: (g.categoryIds ?? []).filter((c): c is string => !!c),
  phone: g.phone ?? null,
  whatsapp: g.whatsapp ?? null,
  storeUrl: g.storeUrl ?? null,
  lat: g.lat ?? null,
  lng: g.lng ?? null,
  region: g.region ?? null,
  serviceMode: (g.serviceMode ?? null) as ServiceMode | null,
  logo: g.logo ?? null,
});

// Customers see the facility's discounted price (direct discount carried by the facility; never a code).
const planPrice = (p: PlanRecord) =>
  !p.discountType || !p.discountValue
    ? p.price
    : p.discountType === 'percent'
      ? Math.round(p.price * (1 - Math.min(90, p.discountValue) / 100))
      : Math.max(0, p.price - p.discountValue);

const toPlan = (p: PlanRecord): MembershipPlan => ({
  id: p.id,
  kind: p.kind as PlanKind,
  name: p.name,
  price: planPrice(p),
  description: p.description,
  badge: p.badge ?? null,
  allowFreeze: p.allowFreeze === true,
});

const toTrainer = (t: TrainerRecord): Trainer => ({
  id: t.id,
  gymId: t.gymId,
  name: t.name,
  title: t.title,
  bio: t.bio,
  image: t.image,
  rating: t.rating ?? 0,
  reviewCount: t.reviewCount ?? 0,
  yearsExperience: t.yearsExperience,
  languages: [...t.languages],
  specialties: t.specialties as Specialty[],
  certifications: [...t.certifications],
  pricePerSession: t.pricePerSession,
});

export const toReview = (r: ReviewRecord): Review => ({
  id: r.id,
  authorName: r.authorName,
  date: r.date,
  gymId: r.gymId ?? null,
  trainerId: r.trainerId ?? null,
  rating: r.rating,
  text: r.text,
});

export const toBooking = (b: BookingRecord): Booking => ({
  id: b.id,
  type: b.type as BookingType,
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
  status: b.status as BookingStatus,
  // Stored as +974XXXXXXXX; the app shows "+974 XXXX XXXX".
  guest: { fullName: b.guest.fullName, phone: normaliseQatarPhone(b.guest.phone), email: b.guest.email ?? null },
  createdAt: b.createdAt,
  membershipStart: b.membershipStart ?? null,
  membershipEnd: b.membershipEnd ?? null,
  paymentMethod: b.paymentMethod as PaymentMethod,
  paymentId: b.paymentId,
  trainerUnavailable: 'trainerUnavailable' in b ? b.trainerUnavailable === true : false,
});

export const newestFirst = (a: Booking, b: Booking) => b.createdAt.localeCompare(a.createdAt);

const accountFromClaims = (claims: Record<string, unknown>): Account => ({
  fullName: String(claims.name ?? ''),
  email: String(claims.email ?? ''),
  phone: claims.phone_number ? normaliseQatarPhone(String(claims.phone_number)) : '',
  isAdmin: Array.isArray(claims['cognito:groups']) && claims['cognito:groups'].includes('admin'),
  isOwner: Array.isArray(claims['cognito:groups']) && claims['cognito:groups'].includes('FACILITY_OWNER'),
});

// ── Guest bookings kept on this device ("<bookingId>.<secret>" tokens from placeBooking) ──

const GUEST_BOOKINGS_KEY = 'oneq.guestBookingTokens';

async function readGuestTokens(): Promise<string[]> {
  const raw = await AsyncStorage.getItem(GUEST_BOOKINGS_KEY);
  return raw ? (JSON.parse(raw) as string[]) : [];
}

const writeGuestTokens = (tokens: string[]) => AsyncStorage.setItem(GUEST_BOOKINGS_KEY, JSON.stringify(tokens));

async function fetchGuestBookings(tokens: string[], authMode: AuthMode) {
  if (tokens.length === 0) return [];
  const { data: views } = await run(data().queries.guestBookings({ tokens }, { authMode }));
  return required(views).map(toBooking);
}

// ── Booking drafts (domain → custom operation arguments) ──

function draftArgs(d: BookingDraft) {
  const { gym, guest } = d;
  if (!gym || !guest) throw new RepositoryError('INVALID_BOOKING');
  const session = d.path === 'membershipPlusTrainer';
  return {
    type: session ? 'session' : 'membership',
    gymId: gym.id,
    planId: session ? null : (d.plan?.id ?? null),
    trainerId: session ? (d.trainer?.id ?? null) : null,
    date: session ? (d.date ?? null) : null,
    minutes: session ? (d.slot?.minutes ?? null) : null,
    guestName: guest.fullName,
    guestPhone: toQatarE164(guest.phone) ?? guest.phone,
    guestEmail: guest.email,
  };
}

// ── Auth helpers ──

// Email, or a Qatar mobile number resolved to its Cognito username by the `signInName` query.
async function resolveUsername(identifier: string): Promise<string | null> {
  const id = identifier.trim();
  if (id.includes('@')) return id.toLowerCase();
  if (!isValidQatarMobile(id)) return null;
  const { data: username } = await run(data().queries.signInName({ phone: id }, { authMode: 'identityPool' }));
  return username ?? null;
}

async function currentAccount(): Promise<Account | null> {
  const s = await session();
  return s.mode === 'userPool' ? accountFromClaims(s.claims) : null;
}

async function signedInAccount(): Promise<Account> {
  const account = await currentAccount();
  if (!account) throw new RepositoryError('SESSION_EXPIRED');
  return account;
}

async function auth<T>(request: Promise<T>): Promise<T> {
  try {
    return await request;
  } catch (e) {
    throw toRepositoryError(e);
  }
}

// ── Repository ──

export const amplifyRepository: Repository = {
  // Customers read approved facilities of visible sections only, filtered by the server (catalogue function).
  async listGyms() {
    const { mode } = await session();
    const { data: facilities } = await run(data().queries.listApprovedFacilities({ sectionId: 'gym' }, { authMode: mode }));
    return required(facilities).map(toGym);
  },
  async getGym(id) {
    const { mode } = await session();
    const { data: facility } = await run(data().queries.getApprovedFacility({ id }, { authMode: mode }));
    return facility ? toGym(facility) : null;
  },
  async getPlans(gymId) {
    const { mode } = await session();
    const plans = await listAll((nextToken) => data().models.MembershipPlan.listPlansByGym({ gymId }, { authMode: mode, nextToken }));
    // Plans hidden by the facility are not offered to customers.
    return plans.filter((p) => p.visible !== false).map(toPlan);
  },
  async listSections(): Promise<Section[]> {
    const { mode } = await session();
    const { data: sections } = await run(data().queries.listVisibleSections({ authMode: mode }));
    return required(sections).map((s) => ({
      slug: s.slug,
      nameAr: s.nameAr,
      nameEn: s.nameEn ?? null,
      descAr: s.descAr ?? null,
      descEn: s.descEn ?? null,
      icon: s.icon,
      colorKey: s.colorKey,
      order: s.order,
      bookingMode: s.bookingMode as Section['bookingMode'],
      hasPractitioners: s.hasPractitioners,
      hasServices: s.hasServices,
      hasDepartments: s.hasDepartments,
      hasPackages: s.hasPackages,
      hasGallery: s.hasGallery,
      practitionerLabelAr: s.practitionerLabelAr ?? null,
      practitionerLabelEn: s.practitionerLabelEn ?? null,
      presetType: s.presetType as Section['presetType'],
      categories: s.categories.map((c) => ({ id: c.id, nameAr: c.nameAr, nameEn: c.nameEn ?? null, order: c.order })),
    }));
  },
  // Approved facilities of visible sections (all sections, or one).
  async listFacilities(sectionId) {
    const { mode } = await session();
    const { data: facilities } = await run(data().queries.listApprovedFacilities({ sectionId: sectionId ?? null }, { authMode: mode }));
    return required(facilities).map(toGym);
  },
  async listServices(facilityId): Promise<FacilityService[]> {
    const { mode } = await session();
    const items = await listAll((nextToken) => data().models.Service.listServicesByFacility({ facilityId }, { authMode: mode, nextToken }));
    return items
      .filter((s) => s.active !== false)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      .map((s) => ({ id: s.id, nameAr: s.nameAr, nameEn: s.nameEn ?? null, categoryId: s.categoryId ?? null, priceQar: s.priceQar, durationMinutes: s.durationMinutes, homeAvailable: s.homeAvailable === true }));
  },
  async listDepartments(facilityId): Promise<Department[]> {
    const { mode } = await session();
    const items = await listAll((nextToken) => data().models.Department.listDepartmentsByFacility({ facilityId }, { authMode: mode, nextToken }));
    return items.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)).map((d) => ({ id: d.id, nameAr: d.nameAr, nameEn: d.nameEn ?? null }));
  },
  async listTrainers(gymId, specialty) {
    const { mode } = await session();
    const trainers = await listAll((nextToken) => data().models.Trainer.listTrainersByGym({ gymId }, { authMode: mode, nextToken }));
    return trainers.map(toTrainer).filter((t) => !specialty || t.specialties.includes(specialty));
  },
  async getTrainer(id) {
    const { mode } = await session();
    const trainer = await getOrNull(data().models.Trainer.get({ id }, { authMode: mode }));
    return trainer ? toTrainer(trainer) : null;
  },
  async listReviews(by) {
    const { mode } = await session();
    const reviews = await listAll((nextToken) =>
      'gymId' in by
        ? data().models.Review.listReviewsByGym({ gymId: by.gymId }, { authMode: mode, nextToken, sortDirection: 'DESC' })
        : data().models.Review.listReviewsByTrainer({ trainerId: by.trainerId }, { authMode: mode, nextToken, sortDirection: 'DESC' }),
    );
    return reviews.map(toReview);
  },
  async getAvailability(trainerId) {
    const { mode } = await session();
    const { data: days } = await run(data().queries.trainerAvailability({ trainerId }, { authMode: mode }));
    return required(days).map((d) => ({ date: d.date, closed: d.closed, slots: d.slots.map((s) => ({ ...s })) }));
  },

  async quoteBooking(draft) {
    const { mode } = await session();
    const { data: quote } = await run(data().queries.quoteBooking(draftArgs(draft), { authMode: mode }));
    return { priceQar: required(quote).priceQar };
  },
  async createBooking(draft, payment) {
    const { mode } = await session();
    const args = { ...draftArgs(draft), paymentMethod: payment.method, paymentId: payment.paymentId };
    const view = required((await run(data().mutations.placeBooking(args, { authMode: mode }))).data);
    // Guests keep the one-time access token to read this booking later (Bookings tab, details).
    if (view.guestToken) await writeGuestTokens([view.guestToken, ...(await readGuestTokens())]);
    return toBooking(view);
  },
  async listBookings() {
    const s = await session();
    if (s.mode === 'userPool') {
      const owner = s.owner;
      const bookings = await listAll((nextToken) => data().models.Booking.listBookingsByOwner({ owner }, { authMode: 'userPool', nextToken }));
      return bookings.map(toBooking).sort(newestFirst);
    }
    const tokens = await readGuestTokens();
    const bookings = await fetchGuestBookings(tokens, 'identityPool');
    // Forget tokens the backend no longer recognises.
    const known = new Set(bookings.map((b) => b.id));
    const kept = tokens.filter((t) => known.has(t.split('.')[0]!));
    if (kept.length !== tokens.length) await writeGuestTokens(kept);
    return bookings.sort(newestFirst);
  },
  async getBooking(id) {
    const s = await session();
    if (s.mode === 'userPool') {
      const booking = await getOrNull(data().models.Booking.get({ id }, { authMode: 'userPool' }));
      if (booking) return toBooking(booking);
    }
    // A guest booking made on this device (e.g. its Success screen).
    const token = (await readGuestTokens()).find((t) => t.startsWith(`${id}.`));
    return token ? ((await fetchGuestBookings([token], s.mode))[0] ?? null) : null;
  },

  async listFreezes(bookingId): Promise<MembershipFreeze[]> {
    await signedInSession();
    const items = await listAll((nextToken) => data().models.MembershipFreeze.listFreezesByBooking({ bookingId }, { authMode: 'userPool', nextToken }));
    return items.map((f) => ({ id: f.id, startDate: f.startDate, endDate: f.endDate, days: f.days }));
  },
  async freezeMembership(bookingId, startDate, days) {
    await signedInSession();
    const { data: result } = await run(data().mutations.freezeMembership({ bookingId, startDate, days }, { authMode: 'userPool' }));
    return required(result);
  },
  async pendingReviewPrompt() {
    await signedInSession();
    const { data: pending } = await run(data().queries.pendingReviewPrompt({ authMode: 'userPool' }));
    return pending ? { bookingId: pending.bookingId, targetType: pending.targetType as 'gym' | 'trainer', targetId: pending.targetId, targetName: pending.targetName } : null;
  },
  async submitBookingReview({ bookingId, rating, satisfied, text }) {
    await signedInSession();
    await run(data().mutations.submitBookingReview({ bookingId, rating, satisfied, text }, { authMode: 'userPool' }));
  },
  async dismissReviewPrompt(bookingId) {
    await signedInSession();
    await run(data().mutations.dismissReviewPrompt({ bookingId }, { authMode: 'userPool' }));
  },
  async getAddress(): Promise<Address> {
    const { owner } = await signedInSession();
    const profile = await getOrNull(data().models.UserProfile.get({ profileOwner: owner }, { authMode: 'userPool' }));
    return { region: profile?.region ?? '', street: profile?.street ?? '', house: profile?.house ?? '' };
  },
  async saveAddress(address) {
    const { owner } = await signedInSession();
    await amplifyRepository.getProfile(); // creates the profile on first use
    await run(
      data().models.UserProfile.update(
        { profileOwner: owner, region: address.region.trim() || null, street: address.street.trim() || null, house: address.house.trim() || null },
        { authMode: 'userPool' },
      ),
    );
  },

  async getReviewStatus(target) {
    await signedInSession();
    const { data: status } = await run(data().queries.reviewStatus({ targetType: target.type, targetId: target.id }, { authMode: 'userPool' }));
    const { eligible, review } = required(status);
    return { eligible, review: review ? toReview(review) : null };
  },
  async submitReview({ target, rating, text, reviewId }) {
    await signedInSession();
    const args = { targetType: target.type, targetId: target.id, rating, text, ...(reviewId ? { reviewId } : {}) };
    const { data: review } = await run(data().mutations.submitReview(args, { authMode: 'userPool' }));
    return toReview(required(review));
  },
  async removeReview(id) {
    await signedInSession();
    await run(data().mutations.removeReview({ id }, { authMode: 'userPool' }));
  },

  async listFavorites() {
    const { owner } = await signedInSession();
    const favorites = await listAll((nextToken) => data().models.Favorite.list({ owner, authMode: 'userPool', nextToken }));
    return favorites.map((f) => f.gymId);
  },
  async addFavorite(gymId) {
    const { owner } = await signedInSession();
    try {
      await run(data().models.Favorite.create({ owner, gymId }, { authMode: 'userPool' }));
    } catch (e) {
      // (owner, gymId) is the primary key: an existing favorite is already the desired state.
      if (!isConditionalFailure(e)) throw e;
    }
  },
  async removeFavorite(gymId) {
    const { owner } = await signedInSession();
    try {
      await run(data().models.Favorite.delete({ owner, gymId }, { authMode: 'userPool' }));
    } catch (e) {
      if (!isConditionalFailure(e)) throw e;
    }
  },

  currentAccount,
  async getProfile() {
    const { owner, claims } = await signedInSession();
    const fallback = accountFromClaims(claims);
    const toAccount = (p: Schema['UserProfile']['type']): Account => ({
      fullName: p.fullName,
      email: p.email,
      phone: normaliseQatarPhone(p.phone),
    });
    const profile = await getOrNull(data().models.UserProfile.get({ profileOwner: owner }, { authMode: 'userPool' }));
    if (profile) return toAccount(profile);
    // First sign-in: create the profile from the confirmed Cognito attributes.
    const { data: created } = await run(
      data().models.UserProfile.create(
        { profileOwner: owner, fullName: fallback.fullName, email: fallback.email, phone: toQatarE164(fallback.phone) ?? fallback.phone },
        { authMode: 'userPool' },
      ),
    );
    return created ? toAccount(created) : fallback;
  },

  async signIn(identifier, password) {
    // A stale session would make Cognito reject the new sign-in.
    if ((await session()).mode === 'userPool') await auth(Auth.signOut());
    const username = await resolveUsername(identifier);
    if (!username) throw new RepositoryError('INVALID_CREDENTIALS');
    let result;
    try {
      result = await Auth.signIn({ username, password });
    } catch (e) {
      if (!(e instanceof Error && e.name === 'UserNotConfirmedException')) throw toRepositoryError(e);
      result = { isSignedIn: false, nextStep: { signInStep: 'CONFIRM_SIGN_UP' as const } };
    }
    if (result.isSignedIn) return { status: 'signedIn', account: await signedInAccount() };
    if (result.nextStep.signInStep === 'CONFIRM_SIGN_UP') {
      const details = await auth(Auth.resendSignUpCode({ username }));
      return { status: 'confirm', username, destination: details.destination ?? null };
    }
    // No other challenges (MFA, new password) are configured for this user pool.
    throw new RepositoryError('INVALID_CREDENTIALS');
  },
  async signUp({ fullName, email, phone, password }) {
    const username = email.trim().toLowerCase();
    const phoneNumber = toQatarE164(phone);
    if (!phoneNumber) throw new RepositoryError('VALIDATION');
    const { nextStep } = await auth(
      Auth.signUp({
        username,
        password,
        options: { userAttributes: { email: username, name: fullName.trim(), phone_number: phoneNumber }, autoSignIn: true },
      }),
    );
    if (nextStep.signUpStep === 'COMPLETE_AUTO_SIGN_IN') {
      const { isSignedIn } = await auth(Auth.autoSignIn());
      if (isSignedIn) return { status: 'signedIn', account: await signedInAccount() };
    }
    const destination = nextStep.signUpStep === 'CONFIRM_SIGN_UP' ? (nextStep.codeDeliveryDetails.destination ?? null) : null;
    return { status: 'confirm', username, destination };
  },
  async confirmSignUp(username, code) {
    const { nextStep } = await auth(Auth.confirmSignUp({ username, confirmationCode: code.trim() }));
    if (nextStep.signUpStep !== 'COMPLETE_AUTO_SIGN_IN') return null;
    const { isSignedIn } = await auth(Auth.autoSignIn());
    return isSignedIn ? signedInAccount() : null;
  },
  async resendSignUpCode(username) {
    await auth(Auth.resendSignUpCode({ username }));
  },
  async signOut() {
    await auth(Auth.signOut());
  },
  async requestPasswordReset(identifier) {
    const username = await resolveUsername(identifier);
    if (!username) throw new RepositoryError('ACCOUNT_NOT_FOUND');
    try {
      await Auth.resetPassword({ username });
    } catch (e) {
      if (e instanceof Error && e.name === 'UserNotFoundException') throw new RepositoryError('ACCOUNT_NOT_FOUND', { cause: e });
      throw toRepositoryError(e);
    }
  },
  async confirmPasswordReset(identifier, code, newPassword) {
    const username = await resolveUsername(identifier);
    if (!username) throw new RepositoryError('INVALID_CODE');
    await auth(Auth.confirmResetPassword({ username, confirmationCode: code.trim(), newPassword }));
  },
};
