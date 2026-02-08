'use client';

import { useState, FormEvent, useEffect } from 'react';
import MainLayout from '@/components/layout/MainLayout';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Badge from '@/components/ui/Badge';
import Table, { Column } from '@/components/ui/Table';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/hooks/useAuth';
import { api } from '@/lib/api';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { User } from '@/lib/types';

const ROLE_OPTIONS = [
  { value: 'admin', label: 'Admin' },
  { value: 'operator', label: 'Operator' },
];

export default function SettingsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Exchange Rates
  const [mukuruRate, setMukuruRate] = useState('');
  const [cashRate, setCashRate] = useState('');

  // Backend returns settings as a dict { key: value }, convert to array
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const dict = await api.get<Record<string, string>>('/settings');
      return Object.entries(dict ?? {}).map(([key, value]) => ({ key, value }));
    },
  });

  useEffect(() => {
    if (settings) {
      const mukuru = settings.find((s) => s.key === 'mukuru_rate');
      const cash = settings.find((s) => s.key === 'cash_rate');
      if (mukuru) setMukuruRate(mukuru.value);
      if (cash) setCashRate(cash.value);
    }
  }, [settings]);

  // Track the saved cash rate (from server) to detect changes
  const savedCashRate = settings?.find((s) => s.key === 'cash_rate')?.value ?? '';

  const updateMukuruMutation = useMutation({
    mutationFn: async (value: string) => {
      await api.put('/settings', { key: 'mukuru_rate', value });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      toast('success', 'Mukuru rate saved.');
    },
    onError: (err) => {
      toast('error', err instanceof Error ? err.message : 'Save failed.');
    },
  });

  const updateCashRateMutation = useMutation({
    mutationFn: async (newRate: number) => {
      return api.put<{
        old_rate: number;
        new_rate: number;
        tyres_updated: number;
        changes: { tyre_id: number; size: string; brand: string; old_price: number; new_price: number }[];
      }>('/settings/cash-rate', { new_rate: newRate });
    },
    onSuccess: async (data) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['settings'] }),
        queryClient.invalidateQueries({ queryKey: ['tyres'] }),
        queryClient.invalidateQueries({ queryKey: ['inventory'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      ]);
      toast(
        'success',
        `Cash rate updated: ${data?.old_rate} → ${data?.new_rate}. ${data?.tyres_updated} product prices recalculated.`,
      );
    },
    onError: (err) => {
      toast('error', err instanceof Error ? err.message : 'Save failed.');
    },
  });

  function handleSaveRates(e: FormEvent) {
    e.preventDefault();

    // Save mukuru rate (simple setting update)
    if (mukuruRate) {
      updateMukuruMutation.mutate(mukuruRate);
    }

    // Save cash rate with price recalculation
    const newRate = Number(cashRate);
    if (!cashRate || isNaN(newRate) || newRate <= 0) {
      toast('error', 'Please enter a valid cash rate.');
      return;
    }

    // If cash rate changed, confirm before recalculating prices
    if (cashRate !== savedCashRate) {
      const confirmed = confirm(
        `Changing cash rate from ${savedCashRate || '(not set)'} to ${cashRate} will automatically recalculate ALL product prices (rounded to nearest 1,000 MWK).\n\nContinue?`,
      );
      if (!confirmed) return;
      updateCashRateMutation.mutate(newRate);
    }
  }

  // User Management
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('operator');

  const { data: users, isLoading: usersLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get<User[]>('/users'),
    enabled: user?.role === 'admin',
  });

  const createUserMutation = useMutation({
    mutationFn: (data: { username: string; password: string; role: string }) =>
      api.post('/users', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast('success', 'User created.');
      setNewUsername('');
      setNewPassword('');
      setNewRole('operator');
    },
    onError: (err) => {
      toast('error', err instanceof Error ? err.message : 'User creation failed.');
    },
  });

  function handleCreateUser(e: FormEvent) {
    e.preventDefault();
    if (!newUsername.trim() || !newPassword.trim()) {
      toast('error', 'Username and password are required.');
      return;
    }
    createUserMutation.mutate({
      username: newUsername.trim(),
      password: newPassword,
      role: newRole,
    });
  }

  const userColumns: Column<User>[] = [
    { key: 'id', label: 'ID' },
    { key: 'username', label: 'Username' },
    {
      key: 'role',
      label: 'Role',
      render: (u) => (
        <Badge variant={u.role === 'admin' ? 'info' : 'default'}>
          {u.role}
        </Badge>
      ),
    },
  ];

  return (
    <MainLayout title="Settings">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Exchange Rates */}
        <Card title="Exchange Rates">
          <form onSubmit={handleSaveRates} className="space-y-4">
            <Input
              label="Mukuru Rate"
              type="number"
              step="0.01"
              value={mukuruRate}
              onChange={(e) => setMukuruRate(e.target.value)}
              placeholder="e.g. 590"
            />
            <div>
              <Input
                label="Cash Rate"
                type="number"
                step="0.01"
                value={cashRate}
                onChange={(e) => setCashRate(e.target.value)}
                placeholder="e.g. 590"
              />
              <p className="mt-1 text-xs text-slate-500">
                Changing cash rate will auto-recalculate all product prices (rounded to nearest 1,000 MWK).
              </p>
            </div>
            <Button
              type="submit"
              loading={updateMukuruMutation.isPending || updateCashRateMutation.isPending}
            >
              Save Rates
            </Button>
          </form>
        </Card>

        {/* File Paths */}
        <Card title="File Paths">
          <div className="space-y-3">
            {settings
              ?.filter((s) => s.key.includes('path'))
              .map((s) => (
                <div key={s.key} className="text-sm">
                  <span className="font-medium text-slate-600">{s.key}:</span>
                  <span className="ml-2 text-slate-500 break-all">{s.value}</span>
                </div>
              ))}
            {(!settings || settings.filter((s) => s.key.includes('path')).length === 0) && (
              <p className="text-sm text-slate-400">No file paths configured.</p>
            )}
          </div>
        </Card>
      </div>

      {/* User Management (Admin Only) */}
      {user?.role === 'admin' && (
        <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card title="Add User">
            <form onSubmit={handleCreateUser} className="space-y-4">
              <Input
                label="Username"
                type="text"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                placeholder="Enter username"
              />
              <Input
                label="Password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter password"
              />
              <Select
                label="Role"
                options={ROLE_OPTIONS}
                value={newRole}
                onChange={(e) => setNewRole(e.target.value)}
              />
              <Button
                type="submit"
                loading={createUserMutation.isPending}
                className="w-full"
              >
                Create User
              </Button>
            </form>
          </Card>

          <div className="lg:col-span-2">
            <Card title="Users">
              <Table
                columns={userColumns}
                data={users ?? []}
                keyExtractor={(u) => u.id}
                loading={usersLoading}
                emptyMessage="No users found."
              />
            </Card>
          </div>
        </div>
      )}
    </MainLayout>
  );
}
