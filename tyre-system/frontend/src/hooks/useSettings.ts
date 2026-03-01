'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export const SETTINGS_DICT_KEY = ['settings-dict'];

export function useSettings() {
  return useQuery({
    queryKey: SETTINGS_DICT_KEY,
    queryFn: () => api.get<Record<string, string>>('/settings'),
    staleTime: 5 * 60 * 1000,
  });
}
