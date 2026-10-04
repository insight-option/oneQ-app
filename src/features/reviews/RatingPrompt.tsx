import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { Icon } from '@/components/Icon';
import { TextField } from '@/components/TextField';
import { useToast } from '@/components/Toast';
import { repository } from '@/data';
import { useSession } from '@/features/auth/sessionStore';
import { makeStyles, radius, space, useTheme } from '@/theme';
import { errorMessage } from '@/utils/errorMessage';

// One-time rating prompt: shown once for each completed booking (stars, a satisfaction question and an optional
// comment). Rating or closing marks the booking as prompted on the server, so it never shows again.
export function RatingPrompt() {
  const signedIn = useSession((s) => s.user !== null);
  const pending = useQuery({ queryKey: ['bookings', 'ratingPrompt'], queryFn: () => repository.pendingReviewPrompt(), enabled: signedIn, staleTime: 5 * 60_000 });
  if (!signedIn || !pending.data) return null;
  return <PromptModal key={pending.data.bookingId} prompt={pending.data} />;
}

function PromptModal({ prompt }: { prompt: { bookingId: string; targetName: string } }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useStyles();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [rating, setRating] = useState(0);
  const [satisfied, setSatisfied] = useState<boolean | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const done = () => queryClient.invalidateQueries({ queryKey: ['bookings', 'ratingPrompt'] });
  const submit = async () => {
    if (!rating) return;
    setBusy(true);
    try {
      await repository.submitBookingReview({ bookingId: prompt.bookingId, rating, satisfied, text: text.trim() });
      toast(t('ratingPrompt.thanks'));
      await Promise.all([done(), queryClient.invalidateQueries({ queryKey: ['reviews'] })]);
    } catch (e) {
      toast(errorMessage(e));
      setBusy(false);
    }
  };
  const dismiss = async () => {
    setBusy(true);
    await repository.dismissReviewPrompt(prompt.bookingId).catch(() => undefined);
    await done();
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={dismiss}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <AppText variant="titleM">{t('ratingPrompt.title', { name: prompt.targetName })}</AppText>
          <View style={styles.stars} accessibilityRole="radiogroup">
            {[1, 2, 3, 4, 5].map((n) => (
              <Pressable key={n} accessibilityRole="radio" accessibilityState={{ checked: rating === n }} accessibilityLabel={t('reviews.stars', { count: n })} hitSlop={6} onPress={() => setRating(n)}>
                <Icon name={n <= rating ? 'star' : 'star-outline'} size={36} color={n <= rating ? colors.accent : colors.textTertiary} />
              </Pressable>
            ))}
          </View>
          <AppText variant="label">{t('ratingPrompt.satisfied')}</AppText>
          <View style={styles.row}>
            <Chip label={t('ratingPrompt.yes')} selected={satisfied === true} onPress={() => setSatisfied(true)} />
            <Chip label={t('ratingPrompt.no')} selected={satisfied === false} onPress={() => setSatisfied(false)} />
          </View>
          <TextField label={t('ratingPrompt.comment')} value={text} onChangeText={setText} multiline />
          <Button label={t('ratingPrompt.send')} onPress={submit} disabled={!rating} loading={busy} />
          <Button variant="text" label={t('ratingPrompt.later')} onPress={dismiss} style={styles.center} />
        </View>
      </View>
    </Modal>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  backdrop: { flex: 1, justifyContent: 'center', padding: space.xl, backgroundColor: colors.overlayDark },
  card: { gap: space.md, padding: space.xl, borderRadius: radius.lg, backgroundColor: colors.surface },
  stars: { flexDirection: 'row', justifyContent: 'center', gap: space.sm },
  row: { flexDirection: 'row', gap: space.sm },
  center: { alignSelf: 'center' },
}));
