import React from 'react';
import { Star, MessageCircle, Mail, TrendingUp, Inbox, Share2, Send, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { SectionHeader } from '@/components/dashboard/SectionHeader';
import { KpiCard } from '@/components/dashboard/KpiCard';
import { ChartCard } from '@/components/dashboard/ChartCard';
import { Card } from '@/components/ui/card';
import { useReviewsInsights } from '@/hooks/insights/useReviewsInsights';
import { useWhatsAppInsights } from '@/hooks/insights/useWhatsAppInsights';
import { useEmailInsights } from '@/hooks/insights/useEmailInsights';
import { useCompetitorsInsights } from '@/hooks/insights/useCompetitorsInsights';
import { useInfoEmailInsights } from '@/hooks/insights/useInfoEmailInsights';
import { useSocialInsights } from '@/hooks/insights/useSocialInsights';
import { useWelcomeInsights } from '@/hooks/insights/useWelcomeInsights';
import { useDateRange } from '@/contexts/DateRangeContext';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { tooltipStyle, tooltipItemStyle, tooltipLabelStyle, lineCursor } from '@/components/dashboard/chartTheme';

const tile = (to: string, icon: React.ReactNode, label: string, value: string | number, hint?: string, tone: 'primary' | 'accent' | 'magenta' = 'primary') => ({
  to, icon, label, value, hint, tone,
});

const Overview: React.FC = () => {
  const { label } = useDateRange();
  const reviews = useReviewsInsights();
  const wa = useWhatsAppInsights();
  const email = useEmailInsights();
  const comps = useCompetitorsInsights();
  const info = useInfoEmailInsights();
  const social = useSocialInsights();
  const welcome = useWelcomeInsights();

  const tiles = [
    tile('/dashboard/reviews', <Star className="h-5 w-5" />, 'Reviews', reviews.data?.kpis.total ?? 0, `Avg ${(reviews.data?.kpis.avg ?? 0).toFixed(2)} / 5`, 'primary'),
    tile('/dashboard/whatsapp', <MessageCircle className="h-5 w-5" />, 'WhatsApp', wa.data?.kpis.total ?? 0, `${wa.data?.kpis.uniqueGuests ?? 0} guests`, 'accent'),
    tile('/dashboard/email', <Mail className="h-5 w-5" />, 'Email Threads', email.data?.kpis.total ?? 0, `${email.data?.kpis.inbound ?? 0} inbound`, 'magenta'),
    tile('/dashboard/competitors', <TrendingUp className="h-5 w-5" />, 'Comp Rank', comps.data?.kpis.ourRank ? `#${comps.data.kpis.ourRank}` : '—', `of ${comps.data?.kpis.totalHotels ?? 0} hotels`, 'primary'),
    tile('/dashboard/info-email', <Inbox className="h-5 w-5" />, 'Info Emails', info.data?.kpis.total ?? 0, `${info.data?.kpis.forwarded ?? 0} forwarded`, 'accent'),
    tile('/dashboard/social', <Share2 className="h-5 w-5" />, 'Social DMs', social.data?.kpis.totalDMs ?? 0, `${social.data?.kpis.igComments ?? 0} IG comments`, 'magenta'),
    tile('/dashboard/welcome', <Send className="h-5 w-5" />, 'Welcome Sent', welcome.data?.kpis.sent ?? 0, `${welcome.data?.kpis.successRate ?? 0}% success`, 'primary'),
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <SectionHeader
        title="Operations Overview"
        subtitle={`Live insights for ${label} · Two Seasons Hotel`}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {tiles.map((t) => (
          <Link key={t.to} to={t.to} className="group">
            <KpiCard label={t.label} value={t.value} hint={t.hint} tone={t.tone as any} />
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Reviews · daily" description="Volume per day in selected range">
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={reviews.data?.trend || []}>
              <defs>
                <linearGradient id="ovReviews" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.6} />
                  <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
              <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} cursor={lineCursor} />
              <Area type="monotone" dataKey="value" stroke="hsl(var(--chart-1))" fill="url(#ovReviews)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="WhatsApp · daily" description="Guest conversations per day">
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={wa.data?.trend || []}>
              <defs>
                <linearGradient id="ovWA" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--chart-2))" stopOpacity={0.6} />
                  <stop offset="95%" stopColor="hsl(var(--chart-2))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
              <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} cursor={lineCursor} />
              <Area type="monotone" dataKey="value" stroke="hsl(var(--chart-2))" fill="url(#ovWA)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <Card className="bg-card-gradient border-border/60 p-5">
        <h3 className="font-display font-semibold mb-3">Quick links</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {tiles.map((t) => (
            <Link key={t.to + '-l'} to={t.to} className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg border border-border bg-muted/20 hover:bg-muted/40 hover:border-primary/40 transition-colors text-sm">
              <span className="flex items-center gap-2">{t.icon}<span>{t.label}</span></span>
              <ArrowRight className="h-3.5 w-3.5 opacity-60" />
            </Link>
          ))}
        </div>
      </Card>
    </div>
  );
};

export default Overview;
