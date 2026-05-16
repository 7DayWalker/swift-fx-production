/**
 * Distribution gating for Flutterwave.
 *
 * Flutterwave is ONLY available on non-Play Android distributions:
 *   • Direct APK installs
 *   • Xiaomi GetApps
 *   • Samsung Store
 *
 * It must NEVER appear on iOS (Apple IAP only) or on Google Play builds.
 *
 * Gate logic:
 *   1. Hard guard: Platform.OS must be 'android'. iOS short-circuits to false.
 *   2. Env toggle: `EXPO_PUBLIC_ENABLE_FLUTTERWAVE === 'true'` flips it on.
 *      Apple/Play production EAS profiles ship with this unset → Flutterwave hidden.
 *      APK/Xiaomi/Samsung EAS profiles set it to 'true' → Flutterwave shown.
 *
 * To re-enable Google Play distribution later, simply unset the env var in
 * the Play profile — no code change required.
 */
import { Platform } from 'react-native';

/** True only on Android builds that explicitly opt in via EAS env. */
export function isFlutterwaveEnabled(): boolean {
  if (Platform.OS !== 'android') return false;
  return process.env.EXPO_PUBLIC_ENABLE_FLUTTERWAVE === 'true';
}

/**
 * Distribution channel label sent to the backend's `payment_transactions.platform`.
 * The backend whitelists this value; arbitrary strings collapse to 'android_apk'.
 */
export type DistributionChannel = 'android_apk' | 'xiaomi' | 'samsung';

/**
 * Best-effort detection of the distribution channel from EAS build profile.
 * Add `EXPO_PUBLIC_DISTRIBUTION_CHANNEL=xiaomi|samsung` to the corresponding EAS profile;
 * APK builds omit it and default to 'android_apk'.
 */
export function getDistributionChannel(): DistributionChannel {
  const raw = (process.env.EXPO_PUBLIC_DISTRIBUTION_CHANNEL || '').toLowerCase();
  if (raw === 'xiaomi') return 'xiaomi';
  if (raw === 'samsung') return 'samsung';
  return 'android_apk';
}
