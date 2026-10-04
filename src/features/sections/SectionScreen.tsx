import { Stack } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Chip } from '@/components/Chip';
import { Icon, type IconName } from '@/components/Icon';
import { Screen } from '@/components/Screen';
import { EmptyState, LoadingState } from '@/components/StateView';
import { useFacilities, useSections } from '@/data';
import { accentOf, FacilityList, sectionName } from '@/features/home/HomeScreen';
import { makeStyles, screenPadding, space, useTheme } from '@/theme';

// A section's facilities: header in the section colour, its categories as filters (when it has priced services).
export function SectionScreen({ slug }: { slug: string }) {
  const { t } = useTranslation();
  const { isRTL } = useTheme();
  const styles = useStyles();
  const sections = useSections();
  const facilities = useFacilities(slug);
  const [category, setCategory] = useState<string | null>(null);
  const section = sections.data?.find((s) => s.slug === slug);

  if (sections.isPending || facilities.isPending) return <Screen edges={[]}><LoadingState /></Screen>;
  if (!section) {
    return (
      <Screen edges={[]}>
        <EmptyState icon="shape-outline" title={t('section.notFound')} />
      </Screen>
    );
  }
  const accent = accentOf(section.colorKey);
  const list = (facilities.data ?? []).filter((f) => !category || (f.categoryIds ?? []).includes(category));

  return (
    <Screen scroll edges={[]} contentStyle={styles.content}>
      <Stack.Screen options={{ title: sectionName(section, isRTL) }} />
      <View style={[styles.header, { backgroundColor: accent.accentSoft }]}>
        <Icon name={section.icon as IconName} size={30} color={accent.accent} />
        <AppText variant="titleL" color={accent.accentInk}>
          {sectionName(section, isRTL)}
        </AppText>
        {section.descAr ? <AppText color={accent.accentInk}>{isRTL ? section.descAr : section.descEn || section.descAr}</AppText> : null}
      </View>
      {section.hasServices && section.categories.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.bleed} contentContainerStyle={styles.chips}>
          <Chip label={t('section.all')} selected={!category} onPress={() => setCategory(null)} />
          {section.categories.map((c) => (
            <Chip key={c.id} label={isRTL ? c.nameAr : c.nameEn || c.nameAr} selected={category === c.id} onPress={() => setCategory(c.id)} />
          ))}
        </ScrollView>
      ) : null}
      {list.length === 0 ? (
        <EmptyState icon="store-search-outline" title={t('section.emptyTitle')} body={t('section.emptyBody')} />
      ) : (
        <FacilityList title={t('section.facilities', { count: list.length })} facilities={list} sections={sections.data ?? []} />
      )}
    </Screen>
  );
}

const useStyles = makeStyles(() => ({
  content: { gap: space.lg },
  header: { gap: space.xs, padding: space.xl, borderRadius: 24 },
  bleed: { marginHorizontal: -screenPadding },
  chips: { gap: space.sm, paddingHorizontal: screenPadding },
}));
