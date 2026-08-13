"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { useEffect, useMemo, useState } from "react";
import {
  MarketingView as LegacyMarketingView,
  type CampaignMetric,
  type CommunicationRecipient,
  type CrmContact,
  type DriveMedia,
  type MarketingCampaign,
  type MarketingContent,
  type MarketingEvent,
  type MarketingRate,
} from "./marketing-view-legacy";

export type {
  CampaignMetric,
  CommunicationRecipient,
  CrmContact,
  DriveMedia,
  MarketingCampaign,
  MarketingContent,
  MarketingEvent,
  MarketingRate,
} from "./marketing-view-legacy";

type BonusSummary = {
  person_id: number;
  active_grant_count: number;
  active_balance_minutes: number;
  latest_grant_label: string | null;
  latest_grant_price_cents: number | null;
  latest_grant_payment_status: string | null;
  latest_grant_purchased_at: string | null;
};

function asArray<T>(value: T[] | T | null | undefined): T[] {
  if (Array.isArray(value)) return value;
  return value == null ? [] : [value];
}

function normalizeContacts(contacts: CrmContact[]): CrmContact[] {
  return asArray(contacts).map((contact) => {
    const raw = contact as unknown as {
      student_profiles?: CrmContact["student_profiles"] | CrmContact["student_profiles"][number] | null;
      crm_profiles?: CrmContact["crm_profiles"] | CrmContact["crm_profiles"][number] | null;
    };
    return {
      ...contact,
      student_profiles: asArray(raw.student_profiles),
      crm_profiles: asArray(raw.crm_profiles),
    };
  });
}

function normalizeContent(items: MarketingContent[]): MarketingContent[] {
  return asArray(items).map((item) => ({
    ...item,
    marketing_content_media: asArray(item.marketing_content_media),
  }));
}

function normalizeCampaigns(items: MarketingCampaign[]): MarketingCampaign[] {
  return asArray(items).map((item) => ({
    ...item,
    marketing_campaign_media: asArray(item.marketing_campaign_media),
  }));
}

function normalizeRecipients(items: CommunicationRecipient[]): CommunicationRecipient[] {
  return asArray(items).map((item) => ({
    ...item,
    media_snapshot: asArray(item.media_snapshot),
  }));
}

function minutesLabel(total: number) {
  if (total <= 0) return "Sin saldo";
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (!hours) return `${minutes} min`;
  return minutes ? `${hours} h ${minutes} min` : `${hours} h`;
}

function paymentLabel(value: string | null) {
  if (value === "paid") return "Pagado";
  if (value === "pending") return "Pendiente de pago";
  return value || "Sin estado de pago";
}

export function MarketingView(props: {
  db: SupabaseClient;
  contacts: CrmContact[];
  rates: MarketingRate[];
  content: MarketingContent[];
  events: MarketingEvent[];
  campaigns: MarketingCampaign[];
  metrics: CampaignMetric[];
  recipients: CommunicationRecipient[];
  refresh: () => Promise<void>;
  notify: (message: string) => void;
}) {
  const [bonuses, setBonuses] = useState<BonusSummary[]>([]);
  const contacts = useMemo(() => normalizeContacts(props.contacts), [props.contacts]);
  const contactNames = useMemo(() => new Map(contacts.map((contact) => [contact.id, contact.display_name])), [contacts]);

  useEffect(() => {
    let alive = true;
    props.db.rpc("crm_bonus_summary").then(({ data, error }) => {
      if (!alive) return;
      if (error) {
        setBonuses([]);
        return;
      }
      setBonuses(asArray(data as BonusSummary[] | BonusSummary | null));
    });
    return () => { alive = false; };
  }, [props.db, props.refresh]);

  const visibleBonuses = bonuses.filter((bonus) => bonus.active_grant_count > 0 || bonus.latest_grant_label);

  return <>
    {visibleBonuses.length ? <details className="card pad p29-bonus-summary">
      <summary>Bonos vinculados al CRM · {visibleBonuses.length}</summary>
      <div className="p29-bonus-list">
        {visibleBonuses.map((bonus) => <div className="p29-bonus-row" key={bonus.person_id}>
          <span><strong>{contactNames.get(bonus.person_id) ?? "Alumno"}</strong>{bonus.latest_grant_label ? ` · ${bonus.latest_grant_label}` : ""}</span>
          <small>{bonus.active_grant_count} activo{bonus.active_grant_count === 1 ? "" : "s"} · {paymentLabel(bonus.latest_grant_payment_status)}</small>
          <strong>{minutesLabel(bonus.active_balance_minutes)}</strong>
        </div>)}
      </div>
    </details> : null}
    <LegacyMarketingView
      {...props}
      contacts={contacts}
      content={normalizeContent(props.content)}
      campaigns={normalizeCampaigns(props.campaigns)}
      recipients={normalizeRecipients(props.recipients)}
    />
  </>;
}
