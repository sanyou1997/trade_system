'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  ShoppingCart,
  History,
  Package,
  CreditCard,
  AlertTriangle,
  FileSpreadsheet,
  Settings,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/sales/new', label: 'Record Sale', icon: ShoppingCart },
  { href: '/sales', label: 'Sales History', icon: History },
  { href: '/inventory', label: 'Inventory', icon: Package },
  { href: '/payments', label: 'Payments', icon: CreditCard },
  { href: '/losses', label: 'Losses', icon: AlertTriangle },
  { href: '/sync', label: 'Excel Sync', icon: FileSpreadsheet },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={cn(
        'flex flex-col bg-slate-900 text-white transition-all duration-200 h-screen sticky top-0',
        collapsed ? 'w-16' : 'w-56',
      )}
    >
      <div className="flex items-center justify-between px-4 py-5 border-b border-slate-700">
        {!collapsed && (
          <span className="text-lg font-bold tracking-tight">Tyre Manager</span>
        )}
        <button
          onClick={() => setCollapsed((prev) => !prev)}
          className="p-1 rounded hover:bg-slate-700 transition-colors"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </div>

      <nav className="flex-1 py-4 space-y-1">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== '/sales' && pathname.startsWith(item.href + '/')) ||
            (item.href === '/sales' && pathname === '/sales');
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-4 py-2.5 text-sm transition-colors',
                isActive
                  ? 'bg-blue-600 text-white font-medium'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white',
              )}
              title={collapsed ? item.label : undefined}
            >
              <Icon size={20} className="flex-shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
