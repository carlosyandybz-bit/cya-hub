import { notFound } from "next/navigation";
import { StagingAccountAccess } from "../staging-account-access";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

const STAGING_PROJECT_REF = "qlngfkzmncihtdzktcmd";

function isStagingRuntime() {
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  try {
    return new URL(rawUrl).hostname === `${STAGING_PROJECT_REF}.supabase.co`;
  } catch {
    return false;
  }
}

export default function StagingAccountsPage() {
  if (!isStagingRuntime()) notFound();

  return (
    <main className={styles.shell} data-staging-only="true">
      <header className={styles.header}>
        <p>STAGING_ONLY · QA ACCESS</p>
        <h1>Identidades de prueba</h1>
        <span>El selector vive exclusivamente en staging. La contraseña se introduce en el momento de uso y nunca forma parte del bundle ni del repositorio.</span>
      </header>
      <StagingAccountAccess />
      <p className={styles.note}>El cambio de vista normal dentro de una misma cuenta sigue disponible en el menú de cuenta del producto. Esta superficie solo cambia entre identidades QA.</p>
    </main>
  );
}
