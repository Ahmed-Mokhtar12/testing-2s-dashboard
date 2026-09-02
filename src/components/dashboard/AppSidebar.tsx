import React from 'react';
import { LayoutDashboard, Star, MessageCircle, Mail, TrendingUp, Inbox, Share2, Send, GraduationCap } from 'lucide-react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';
import twoSeasonsLogo from '@/assets/two-seasons-logo-full.png';

const items = [
  { title: 'Overview', url: '/', icon: LayoutDashboard },
  { title: 'Reviews', url: '/dashboard/reviews', icon: Star },
  { title: 'WhatsApp', url: '/dashboard/whatsapp', icon: MessageCircle },
  { title: 'Sera Emails', url: '/dashboard/email', icon: Mail },
  { title: 'Competitor Rates', url: '/dashboard/competitors', icon: TrendingUp },
  { title: 'Info Email', url: '/dashboard/info-email', icon: Inbox },
  { title: 'Social Engagement', url: '/dashboard/social', icon: Share2 },
  { title: 'Welcome Messages', url: '/dashboard/welcome', icon: Send },
  { title: 'Hotel Training', url: '/dashboard/hotel-training', icon: GraduationCap },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const location = useLocation();

  const isActive = (url: string) =>
    url === '/' ? location.pathname === '/' : location.pathname.startsWith(url);

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarContent className="bg-sidebar">
        <div className="px-3 py-5 flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-xl bg-white flex items-center justify-center shrink-0 overflow-hidden ring-1 ring-border">
            <img src={twoSeasonsLogo} alt="Two Seasons" className="w-full h-full object-contain p-0.5" />
          </div>
          {!collapsed && (
            <div className="flex flex-col">
              <span className="font-display font-semibold text-sidebar-foreground text-sm leading-tight">Two Seasons</span>
              <span className="text-[11px] text-muted-foreground tracking-wider uppercase">Insights</span>
            </div>
          )}
        </div>

        <nav aria-label="Main">
          <SidebarGroup>
            {!collapsed && <SidebarGroupLabel className="text-[10px] tracking-widest uppercase text-muted-foreground/70">Dashboard</SidebarGroupLabel>}
            <SidebarGroupContent>
              <SidebarMenu>
                {items.map((item) => {
                  const active = isActive(item.url);
                  return (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton asChild tooltip={item.title}>
                        <NavLink
                          to={item.url}
                          end={item.url === '/'}
                          className={
                            active
                              ? 'bg-sidebar-accent text-primary font-medium border-l-2 border-primary'
                              : 'text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground'
                          }
                        >
                          <item.icon className={active ? 'text-primary' : ''} />
                          {!collapsed && <span>{item.title}</span>}
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </nav>
      </SidebarContent>
    </Sidebar>
  );
}
