'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { DailySummary, SalesTrendPoint, PhoneSale } from '@/lib/types';

export function usePhoneDailySummary(date: string) {
  return useQuery({
    queryKey: ['phone-dashboard', 'summary', date],
    queryFn: () => api.get<DailySummary>(`/phone-dashboard/daily-summary/${date}`),
    enabled: !!date,
  });
}

export function usePhoneWeChatMessage(date: string) {
  return useQuery({
    queryKey: ['phone-dashboard', 'wechat', date],
    queryFn: () => api.get<{ message: string }>(`/phone-dashboard/wechat-message/${date}`),
    enabled: !!date,
  });
}

export function usePhoneMonthlyStats(year: number, month: number) {
  return useQuery({
    queryKey: ['phone-dashboard', 'monthly-stats', year, month],
    queryFn: () =>
      api.get<Record<string, unknown>>(`/phone-dashboard/monthly-stats/${year}/${month}`),
  });
}

export function usePhoneSalesTrend(year: number, month: number) {
  return useQuery({
    queryKey: ['phone-dashboard', 'sales-trend', year, month],
    queryFn: async () => {
      const result = await api.get<{ daily_data: SalesTrendPoint[] }>(
        `/phone-dashboard/sales-trend/${year}/${month}`,
      );
      return result.daily_data;
    },
  });
}

export function usePhoneRecentSales(limit: number = 10) {
  return useQuery({
    queryKey: ['phone-dashboard', 'recent-sales', limit],
    queryFn: () => api.get<PhoneSale[]>(`/phone-sales?limit=${limit}`),
  });
}
