import { useTranslation } from 'react-i18next';

import { Screen } from '@/components/Screen';
import { EmptyState } from '@/components/StateView';

// The Gifts tab until the gift screens are added (Phase 6).
export function GiftsPlaceholder() {
  const { t } = useTranslation();
  return (
    <Screen>
      <EmptyState icon="gift-outline" title={t('giftsSoon.title')} body={t('giftsSoon.body')} />
    </Screen>
  );
}
