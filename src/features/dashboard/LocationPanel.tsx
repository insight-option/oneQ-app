import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { DOHA } from '@/components/map/mapHtml';
import { OsmMap } from '@/components/map/OsmMap';
import { TextField } from '@/components/TextField';
import { useToast } from '@/components/Toast';
import type { FacilitySummary } from '@/domain/dashboard';
import { isValidQatarMobile, toQatarE164 } from '@/domain/validation';
import { makeStyles, radius, space, useTheme } from '@/theme';
import { errorMessage } from '@/utils/errorMessage';

import { useSaveFacility } from './hooks';
import { Panel } from './ui';

// Contacts and location shown on the facility page and the customer map: call, WhatsApp, shop link, area,
// and the pin the owner places once on the map (tap to move it).
export function LocationPanel({ facility }: { facility: FacilitySummary }) {
  const { t } = useTranslation();
  const { colors, sectionAccent } = useTheme();
  const styles = useStyles();
  const toast = useToast();
  const save = useSaveFacility(facility.id);
  const local = (p: string | null) => (p ? p.replace(/^\+974/, '') : '');
  const [phone, setPhone] = useState(local(facility.phone));
  const [whatsapp, setWhatsapp] = useState(local(facility.whatsapp));
  const [storeUrl, setStoreUrl] = useState(facility.storeUrl ?? '');
  const [region, setRegion] = useState(facility.region ?? '');
  const [pin, setPin] = useState(facility.lat != null && facility.lng != null ? { lat: facility.lat, lng: facility.lng } : null);
  const phoneOk = (p: string) => !p || isValidQatarMobile(p);
  const urlOk = !storeUrl || /^https:\/\/\S+$/.test(storeUrl.trim());
  const mapData = useMemo(() => ({ center: pin ?? DOHA, zoom: pin ? 15 : 11, markers: [], pick: pin ?? DOHA, pickColor: sectionAccent.accent }), [pin, sectionAccent.accent]);

  const onSave = () => {
    if (!phoneOk(phone) || !phoneOk(whatsapp) || !urlOk) return;
    save.mutate(
      {
        phone: phone ? toQatarE164(phone) : null,
        whatsapp: whatsapp ? toQatarE164(whatsapp) : null,
        storeUrl: storeUrl.trim() || null,
        region: region.trim() || null,
        ...(pin ? { lat: pin.lat, lng: pin.lng } : {}),
      },
      { onSuccess: () => toast(t('dashboard.saved')), onError: (e) => toast(errorMessage(e)) },
    );
  };

  return (
    <Panel title={t('dashboard.location.title')}>
      <View style={styles.pair}>
        <View style={styles.flex}>
          <TextField label={t('console.facilities.phone')} value={phone} onChangeText={setPhone} keyboardType="phone-pad" prefix="+974" error={!phoneOk(phone) ? t('validation.phone') : undefined} />
        </View>
        <View style={styles.flex}>
          <TextField label={t('console.facilities.whatsapp')} value={whatsapp} onChangeText={setWhatsapp} keyboardType="phone-pad" prefix="+974" error={!phoneOk(whatsapp) ? t('validation.phone') : undefined} />
        </View>
      </View>
      <TextField label={t('dashboard.location.storeUrl')} value={storeUrl} onChangeText={setStoreUrl} autoCapitalize="none" keyboardType="url" placeholder="https://" error={!urlOk ? t('dashboard.photos.httpsOnly') : undefined} />
      <TextField label={t('console.facilities.region')} value={region} onChangeText={setRegion} />
      <AppText variant="bodyS" color={colors.textSecondary}>
        {t('dashboard.location.pinHint')}
      </AppText>
      <OsmMap data={mapData} style={styles.map} onPick={(lat, lng) => setPin({ lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6 })} />
      <AppText variant="bodyS" color={colors.textTertiary}>
        {pin ? t('dashboard.location.pinAt', { lat: pin.lat.toFixed(5), lng: pin.lng.toFixed(5) }) : t('dashboard.location.noPin')}
      </AppText>
      <Button label={t('dashboard.save')} onPress={onSave} loading={save.isPending} />
    </Panel>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  flex: { flex: 1 },
  pair: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  map: { height: 260, borderRadius: radius.md, overflow: 'hidden', borderWidth: 1, borderColor: colors.outline },
}));
