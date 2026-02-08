'use client';

import { LogOut, User as UserIcon } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useState, useRef, useEffect } from 'react';
import { useProductType } from '@/lib/product-context';

interface HeaderProps {
  title: string;
}

export default function Header({ title }: HeaderProps) {
  const { user, logout } = useAuth();
  const { productType } = useProductType();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const today = new Date().toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <header className="flex items-center justify-between px-6 py-4 bg-white border-b border-slate-200">
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
          <p className="text-sm text-slate-500">{today}</p>
        </div>
        <span
          className={
            productType === 'tyre'
              ? 'px-2 py-0.5 text-xs font-medium rounded-full bg-blue-100 text-blue-700'
              : 'px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-700'
          }
        >
          {productType === 'tyre' ? 'Tyres' : 'Phones'}
        </span>
      </div>

      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setDropdownOpen((prev) => !prev)}
          className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 rounded-md hover:bg-slate-100 transition-colors"
        >
          <UserIcon size={18} />
          <span>{user?.username ?? 'User'}</span>
        </button>

        {dropdownOpen && (
          <div className="absolute right-0 mt-1 w-44 bg-white border border-slate-200 rounded-md shadow-lg z-50">
            <div className="px-3 py-2 text-xs text-slate-500 border-b border-slate-100">
              Role: {user?.role ?? 'unknown'}
            </div>
            <button
              onClick={() => {
                setDropdownOpen(false);
                logout();
              }}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
            >
              <LogOut size={16} />
              Logout
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
