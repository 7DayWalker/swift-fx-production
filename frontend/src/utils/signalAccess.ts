/**
 * Signal Access Utility
 * 
 * Handles frontend-level visibility gating for signals.
 * All signals are fetched from Supabase (RLS allows all authenticated users).
 * This utility determines if a user can VIEW the signal content.
 */

export type SubscriptionTier = 'free' | 'premium' | 'vip';
export type SignalVisibility = 'free' | 'premium' | 'vip';

/**
 * Check if a user can access a signal based on their subscription tier
 * 
 * @param userTier - The user's current subscription tier
 * @param signalVisibility - The signal's visibility level
 * @returns true if the user can access the signal content
 * 
 * Logic:
 * - VIP users → access all signals
 * - Premium users → access free + premium signals
 * - Free users → access free signals only
 */
export function canAccessSignal(
  userTier: SubscriptionTier | string | undefined,
  signalVisibility: SignalVisibility | string | undefined
): boolean {
  const tier = (userTier || 'free').toLowerCase() as SubscriptionTier;
  const visibility = (signalVisibility || 'free').toLowerCase() as SignalVisibility;

  // VIP can access everything
  if (tier === 'vip') {
    return true;
  }

  // Premium can access free and premium
  if (tier === 'premium') {
    return visibility === 'free' || visibility === 'premium';
  }

  // Free can only access free
  return visibility === 'free';
}

/**
 * Get the upgrade message for a locked signal
 * 
 * @param signalVisibility - The signal's visibility level
 * @returns The upgrade prompt message
 */
export function getUpgradeMessage(
  signalVisibility: SignalVisibility | string | undefined
): string {
  const visibility = (signalVisibility || 'premium').toLowerCase();

  if (visibility === 'vip') {
    return 'Upgrade to VIP to unlock';
  }

  return 'Upgrade to Premium to unlock';
}

/**
 * Get the tier badge color
 */
export function getTierBadgeColor(visibility: SignalVisibility | string | undefined): string {
  const vis = (visibility || 'free').toLowerCase();
  
  switch (vis) {
    case 'vip':
      return '#FFD700'; // Gold
    case 'premium':
      return '#00D4AA'; // Teal/Cyan
    default:
      return '#888888'; // Gray for free
  }
}
