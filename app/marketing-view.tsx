"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
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
  return <LegacyMarketingView
    {...props}
    contacts={normalizeContacts(props.contacts)}
    content={normalizeContent(props.content)}
    campaigns={normalizeCampaigns(props.campaigns)}
    recipients={normalizeRecipients(props.recipients)}
  />;
}
