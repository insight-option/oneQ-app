import { addDays, addMonths, format } from 'date-fns';

// Sample data for the test branch only, so the facility dashboards are not empty. Every id starts with
// "sample-"; facility and people names are invented. Generated relative to the day the seed runs, with a fixed
// pseudo-random sequence, so running the seed again rewrites the same records.

const ymd = (d: Date) => format(d, 'yyyy-MM-dd');

function sequence(seed: number) {
  let s = seed;
  const next = () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
  return { next, int: (min: number, max: number) => min + Math.floor(next() * (max - min + 1)), pick: <T,>(list: readonly T[]) => list[Math.floor(next() * list.length)]! };
}

const FIRST = ['Ahmed', 'Fatima', 'Omar', 'Mariam', 'Yousef', 'Noor', 'Khalid', 'Sara', 'Hamad', 'Aisha', 'Ali', 'Reem', 'Faisal', 'Hessa', 'Nasser', 'Dana', 'Majed', 'Latifa', 'Saad', 'Huda'] as const;
const LAST = ['Haddad', 'Saleh', 'Mansour', 'Nasser', 'Karim', 'Yousef', 'Hamdan', 'Aziz', 'Rahman', 'Fares'] as const;

const unsplash = (id: string, w: number) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&q=80`;

const HOURS = ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].map((day) => ({
  day,
  open: day === 'Friday' ? '8:00 AM' : '6:00 AM',
  close: day === 'Friday' ? '10:00 PM' : '11:00 PM',
}));

export const SAMPLE_GYM_ID = 'sample-gym';

export const sampleGym = (ownerId: string | null) => ({
  id: SAMPLE_GYM_ID,
  name: 'Sample Fitness Club',
  area: 'Al Sadd',
  description: 'Sample data for the OneQ dashboards (test branch). Members, bookings and reviews are invented.',
  address: 'Sample Street, Al Sadd, Doha',
  monthlyPrice: 250,
  trainerFromMonthly: 450,
  images: [unsplash('1593079831268-3381b0db4a77', 1400), unsplash('1554344728-77cf90d9ed26', 1400), unsplash('1571019614242-c5c5dee9f50b', 1400)],
  amenities: ['weights', 'cardio', 'sauna', 'lockers', 'parking'],
  openingHours: HOURS,
  isFeatured: false,
  isNearby: false,
  sortOrder: 800,
  sectionId: 'gym',
  // Not public until the client screens for sections exist (Phase 5); owners and admins see it in the dashboards.
  status: 'pending' as const,
  statusReason: 'sample',
  createdBy: 'admin' as const,
  categoryIds: [],
  phone: '+97455000201',
  whatsapp: '+97455000201',
  region: 'Al Sadd',
  lat: 25.2846,
  lng: 51.4947,
  // Written every run, so the sample facilities lose a temporary owner once that account is gone.
  ownerId,
});

export const SAMPLE_PLANS = [
  { months: 1, name: 'Monthly', price: 250, badge: null },
  { months: 2, name: '2 Months', price: 470, badge: null },
  { months: 3, name: '3 Months', price: 675, badge: 'popular' },
  { months: 6, name: '6 Months', price: 1250, badge: null },
  { months: 12, name: 'Annual', price: 2300, badge: 'bestValue' },
].map((p) => ({
  id: `sample-gym-plan-${p.months}m`,
  gymId: SAMPLE_GYM_ID,
  kind: p.months === 1 ? 'monthly' : `${p.months}m`,
  name: p.name,
  description: 'Sample plan',
  price: p.price,
  durationMonths: p.months,
  badge: p.badge,
  visible: true,
  allowFreeze: p.months >= 3,
  autoRenew: p.months === 1,
  ...(p.months === 12 ? { discountType: 'percent', discountValue: 10 } : {}),
}));

export const SAMPLE_TRAINERS = [
  { id: 'sample-trainer-rami', name: 'Rami Haddad', title: 'Strength Coach', image: unsplash('1571019614242-c5c5dee9f50b', 900), specialties: ['Strength Training'], skills: ['Powerlifting', 'Mobility'], years: 8, price: 220, languages: ['English', 'Arabic'] },
  { id: 'sample-trainer-lina', name: 'Lina Saleh', title: 'Functional Training Coach', image: unsplash('1518611012118-696072aa579a', 900), specialties: ['Functional Training', 'Mobility'], skills: ['HIIT', 'Rehab'], years: 6, price: 200, languages: ['English', 'Arabic'] },
  { id: 'sample-trainer-tariq', name: 'Tariq Mansour', title: 'Weight Loss Coach', image: unsplash('1583454110551-21f2fa2afe61', 900), specialties: ['Weight Loss'], skills: ['Nutrition', 'Cardio'], years: 5, price: 180, languages: ['Arabic'] },
].map((t, i) => ({
  id: t.id,
  gymId: SAMPLE_GYM_ID,
  name: t.name,
  title: t.title,
  bio: 'Sample trainer profile for the dashboards.',
  image: t.image,
  yearsExperience: t.years,
  languages: t.languages,
  specialties: t.specialties,
  skills: t.skills,
  certifications: ['Sample certification'],
  pricePerSession: t.price,
  sortOrder: i,
}));

const TIMES = [360, 420, 1020, 1080, 1140, 1200];
const timeLabel = (min: number) => {
  const h = Math.floor(min / 60);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(min % 60).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
};
const startAt = (day: Date, min: number) => `${ymd(day)}T${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}:00`;

type Guest = { fullName: string; phone: string; email: string | null };

// Members (membership bookings) over the last 12 months, trainer sessions from 60 days ago to 2 weeks ahead,
// a few frozen memberships and reviews.
export function sampleActivity(today: Date) {
  const r = sequence(20261004);
  const guests: Guest[] = [...Array(48)].map((_, i) => ({
    fullName: `${FIRST[i % FIRST.length]} ${LAST[(i * 7) % LAST.length]}`,
    phone: `+97455${String(100000 + i).slice(-6)}`,
    email: null,
  }));

  const memberships = guests.map((guest, i) => {
    const plan = SAMPLE_PLANS[r.pick([0, 0, 1, 2, 2, 2, 3, 4] as const)]!;
    const start = addDays(today, -r.int(0, 360));
    const end = addDays(addMonths(start, plan.durationMonths), -1);
    const cancelled = i % 13 === 5;
    const ended = ymd(end) < ymd(today);
    return {
      id: `sample-gym-member-${i + 1}`,
      type: 'membership',
      gymId: SAMPLE_GYM_ID,
      gymName: 'Sample Fitness Club',
      gymLocation: 'Al Sadd, Doha',
      planId: plan.id,
      planName: plan.name,
      sessionCount: 1,
      priceQar: plan.price,
      status: cancelled ? 'cancelled' : ended ? 'completed' : 'confirmed',
      guest,
      guestPhone: guest.phone,
      membershipStart: ymd(start),
      membershipEnd: ymd(end),
      paymentMethod: 'card',
      paymentId: `sample-pay-member-${i + 1}`,
      sectionId: 'gym',
    };
  });

  const sessions = [...Array(34)].map((_, i) => {
    const trainer = SAMPLE_TRAINERS[i % SAMPLE_TRAINERS.length]!;
    const day = addDays(today, r.int(-60, 14));
    const minutes = r.pick(TIMES);
    const guest = guests[r.int(0, guests.length - 1)]!;
    const past = ymd(day) < ymd(today);
    const cancelled = i % 11 === 3;
    return {
      id: `sample-gym-session-${i + 1}`,
      type: 'session',
      gymId: SAMPLE_GYM_ID,
      gymName: 'Sample Fitness Club',
      gymLocation: 'Al Sadd, Doha',
      trainerId: trainer.id,
      trainerName: trainer.name,
      date: startAt(day, minutes),
      timeLabel: timeLabel(minutes),
      sessionCount: 1,
      priceQar: trainer.pricePerSession,
      status: cancelled ? 'cancelled' : past ? 'completed' : 'confirmed',
      guest,
      guestPhone: guest.phone,
      paymentMethod: 'card',
      paymentId: `sample-pay-session-${i + 1}`,
      sectionId: 'gym',
    };
  });
  // Two upcoming sessions never collide on the same trainer and start time.
  const seen = new Set<string>();
  const uniqueSessions = sessions.filter((s) => {
    const key = `${s.trainerId}|${s.date}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const active = memberships.filter((m) => m.status === 'confirmed' && m.membershipStart <= ymd(today));
  const freezes = active.slice(0, 2).map((m, i) => ({
    id: `sample-gym-freeze-${i + 1}`,
    bookingId: m.id,
    gymId: SAMPLE_GYM_ID,
    startDate: ymd(addDays(today, -3)),
    endDate: ymd(addDays(today, 10 + i * 5)),
    days: 14 + i * 5,
  }));

  const TEXTS = [
    'Clean, calm and well equipped.',
    'Great coaches and friendly staff.',
    'Busy in the evenings but worth it.',
    'Excellent strength area.',
    'Good value for the annual plan.',
    'Changing rooms could be bigger.',
    'Love the sauna after training.',
    'Trainer sessions are very professional.',
  ];
  const reviews = [...Array(10)].map((_, i) => {
    const trainer = i >= 7 ? SAMPLE_TRAINERS[i - 7]! : null;
    return {
      id: `sample-gym-review-${i + 1}`,
      ...(trainer ? { trainerId: trainer.id } : { gymId: SAMPLE_GYM_ID }),
      authorName: `${FIRST[(i * 3) % FIRST.length]} ${LAST[i % LAST.length]![0]}.`,
      rating: [5, 5, 4, 5, 4, 3, 5, 5, 4, 5][i]!,
      date: ymd(addDays(today, -r.int(1, 120))),
      text: TEXTS[i % TEXTS.length]!,
      satisfied: i !== 5,
      ...(i === 1 ? { ownerReply: 'Thank you! See you at the club.', ownerReplyAt: today.toISOString() } : {}),
    };
  });

  return { memberships, sessions: uniqueSessions, freezes, reviews };
}

