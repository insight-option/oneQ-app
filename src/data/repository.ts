import type {
  Account,
  Address,
  Department,
  FacilityService,
  MembershipFreeze,
  Section,
  Booking,
  BookingDraft,
  Gym,
  MembershipPlan,
  PaymentMethod,
  Review,
  ReviewStatus,
  ReviewTarget,
  AvailabilityRule,
  Specialty,
  TimeSlot,
  Trainer,
} from '@/domain/models';

export type AvailabilityDay = { date: string; closed: boolean; slots: TimeSlot[] };

// Error codes mirror 11-API-AND-BACKEND-REQUIREMENTS §2; UI maps them to `errors.*` strings.
export type RepositoryErrorCode =
  | 'INVALID_BOOKING'
  | 'SLOT_TAKEN'
  | 'SLOT_UNAVAILABLE'
  | 'DUPLICATE_BOOKING'
  | 'PAYMENT_FAILED'
  | 'REVIEW_NOT_ELIGIBLE'
  | 'DUPLICATE_REVIEW'
  | 'CONFLICT'
  | 'VALIDATION'
  | 'INVALID_CREDENTIALS'
  | 'INVALID_PASSWORD'
  | 'ACCOUNT_EXISTS'
  | 'ACCOUNT_NOT_FOUND'
  | 'INVALID_CODE'
  | 'NOT_FOUND'
  | 'RATE_LIMITED'
  | 'NETWORK'
  | 'UNAUTHORIZED'
  | 'SESSION_EXPIRED'
  | 'FREEZE_LIMIT'
  | 'FREEZE_NOT_ALLOWED';

export class RepositoryError extends Error {
  readonly code: RepositoryErrorCode;
  constructor(code: RepositoryErrorCode, options?: { cause?: unknown }) {
    super(code, options);
    this.code = code;
  }
}

export type SignUpInput = Account & { password: string };

// `confirm`: the account exists but its email is not confirmed yet; a code was sent to `destination`.
export type AuthResult = { status: 'signedIn'; account: Account } | { status: 'confirm'; username: string; destination: string | null };

// Screens depend only on this interface; the implementation is AWS Amplify (src/data/amplify).
export interface Repository {
  listGyms(): Promise<Gym[]>;
  getGym(id: string): Promise<Gym | null>;
  getPlans(gymId: string): Promise<MembershipPlan[]>;
  listTrainers(gymId: string, specialty?: Specialty | null): Promise<Trainer[]>;
  getTrainer(id: string): Promise<Trainer | null>;
  listReviews(by: { gymId: string } | { trainerId: string }): Promise<Review[]>;
  // The next 14 days (Asia/Qatar), computed by the server.
  getAvailability(trainerId: string): Promise<AvailabilityDay[]>;

  // Dynamic sections and facilities (customers see visible sections and approved facilities only).
  listSections(): Promise<Section[]>;
  listFacilities(sectionId?: string | null): Promise<Gym[]>;
  listServices(facilityId: string): Promise<FacilityService[]>;
  listDepartments(facilityId: string): Promise<Department[]>;

  // Membership freeze (2 × up to 30 days when the plan allows it).
  listFreezes(bookingId: string): Promise<MembershipFreeze[]>;
  freezeMembership(bookingId: string, startDate: string, days: number): Promise<{ freezesUsed: number; membershipEnd: string }>;

  // One-time rating prompt for a completed booking.
  pendingReviewPrompt(): Promise<{ bookingId: string; targetType: 'gym' | 'trainer'; targetId: string; targetName: string } | null>;
  submitBookingReview(input: { bookingId: string; rating: number; satisfied: boolean | null; text: string }): Promise<void>;
  dismissReviewPrompt(bookingId: string): Promise<void>;

  // Full address kept in the user's profile (UserProfile), never in Cognito attributes.
  getAddress(): Promise<Address>;
  saveAddress(address: Address): Promise<void>;

  // Validates the draft (slot still free, no duplicate) and returns the server-side price.
  quoteBooking(draft: BookingDraft): Promise<{ priceQar: number }>;
  createBooking(draft: BookingDraft, payment: { method: PaymentMethod; paymentId: string }): Promise<Booking>;
  // Signed in: the account's bookings. Signed out: guest bookings made on this device.
  listBookings(): Promise<Booking[]>;
  getBooking(id: string): Promise<Booking | null>;

  // Verified ratings (signed-in users with a completed booking; enforced by the backend).
  getReviewStatus(target: ReviewTarget): Promise<ReviewStatus>;
  // Creates the review, or edits the caller's own one when reviewId is given.
  submitReview(input: { target: ReviewTarget; rating: number; text: string; reviewId?: string }): Promise<Review>;
  removeReview(id: string): Promise<void>;

  listFavorites(): Promise<string[]>;
  addFavorite(gymId: string): Promise<void>;
  removeFavorite(gymId: string): Promise<void>;

  // Restores the stored session without a network round trip when the tokens are still valid.
  currentAccount(): Promise<Account | null>;
  // Profile details from UserProfile (created on first sign-in), falling back to the Cognito attributes.
  getProfile(): Promise<Account>;
  signIn(identifier: string, password: string): Promise<AuthResult>;
  signUp(input: SignUpInput): Promise<AuthResult>;
  // Returns the account when the sign-up can finish signing in automatically, otherwise null.
  confirmSignUp(username: string, code: string): Promise<Account | null>;
  resendSignUpCode(username: string): Promise<void>;
  signOut(): Promise<void>;
  requestPasswordReset(identifier: string): Promise<void>;
  confirmPasswordReset(identifier: string, code: string, newPassword: string): Promise<void>;
}

// Management operations. The backend enforces the Cognito `admin` group for every one of them.
export type GymInput = Omit<Gym, 'id' | 'rating' | 'reviewCount' | 'openingHours'>;
export type TrainerInput = Omit<Trainer, 'id' | 'rating' | 'reviewCount'>;

export interface AdminRepository {
  // `id` null creates a new record (id derived from the name) and returns its id.
  saveGym(id: string | null, input: GymInput): Promise<string>;
  savePlan(plan: MembershipPlan & { gymId: string }): Promise<void>;
  saveTrainer(id: string | null, input: TrainerInput): Promise<string>;
  listAllBookings(): Promise<Booking[]>;
  cancelBooking(id: string): Promise<Booking>;
  // Moderation: newest first, gym and trainer reviews; removal goes through removeReview (admin allowed).
  listAllReviews(): Promise<Review[]>;
  // Availability rules for "*" (all trainers) or one trainer.
  listAvailabilityRules(trainerId: string): Promise<AvailabilityRule[]>;
  saveAvailabilityRule(rule: AvailabilityRule): Promise<void>;
  deleteAvailabilityRule(trainerId: string, key: string): Promise<void>;
}
