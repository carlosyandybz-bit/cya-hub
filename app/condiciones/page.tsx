import styles from "../legal.module.css";

export const metadata = { title: "Condiciones del servicio · CYA Hub" };

export default function TermsPage() {
  return (
    <main className={styles.page}>
      <article className={styles.article}>
        <p className={styles.eyebrow}>Carlos & Andy · CYA Hub</p>
        <h1 className={styles.title}>Condiciones del servicio</h1>
        <p className={styles.updated}>Última actualización: 18 de agosto de 2026</p>

        <section className={styles.section}>
          <h2>1. Objeto</h2>
          <p>CYA Hub es una aplicación de Carlos & Andy para organizar y prestar funciones relacionadas con alumnado, clases, enseñanza, agenda, comunicaciones y gestión de sus servicios.</p>
        </section>

        <section className={styles.section}>
          <h2>2. Cuenta y acceso</h2>
          <p>El usuario es responsable de utilizar su cuenta de forma legítima y de mantener seguras sus credenciales. Las funciones disponibles pueden variar según el perfil y los permisos asignados dentro de CYA Hub.</p>
        </section>

        <section className={styles.section}>
          <h2>3. Integraciones externas</h2>
          <p>CYA Hub puede conectarse con servicios externos, incluido Google Calendar, cuando el usuario o administrador correspondiente lo autoriza. Estas integraciones dependen también de la disponibilidad y condiciones del proveedor externo.</p>
        </section>

        <section className={styles.section}>
          <h2>4. Google Calendar</h2>
          <p>La integración de calendario puede utilizar los calendarios autorizados para mostrar eventos y disponibilidad en CYA Hub. Los eventos vinculados a funciones de CYA Hub, como determinadas clases, podrán crearse y mantenerse sincronizados con Google Calendar. Los eventos externos que se presenten como solo lectura no serán modificados por CYA Hub.</p>
        </section>

        <section className={styles.section}>
          <h2>5. Uso adecuado</h2>
          <p>No se permite utilizar CYA Hub para acceder sin autorización a información ajena, interferir en el funcionamiento del servicio, eludir controles de acceso o realizar actividades contrarias a la normativa aplicable.</p>
        </section>

        <section className={styles.section}>
          <h2>6. Disponibilidad y cambios</h2>
          <p>Las funciones pueden evolucionar, modificarse o suspenderse por mantenimiento, seguridad, cambios técnicos o mejoras del producto. Se procurará preservar la integridad de los datos y la continuidad de las funciones esenciales.</p>
        </section>

        <section className={styles.section}>
          <h2>7. Privacidad</h2>
          <p>El tratamiento de datos personales se describe en la <a className={styles.link} href="/privacidad">Política de privacidad de CYA Hub</a>.</p>
        </section>

        <section className={styles.section}>
          <h2>8. Contacto</h2>
          <p>Para consultas sobre CYA Hub o estas condiciones, puedes escribir a <a className={styles.link} href="mailto:hola@carlosyandy.com">hola@carlosyandy.com</a>.</p>
        </section>
      </article>
    </main>
  );
}
