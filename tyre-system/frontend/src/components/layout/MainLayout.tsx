'use client';

import Sidebar from './Sidebar';
import Header from './Header';
import AuthGuard from './AuthGuard';

interface MainLayoutProps {
  title: string;
  children: React.ReactNode;
}

export default function MainLayout({ title, children }: MainLayoutProps) {
  return (
    <AuthGuard>
      <div className="flex min-h-screen bg-slate-50">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <Header title={title} />
          <main className="flex-1 p-6 overflow-auto">{children}</main>
        </div>
      </div>
    </AuthGuard>
  );
}
