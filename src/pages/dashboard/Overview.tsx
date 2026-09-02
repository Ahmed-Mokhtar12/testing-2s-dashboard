import React, { useMemo } from 'react';
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
import { useDateRange } from '@/contexts/useDateRange';
import { useIsMobile } from '@/hooks/use-mobile';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { tooltipStyle, tooltipItemStyle, tooltipLabelStyle, lineCursor } from '@/components/dashboard/chartTheme';

type TileTone = 'primary' | 'accent' | 'magenta';

/** Just the two flags each tile needs from its react-query result. */
type QueryState = { isLoading: boolean; isError: boolean };

const tile = (
  to: string,
  icon: React.ReactNode,
  label: string,
  q: QueryState,
  value: string | number,
  hint?: string,
  tone: TileTone = 'primary',
) => ({ to, icon, label, value, hint, tone, loading: q.isLoading, error: q.isError });

const Overview: React.FC = () => {
  const { label } = useDateRange();
  const isMobile = useIsMobile();
  const reviews = useReviewsInsights();
  const wa = useWhatsAppInsights();
  const email = useEmailInsights();
  const comps = useCompetitorsInsights();
  const info = useInfoEmailInsights();
  const social = useSocialInsights();
  const welcome = useWelcomeInsights();
  const chartHeight = isMobile ? 180 : 240;
  const axisFontSize = isMobile ? 9 : 11;

  // Deliberately NOT memoised. Each tile now depends on its query's isLoading
  // and isError as well as its data, and a useMemo over 21 flags is a
  // stale-dependency trap for the sake of rebuilding seven small objects.
  const tiles = [
    tile('/dashboard/reviews', <Star className="h-5 w-5" />, 'Reviews', reviews, reviews.data?.kpis.total ?? 0, `Avg ${(reviews.data?.kpis.avg ?? 0).toFixed(2)} / 5`, 'primary'),
    tile('/dashboard/whatsapp', <MessageCircle className="h-5 w-5" />, 'WhatsApp', wa, wa.data?.kpis.total ?? 0, `${wa.data?.kpis.uniqueGuests ?? 0} guests`, 'accent'),
    // `kpis.inbound` never existed on useEmailInsights ({ total, newEmails,
    // replyEmails, uniqueGuests }) — so this sub-line read "0 inbound" on
    // every load regardless of the data, and `?? 0` hid it. This dataset is
    // Sera's SENT mail, so there is no inbound count to show; newEmails is
    // the same figure the Email page labels "New Emails".
    tile('/dashboard/email', <Mail className="h-5 w-5" />, 'Email Threads', email, email.data?.kpis.total ?? 0, `${email.data?.kpis.newEmails ?? 0} new`, 'magenta'),
    tile('/dashboard/competitors', <TrendingUp className="h-5 w-5" />, 'Comp Rank', comps, comps.data?.kpis.ourRank ? `#${comps.data.kpis.ourRank}` : '—', `of ${comps.data?.kpis.totalHotels ?? 0} hotels`, 'primary'),
    tile('/dashboard/info-email', <Inbox className="h-5 w-5" />, 'Info Emails', info, info.data?.kpis.total ?? 0, `${info.data?.kpis.forwarded ?? 0} forwarded`, 'accent'),
    tile('/dashboard/social', <Share2 className="h-5 w-5" />, 'Social DMs', social, social.data?.kpis.totalDMs ?? 0, `${social.data?.kpis.igComments ?? 0} IG comments`, 'magenta'),
    tile('/dashboard/welcome', <Send className="h-5 w-5" />, 'Welcome Sent', welcome, welcome.data?.kpis.sent ?? 0, `${welcome.data?.kpis.successRate ?? 0}% success`, 'primary'),
  ];

  const reviewsTrend = useMemo(() => reviews.data?.trend || [], [reviews.data]);
  const whatsAppTrend = useMemo(() => wa.data?.trend || [], [wa.data]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 short:gap-3 animate-fade-in">
      <SectionHeader
        title="Operations Overview"
        subtitle={`Live insights for ${label} · Two Seasons Hotel`}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 short:gap-2 shrink-0">
        {tiles.map((currentTile) => (
          <Link key={currentTile.to} to={currentTile.to} className="group">
            <KpiCard
              label={currentTile.label}
              value={currentTile.value}
              hint={currentTile.hint}
              tone={currentTile.tone}
              loading={currentTile.loading}
              error={currentTile.error}
            />
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:flex-1 lg:min-h-0">
        <ChartCard title="Reviews · daily" description="Volume per day in selected range" fill error={reviews.isError}>
          <ResponsiveContainer width="100%" height={isMobile ? chartHeight : '100%'} minHeight={isMobile ? undefined : 160}>
            <AreaChart data={reviewsTrend}>
              <defs>
                <linearGradient id="ovReviews" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.6} />
                  <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
              <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={axisFontSize} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={axisFontSize} />
              <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} cursor={lineCursor} />
              <Area type="monotone" dataKey="value" stroke="hsl(var(--chart-1))" fill="url(#ovReviews)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="WhatsApp · daily" description="Guest conversations per day" fill error={wa.isError}>
          <ResponsiveContainer width="100%" height={isMobile ? chartHeight : '100%'} minHeight={isMobile ? undefined : 160}>
            <AreaChart data={whatsAppTrend}>
              <defs>
                <linearGradient id="ovWA" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--chart-2))" stopOpacity={0.6} />
                  <stop offset="95%" stopColor="hsl(var(--chart-2))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
              <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={axisFontSize} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={axisFontSize} />
              <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} cursor={lineCursor} />
              <Area type="monotone" dataKey="value" stroke="hsl(var(--chart-2))" fill="url(#ovWA)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <Card className="bg-card-gradient border-border/60 p-5 short:p-3 shrink-0">
        <h2 className="font-display font-semibold mb-3 short:mb-2">Quick links</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-2">
          {tiles.map((currentTile) => (
            <Link key={`${currentTile.to}-l`} to={currentTile.to} className="flex items-center justify-between gap-2 px-3 py-2.5 short:py-1.5 rounded-lg border border-border bg-muted/20 hover:bg-muted/40 hover:border-primary/40 transition-colors text-sm min-w-0">
              <span className="flex items-center gap-2 min-w-0 overflow-hidden">
                <span className="shrink-0">{currentTile.icon}</span>
                <span className="truncate">{currentTile.label}</span>
              </span>
              <ArrowRight className="h-3.5 w-3.5 opacity-60 shrink-0 short:hidden" />
            </Link>
          ))}
        </div>
      </Card>
    </div>
  );
};

export default Overview;
