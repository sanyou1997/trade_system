'use client';

import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string | number;
  icon?: LucideIcon;
  change?: string;
  changeType?: 'positive' | 'negative' | 'neutral';
  className?: string;
}

export function StatCard({
  title,
  value,
  icon: Icon,
  change,
  changeType = 'neutral',
  className,
}: StatCardProps) {
  return (
    <div
      className={cn(
        'bg-white rounded-lg border border-slate-200 p-5 flex items-start justify-between',
        className,
      )}
    >
      <div>
        <p className="text-sm text-slate-500">{title}</p>
        <p className="text-2xl font-bold text-slate-900 mt-1">{value}</p>
        {change && (
          <p
            className={cn(
              'text-xs mt-1',
              changeType === 'positive' && 'text-green-600',
              changeType === 'negative' && 'text-red-600',
              changeType === 'neutral' && 'text-slate-500',
            )}
          >
            {change}
          </p>
        )}
      </div>
      {Icon && (
        <div className="p-2 bg-blue-50 rounded-lg">
          <Icon size={22} className="text-blue-600" />
        </div>
      )}
    </div>
  );
}

interface CardProps {
  title?: string;
  children: React.ReactNode;
  className?: string;
  headerRight?: React.ReactNode;
}

export default function Card({ title, children, className, headerRight }: CardProps) {
  return (
    <div className={cn('bg-white rounded-lg border border-slate-200', className)}>
      {title && (
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h3 className="font-semibold text-slate-900">{title}</h3>
          {headerRight}
        </div>
      )}
      <div className="p-5">{children}</div>
    </div>
  );
}