// ── Salon and clinic samples (Phase 4) ──

type AppointmentFacility = {
  id: string;
  sectionId: 'salon' | 'clinic';
  name: string;
  area: string;
  description: string;
  serviceMode: 'inShop' | 'home' | 'both' | null;
  lat: number;
  lng: number;
  phone: string;
  images: string[];
};

export const SAMPLE_SALON: AppointmentFacility = {
  id: 'sample-salon',
  sectionId: 'salon',
  name: 'Sample Beauty Salon',
  area: 'Al Waab',
  description: 'Sample data for the OneQ salon dashboard (test branch). Clients and bookings are invented.',
  serviceMode: 'both',
  lat: 25.2602,
  lng: 51.4458,
  phone: '+97455000301',
  images: [unsplash('1560066984-138dadb4c035', 1400), unsplash('1522337360788-8b13dee7a37e', 1400)],
};

export const SAMPLE_CLINIC: AppointmentFacility = {
  id: 'sample-clinic',
  sectionId: 'clinic',
  name: 'Sample Family Clinic',
  area: 'Al Sadd',
  description: 'Sample data for the OneQ clinic dashboard (test branch). Patients and appointments are invented.',
  serviceMode: null,
  lat: 25.2889,
  lng: 51.5022,
  phone: '+97455000401',
  images: [unsplash('1519494026892-80bbd2d6fd0d', 1400), unsplash('1586773860418-d37222d8fce3', 1400)],
};

