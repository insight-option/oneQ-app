import { router } from 'expo-router';

import { useAuthSheet } from '@/features/auth/AuthSheet';
import { useSession } from '@/features/auth/sessionStore';

import { useDraft } from './draftStore';

// Plans / Booking "Continue": signed-in users go to Checkout with their account details. Guests browse freely;
// this first action asks them to sign in or create an account (bottom sheet), then continues to Checkout.
export function continueToCheckout() {
  const { user } = useSession.getState();
  if (user) {
    useDraft.getState().setGuest({ fullName: user.fullName, phone: user.phone, email: user.email });
    router.push('/checkout');
  } else {
    useAuthSheet.getState().show('checkout');
  }
}

// After signing in from S12, go straight to Checkout (fixes the sign-in loop, 01 §5.4).
// The auth modal is closed and S12 is replaced, so Back from Checkout returns to the booking step.
export function finishAuth(next?: string) {
  router.back();
  if (next === 'checkout') {
    const { user } = useSession.getState();
    if (user) useDraft.getState().setGuest({ fullName: user.fullName, phone: user.phone, email: user.email });
    router.replace('/checkout');
  }
}
