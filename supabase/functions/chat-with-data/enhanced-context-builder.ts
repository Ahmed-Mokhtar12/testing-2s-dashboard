import { ContextSectionBuilder } from './context-section-builder.ts';
import { getDubaiTimezoneContext, DEFAULT_LANGUAGE } from './timezone-utils.ts';
import type { DashboardSnapshot, DashboardDomain } from './context-data-fetcher.ts';

// The snapshot rendered by index.ts also carries the recently-uploaded
// document context fetched via the `get_recent_document_context` RPC — that
// RPC is not one of the DashboardSnapshot domain tables, so it rides along
// as an extra, optional field rather than living in DashboardSnapshot.
export interface ContextSnapshot extends DashboardSnapshot {
  documentContext?: any[];
}

interface DomainRenderSpec {
  key: keyof DashboardSnapshot & string;
  label: string;
  cap: number;
  renderRow: (row: any) => string;
}

// One entry per DashboardSnapshot domain: display label, how many rendered
// rows to cap the section at, and how to format a single row compactly.
const DOMAIN_SECTIONS: DomainRenderSpec[] = [
  { key: 'reviews', label: 'Reviews', cap: 25, renderRow: (r) =>
    `${r['Date']} | ${r.Source} | score ${r.Score} | ${r.Author ?? ''} | ${(r.Text ?? r.Title ?? '').slice(0, 200)}` },
  { key: 'whatsapp', label: 'WhatsApp', cap: 40, renderRow: (r) =>
    `${r.created_at} | ${r['Sender Number']} ${r.Name ?? ''} | guest: ${(r['Sender Message'] ?? '').slice(0, 150)} | reply: ${((r.human_reply ?? r['Ai Reply']) ?? '').slice(0, 150)}` },
  { key: 'seraEmails', label: 'Sera Emails', cap: 15, renderRow: (r) =>
    `${r.sent_at} | ${r.email_type} | ${r.category ?? ''} | ${r.guest_name ?? ''} | ${(r.email_subject ?? '').slice(0, 120)}` },
  { key: 'infoEmails', label: 'Info Emails', cap: 15, renderRow: (r) =>
    `${r.created_at} | ${r.action} | ${r.department ?? ''} | conf ${r.confidence ?? ''} | ${(r.subject ?? '').slice(0, 120)}` },
  { key: 'competitorRates', label: 'Competitor Rates', cap: 15, renderRow: (r) =>
    `${r.report_date} | ${r.hotel_name} | checkin ${r.checkin_date} | AED ${r.converted_price_aed}${r.is_lowest_for_day ? ' (lowest)' : ''}` },
  { key: 'social', label: 'Social', cap: 15, renderRow: (r) =>
    `${r.created_at} | ${r.platform}/${r.channel} | ${r.event_type} | ${(r.guest_message_text ?? '').slice(0, 120)}${r.escalation_flag ? ' [ESCALATED]' : ''}` },
  { key: 'welcome', label: 'Welcome Messages', cap: 15, renderRow: (r) =>
    `${r.sent_date} | ${r.full_name ?? ''} | room ${r.room_number ?? ''} | ${r.status}` },
];

export class EnhancedContextBuilder {
  buildContextWithDocuments(snapshot: ContextSnapshot, userMessage: string): string {
    const contextSections: string[] = [];

    // Add clear database access statement and role definition
    contextSections.push(ContextSectionBuilder.buildRoleAndAccessSection());

    // Add Dubai timezone and language context
    contextSections.push('⏰ OPERATIONAL CONTEXT:');
    contextSections.push(getDubaiTimezoneContext());
    contextSections.push(`Default Language: ${DEFAULT_LANGUAGE}`);
    contextSections.push('Hotel operates in Dubai timezone (GST, UTC+4) for all business operations.');
    contextSections.push('');

    // Recently uploaded documents (highest priority context, when present)
    contextSections.push(this.buildDocumentContextSection(snapshot.documentContext ?? []));

    // One section per real dashboard domain, each showing the true
    // in-range count and the (possibly capped) rows actually fetched.
    for (const spec of DOMAIN_SECTIONS) {
      contextSections.push(this.renderDomainSection(spec.label, snapshot[spec.key] as DashboardDomain, spec.cap, spec.renderRow));
    }

    // Sera must say data was unavailable rather than invent it, so any
    // per-domain fetch failure is surfaced verbatim, not swallowed.
    if (snapshot.errors.length > 0) {
      contextSections.push(['### Data access errors', ...snapshot.errors.map((e) => `- ${e}`)].join('\n'));
    }

    // Add clear instructions for using the database data
    contextSections.push(ContextSectionBuilder.buildInstructionsSection(userMessage));

    const context = contextSections.filter(Boolean).join('\n\n');

    console.log('🏗️ Built enhanced context from real dashboard data, length:', context.length);

    return context;
  }

  private renderDomainSection(
    label: string,
    domain: DashboardDomain,
    cap: number,
    renderRow: (row: any) => string,
  ): string {
    const lines = [`### ${label} (${domain.count ?? 'unknown'} rows in range; showing ${domain.rows.length})`];
    if (domain.rows.length === 0) {
      lines.push('No rows in the selected range.');
    } else {
      domain.rows.slice(0, cap).forEach((row) => lines.push(renderRow(row)));
    }
    return lines.join('\n');
  }

  private buildDocumentContextSection(documents: any[]): string {
    const withContent = documents.filter((doc: any) => doc?.content);
    if (withContent.length === 0) return '';

    const lines = ['🔥 RECENTLY UPLOADED DOCUMENTS (PRIORITY CONTEXT):', ''];
    withContent.forEach((doc: any, index: number) => {
      lines.push(`=== DOCUMENT ${index + 1}: ${doc.document_filename || 'Document'} ===`);
      lines.push(`Category: ${(doc.document_category ?? 'general').toString().toUpperCase()}`);
      if (typeof doc.relevance_score === 'number') {
        lines.push(`Relevance Score: ${(doc.relevance_score * 100).toFixed(0)}%`);
      }
      lines.push(`Chunk ${doc.chunk_index ?? 0}`);
      lines.push('');
      lines.push('FULL CONTENT:');
      lines.push(doc.content);
      lines.push('');
      lines.push('='.repeat(50));
      lines.push('');
    });
    lines.push('⚠️ CRITICAL: Base your responses primarily on the document content shown above. This is the most relevant and recent information available.');
    return lines.join('\n');
  }
}
