'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { User } from '@/lib/types';

export function useAuth() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: user, isLoading } = useQuery<User | null>({
    queryKey: ['auth', 'me'],
    queryFn: async () => {
      try {
        return await api.get<User>('/auth/me');
      } catch {
        return null;
      }
    },
    retry: false,
    staleTime: 30 * 1000,
    refetchOnWindowFocus: true,
  });

  const loginMutation = useMutation({
    mutationFn: async (credentials: { username: string; password: string }) => {
      return api.post<User>('/auth/login', credentials);
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['auth', 'me'], data);
      router.push('/dashboard');
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      return api.post('/auth/logout');
    },
    onSuccess: () => {
      queryClient.setQueryData(['auth', 'me'], null);
      queryClient.clear();
      router.push('/login');
    },
  });

  return {
    user: user ?? null,
    isLoading,
    login: loginMutation.mutateAsync,
    loginError: loginMutation.error?.message ?? null,
    loginPending: loginMutation.isPending,
    logout: () => logoutMutation.mutate(),
  };
}
