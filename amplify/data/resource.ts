import { a, defineData, type ClientSchema } from '@aws-amplify/backend';

import { adminOps } from '../functions/admin-ops/resource';
import { bookings } from '../functions/bookings/resource';
import { catalogue } from '../functions/catalogue/resource';
import { completeBookings } from '../functions/complete-bookings/resource';
import { facilityOwner } from '../functions/facility-owner/resource';
import { phoneLogin } from '../functions/phone-login/resource';
import { reviews } from '../functions/reviews/resource';
import { sandboxFixtures } from '../functions/sandbox-fixtures/resource';
import { seedCatalogue } from '../functions/seed-catalogue/resource';

// Mirrors src/domain/models.ts. Catalogue ids are the approved Phase 3 slugs, so routes keep working.
// Clients never write the catalogue, bookings or slot reservations: bookings are created only by the
// `bookings` function after server-side validation (see docs/PHASE-4-BACKEND.md).

const bookingDraftArgs = {
  type: a.string().required(), // 'membership' | 'session'
  gymId: a.id().required(),
  planId: a.id(),
  trainerId: a.id(),
  date: a.string(), // yyyy-MM-dd (Asia/Qatar)
  minutes: a.integer(), // slot start, minutes after midnight
  guestName: a.string().required(),
  guestPhone: a.string().required(),
  guestEmail: a.string(),
};

// Rating aggregates are computed by the reviews function (IAM, which bypasses these rules). Every client —
// admins included — can only read them, so nobody can set an average or a count by hand.
type FieldAllow = Parameters<Parameters<ReturnType<typeof a.string>['authorization']>[0]>[0];
const serverOwned = (allow: FieldAllow) => [allow.guest().to(['read']), allow.authenticated().to(['read'])];
// Facilities are read by customers only through listApprovedFacilities, so their aggregates are readable by the
// facility owner and admins (still never writable by a client).
const facilityServerOwned = (allow: FieldAllow) => [allow.ownerDefinedIn('ownerId').to(['read']), allow.group('admin').to(['read'])];

