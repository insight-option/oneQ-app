import { MutationCache, QueryCache, QueryClient, useQuery } from '@tanstack/react-query';

import type { ReviewTarget, Specialty } from '@/domain/models';
import { reportError } from '@/services/monitoring';

import { adminRepository as amplifyAdminRepository } from './amplify/adminRepository';
import { amplifyRepository } from './amplify/amplifyRepository';
import { consoleRepository as amplifyConsoleRepository, type ConsoleRepository } from './amplify/consoleRepository';
import { dashboardRepository as amplifyDashboardRepository, type DashboardRepository } from './amplify/dashboardRepository';
import './network';
import { RepositoryError, type AdminRepository, type Repository } from './repository';

export const repository: Repository = amplifyRepository;
export const adminRepository: AdminRepository = amplifyAdminRepository;
export const dashboardRepository: DashboardRepository = amplifyDashboardRepository;
export const consoleRepository: ConsoleRepository = amplifyConsoleRepository;

// Only transient failures are retried; validation, auth and not-found errors are final.
const retryable = (e: unknown) => !(e instanceof RepositoryError) || e.code === 'NETWORK';

export const queryClient = new QueryClient({
  // Unexpected failures are reported; expected ones (RepositoryError) are shown by the screens.
  queryCache: new QueryCache({ onError: (e, query) => reportError(e, { query: String(query.queryKey[0]) }) }),
  mutationCache: new MutationCache({ onError: (e) => reportError(e, { area: 'mutation' }) }),
  defaultOptions: {
    // Requests run even when NetInfo says offline, so screens show the network error + Retry instead of an
    // endless spinner; they refetch automatically when the connection returns (./network.ts). React Query turns
    // refetchOnReconnect off by default for networkMode 'always', so it is switched back on here.
    queries: { networkMode: 'always', refetchOnReconnect: true, retry: (failures, e) => failures < 2 && retryable(e) },
  },
});

export const useGyms = () => useQuery({ queryKey: ['gyms'], queryFn: () => repository.listGyms() });

// An empty id (e.g. a trainer's gym before the trainer has loaded) waits instead of requesting nothing.
export const useGym = (id: string) => useQuery({ queryKey: ['gym', id], queryFn: () => repository.getGym(id), enabled: !!id });

export const usePlans = (gymId: string) => useQuery({ queryKey: ['plans', gymId], queryFn: () => repository.getPlans(gymId) });

export const useTrainers = (gymId: string, specialty: Specialty | null) =>
  useQuery({ queryKey: ['trainers', gymId, specialty], queryFn: () => repository.listTrainers(gymId, specialty) });

export const useTrainer = (id: string) => useQuery({ queryKey: ['trainer', id], queryFn: () => repository.getTrainer(id), enabled: !!id });

export const useGymReviews = (gymId: string) =>
  useQuery({ queryKey: ['reviews', 'gym', gymId], queryFn: () => repository.listReviews({ gymId }) });

export const useTrainerReviews = (trainerId: string) =>
  useQuery({ queryKey: ['reviews', 'trainer', trainerId], queryFn: () => repository.listReviews({ trainerId }) });

// Signed-in users only: eligibility to rate and the caller's own review.
export const useReviewStatus = (target: ReviewTarget, enabled: boolean) =>
  useQuery({ queryKey: ['reviewStatus', target.type, target.id], queryFn: () => repository.getReviewStatus(target), enabled });

export const useAvailability = (trainerId: string) =>
  useQuery({ queryKey: ['availability', trainerId], queryFn: () => repository.getAvailability(trainerId) });

export const useSections = () => useQuery({ queryKey: ['sections'], queryFn: () => repository.listSections() });

export const useFacilities = (sectionId?: string | null) =>
  useQuery({ queryKey: ['facilities', sectionId ?? 'all'], queryFn: () => repository.listFacilities(sectionId) });

export const useFacilityServicesPublic = (facilityId: string) =>
  useQuery({ queryKey: ['services', facilityId], queryFn: () => repository.listServices(facilityId), enabled: !!facilityId });

export const useDepartments = (facilityId: string) =>
  useQuery({ queryKey: ['departments', facilityId], queryFn: () => repository.listDepartments(facilityId), enabled: !!facilityId });

// Bookings belong to the current user (or this device's guest), so they are cleared on every auth change.
export const useBookings = () => useQuery({ queryKey: ['bookings'], queryFn: () => repository.listBookings() });

export const useBooking = (id: string) => useQuery({ queryKey: ['booking', id], queryFn: () => repository.getBooking(id) });
