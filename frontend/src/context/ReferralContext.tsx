/**
 * Referral Context
 * Manages referral state across the app
 */

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import {
  getStoredReferralCode,
  storeReferralCode,
  clearStoredReferralCode,
  validateReferralCode,
  initDeepLinkListener,
  ReferralInfo,
  ReferralValidationResult,
} from '../services/referralService';

interface ReferralContextType {
  // Stored referral info (from deep link or manual entry)
  referralInfo: ReferralInfo | null;
  // Whether the referral code is locked (from deep link)
  isReferralLocked: boolean;
  // Loading state
  isLoading: boolean;
  // Validation result
  validationResult: ReferralValidationResult | null;
  // Actions
  setReferralCode: (code: string, source?: 'deeplink' | 'manual' | 'qr') => Promise<boolean>;
  validateCode: (code: string) => Promise<ReferralValidationResult>;
  clearReferral: () => Promise<void>;
  // Called after successful signup to lock in the referral
  consumeReferral: () => Promise<void>;
}

const ReferralContext = createContext<ReferralContextType | undefined>(undefined);

export function ReferralProvider({ children }: { children: ReactNode }) {
  const [referralInfo, setReferralInfo] = useState<ReferralInfo | null>(null);
  const [isReferralLocked, setIsReferralLocked] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [validationResult, setValidationResult] = useState<ReferralValidationResult | null>(null);

  // Load stored referral on mount
  useEffect(() => {
    loadStoredReferral();
  }, []);

  // Initialize deep link listener
  useEffect(() => {
    const cleanup = initDeepLinkListener((code) => {
      console.log('[ReferralContext] Deep link referral detected:', code);
      loadStoredReferral();
    });
    
    return cleanup;
  }, []);

  const loadStoredReferral = async () => {
    try {
      setIsLoading(true);
      const stored = await getStoredReferralCode();
      if (stored) {
        setReferralInfo(stored);
        setIsReferralLocked(stored.source === 'deeplink');
        
        // Validate the stored code
        const validation = await validateReferralCode(stored.code);
        setValidationResult(validation);
        setReferralInfo(prev => prev ? { ...prev, isValid: validation.valid, referrerName: validation.referrer_name } : null);
      }
    } catch (error) {
      console.error('[ReferralContext] Failed to load stored referral:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const setReferralCode = useCallback(async (
    code: string,
    source: 'deeplink' | 'manual' | 'qr' = 'manual'
  ): Promise<boolean> => {
    try {
      // Validate first
      const validation = await validateReferralCode(code);
      setValidationResult(validation);
      
      if (validation.valid) {
        await storeReferralCode(code, source);
        setReferralInfo({
          code: code.toUpperCase().trim(),
          source,
          timestamp: new Date().toISOString(),
          isValid: true,
          referrerName: validation.referrer_name,
        });
        setIsReferralLocked(source === 'deeplink');
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('[ReferralContext] Failed to set referral code:', error);
      return false;
    }
  }, []);

  const validateCode = useCallback(async (code: string): Promise<ReferralValidationResult> => {
    const result = await validateReferralCode(code);
    setValidationResult(result);
    return result;
  }, []);

  const clearReferral = useCallback(async () => {
    await clearStoredReferralCode();
    setReferralInfo(null);
    setIsReferralLocked(false);
    setValidationResult(null);
  }, []);

  const consumeReferral = useCallback(async () => {
    // Called after successful signup - the referral has been used
    await clearStoredReferralCode();
    // Keep the info in state for display purposes but mark as consumed
    console.log('[ReferralContext] Referral consumed for signup');
  }, []);

  return (
    <ReferralContext.Provider
      value={{
        referralInfo,
        isReferralLocked,
        isLoading,
        validationResult,
        setReferralCode,
        validateCode,
        clearReferral,
        consumeReferral,
      }}
    >
      {children}
    </ReferralContext.Provider>
  );
}

export function useReferral() {
  const context = useContext(ReferralContext);
  if (context === undefined) {
    throw new Error('useReferral must be used within a ReferralProvider');
  }
  return context;
}