const schema = a
  .schema({
    OpeningHours: a.customType({
      day: a.string().required(),
      open: a.string().required(),
      close: a.string().required(),
    }),

    GuestInfo: a.customType({
      fullName: a.string().required(),
      phone: a.string().required(), // +974XXXXXXXX
      email: a.string(),
    }),

    // ── Sections (dynamic): admins manage them, facility owners read them. Customers read only visible sections
    // and approved facilities, through listVisibleSections / listApprovedFacilities (server-side filtering: model
    // rules cannot filter rows by a field value; docs/ENG-REVIEW-multi-section-v2.md §2) ──

    SectionStatus: a.enum(['visible', 'hidden']),
    BookingMode: a.enum(['appointment', 'subscription', 'both']),
    PresetType: a.enum(['gym', 'hospital', 'clinic', 'salon', 'other']),
    FacilityStatus: a.enum(['pending', 'approved', 'suspended']),
    FacilityCreator: a.enum(['owner', 'admin']),
    ServiceMode: a.enum(['inShop', 'home', 'both']),

    Section: a
      .model({
        slug: a.string().required(),
        nameAr: a.string().required(),
        nameEn: a.string(),
        descAr: a.string(),
        descEn: a.string(),
        icon: a.string().required(), // key of the fixed icon set
        colorKey: a.string().required(), // sectionPalette key, never a hex value
        order: a.integer().required(),
        status: a.ref('SectionStatus').required(),
        bookingMode: a.ref('BookingMode').required(),
        hasPractitioners: a.boolean().required(),
        hasServices: a.boolean().required(),
        hasDepartments: a.boolean().required(),
        hasPackages: a.boolean().required(),
        hasGallery: a.boolean().required(),
        practitionerLabelAr: a.string(),
        practitionerLabelEn: a.string(),
        presetType: a.ref('PresetType').required(),
        categories: a.hasMany('SectionCategory', 'sectionId'),
      })
      .identifier(['slug'])
      .authorization((allow) => [allow.group('admin'), allow.group('FACILITY_OWNER').to(['read'])]),

    // At most 12 per section.
    SectionCategory: a
      .model({
        sectionId: a.string().required(),
        section: a.belongsTo('Section', 'sectionId'),
        nameAr: a.string().required(),
        nameEn: a.string(),
        order: a.integer().required(),
      })
      .secondaryIndexes((index) => [index('sectionId').sortKeys(['order']).queryField('listCategoriesBySection')])
      .authorization((allow) => [allow.group('admin'), allow.group('FACILITY_OWNER').to(['read'])]),

    // ── Facilities. A facility of any section is a `Gym` record: the model keeps its original name so the existing
    // table and its data stay. Records from before sections have no section and no status: approved gyms. ──

    Gym: a
      .model({
        name: a.string().required(),
        area: a.string().required(),
        description: a.string().required(),
        address: a.string().required(),
        rating: a.float().authorization(facilityServerOwned),
        reviewCount: a.integer().authorization(facilityServerOwned),
        ratingSum: a.float().authorization(facilityServerOwned),
        monthlyPrice: a.integer().required(),
        trainerFromMonthly: a.integer().required(),
        images: a.string().required().array().required(),
        amenities: a.string().required().array().required(),
        openingHours: a.ref('OpeningHours').required().array().required(),
        isFeatured: a.boolean().required(),
        isNearby: a.boolean().required(),
        sortOrder: a.integer().required(),
        sectionId: a.string(), // Section slug
        ownerId: a.string(), // "<sub>::<username>" of the FACILITY_OWNER account
        status: a.ref('FacilityStatus'),
        statusReason: a.string(),
        createdBy: a.ref('FacilityCreator'),
        categoryIds: a.string().required().array(),
        phone: a.string(), // +974XXXXXXXX
        whatsapp: a.string(), // +974XXXXXXXX
        storeUrl: a.string(),
        lat: a.float(),
        lng: a.float(),
        region: a.string(),
        serviceMode: a.ref('ServiceMode'), // salons: in the shop, at home, or both
        logo: a.string(),
        plans: a.hasMany('MembershipPlan', 'gymId'),
        trainers: a.hasMany('Trainer', 'gymId'),
        reviews: a.hasMany('Review', 'gymId'),
      })
      // Owners read their own facilities; every write by an owner goes through the facility functions, which
      // check the owner. Customers use listApprovedFacilities / getApprovedFacility.
      .authorization((allow) => [allow.group('admin'), allow.ownerDefinedIn('ownerId').to(['read'])]),

    MembershipPlan: a
      .model({
        gymId: a.id().required(),
        gym: a.belongsTo('Gym', 'gymId'),
        kind: a.string().required(), // 'monthly' | '3m' | '6m'
        name: a.string().required(),
        description: a.string().required(),
        price: a.integer().required(),
        durationMonths: a.integer().required(),
        badge: a.string(),
        visible: a.boolean(), // false hides the plan from customers (null = visible)
        discountType: a.string(), // 'percent' | 'amount': a direct discount carried by the facility
        discountValue: a.integer(),
        allowFreeze: a.boolean(), // up to 2 freezes of up to 30 days each per membership
        autoRenew: a.boolean(), // customers may opt in to automatic renewal
      })
      .secondaryIndexes((index) => [index('gymId').sortKeys(['durationMonths']).queryField('listPlansByGym')])
      .authorization((allow) => [allow.guest().to(['read']), allow.authenticated().to(['read']), allow.group('admin')]),

    Trainer: a
      .model({
        gymId: a.id().required(),
        gym: a.belongsTo('Gym', 'gymId'),
        name: a.string().required(),
        title: a.string().required(),
        bio: a.string().required(),
        image: a.string().required(),
        rating: a.float().authorization(serverOwned),
        reviewCount: a.integer().authorization(serverOwned),
        ratingSum: a.float().authorization(serverOwned),
        yearsExperience: a.integer().required(),
        languages: a.string().required().array().required(),
        specialties: a.string().required().array().required(),
        certifications: a.string().required().array().required(),
        pricePerSession: a.integer().required(),
        sortOrder: a.integer().required(),
        skills: a.string().required().array(),
        departmentId: a.string(), // clinics/hospitals: the department the practitioner works in
        reviews: a.hasMany('Review', 'trainerId'),
      })
      .secondaryIndexes((index) => [index('gymId').sortKeys(['sortOrder']).queryField('listTrainersByGym')])
      .authorization((allow) => [allow.guest().to(['read']), allow.authenticated().to(['read']), allow.group('admin')]),

    Review: a
      .model({
        gymId: a.id(),
        gym: a.belongsTo('Gym', 'gymId'),
        trainerId: a.id(),
        trainer: a.belongsTo('Trainer', 'trainerId'),
        authorName: a.string().required(),
        rating: a.integer().required(), // 1–5
        date: a.date().required(),
        text: a.string().required(), // may be empty
        // Verified user reviews (created by the reviews function); null on the imported catalogue reviews.
        authorKey: a.string(), // hash of the author, never the Cognito id
        bookingId: a.string(), // the completed booking that made the author eligible
        satisfied: a.boolean(), // the satisfaction question of the one-time rating prompt
        ownerReply: a.string(), // the facility owner's public reply (the review itself is never edited)
        ownerReplyAt: a.string(),
      })
      .secondaryIndexes((index) => [
        index('gymId').sortKeys(['date']).queryField('listReviewsByGym'),
        index('trainerId').sortKeys(['date']).queryField('listReviewsByTrainer'),
      ])
      // Writes only through submitReview / removeReview; admins moderate there and cannot author reviews.
      .authorization((allow) => [allow.guest().to(['read']), allow.authenticated().to(['read'])]),

    // ── Per-user data ──

    // One profile per user: the owner key is the primary key, so it cannot be created for someone else.
    UserProfile: a
      .model({
        profileOwner: a.string().required(), // "<sub>::<username>"
        fullName: a.string().required(),
        email: a.string().required(),
        phone: a.string().required(), // +974XXXXXXXX
        // Full address (no Cognito attributes): area/region, street, house.
        region: a.string(),
        street: a.string(),
        house: a.string(),
      })
      .identifier(['profileOwner'])
      .authorization((allow) => [allow.ownerDefinedIn('profileOwner').to(['create', 'read', 'update'])]),

    // (owner, gymId) primary key: no duplicates, and nobody can create or read another user's favorites.
    Favorite: a
      .model({
        owner: a.string().required(),
        gymId: a.id().required(),
      })
      .identifier(['owner', 'gymId'])
      .authorization((allow) => [allow.owner().to(['create', 'read', 'delete'])]),

    // Written only by the bookings function. Owners can read their own; guests read theirs through `guestBookings`.
    Booking: a
      .model({
        type: a.string().required(), // 'membership' | 'session'
        gymId: a.id().required(),
        gymName: a.string().required(),
        gymLocation: a.string().required(),
        trainerId: a.id(),
        trainerName: a.string(),
        planId: a.id(),
        planName: a.string(),
        date: a.string(), // session start "yyyy-MM-ddTHH:mm:00", Asia/Qatar wall time
        timeLabel: a.string(),
        sessionCount: a.integer().required(),
        priceQar: a.integer().required(),
        status: a.string().required(), // 'confirmed' | 'completed' | 'cancelled'
        guest: a.ref('GuestInfo').required(),
        guestPhone: a.string().required(), // duplicate-membership index
        membershipStart: a.date(),
        membershipEnd: a.date(),
        paymentMethod: a.string().required(),
        paymentId: a.string().required(),
        owner: a.string(), // "<sub>::<username>"; null for guest bookings
        guestTokenHash: a.string(), // sha256 of the guest access secret; guest bookings only
        sectionId: a.string(),
        serviceId: a.string(), // appointment bookings (salons, clinics)
        serviceName: a.string(),
        departmentId: a.string(),
        durationMinutes: a.integer(), // timed bookings; 60 when null
        homeService: a.boolean(), // salon home visit: the salon sees the phone after confirming and calls for the location
        cancelReason: a.string(),
        trainerUnavailable: a.boolean(), // the facility blocked the trainer and will contact the customer
        reviewPrompted: a.boolean(), // the one-time rating prompt was shown or answered
      })
      .secondaryIndexes((index) => [
        index('owner').queryField('listBookingsByOwner'),
        index('guestPhone').sortKeys(['gymId']).queryField('listBookingsByGuestPhone'),
        index('gymId').queryField('listBookingsByGym'),
      ])
      .authorization((allow) => [allow.owner().to(['read']), allow.group('admin').to(['read'])]),

    // One item per booked trainer slot; the conditional create is the double-booking lock.
    SlotReservation: a
      .model({
        trainerId: a.id().required(),
        startAt: a.string().required(), // "yyyy-MM-ddTHH:mm:00", Asia/Qatar wall time
        bookingId: a.string().required(),
      })
      .identifier(['trainerId', 'startAt'])
      .authorization((allow) => [allow.group('admin').to(['read'])]),

    // One active membership per (phone, gym); the conditional create is the duplicate-membership lock.
    MembershipLock: a
      .model({
        guestPhone: a.string().required(),
        gymId: a.id().required(),
        bookingId: a.string().required(),
        membershipEnd: a.date().required(),
      })
      .identifier(['guestPhone', 'gymId'])
      .authorization((allow) => [allow.group('admin').to(['read'])]),

    // Trainer availability, managed by admins. trainerId "*" applies to every trainer; key is "weekday:0"…"weekday:6"
    // (0 = Sunday) or "date:yyyy-MM-dd" (override). Users read availability only through trainerAvailability.
    AvailabilityRule: a
      .model({
        trainerId: a.string().required(),
        key: a.string().required(),
        closed: a.boolean().required(),
        slots: a.integer().required().array().required(), // start times, minutes after midnight (Asia/Qatar)
      })
      .identifier(['trainerId', 'key'])
      .authorization((allow) => [allow.group('admin')]),

    WeeklyHours: a.customType({
      weekday: a.integer().required(), // 0 = Sunday
      open: a.string().required(), // "HH:mm", Asia/Qatar
      close: a.string().required(),
    }),

    // The facility's availability for a trainer: blocked (open-ended or for a period) and weekly working hours.
    // Applied on top of AvailabilityRule by the bookings function.
    TrainerAvailability: a
      .model({
        trainerId: a.string().required(),
        gymId: a.string().required(),
        unavailable: a.boolean().required(),
        unavailableFrom: a.date(), // null = from today
        unavailableUntil: a.date(), // null = until made available again
        weeklyHours: a.ref('WeeklyHours').required().array(), // empty = no restriction
      })
      .identifier(['trainerId'])
      .authorization((allow) => [allow.group('admin')]),

    // A membership freeze: at most 2 per membership, each up to 30 days (only when the plan allows freezing).
    MembershipFreeze: a
      .model({
        bookingId: a.string().required(),
        gymId: a.string().required(),
        owner: a.string(), // the customer's "<sub>::<username>"
        startDate: a.date().required(),
        endDate: a.date().required(),
        days: a.integer().required(),
      })
      .secondaryIndexes((index) => [index('bookingId').queryField('listFreezesByBooking')])
      .authorization((allow) => [allow.owner().to(['read']), allow.group('admin').to(['read'])]),

    // In-app notifications (no push yet). Written by the functions; the recipient reads them and marks them read.
    Notification: a
      .model({
        recipient: a.string().required(), // "<sub>::<username>"
        kind: a.string().required(), // e.g. facilityStatus, trainerUnavailable, freezeLimit
        params: a.json(),
        readAt: a.string(),
      })
      .secondaryIndexes((index) => [index('recipient').queryField('listNotificationsByRecipient')])
      .authorization((allow) => [allow.ownerDefinedIn('recipient').to(['read', 'update']), allow.group('admin').to(['read'])]),

    // Generic facility building blocks (sections with services / departments).
    Service: a
      .model({
        facilityId: a.string().required(),
        categoryId: a.string(),
        nameAr: a.string().required(),
        nameEn: a.string(),
        priceQar: a.integer().required(),
        durationMinutes: a.integer().required(),
        homeAvailable: a.boolean(),
        active: a.boolean(),
        sortOrder: a.integer(),
      })
      .secondaryIndexes((index) => [index('facilityId').queryField('listServicesByFacility')])
      .authorization((allow) => [allow.guest().to(['read']), allow.authenticated().to(['read']), allow.group('admin')]),

    Department: a
      .model({
        facilityId: a.string().required(),
        nameAr: a.string().required(),
        nameEn: a.string(),
        sortOrder: a.integer(),
      })
      .secondaryIndexes((index) => [index('facilityId').queryField('listDepartmentsByFacility')])
      .authorization((allow) => [allow.guest().to(['read']), allow.authenticated().to(['read']), allow.group('admin')]),

    // ── Custom operations ──

    CategoryView: a.customType({
      id: a.string().required(),
      nameAr: a.string().required(),
      nameEn: a.string(),
      order: a.integer().required(),
    }),

    SectionView: a.customType({
      slug: a.string().required(),
      nameAr: a.string().required(),
      nameEn: a.string(),
      descAr: a.string(),
      descEn: a.string(),
      icon: a.string().required(),
      colorKey: a.string().required(),
      order: a.integer().required(),
      bookingMode: a.ref('BookingMode').required(),
      hasPractitioners: a.boolean().required(),
      hasServices: a.boolean().required(),
      hasDepartments: a.boolean().required(),
      hasPackages: a.boolean().required(),
      hasGallery: a.boolean().required(),
      practitionerLabelAr: a.string(),
      practitionerLabelEn: a.string(),
      presetType: a.ref('PresetType').required(),
      categories: a.ref('CategoryView').required().array().required(),
    }),

    // What customers see of a facility: no owner, status or audit fields.
    FacilityView: a.customType({
      id: a.string().required(),
      sectionId: a.string().required(),
      name: a.string().required(),
      area: a.string().required(),
      description: a.string().required(),
      address: a.string().required(),
      rating: a.float(),
      reviewCount: a.integer(),
      monthlyPrice: a.integer().required(),
      trainerFromMonthly: a.integer().required(),
      images: a.string().required().array().required(),
      amenities: a.string().required().array().required(),
      openingHours: a.ref('OpeningHours').required().array().required(),
      isFeatured: a.boolean().required(),
      isNearby: a.boolean().required(),
      sortOrder: a.integer().required(),
      categoryIds: a.string().required().array().required(),
      phone: a.string(),
      whatsapp: a.string(),
      storeUrl: a.string(),
      lat: a.float(),
      lng: a.float(),
      region: a.string(),
      serviceMode: a.ref('ServiceMode'),
      logo: a.string(),
    }),

    listVisibleSections: a
      .query()
      .returns(a.ref('SectionView').required().array().required())
      .authorization((allow) => [allow.guest(), allow.authenticated()])
      .handler(a.handler.function(catalogue)),

    // Approved facilities of visible sections, optionally of one section, in display order.
    listApprovedFacilities: a
      .query()
      .arguments({ sectionId: a.string() })
      .returns(a.ref('FacilityView').required().array().required())
      .authorization((allow) => [allow.guest(), allow.authenticated()])
      .handler(a.handler.function(catalogue)),

    // null unless the facility is approved and its section visible.
    getApprovedFacility: a
      .query()
      .arguments({ id: a.id().required() })
      .returns(a.ref('FacilityView'))
      .authorization((allow) => [allow.guest(), allow.authenticated()])
      .handler(a.handler.function(catalogue)),

    OwnerAccount: a.customType({
      username: a.string().required(),
      ownerKey: a.string().required(), // value for Gym.ownerId
      email: a.string().required(),
      fullName: a.string().required(),
    }),

    AccountSuspension: a.customType({
      username: a.string().required(),
      suspended: a.boolean().required(),
      facilities: a.integer().required(), // facilities suspended with the account
    }),

    FacilityStatusChange: a.customType({
      id: a.string().required(),
      status: a.ref('FacilityStatus').required(),
      statusReason: a.string(),
    }),

    // Admin only (resolver rule + check in admin-ops). Invitation by email only (no SMS).
    adminCreateFacilityOwner: a
      .mutation()
      .arguments({ fullName: a.string().required(), email: a.string().required(), phone: a.string().required() })
      .returns(a.ref('OwnerAccount').required())
      .authorization((allow) => [allow.group('admin')])
      .handler(a.handler.function(adminOps)),

    // Disabling an owner account also suspends all of its facilities.
    adminSuspendAccount: a
      .mutation()
      .arguments({ username: a.string().required(), suspended: a.boolean().required() })
      .returns(a.ref('AccountSuspension').required())
      .authorization((allow) => [allow.group('admin')])
      .handler(a.handler.function(adminOps)),

    adminSetFacilityStatus: a
      .mutation()
      .arguments({ facilityId: a.id().required(), status: a.ref('FacilityStatus').required(), reason: a.string() })
      .returns(a.ref('FacilityStatusChange').required())
      .authorization((allow) => [allow.group('admin')])
      .handler(a.handler.function(adminOps)),

    OwnerRow: a.customType({
      username: a.string().required(),
      ownerKey: a.string().required(),
      email: a.string().required(),
      fullName: a.string().required(),
      phone: a.string(),
      enabled: a.boolean().required(),
      createdAt: a.string(),
      facilities: a.integer().required(),
    }),

    ConsoleStats: a.customType({
      bookingsToday: a.integer().required(),
      pendingFacilities: a.integer().required(),
      activeFacilities: a.integer().required(),
      newCustomers: a.integer().required(), // accounts created in the last 30 days
    }),

    adminListOwners: a
      .query()
      .returns(a.ref('OwnerRow').required().array().required())
      .authorization((allow) => [allow.group('admin')])
      .handler(a.handler.function(adminOps)),

    adminStats: a
      .query()
      .returns(a.ref('ConsoleStats').required())
      .authorization((allow) => [allow.group('admin')])
      .handler(a.handler.function(adminOps)),

    // Wizard save: creates (slug null) or edits a section and its categories (input is JSON, at most 12 categories).
    adminSaveSection: a
      .mutation()
      .arguments({ slug: a.string(), input: a.json().required() })
      .returns(a.string().required())
      .authorization((allow) => [allow.group('admin')])
      .handler(a.handler.function(adminOps)),

    // Creates (facilityId null; approved, createdBy admin) or edits a facility; the owner is required.
    adminSaveFacility: a
      .mutation()
      .arguments({ facilityId: a.id(), input: a.json().required() })
      .returns(a.string().required())
      .authorization((allow) => [allow.group('admin')])
      .handler(a.handler.function(adminOps)),

    // Refused (SECTION_NOT_EMPTY) while any facility belongs to the section.
    adminDeleteSection: a
      .mutation()
      .arguments({ slug: a.string().required() })
      .returns(a.boolean().required())
      .authorization((allow) => [allow.group('admin')])
      .handler(a.handler.function(adminOps)),

    AvailabilitySlot: a.customType({
      id: a.string().required(),
      minutes: a.integer().required(),
      available: a.boolean().required(),
    }),

    AvailabilityDay: a.customType({
      date: a.string().required(),
      closed: a.boolean().required(),
      slots: a.ref('AvailabilitySlot').required().array().required(),
    }),

    BookingQuote: a.customType({ priceQar: a.integer().required() }),

    BookingView: a.customType({
      id: a.string().required(),
      type: a.string().required(),
      gymId: a.string().required(),
      gymName: a.string().required(),
      gymLocation: a.string().required(),
      trainerId: a.string(),
      trainerName: a.string(),
      planId: a.string(),
      planName: a.string(),
      date: a.string(),
      timeLabel: a.string(),
      sessionCount: a.integer().required(),
      priceQar: a.integer().required(),
      status: a.string().required(),
      guest: a.ref('GuestInfo').required(),
      createdAt: a.string().required(),
      membershipStart: a.string(),
      membershipEnd: a.string(),
      paymentMethod: a.string().required(),
      paymentId: a.string().required(),
      guestToken: a.string(), // returned once, on guest booking creation
    }),

    trainerAvailability: a
      .query()
      .arguments({ trainerId: a.id().required() })
      .returns(a.ref('AvailabilityDay').required().array().required())
      .authorization((allow) => [allow.guest(), allow.authenticated()])
      .handler(a.handler.function(bookings)),

    quoteBooking: a
      .query()
      .arguments(bookingDraftArgs)
      .returns(a.ref('BookingQuote').required())
      .authorization((allow) => [allow.guest(), allow.authenticated()])
      .handler(a.handler.function(bookings)),

    placeBooking: a
      .mutation()
      .arguments({ ...bookingDraftArgs, paymentMethod: a.string().required(), paymentId: a.string().required() })
      .returns(a.ref('BookingView').required())
      .authorization((allow) => [allow.guest(), allow.authenticated()])
      .handler(a.handler.function(bookings)),

    // Guest booking lookup by the "<bookingId>.<secret>" tokens kept on the device.
    guestBookings: a
      .query()
      .arguments({ tokens: a.string().required().array().required() })
      .returns(a.ref('BookingView').required().array().required())
      .authorization((allow) => [allow.guest(), allow.authenticated()])
      .handler(a.handler.function(bookings)),

    FreezeResult: a.customType({ freezesUsed: a.integer().required(), membershipEnd: a.string().required() }),

    // Signed-in customers freeze their own membership (plan allows freezing; 2 × up to 30 days).
    freezeMembership: a
      .mutation()
      .arguments({ bookingId: a.id().required(), startDate: a.string().required(), days: a.integer().required() })
      .returns(a.ref('FreezeResult').required())
      .authorization((allow) => [allow.authenticated()])
      .handler(a.handler.function(bookings)),

    // Management: cancels a booking and releases its trainer slot. Admin group only (checked again in the function).
    adminCancelBooking: a
      .mutation()
      .arguments({ id: a.id().required(), reason: a.string() })
      .returns(a.ref('BookingView').required())
      .authorization((allow) => [allow.group('admin')])
      .handler(a.handler.function(bookings)),

    ReviewView: a.customType({
      id: a.string().required(),
      gymId: a.string(),
      trainerId: a.string(),
      authorName: a.string().required(),
      rating: a.integer().required(),
      text: a.string().required(),
      date: a.string().required(),
      mine: a.boolean().required(),
    }),

    ReviewStatus: a.customType({ eligible: a.boolean().required(), review: a.ref('ReviewView') }),

    // Signed-in users only: may the caller rate this gym/trainer, and their existing review if any.
    reviewStatus: a
      .query()
      .arguments({ targetType: a.string().required(), targetId: a.id().required() })
      .returns(a.ref('ReviewStatus').required())
      .authorization((allow) => [allow.authenticated()])
      .handler(a.handler.function(reviews)),

    // Create (no reviewId) or edit the caller's own review (reviewId). Requires a completed booking.
    submitReview: a
      .mutation()
      .arguments({ targetType: a.string().required(), targetId: a.id().required(), rating: a.integer().required(), text: a.string(), reviewId: a.id() })
      .returns(a.ref('ReviewView').required())
      .authorization((allow) => [allow.authenticated()])
      .handler(a.handler.function(reviews)),

    // The author removes their review; admins remove any review (moderation).
    removeReview: a
      .mutation()
      .arguments({ id: a.id().required() })
      .returns(a.ref('ReviewView').required())
      .authorization((allow) => [allow.authenticated()])
      .handler(a.handler.function(reviews)),

    // ── Facility dashboards (FACILITY_OWNER for their own facilities, admins for all; checked in facility-owner) ──

    SeriesPoint: a.customType({ start: a.string().required(), value: a.integer().required() }),
    CountItem: a.customType({ label: a.string().required(), count: a.integer().required() }),

    MemberRow: a.customType({
      bookingId: a.string().required(),
      name: a.string().required(),
      phone: a.string().required(),
      planName: a.string().required(),
      planId: a.string(),
      start: a.string(),
      end: a.string(),
      status: a.string().required(), // active | frozen | expired | cancelled
      amount: a.integer().required(),
    }),

    BookingRow: a.customType({
      id: a.string().required(),
      type: a.string().required(),
      status: a.string().required(),
      customerName: a.string().required(),
      customerPhone: a.string(), // null for a home-service appointment until it is confirmed
      date: a.string(),
      timeLabel: a.string(),
      trainerId: a.string(),
      trainerName: a.string(),
      planName: a.string(),
      serviceName: a.string(),
      priceQar: a.integer().required(),
      createdAt: a.string().required(),
      membershipStart: a.string(),
      membershipEnd: a.string(),
      homeService: a.boolean().required(),
      trainerUnavailable: a.boolean().required(),
      cancelReason: a.string(),
    }),

    ReviewRow: a.customType({
      id: a.string().required(),
      authorName: a.string().required(),
      rating: a.integer().required(),
      text: a.string().required(),
      date: a.string().required(),
      satisfied: a.boolean(),
      trainerName: a.string(),
      ownerReply: a.string(),
      ownerReplyAt: a.string(),
    }),

    FacilityInsights: a.customType({
      period: a.string().required(),
      members: a.integer().required(),
      activeMembers: a.integer().required(),
      newMembers: a.integer().required(),
      revenue: a.integer().required(),
      trainerBookings: a.integer().required(),
      planDistribution: a.ref('CountItem').required().array().required(),
      popularPlan: a.string(),
      membersSeries: a.ref('SeriesPoint').required().array().required(),
      revenueSeries: a.ref('SeriesPoint').required().array().required(),
      newMembersSeries: a.ref('SeriesPoint').required().array().required(),
      expiringSoon: a.ref('MemberRow').required().array().required(),
      latestBookings: a.ref('BookingRow').required().array().required(),
      latestReviews: a.ref('ReviewRow').required().array().required(),
      ratingAverage: a.float().required(),
      ratingCount: a.integer().required(),
      ratingDistribution: a.integer().required().array().required(), // 1★…5★
      // Appointment facilities (salons, clinics)
      appointmentsToday: a.integer().required(),
      upcomingAppointments: a.integer().required(),
      pendingRequests: a.integer().required(),
      customers: a.integer().required(),
      newCustomers: a.integer().required(),
      topServices: a.ref('CountItem').required().array().required(),
      appointmentsSeries: a.ref('SeriesPoint').required().array().required(),
      newCustomersSeries: a.ref('SeriesPoint').required().array().required(),
    }),

    CustomerRow: a.customType({
      id: a.string().required(),
      name: a.string().required(),
      phone: a.string(), // null until one of the customer's bookings is confirmed (home service)
      visits: a.integer().required(),
      firstVisit: a.string(),
      lastVisit: a.string(),
      totalSpent: a.integer().required(),
    }),

    facilityCustomers: a
      .query()
      .arguments({ facilityId: a.id().required() })
      .returns(a.ref('CustomerRow').required().array().required())
      .authorization((allow) => [allow.groups(['FACILITY_OWNER', 'admin'])])
      .handler(a.handler.function(facilityOwner)),

    ownerSaveService: a
      .mutation()
      .arguments({
        facilityId: a.id().required(),
        serviceId: a.id(),
        nameAr: a.string().required(),
        nameEn: a.string(),
        categoryId: a.string(),
        priceQar: a.integer().required(),
        durationMinutes: a.integer().required(),
        homeAvailable: a.boolean(),
        active: a.boolean(),
        sortOrder: a.integer(),
      })
      .returns(a.string().required())
      .authorization((allow) => [allow.groups(['FACILITY_OWNER', 'admin'])])
      .handler(a.handler.function(facilityOwner)),

    ownerSaveDepartment: a
      .mutation()
      .arguments({ facilityId: a.id().required(), departmentId: a.id(), nameAr: a.string().required(), nameEn: a.string(), sortOrder: a.integer() })
      .returns(a.string().required())
      .authorization((allow) => [allow.groups(['FACILITY_OWNER', 'admin'])])
      .handler(a.handler.function(facilityOwner)),

    // A requested (home-service) appointment becomes confirmed; the facility then sees the customer's phone.
    ownerConfirmBooking: a
      .mutation()
      .arguments({ bookingId: a.id().required() })
      .returns(a.ref('BookingRow').required())
      .authorization((allow) => [allow.groups(['FACILITY_OWNER', 'admin'])])
      .handler(a.handler.function(facilityOwner)),

    TrainerRow: a.customType({
      id: a.string().required(),
      name: a.string().required(),
      title: a.string().required(),
      bio: a.string().required(),
      image: a.string().required(),
      specialties: a.string().required().array().required(),
      skills: a.string().required().array().required(),
      yearsExperience: a.integer().required(),
      pricePerSession: a.integer().required(),
      languages: a.string().required().array().required(),
      certifications: a.string().required().array().required(),
      departmentId: a.string(),
      rating: a.float().required(),
      reviewCount: a.integer().required(),
      unavailable: a.boolean().required(),
      unavailableFrom: a.string(),
      unavailableUntil: a.string(),
      weeklyHours: a.ref('WeeklyHours').required().array().required(),
    }),

    AvailabilityChange: a.customType({ affected: a.integer().required() }),

    facilityInsights: a
      .query()
      .arguments({ facilityId: a.id().required(), period: a.string().required() }) // 30d | month | 90d | 12m
      .returns(a.ref('FacilityInsights').required())
      .authorization((allow) => [allow.groups(['FACILITY_OWNER', 'admin'])])
      .handler(a.handler.function(facilityOwner)),

    facilityMembers: a
      .query()
      .arguments({ facilityId: a.id().required() })
      .returns(a.ref('MemberRow').required().array().required())
      .authorization((allow) => [allow.groups(['FACILITY_OWNER', 'admin'])])
      .handler(a.handler.function(facilityOwner)),

    facilityBookings: a
      .query()
      .arguments({ facilityId: a.id().required(), from: a.string(), to: a.string() })
      .returns(a.ref('BookingRow').required().array().required())
      .authorization((allow) => [allow.groups(['FACILITY_OWNER', 'admin'])])
      .handler(a.handler.function(facilityOwner)),

    facilityReviews: a
      .query()
      .arguments({ facilityId: a.id().required() })
      .returns(a.ref('ReviewRow').required().array().required())
      .authorization((allow) => [allow.groups(['FACILITY_OWNER', 'admin'])])
      .handler(a.handler.function(facilityOwner)),

    facilityTrainers: a
      .query()
      .arguments({ facilityId: a.id().required() })
      .returns(a.ref('TrainerRow').required().array().required())
      .authorization((allow) => [allow.groups(['FACILITY_OWNER', 'admin'])])
      .handler(a.handler.function(facilityOwner)),

    trainerSchedule: a
      .query()
      .arguments({ trainerId: a.id().required(), from: a.string(), to: a.string() })
      .returns(a.ref('BookingRow').required().array().required())
      .authorization((allow) => [allow.groups(['FACILITY_OWNER', 'admin'])])
      .handler(a.handler.function(facilityOwner)),

    ownerSavePlan: a
      .mutation()
      .arguments({
        facilityId: a.id().required(),
        planId: a.id(),
        name: a.string().required(),
        description: a.string(),
        price: a.integer().required(),
        durationMonths: a.integer().required(), // 1 | 2 | 3 | 6 | 12
        badge: a.string(), // popular | bestValue
        visible: a.boolean(),
        discountType: a.string(), // percent | amount
        discountValue: a.integer(),
        allowFreeze: a.boolean(),
        autoRenew: a.boolean(),
      })
      .returns(a.string().required())
      .authorization((allow) => [allow.groups(['FACILITY_OWNER', 'admin'])])
      .handler(a.handler.function(facilityOwner)),

    ownerSaveFacility: a
      .mutation()
      .arguments({
        facilityId: a.id().required(),
        name: a.string(),
        description: a.string(),
        area: a.string(),
        address: a.string(),
        logo: a.string(),
        images: a.string().required().array(),
        phone: a.string(),
        whatsapp: a.string(),
        storeUrl: a.string(),
        region: a.string(),
        lat: a.float(),
        lng: a.float(),
        serviceMode: a.string(),
        categoryIds: a.string().required().array(),
      })
      .returns(a.string().required())
      .authorization((allow) => [allow.groups(['FACILITY_OWNER', 'admin'])])
      .handler(a.handler.function(facilityOwner)),

    ownerSaveTrainer: a
      .mutation()
      .arguments({
        facilityId: a.id().required(),
        trainerId: a.id(),
        name: a.string().required(),
        title: a.string(),
        bio: a.string(),
        image: a.string().required(),
        specialties: a.string().required().array(),
        skills: a.string().required().array(),
        yearsExperience: a.integer().required(),
        pricePerSession: a.integer().required(),
        languages: a.string().required().array(),
        certifications: a.string().required().array(),
        departmentId: a.string(),
      })
      .returns(a.string().required())
      .authorization((allow) => [allow.groups(['FACILITY_OWNER', 'admin'])])
      .handler(a.handler.function(facilityOwner)),

    // weeklyHours / actions are JSON: [{weekday, open, close}] / [{bookingId, action: keep | reassign, trainerId}]
    ownerSetTrainerAvailability: a
      .mutation()
      .arguments({
        trainerId: a.id().required(),
        unavailable: a.boolean().required(),
        unavailableFrom: a.string(),
        unavailableUntil: a.string(),
        weeklyHours: a.json(),
        actions: a.json(),
      })
      .returns(a.ref('AvailabilityChange').required())
      .authorization((allow) => [allow.groups(['FACILITY_OWNER', 'admin'])])
      .handler(a.handler.function(facilityOwner)),

    ownerReplyReview: a
      .mutation()
      .arguments({ reviewId: a.id().required(), reply: a.string().required() })
      .returns(a.boolean().required())
      .authorization((allow) => [allow.groups(['FACILITY_OWNER', 'admin'])])
      .handler(a.handler.function(facilityOwner)),

    PendingReview: a.customType({
      bookingId: a.string().required(),
      targetType: a.string().required(), // 'gym' | 'trainer'
      targetId: a.string().required(),
      targetName: a.string().required(),
    }),

    // The caller's oldest completed booking that has not been rated or prompted yet (one prompt per booking).
    pendingReviewPrompt: a
      .query()
      .returns(a.ref('PendingReview'))
      .authorization((allow) => [allow.authenticated()])
      .handler(a.handler.function(reviews)),

    // One review per completed booking (stars, satisfaction, optional comment); it is never edited afterwards.
    submitBookingReview: a
      .mutation()
      .arguments({ bookingId: a.id().required(), rating: a.integer().required(), satisfied: a.boolean(), text: a.string() })
      .returns(a.ref('ReviewView').required())
      .authorization((allow) => [allow.authenticated()])
      .handler(a.handler.function(reviews)),

    // The customer closed the prompt without rating: it is not shown again for this booking.
    dismissReviewPrompt: a
      .mutation()
      .arguments({ bookingId: a.id().required() })
      .returns(a.boolean().required())
      .authorization((allow) => [allow.authenticated()])
      .handler(a.handler.function(reviews)),

    // Phone sign-in: resolves a Qatar mobile number to the Cognito username (null when unknown).
    signInName: a
      .query()
      .arguments({ phone: a.string().required() })
      .returns(a.string())
      .authorization((allow) => [allow.guest()])
      .handler(a.handler.function(phoneLogin)),
  })
  .authorization((allow) => [
    allow.resource(bookings).to(['query', 'mutate']),
    allow.resource(reviews).to(['query', 'mutate']),
    allow.resource(seedCatalogue).to(['query', 'mutate']),
    allow.resource(sandboxFixtures).to(['query', 'mutate']),
    allow.resource(catalogue).to(['query']),
    allow.resource(adminOps).to(['query', 'mutate']),
    allow.resource(completeBookings).to(['query', 'mutate']),
    allow.resource(facilityOwner).to(['query', 'mutate']),
  ]);

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: { defaultAuthorizationMode: 'userPool' },
});