export const sampleAppointmentFacility = (f: AppointmentFacility, ownerId: string | null, sortOrder: number) => ({
  id: f.id,
  name: f.name,
  area: f.area,
  description: f.description,
  address: `Sample Street, ${f.area}, Doha`,
  monthlyPrice: 0,
  trainerFromMonthly: 0,
  images: f.images,
  amenities: [],
  openingHours: HOURS,
  isFeatured: false,
  isNearby: false,
  sortOrder,
  sectionId: f.sectionId,
  status: 'pending' as const,
  statusReason: 'sample',
  createdBy: 'admin' as const,
  categoryIds: f.sectionId === 'salon' ? ['salon-cat-1', 'salon-cat-2', 'salon-cat-3', 'salon-cat-4', 'salon-cat-5'] : ['clinic-cat-1', 'clinic-cat-2', 'clinic-cat-3'],
  phone: f.phone,
  whatsapp: f.phone,
  region: f.area,
  lat: f.lat,
  lng: f.lng,
  ...(f.serviceMode ? { serviceMode: f.serviceMode } : {}),
  ownerId,
});

const SALON_SERVICES = [
  { key: 'cut', nameAr: 'قص وتصفيف', nameEn: 'Cut and styling', cat: 'salon-cat-1', price: 180, min: 60, home: true },
  { key: 'color', nameAr: 'صبغة شعر', nameEn: 'Hair colour', cat: 'salon-cat-1', price: 450, min: 120, home: false },
  { key: 'mani', nameAr: 'مانيكير', nameEn: 'Manicure', cat: 'salon-cat-2', price: 120, min: 45, home: true },
  { key: 'pedi', nameAr: 'باديكير', nameEn: 'Pedicure', cat: 'salon-cat-2', price: 140, min: 60, home: true },
  { key: 'makeup', nameAr: 'مكياج سهرة', nameEn: 'Evening makeup', cat: 'salon-cat-3', price: 400, min: 90, home: true },
  { key: 'facial', nameAr: 'تنظيف بشرة', nameEn: 'Facial', cat: 'salon-cat-4', price: 300, min: 75, home: false },
  { key: 'henna', nameAr: 'حناء', nameEn: 'Henna', cat: 'salon-cat-5', price: 150, min: 60, home: true },
];

