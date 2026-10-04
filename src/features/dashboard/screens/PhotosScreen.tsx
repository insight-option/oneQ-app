import { Image } from 'expo-image';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { RatingInline } from '@/components/RatingInline';
import { TextField } from '@/components/TextField';
import { useToast } from '@/components/Toast';
import { makeStyles, radius, space, useTheme } from '@/theme';
import { errorMessage } from '@/utils/errorMessage';

import { useCurrentFacility } from '../FacilityDashboard';
import { useSaveFacility } from '../hooks';
import { LocationPanel } from '../LocationPanel';
import { Grid, PageHeader, Panel } from '../ui';

const isHttps = (u: string) => /^https:\/\/\S+$/.test(u.trim());

// Facility photos: cover (first gallery image), logo and gallery, with a preview of the customer card.
// Photos are added by HTTPS link for now; uploading from the device needs storage (coming soon).
export function PhotosScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useStyles();
  const toast = useToast();
  const { facility, section } = useCurrentFacility();
  const save = useSaveFacility(facility.id);
  const [images, setImages] = useState<string[]>(facility.images);
  const [logo, setLogo] = useState(facility.logo ?? '');
  const [draft, setDraft] = useState('');
  const gallery = section?.presetType === 'salon';

  const add = () => {
    if (!isHttps(draft) || images.length >= 12) return;
    setImages((list) => [...list, draft.trim()]);
    setDraft('');
  };
  const move = (i: number, by: number) =>
    setImages((list) => {
      const next = [...list];
      const [item] = next.splice(i, 1);
      next.splice(Math.max(0, Math.min(next.length, i + by)), 0, item!);
      return next;
    });
  const onSave = () => {
    if (logo && !isHttps(logo)) return toast(t('dashboard.photos.httpsOnly'));
    save.mutate({ images, logo: logo.trim() || null }, { onSuccess: () => toast(t('dashboard.saved')), onError: (e) => toast(errorMessage(e)) });
  };

  return (
    <>
      <PageHeader title={gallery ? t('dashboard.menu.gallery') : t('dashboard.photos.title')} subtitle={t('dashboard.photos.subtitle')} right={<Button label={t('dashboard.save')} onPress={onSave} loading={save.isPending} />} />
      <Grid min={320}>
        <Panel title={t('dashboard.photos.gallery')}>
          <AppText variant="bodyS" color={colors.textSecondary}>
            {t('dashboard.photos.coverHint')}
          </AppText>
          <View style={styles.thumbs}>
            {images.map((uri, i) => (
              <View key={`${uri}-${i}`} style={styles.thumbBox}>
                <Image source={uri} style={styles.thumb} contentFit="cover" />
                {i === 0 ? (
                  <View style={styles.coverTag}>
                    <AppText variant="bodyS" color={colors.onPrimary}>
                      {t('dashboard.photos.cover')}
                    </AppText>
                  </View>
                ) : null}
                <View style={styles.thumbActions}>
                  <Pressable accessibilityRole="button" accessibilityLabel={t('dashboard.photos.moveEarlier')} disabled={i === 0} onPress={() => move(i, -1)} hitSlop={6}>
                    <Icon name="chevron-left" directional color={i === 0 ? colors.outline : colors.textPrimary} />
                  </Pressable>
                  <Pressable accessibilityRole="button" accessibilityLabel={t('dashboard.photos.remove')} onPress={() => setImages((list) => list.filter((_, j) => j !== i))} hitSlop={6}>
                    <Icon name="trash-can-outline" color={colors.error} />
                  </Pressable>
                  <Pressable accessibilityRole="button" accessibilityLabel={t('dashboard.photos.moveLater')} disabled={i === images.length - 1} onPress={() => move(i, 1)} hitSlop={6}>
                    <Icon name="chevron-right" directional color={i === images.length - 1 ? colors.outline : colors.textPrimary} />
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
          <TextField label={t('dashboard.photos.addLink')} value={draft} onChangeText={setDraft} autoCapitalize="none" keyboardType="url" placeholder="https://" />
          <Button variant="outlined" label={t('dashboard.photos.add')} onPress={add} disabled={!isHttps(draft) || images.length >= 12} />
          <AppText variant="bodyS" color={colors.textTertiary}>
            {t('dashboard.photos.uploadSoon')}
          </AppText>
        </Panel>
        <View style={styles.side}>
          <Panel title={t('dashboard.photos.logo')}>
            {logo && isHttps(logo) ? <Image source={logo} style={styles.logo} contentFit="cover" /> : null}
            <TextField label={t('dashboard.photos.logoLink')} value={logo} onChangeText={setLogo} autoCapitalize="none" keyboardType="url" placeholder="https://" />
          </Panel>
          <Panel title={t('dashboard.photos.preview')}>
            <View style={styles.card}>
              {images[0] ? <Image source={images[0]} style={styles.cardImage} contentFit="cover" /> : <View style={[styles.cardImage, styles.placeholder]} />}
              <View style={styles.cardBody}>
                <View style={styles.cardTitle}>
                  {logo && isHttps(logo) ? <Image source={logo} style={styles.cardLogo} contentFit="cover" /> : null}
                  <AppText variant="headline" numberOfLines={1} style={styles.flex}>
                    {facility.name}
                  </AppText>
                </View>
                <AppText color={colors.textSecondary}>{`${facility.area}, Doha`}</AppText>
                <RatingInline rating={facility.rating} reviewCount={facility.reviewCount} />
              </View>
            </View>
          </Panel>
        </View>
      </Grid>
      <LocationPanel facility={facility} />
    </>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  flex: { flex: 1 },
  side: { gap: space.lg },
  thumbs: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  thumbBox: { width: 140, gap: space.xs },
  thumb: { width: 140, height: 100, borderRadius: radius.sm, backgroundColor: colors.surfaceVariant },
  coverTag: { position: 'absolute', top: space.xs, start: space.xs, paddingHorizontal: space.sm, borderRadius: radius.pill, backgroundColor: colors.overlayDark },
  thumbActions: { flexDirection: 'row', justifyContent: 'space-between' },
  logo: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.surfaceVariant },
  card: { borderRadius: radius.md, borderWidth: 1, borderColor: colors.outline, overflow: 'hidden', backgroundColor: colors.surface },
  cardImage: { width: '100%', height: 160, backgroundColor: colors.surfaceVariant },
  placeholder: { backgroundColor: colors.surfaceVariant },
  cardBody: { padding: space.lg, gap: space.xs },
  cardTitle: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  cardLogo: { width: 28, height: 28, borderRadius: 14 },
}));
