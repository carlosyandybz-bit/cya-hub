"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import styles from "./environment-indicator.module.css";

const STAGING_PROJECT_REF = "qlngfkzmncihtdzktcmd";

function clientProjectRef(client: SupabaseClient) {
  const supabaseUrl = (client as SupabaseClient & { supabaseUrl?: string }).supabaseUrl ?? "";
  try {
    return new URL(supabaseUrl).hostname.split(".")[0] ?? "";
  } catch {
    return "";
  }
}

/**
 * Product-safe environment marker.
 *
 * This component deliberately knows only about the deployed data environment.
 * It must never import or depend on STAGING_ONLY laboratory code.
 */
export function EnvironmentIndicator({ client }: { client: SupabaseClient }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let active = true;

    async function inspect() {
      if (clientProjectRef(client) !== STAGING_PROJECT_REF) {
        if (active) setVisible(false);
        return;
      }

      const result = await client.rpc("is_current_user_admin");
      if (active) setVisible(!result.error && result.data === true);
    }

    void inspect();
    return () => { active = false; };
  }, [client]);

  if (!visible) return null;
  return <span className={styles.indicator} aria-label="Entorno de staging">STG</span>;
}
