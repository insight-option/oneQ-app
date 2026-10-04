import { useLocalSearchParams } from 'expo-router';

import { FacilityScreen } from '@/features/facility/FacilityScreen';

export default function Route() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <FacilityScreen id={id} />;
}
