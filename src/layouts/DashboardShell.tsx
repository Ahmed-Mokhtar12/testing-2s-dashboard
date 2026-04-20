import React from 'react';
import { Outlet } from 'react-router-dom';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/dashboard/AppSidebar';
import { RightChatPanel } from '@/components/dashboard/RightChatPanel';
import { DateRangePicker } from '@/components/dashboard/DateRangePicker';
import { DateRangeProvider } from '@/contexts/DateRangeContext';

export const DashboardShell: React.FC = () => {
  return (
    <DateRangeProvider>
      <SidebarProvider defaultOpen={true}>
        <div className="min-h-screen flex w-full bg-background">
          <AppSidebar />

          <div className="flex-1 flex flex-col min-w-0">
            {/* Top bar */}
            <header className="h-14 border-b border-border bg-card/40 backdrop-blur flex items-center justify-between px-4 sticky top-0 z-30">
              <div className="flex items-center gap-3">
                <SidebarTrigger className="hover:bg-muted/50" />
                <div className="hidden sm:flex items-center gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
                  <span className="text-xs text-muted-foreground">Live data · Dubai (GMT+4)</span>
                </div>
              </div>
              <DateRangePicker />
            </header>

            <main className="flex-1 overflow-y-auto p-6">
              <Outlet />
            </main>
          </div>

          <RightChatPanel />
        </div>
      </SidebarProvider>
    </DateRangeProvider>
  );
};

export default DashboardShell;