const CLINIC_SERVICES = [
  { key: 'consult', nameAr: 'استشارة طب عام', nameEn: 'General consultation', cat: 'clinic-cat-1', price: 250, min: 30, home: false },
  { key: 'checkup', nameAr: 'فحص دوري', nameEn: 'Routine check-up', cat: 'clinic-cat-1', price: 400, min: 45, home: false },
  { key: 'physio', nameAr: 'جلسة علاج طبيعي', nameEn: 'Physiotherapy session', cat: 'clinic-cat-2', price: 300, min: 45, home: false },
  { key: 'sports', nameAr: 'تقييم إصابة رياضية', nameEn: 'Sports injury assessment', cat: 'clinic-cat-2', price: 350, min: 40, home: false },
  { key: 'derma', nameAr: 'استشارة جلدية', nameEn: 'Dermatology consultation', cat: 'clinic-cat-3', price: 300, min: 30, home: false },
];

export const sampleServices = (f: AppointmentFacility) =>
  (f.sectionId === 'salon' ? SALON_SERVICES : CLINIC_SERVICES).map((s, i) => ({
    id: `${f.id}-svc-${s.key}`,
    facilityId: f.id,
    categoryId: s.cat,
    nameAr: s.nameAr,
    nameEn: s.nameEn,
    priceQar: s.price,
    durationMinutes: s.min,
    homeAvailable: f.sectionId === 'salon' && s.home,
    active: true,
    sortOrder: i,
  }));

export const SAMPLE_DEPARTMENTS = [
  { id: 'sample-clinic-dep-general', facilityId: 'sample-clinic', nameAr: 'الطب العام', nameEn: 'General medicine', sortOrder: 0 },
  { id: 'sample-clinic-dep-physio', facilityId: 'sample-clinic', nameAr: 'العلاج الطبيعي', nameEn: 'Physiotherapy', sortOrder: 1 },
  { id: 'sample-clinic-dep-derma', facilityId: 'sample-clinic', nameAr: 'الجلدية', nameEn: 'Dermatology', sortOrder: 2 },
];

