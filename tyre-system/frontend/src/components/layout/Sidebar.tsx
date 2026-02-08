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
import { useProductType } from '@/lib/product-context';

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
  const { productType, setProductType, isTyre } = useProductType();

  return (
    <aside
      className={cn(
        'flex flex-col bg-slate-900 text-white transition-all duration-200 h-screen sticky top-0',
        collapsed ? 'w-16' : 'w-56',
      )}
    >
      <div className="flex items-center justify-between px-4 py-5 border-b border-slate-700">
        {!collapsed && (
          <span className="text-lg font-bold tracking-tight">
            {isTyre ? 'Tyre Manager' : 'Phone Manager'}
          </span>
        )}
        <button
          onClick={() => setCollapsed((prev) => !prev)}
          className="p-1 rounded hover:bg-slate-700 transition-colors"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </div>

      {/* Product Type Switcher */}
      <div className={cn('px-2 py-3 border-b border-slate-700', collapsed && 'px-1')}>
        {collapsed ? (
          <button
            onClick={() => setProductType(isTyre ? 'phone' : 'tyre')}
            className="w-full flex items-center justify-center p-2 rounded text-xs font-bold bg-slate-800 hover:bg-slate-700 transition-colors"
            title={`Switch to ${isTyre ? 'Phones' : 'Tyres'}`}
          >
            {isTyre ? 'T' : 'P'}
          </button>
        ) : (
          <div className="flex rounded-lg bg-slate-800 p-0.5">
            <button
              onClick={() => setProductType('tyre')}
              className={cn(
                'flex-1 py-1.5 text-xs font-medium rounded-md transition-colors',
                productType === 'tyre'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-white',
              )}
            >
              Tyres
            </button>
            <button
              onClick={() => setProductType('phone')}
              className={cn(
                'flex-1 py-1.5 text-xs font-medium rounded-md transition-colors',
                productType === 'phone'
                  ? 'bg-green-600 text-white'
                  : 'text-slate-400 hover:text-white',
              )}
            >
              Phones
            </button>
          </div>
        )}
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
