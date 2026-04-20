

## الخطة النهائية — Insights Dashboard + AI Chat Side Panel

### Layout عام
```text
┌──────────┬──────────────────────────┬────────────┐
│          │  Top bar: DateRange      │            │
│ Sidebar  ├──────────────────────────┤  AI Chat   │
│  (left)  │                          │  (Sera)    │
│  icons + │   Dashboard content      │  right     │
│  labels  │   (KPIs + Charts)        │  drawer    │
│          │                          │  collapsib.│
└──────────┴──────────────────────────┴────────────┘
```

### تصميم — Neon-Soft (شدّة 2/5)
مستوحى من الصورة لكن أهدأ: خلفية `#0f0a1f`، cards `#1a1430` مع border `#2a2348`، نيون خفيف:
- primary `#a78bfa` (purple soft)، accent `#67e8f9` (cyan soft)، magenta `#f0abfc` للـ highlights
- glow خفيف على KPI numbers و chart strokes (drop-shadow بـ 30% opacity)
- خطوط: Space Grotesk (headings) + DM Sans (body)
- charts: recharts بـ semantic tokens، donut/area/bar مثل المرجع

### الـ AI Chat Side Panel (يمين)
- مكوّن `RightChatPanel` يحتوي الـ AI Chat الحالي (`Index.tsx` content)
- مغلق افتراضياً، زر عائم floating bottom-right (icon: MessageCircle) يفتحه
- عند الفتح: drawer 400px من اليمين (لا overlay، يدفع المحتوى) — `Sheet` modal=false
- زر إغلاق X في الـ header

### الـ Sidebar (يسار) — collapsible icon
عناصر: Overview, Reviews, WhatsApp, Email, Competitor Rates, Info Email, Social Engagement, Welcome Messages

### Date Range Picker (top bar)
`DateRangeContext` global + presets: Yesterday (default), Last 7 days, Last 30 days, Custom (shadcn Calendar range mode). كل الـ hooks تستهلكه عبر React Query keys.

### الأقسام السبعة (KPIs + Charts بحسب طلبك)

**1) Reviews** — `reviews` (استبعاد `khaldia_reviews`)
- KPIs: Total reviews, Average score, Positive (≥4), Negative (≤2.5)
- Charts: trend يومي (area)، Source breakdown (donut)، Score distribution (bar)

**2) WhatsApp** — `Chat History` + `burst_messaging`
- KPIs: Total messages, Unique guests, Human-controlled, Archived
- Charts: messages/day (area)، AI vs human reply (donut)، Top guests (bar)

**3) Email** — `email_threads` + `website_email_threads` + `burst_email`
- KPIs: Total threads, Inbound, Outbound, By platform count
- Charts: threads/day stacked by source، Department breakdown، Category nature donut

**4) Competitor Rates** — استبعاد `dry_run=true` و `status≠'success'`
- KPIs: Our avg rate, Comp set avg, Diff (AED + %), **Our rank in comp set**
- Charts: rate trend per hotel (multi-line)، avg per hotel bar، # days we were lowest

**5) Info Email Audit** — `info_email_audit_log`
- KPIs: Total received, Total forwarded (sum), Forwarded by department breakdown total, Deleted
- Charts: action donut (forwarded/deleted/...)، department bar، confidence distribution

**6) Social Engagement** — `social_engagement_logs`
- KPIs: Instagram comments, Total DMs (IG+FB), IG DMs, FB DMs
- Charts: platform split donut (IG/FB)، event_type split (DM vs comment)، nature breakdown (inquiry/booking/banquet) من `notes`/`status`

**7) Welcome Messages** — `welcome_message_success_log` (تجميع client-side حسب `sent_date`)
- KPIs: Total arrivals (unique `arrival_date`+guest)، Welcome messages sent, Success rate, Unique guests
- Charts: sent/day line، status donut

### Routing
- `/` → Dashboard Overview (7 KPI cards + روابط للأقسام)
- `/dashboard/reviews`, `/dashboard/whatsapp`, `/dashboard/email`, `/dashboard/competitors`, `/dashboard/info-email`, `/dashboard/social`, `/dashboard/welcome`
- `/whatsapp-inbox` → الـ WhatsApp Web clone القديم (بدون تغيير)
- AI Chat لم يعد له route — موجود كـ side panel في كل صفحات الـ Dashboard

### ملفات جديدة
```
src/contexts/DateRangeContext.tsx
src/layouts/DashboardShell.tsx
src/components/dashboard/{AppSidebar,RightChatPanel,DateRangePicker,KpiCard,ChartCard,SectionHeader,DataTable}.tsx
src/pages/dashboard/{Overview,Reviews,WhatsApp,Email,Competitors,InfoEmail,Social,Welcome}.tsx
src/hooks/insights/{useReviews,useWhatsApp,useEmail,useCompetitors,useInfoEmail,useSocial,useWelcome}Insights.ts
```

### ملفات معدَّلة
- `src/App.tsx` — routes جديدة + يلفّ بـ `DashboardShell` و `DateRangeContext`
- `src/index.css` + `tailwind.config.ts` — Neon-Soft tokens + Google Fonts
- `index.html` — preconnect للـ Fonts
- محتوى الـ AI chat الحالي يُستخرج من `Index.tsx` إلى `RightChatPanel`

### خارج النطاق (v1)
Auth/RLS, CSV export, realtime subscriptions, ربط arrivals بـ PMS

