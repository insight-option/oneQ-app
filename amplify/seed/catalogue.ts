import type { AmenityKey, Gym, OpeningHours, Review, Trainer } from '../../src/domain/models';

// Approved catalogue (docs/oneq-mobile-spec/09-DATA-MODELS.md §3–5), seeded into DynamoDB by functions/seed-catalogue.
// Array order is the display order (stored as sortOrder).

const unsplash = (id: string, w: number) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&q=80`;

// The spec lists only two gym photo IDs; the trainer photos are gym interiors too.
// The local assets (power-house.jpg, noura-abdullah.jpg) were not provided, so Unsplash stands in.
const IMG = {
  gymA: '1593079831268-3381b0db4a77',
  gymB: '1554344728-77cf90d9ed26',
  james: '1571019614242-c5c5dee9f50b',
  omar: '1583454110551-21f2fa2afe61',
  sofia: '1518611012118-696072aa579a',
  layla: '1518310383802-640c2de311b2',
  khalid: '1567013127542-490d757e51fc',
  maya: '1571019613454-1cb2f99b2d8b',
  // The spec's ID for Hassan (1599058945522-28d584b6f14f) now returns 404; replaced with a live photo.
  hassan: '1581009146145-b5ef050c2e1e',
};

const gymImages = (...ids: string[]) => ids.map((id) => unsplash(id, 1400));

const HOURS: OpeningHours[] = [
  { day: 'Saturday', open: '6:00 AM', close: '11:00 PM' },
  { day: 'Sunday', open: '6:00 AM', close: '11:00 PM' },
  { day: 'Monday', open: '6:00 AM', close: '11:00 PM' },
  { day: 'Tuesday', open: '6:00 AM', close: '11:00 PM' },
  { day: 'Wednesday', open: '6:00 AM', close: '11:00 PM' },
  { day: 'Thursday', open: '6:00 AM', close: '11:00 PM' },
  { day: 'Friday', open: '8:00 AM', close: '10:00 PM' },
];

const ALL: AmenityKey[] = ['weights', 'cardio', 'pool', 'sauna', 'lockers', 'parking'];

export const GYMS: Gym[] = [
  {
    // Invented name (English: Doha Strength Club); the id is kept so plans, trainers and reviews stay linked.
    id: 'power-house', name: 'نادي قوة الدوحة', area: 'West Bay', rating: 4.9, reviewCount: 128, monthlyPrice: 299, trainerFromMonthly: 499,
    isFeatured: true, isNearby: true, amenities: ALL, address: 'Tornado Tower, West Bay, Doha',
    description: 'نادٍ للقوة في الخليج الغربي بمساحات مفتوحة وأجهزة احترافية وأجواء هادئة ومركّزة، لمن يريد نادياً راقياً بعيداً عن الضجيج.',
    images: gymImages(IMG.gymA, IMG.gymB, IMG.james, IMG.khalid), openingHours: HOURS,
  },
  {
    // Invented name (English: Lusail Elite Club); the id is kept so plans, trainers and reviews stay linked.
    id: 'oxygen-gym', name: 'نادي النخبة لوسيل', area: 'Lusail', rating: 4.8, reviewCount: 96, monthlyPrice: 349, trainerFromMonthly: 549,
    isFeatured: true, isNearby: false, amenities: ALL, address: 'Lusail Boulevard, Lusail, Doha',
    description: 'نادٍ عصري ومشرق في لوسيل بمساحات كارديو واسعة وغرف استشفاء، وتجربة اشتراك مريحة غير مزدحمة.',
    images: gymImages(IMG.gymB, IMG.gymA, IMG.omar), openingHours: HOURS,
  },
  {
    id: 'arena-fitness', name: 'Arena Fitness', area: 'The Pearl', rating: 4.7, reviewCount: 84, monthlyPrice: 279, trainerFromMonthly: 479,
    isFeatured: false, isNearby: true, amenities: ['weights', 'cardio', 'sauna', 'lockers', 'parking'], address: 'Porto Arabia, The Pearl, Doha',
    description: 'A polished neighborhood club on The Pearl. Intimate floors, excellent coaching culture, and a membership that feels personal from the first visit.',
    images: gymImages(IMG.layla, IMG.gymA, IMG.gymB), openingHours: HOURS,
  },
  {
    id: 'peak-performance', name: 'Peak Performance', area: 'Al Waab', rating: 4.8, reviewCount: 73, monthlyPrice: 259, trainerFromMonthly: 459,
    isFeatured: false, isNearby: true, amenities: ['weights', 'cardio', 'lockers', 'parking'], address: 'Al Waab Street, Al Waab, Doha',
    description: 'A performance-minded gym in Al Waab with serious strength equipment, mobility space, and coaches who treat programming as a craft.',
    images: gymImages(IMG.khalid, IMG.gymB, IMG.gymA), openingHours: HOURS,
  },
  {
    id: 'core-studio', name: 'Core Studio', area: 'Msheireb', rating: 4.6, reviewCount: 51, monthlyPrice: 229, trainerFromMonthly: 429,
    isFeatured: false, isNearby: true, amenities: ['weights', 'cardio', 'lockers'], address: 'Msheireb Downtown, Doha',
    description: 'A quieter studio in Msheireb for strength, mobility, and small-group training. Designed for people who prefer space and intention over spectacle.',
    images: gymImages(IMG.maya, IMG.gymA), openingHours: HOURS,
  },
  {
    id: 'atlas-athletics', name: 'Atlas Athletics', area: 'Al Sadd', rating: 4.5, reviewCount: 112, monthlyPrice: 199, trainerFromMonthly: 399,
    isFeatured: false, isNearby: false, amenities: ['weights', 'cardio', 'lockers', 'parking'], address: 'Al Sadd Street, Al Sadd, Doha',
    description: 'A well-loved Al Sadd club with a strong community feel, reliable equipment, and trainers who know how to coach both beginners and athletes.',
    images: gymImages(IMG.hassan, IMG.gymB), openingHours: HOURS,
  },
];

export const TRAINERS: Trainer[] = [
  {
    id: 'noura-abdullah', gymId: 'power-house', name: 'Noura Abdullah', title: 'Certified Personal Trainer', rating: 4.7, reviewCount: 50, yearsExperience: 12,
    languages: ['Arabic', 'English'], specialties: ['Strength Training', 'Weight Loss', 'Mobility', 'Functional Training'],
    certifications: ['Certified Personal Trainer', 'Sports Nutrition Certification', 'Strength & Conditioning Certification'], pricePerSession: 200,
    bio: 'Noura coaches with quiet precision. She blends strength work, mobility, and nutrition habits that fit Doha life — early mornings, late evenings, and everything in between.',
    image: unsplash(IMG.gymB, 900),
  },
  {
    id: 'james-mitchell', gymId: 'power-house', name: 'James Mitchell', title: 'Strength Coach', rating: 4.8, reviewCount: 64, yearsExperience: 9,
    languages: ['English'], specialties: ['Strength Training', 'Functional Training'],
    certifications: ['Certified Strength & Conditioning Specialist', 'Level 2 Olympic Lifting Coach'], pricePerSession: 220,
    bio: 'James builds programs that feel athletic without being theatrical. His sessions are structured, measurable, and designed around long-term strength.',
    image: unsplash(IMG.james, 900),
  },
  {
    id: 'omar-alkuwari', gymId: 'oxygen-gym', name: 'Omar Al-Kuwari', title: 'Performance Coach', rating: 4.9, reviewCount: 41, yearsExperience: 8,
    languages: ['Arabic', 'English'], specialties: ['Weight Loss', 'Strength Training', 'Functional Training'],
    certifications: ['Certified Personal Trainer', 'Corrective Exercise Specialist'], pricePerSession: 210,
    bio: 'Omar works with busy professionals who want results without living in the gym. His coaching is direct, warm, and grounded in consistency.',
    image: unsplash(IMG.omar, 900),
  },
  {
    id: 'sofia-moretti', gymId: 'oxygen-gym', name: 'Sofia Moretti', title: 'Mobility & Strength Coach', rating: 4.8, reviewCount: 37, yearsExperience: 7,
    languages: ['English', 'Italian'], specialties: ['Mobility', 'Strength Training'],
    certifications: ['Certified Personal Trainer', 'Mobility Specialist'], pricePerSession: 190,
    bio: 'Sofia helps members move better before they lift heavier. Her sessions feel considered — strong, unhurried, and built around how the body actually works.',
    image: unsplash(IMG.sofia, 900),
  },
  {
    id: 'layla-hassan', gymId: 'arena-fitness', name: 'Layla Hassan', title: 'Personal Trainer', rating: 4.6, reviewCount: 29, yearsExperience: 6,
    languages: ['Arabic', 'English', 'French'], specialties: ['Weight Loss', 'Mobility'],
    certifications: ['Certified Personal Trainer', 'Sports Nutrition Certification'], pricePerSession: 180,
    bio: 'Layla is known for making first sessions feel easy to start. She coaches women and men who want a calmer, more personal approach to fitness.',
    image: unsplash(IMG.layla, 900),
  },
  {
    id: 'khalid-rahman', gymId: 'peak-performance', name: 'Khalid Rahman', title: 'Athletic Performance Coach', rating: 4.7, reviewCount: 45, yearsExperience: 11,
    languages: ['Arabic', 'English', 'Urdu'], specialties: ['Strength Training', 'Functional Training'],
    certifications: ['Strength & Conditioning Certification', 'Certified Personal Trainer'], pricePerSession: 195,
    bio: 'Khalid trains with a performance mindset — clean technique, honest effort, and programming that respects recovery as much as intensity.',
    image: unsplash(IMG.khalid, 900),
  },
  {
    id: 'maya-fernandes', gymId: 'core-studio', name: 'Maya Fernandes', title: 'Functional Training Coach', rating: 4.5, reviewCount: 22, yearsExperience: 5,
    languages: ['English', 'Portuguese'], specialties: ['Functional Training', 'Weight Loss', 'Mobility'],
    certifications: ['Certified Personal Trainer', 'Functional Movement Certification'], pricePerSession: 170,
    bio: 'Maya keeps training simple and repeatable. Her clients come for clarity — a plan they can keep, and a coach who notices the details.',
    image: unsplash(IMG.maya, 900),
  },
  {
    id: 'hassan-elamin', gymId: 'atlas-athletics', name: 'Hassan Elamin', title: 'Personal Trainer', rating: 4.6, reviewCount: 58, yearsExperience: 10,
    languages: ['Arabic', 'English'], specialties: ['Weight Loss', 'Strength Training'],
    certifications: ['Certified Personal Trainer', 'Sports Nutrition Certification'], pricePerSession: 160,
    bio: 'Hassan has coached in Doha for a decade. He is practical, encouraging, and especially good with members returning to training after a long pause.',
    image: unsplash(IMG.hassan, 900),
  },
];

const gymReview = (id: string, gymId: string, authorName: string, rating: number, date: string, text: string): Review =>
  ({ id, gymId, trainerId: null, authorName, rating, date, text });
const trainerReview = (id: string, trainerId: string, authorName: string, rating: number, date: string, text: string): Review =>
  ({ id, gymId: null, trainerId, authorName, rating, date, text });

export const REVIEWS: Review[] = [
  gymReview('gr-1', 'power-house', 'Sara Al-Ansari', 5, '2026-07-12', 'Clean, well kept, and never feels chaotic. The West Bay location makes early sessions easy.'),
  gymReview('gr-2', 'power-house', 'Daniel Craig', 5, '2026-06-28', 'Serious equipment without the nightclub lighting. This is the gym I actually look forward to.'),
  gymReview('gr-3', 'power-house', 'Maha Farid', 4, '2026-05-19', 'Beautiful floors and excellent lockers. Peak hours can fill, but staff manage it well.'),
  gymReview('gr-4', 'oxygen-gym', 'Yousef Nasser', 5, '2026-07-02', "Lusail's best-kept club. Light, spacious, and the recovery rooms are genuinely useful."),
  gymReview('gr-5', 'oxygen-gym', 'Elena Petrova', 4, '2026-06-08', 'A polished membership experience. Classes are well run and the floor never feels neglected.'),
  gymReview('gr-6', 'arena-fitness', 'Noor Al-Thani', 5, '2026-07-21', 'Smaller than the big clubs, which is exactly why I stay. It feels personal.'),
  gymReview('gr-7', 'peak-performance', 'Ahmed Saleh', 5, '2026-06-15', 'If you care about lifting well, this is the room. Coaches notice form without hovering.'),
  gymReview('gr-8', 'core-studio', 'Hana Ibrahim', 4, '2026-05-30', 'Quiet, considered, and easy to settle into after work in Msheireb.'),
  gymReview('gr-9', 'atlas-athletics', 'Peter Walsh', 4, '2026-07-04', 'Friendly without being loud. Good value and a solid community in Al Sadd.'),
  trainerReview('tr-1', 'noura-abdullah', 'Aisha Rahman', 5, '2026-07-18', 'Noura is exacting in the best way. I got stronger without feeling rushed or overwhelmed.'),
  trainerReview('tr-2', 'noura-abdullah', 'Thomas Reid', 5, '2026-06-22', 'Clear programming and a calm presence. Sessions feel premium, not performative.'),
  trainerReview('tr-3', 'noura-abdullah', 'Lina Qassim', 4, '2026-05-11', 'Thoughtful about recovery and busy weeks. I finally have a plan I can keep.'),
  trainerReview('tr-4', 'james-mitchell', 'Faris Haddad', 5, '2026-07-09', 'James made strength training feel intelligent. My numbers moved, and so did my confidence.'),
  trainerReview('tr-5', 'omar-alkuwari', 'Reem Al-Kuwari', 5, '2026-06-30', 'Omar understands Doha schedules. Forty-five minutes, no wasted motion.'),
  trainerReview('tr-6', 'sofia-moretti', 'Claire Bennett', 5, '2026-07-14', 'My shoulders finally feel open again. Sofia is precise and kind.'),
  trainerReview('tr-7', 'layla-hassan', 'Maryam Saleh', 5, '2026-06-03', 'A gentle start that still produced results. I never felt talked down to.'),
  trainerReview('tr-8', 'khalid-rahman', 'Samir Aziz', 4, '2026-05-27', 'Demanding, fair, and very good on technique. Worth the drive to Al Waab.'),
];

// Initial trainer availability for every trainer ("*") = the approved Phase 3 slot rules: six start times;
// Sunday closed; Friday and Saturday without 9:00 AM and 4:00 PM; other days without 12:00 PM.
const SLOT_TIMES = [540, 630, 720, 960, 1110, 1200];
export const DEFAULT_AVAILABILITY = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
  trainerId: '*',
  key: `weekday:${weekday}`,
  closed: weekday === 0,
  slots: weekday === 0 ? [] : SLOT_TIMES.filter((_, i) => (weekday === 5 || weekday === 6 ? i !== 0 && i !== 3 : i !== 2)),
}));