export const samplePractitioners = (f: AppointmentFacility) =>
  (f.sectionId === 'salon'
    ? [
        { key: 'huda', name: 'Huda Karim', title: 'Hair specialist', dep: null },
        { key: 'reem', name: 'Reem Aziz', title: 'Nail and makeup artist', dep: null },
        { key: 'lulwa', name: 'Lulwa Fares', title: 'Skin care specialist', dep: null },
      ]
    : [
        { key: 'dr-sami', name: 'Dr. Sami Nasser', title: 'General practitioner', dep: 'sample-clinic-dep-general' },
        { key: 'dr-dana', name: 'Dr. Dana Rahman', title: 'Physiotherapist', dep: 'sample-clinic-dep-physio' },
        { key: 'dr-faisal', name: 'Dr. Faisal Hamdan', title: 'Dermatologist', dep: 'sample-clinic-dep-derma' },
      ]
  ).map((p, i) => ({
    id: `${f.id}-pr-${p.key}`,
    gymId: f.id,
    name: p.name,
    title: p.title,
    bio: 'Sample profile for the dashboards.',
    image: unsplash(f.sectionId === 'salon' ? '1580618672591-eb180b1a973f' : '1612349317150-e413f6a5b16d', 900),
    yearsExperience: 4 + i * 3,
    languages: ['Arabic', 'English'],
    specialties: [],
    skills: [],
    certifications: [],
    pricePerSession: 0,
    sortOrder: i,
    ...(p.dep ? { departmentId: p.dep } : {}),
  }));

// Appointments from 45 days ago to 10 days ahead. Salon home-service requests stay "pending" until the salon
// confirms them (the phone is shown only after that).
export function sampleAppointments(f: AppointmentFacility, today: Date, seed: number) {
  const r = sequence(seed);
  const services = sampleServices(f);
  const practitioners = samplePractitioners(f);
  const list = [...Array(36)].map((_, i) => {
    const service = r.pick(services);
    const practitioner = r.pick(practitioners);
    const day = addDays(today, r.int(-45, 10));
    const minutes = r.pick([540, 600, 660, 720, 960, 1020, 1080, 1140]);
    const past = ymd(day) < ymd(today);
    const home = f.sectionId === 'salon' && service.homeAvailable && i % 3 === 0;
    const status = i % 12 === 7 ? 'cancelled' : past ? 'completed' : home && i % 2 === 0 ? 'pending' : 'confirmed';
    const guest = { fullName: `${FIRST[(i * 5) % FIRST.length]} ${LAST[(i * 3) % LAST.length]}`, phone: `+97466${String(200000 + (i % 24)).slice(-6)}`, email: null };
    return {
      id: `${f.id}-appt-${i + 1}`,
      type: 'appointment',
      gymId: f.id,
      gymName: f.name,
      gymLocation: `${f.area}, Doha`,
      trainerId: practitioner.id,
      trainerName: practitioner.name,
      serviceId: service.id,
      serviceName: service.nameEn,
      departmentId: practitioner.departmentId ?? null,
      date: startAt(day, minutes),
      timeLabel: timeLabel(minutes),
      durationMinutes: service.durationMinutes,
      sessionCount: 1,
      priceQar: service.priceQar,
      status,
      homeService: home,
      guest,
      guestPhone: guest.phone,
      paymentMethod: 'card',
      paymentId: `sample-pay-${f.id}-${i + 1}`,
      sectionId: f.sectionId,
    };
  });
  const reviews = [...Array(6)].map((_, i) => ({
    id: `${f.id}-review-${i + 1}`,
    gymId: f.id,
    authorName: `${FIRST[(i * 7 + 2) % FIRST.length]} ${LAST[(i + 4) % LAST.length]![0]}.`,
    rating: [5, 4, 5, 3, 5, 4][i]!,
    date: ymd(addDays(today, -r.int(1, 60))),
    text: f.sectionId === 'salon' ? ['Lovely team and very clean.', 'Great henna design.', 'Booked a home visit, very professional.', 'Waited a little.', 'Best facial in Doha.', 'Friendly and on time.'][i]! : ['The doctor listened carefully.', 'Easy booking, short wait.', 'Physio sessions helped a lot.', 'Parking is difficult.', 'Clear explanation of the treatment.', 'Professional staff.'][i]!,
    satisfied: i !== 3,
  }));
  return { appointments: list, reviews };
}
