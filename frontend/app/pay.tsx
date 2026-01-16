import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Linking,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../src/context/AuthContext';
import { useTheme } from '../src/context/ThemeContext';
import { api } from '../src/services/api';
import * as Clipboard from 'expo-clipboard';

interface PaymentSession {
  session_id: string;
  user_id: string;
  user_email: string;
  user_name: string;
  plan: string;
  billing_cycle: string;
  amount: number;
  currency: string;
  status: string;
  created_at: string;
  expires_at: string;
  paid_at: string | null;
}

export default function PaymentPage() {
  const { session_id } = useLocalSearchParams<{ session_id: string }>();
  const { user } = useAuth();
  const router = useRouter();
  
  const [session, setSession] = useState<PaymentSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (session_id) {
      fetchSession();
    } else {
      setError('No session ID provided');
      setIsLoading(false);
    }
  }, [session_id]);

  const fetchSession = async () => {
    try {
      setIsLoading(true);
      const response = await api.get(`/payments/session/${session_id}`);
      setSession(response.data);
      setError(null);
    } catch (err: any) {
      console.error('Failed to fetch session:', err);
      setError(err.response?.data?.detail || 'Failed to load payment session');
    } finally {
      setIsLoading(false);
    }
  };

  const copySessionId = async () => {
    if (session_id) {
      await Clipboard.setStringAsync(session_id);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const contactSupport = (method: 'email' | 'whatsapp') => {
    const subject = encodeURIComponent(`Payment Confirmation - Session ${session_id}`);
    const body = encodeURIComponent(
      `Hi,\n\nI would like to confirm my payment for:\n\n` +
      `Session ID: ${session_id}\n` +
      `Plan: ${session?.plan?.toUpperCase()}\n` +
      `Amount: $${session?.amount} ${session?.currency}\n` +
      `Billing: ${session?.billing_cycle}\n\n` +
      `User: ${session?.user_email}\n\n` +
      `Please let me know the payment details.\n\nThank you!`
    );

    if (method === 'email') {
      Linking.openURL(`mailto:support@swiftfx.com?subject=${subject}&body=${body}`);
    } else {
      // WhatsApp - replace with your actual number
      Linking.openURL(`https://wa.me/1234567890?text=${body}`);
    }
  };

  const getPlanIcon = () => {
    if (session?.plan === 'vip') return 'diamond';
    if (session?.plan === 'premium') return 'star';
    return 'person';
  };

  const getPlanColor = () => {
    if (session?.plan === 'vip') return '#8B5CF6';
    if (session?.plan === 'premium') return '#F59E0B';
    return '#6B7280';
  };

  const getStatusColor = () => {
    switch (session?.status) {
      case 'paid': return '#10B981';
      case 'pending': return '#F59E0B';
      case 'cancelled': return '#EF4444';
      case 'expired': return '#6B7280';
      default: return '#6B7280';
    }
  };

  const getStatusIcon = () => {
    switch (session?.status) {
      case 'paid': return 'checkmark-circle';
      case 'pending': return 'time';
      case 'cancelled': return 'close-circle';
      case 'expired': return 'alert-circle';
      default: return 'help-circle';
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#00D4AA" />
          <Text style={styles.loadingText}>Loading payment session...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={64} color="#EF4444" />
          <Text style={styles.errorTitle}>Session Error</Text>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (session?.status === 'paid') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.successContainer}>
          <View style={[styles.statusIconContainer, { backgroundColor: 'rgba(16, 185, 129, 0.2)' }]}>
            <Ionicons name="checkmark-circle" size={80} color="#10B981" />
          </View>
          <Text style={styles.successTitle}>Payment Confirmed!</Text>
          <Text style={styles.successText}>
            Your subscription to {session.plan.toUpperCase()} has been activated.
          </Text>
          <TouchableOpacity 
            style={styles.continueButton} 
            onPress={() => router.replace('/(tabs)/dashboard')}
          >
            <Text style={styles.continueButtonText}>Continue to Dashboard</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backIconButton}>
            <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Complete Payment</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Plan Card */}
        <View style={[styles.planCard, { borderColor: getPlanColor() }]}>
          <View style={[styles.planIconContainer, { backgroundColor: getPlanColor() }]}>
            <Ionicons name={getPlanIcon()} size={32} color="#FFFFFF" />
          </View>
          <Text style={styles.planName}>{session?.plan?.toUpperCase()}</Text>
          <View style={styles.priceRow}>
            <Text style={styles.priceAmount}>${session?.amount}</Text>
            <Text style={styles.pricePeriod}>/{session?.billing_cycle}</Text>
          </View>
        </View>

        {/* Status Badge */}
        <View style={[styles.statusBadge, { backgroundColor: `${getStatusColor()}20` }]}>
          <Ionicons name={getStatusIcon()} size={20} color={getStatusColor()} />
          <Text style={[styles.statusText, { color: getStatusColor() }]}>
            {session?.status === 'pending' ? 'Awaiting Payment' : session?.status?.toUpperCase()}
          </Text>
        </View>

        {/* Info Message */}
        <View style={styles.infoCard}>
          <Ionicons name="information-circle" size={24} color="#3B82F6" />
          <Text style={styles.infoText}>
            Payment system is being finalized. To complete your subscription, please contact support or complete payment through our official channel.
          </Text>
        </View>

        {/* Session Details */}
        <View style={styles.detailsCard}>
          <Text style={styles.detailsTitle}>Session Details</Text>
          
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Session ID</Text>
            <View style={styles.sessionIdRow}>
              <Text style={styles.detailValue} numberOfLines={1}>
                {session_id?.substring(0, 20)}...
              </Text>
              <TouchableOpacity onPress={copySessionId} style={styles.copyButton}>
                <Ionicons 
                  name={copied ? "checkmark" : "copy-outline"} 
                  size={18} 
                  color={copied ? "#10B981" : "#00D4AA"} 
                />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Plan</Text>
            <Text style={styles.detailValue}>{session?.plan?.toUpperCase()}</Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Billing Cycle</Text>
            <Text style={styles.detailValue}>{session?.billing_cycle}</Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Amount</Text>
            <Text style={[styles.detailValue, styles.amountText]}>
              ${session?.amount} {session?.currency}
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Expires</Text>
            <Text style={styles.detailValue}>
              {session?.expires_at ? new Date(session.expires_at).toLocaleString() : '-'}
            </Text>
          </View>
        </View>

        {/* Contact Buttons */}
        <Text style={styles.contactTitle}>Contact Support to Complete Payment</Text>
        
        <View style={styles.contactButtons}>
          <TouchableOpacity 
            style={[styles.contactButton, styles.emailButton]}
            onPress={() => contactSupport('email')}
          >
            <Ionicons name="mail" size={24} color="#FFFFFF" />
            <Text style={styles.contactButtonText}>Email Support</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.contactButton, styles.whatsappButton]}
            onPress={() => contactSupport('whatsapp')}
          >
            <Ionicons name="logo-whatsapp" size={24} color="#FFFFFF" />
            <Text style={styles.contactButtonText}>WhatsApp</Text>
          </TouchableOpacity>
        </View>

        {/* Full Session ID (copyable) */}
        <TouchableOpacity style={styles.fullSessionId} onPress={copySessionId}>
          <Text style={styles.fullSessionIdLabel}>Full Session ID (tap to copy)</Text>
          <Text style={styles.fullSessionIdValue}>{session_id}</Text>
          {copied && <Text style={styles.copiedText}>✓ Copied!</Text>}
        </TouchableOpacity>

        {/* Cancel Link */}
        <TouchableOpacity style={styles.cancelLink} onPress={() => router.back()}>
          <Text style={styles.cancelLinkText}>Cancel and go back</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0E17',
  },
  scrollContent: {
    padding: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#8A8D98',
    marginTop: 16,
    fontSize: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorTitle: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 16,
  },
  errorText: {
    color: '#8A8D98',
    fontSize: 16,
    textAlign: 'center',
    marginTop: 8,
  },
  backButton: {
    marginTop: 24,
    paddingHorizontal: 32,
    paddingVertical: 12,
    backgroundColor: '#1A1F2E',
    borderRadius: 12,
  },
  backButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  successContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  statusIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    justifyContent: 'center',
    alignItems: 'center',
  },
  successTitle: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: 'bold',
    marginTop: 24,
  },
  successText: {
    color: '#8A8D98',
    fontSize: 16,
    textAlign: 'center',
    marginTop: 8,
  },
  continueButton: {
    marginTop: 32,
    paddingHorizontal: 48,
    paddingVertical: 16,
    backgroundColor: '#10B981',
    borderRadius: 12,
  },
  continueButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  backIconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1A1F2E',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: 'bold',
  },
  planCard: {
    backgroundColor: '#1A1F2E',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    borderWidth: 2,
    marginBottom: 16,
  },
  planIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  planName: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  priceAmount: {
    color: '#00D4AA',
    fontSize: 40,
    fontWeight: 'bold',
  },
  pricePeriod: {
    color: '#8A8D98',
    fontSize: 18,
    marginLeft: 4,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    marginBottom: 16,
    gap: 8,
  },
  statusText: {
    fontSize: 16,
    fontWeight: '600',
  },
  infoCard: {
    flexDirection: 'row',
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    gap: 12,
  },
  infoText: {
    flex: 1,
    color: '#3B82F6',
    fontSize: 14,
    lineHeight: 20,
  },
  detailsCard: {
    backgroundColor: '#1A1F2E',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
  },
  detailsTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  detailLabel: {
    color: '#8A8D98',
    fontSize: 14,
  },
  detailValue: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
  },
  sessionIdRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  copyButton: {
    padding: 4,
  },
  amountText: {
    color: '#00D4AA',
    fontSize: 16,
    fontWeight: 'bold',
  },
  contactTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 16,
  },
  contactButtons: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  contactButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
  },
  emailButton: {
    backgroundColor: '#3B82F6',
  },
  whatsappButton: {
    backgroundColor: '#25D366',
  },
  contactButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  fullSessionId: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 24,
  },
  fullSessionIdLabel: {
    color: '#8A8D98',
    fontSize: 12,
    marginBottom: 8,
  },
  fullSessionIdValue: {
    color: '#00D4AA',
    fontSize: 14,
    fontFamily: 'monospace',
  },
  copiedText: {
    color: '#10B981',
    fontSize: 12,
    marginTop: 8,
  },
  cancelLink: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  cancelLinkText: {
    color: '#8A8D98',
    fontSize: 14,
  },
});
