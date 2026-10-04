import { useLocalSearchParams } from 'expo-router';

import { SectionScreen } from '@/features/sections/SectionScreen';

export default function Route() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  return <SectionScreen slug={slug} />;
}
