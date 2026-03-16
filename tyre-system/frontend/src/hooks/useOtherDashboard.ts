'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { DailySummary, SalesTrendPoint, OtherSale } from '@/lib/types';

export function useOtherDailySummary(date: string) {
  return useQuery({
    queryKey: ['other-dashboard', 'summary', date],
    queryFn: () => api.get<DailySummary>(`/other-dashboard/daily-summary/${date}`),
    enabled: !!date,
  });
}

export function useOtherWeChatMessage(date: string) {
  return useQuery({
    queryKey: ['other-dashboard', 'wechat', date],
    queryFn: () => api.get<{ message: string }>(`/other-dashboard/wechat-message/${date}`),
    enabled: !!date,
  });
}

export function useOtherMonthlyStats(year: number, month: number) {
  return useQuery({
    queryKey: ['other-dashboard', 'monthly-stats', year, month],
    queryFn: () =>
      api.get<Record<string, unknown>>(`/other-dashboard/monthly-stats/${year}/${month}`),
  });
}

export function useOtherSalesTrend(year: number, month: number) {
  return useQuery({
    queryKey: ['other-dashboard', 'sales-trend', year, month],
    queryFn: async () => {
      const result = await api.get<{ daily_data: SalesTrendPoint[] }>(
        `/other-dashboard/sales-trend/${year}/${month}`,
      );
      return result.daily_data;
    },
  });
}

export function useOtherRecentSales(limit: number = 10) {
  return useQuery({
    queryKey: ['other-dashboard', 'recent-sales', limit],
    queryFn: () => api.get<OtherSale[]>(`/other-sales?limit=${limit}`),
  });
}
