import styles from "../legal.module.css";

export const metadata = { title: "Política de privacidad · CYA Hub" };

export default function PrivacyPage() {
  return (
    <main className={styles.page}>
      <article className={styles.article}>
        <p className={styles.eyebrow}>Carlos & Andy · CYA Hub</p>
        <h1 className={styles.title}>Política de privacidad</h1>
        <p className={styles.updated}>Última actualización: 18 de agosto de 2026</p>

        <section className={styles.section}>
          <h2>1. Responsable y finalidad</h2>
          <p>CYA Hub es una aplicación de Carlos & Andy destinada a gestionar alumnado, clases, enseñanza, agenda, comunicaciones y actividades relacionadas con sus servicios. Los datos se tratan únicamente para prestar, organizar, administrar y mejorar estas funciones.</p>
        </section>

        <section className={styles.section}>
          <h2>2. Datos que podemos tratar</h2>
          <p>Según las funciones utilizadas, CYA Hub puede tratar datos de cuenta y contacto, información necesaria para gestionar clases y servicios, contenidos pedagógicos, comunicaciones y datos de calendario autorizados por el usuario.</p>
        </section>

        <section className={styles.section}>
          <h2>3. Google Calendar</h2>
          <p>Cuando se autoriza la integración con Google Calendar, CYA Hub puede consultar los calendarios autorizados y los datos de sus eventos para mostrarlos en la agenda y detectar disponibilidad. También puede crear, actualizar o cancelar en Google Calendar los eventos gestionados por CYA Hub cuando corresponda.</p>
          <p>CYA Hub no solicita la contraseña de la cuenta de Google. El acceso se realiza mediante OAuth de Google y queda limitado a los permisos expresamente autorizados. Los datos obtenidos de Google Calendar no se utilizan con fines publicitarios ni se venden a terceros.</p>
        </section>

        <section className={styles.section}>
          <h2>4. Comunicaciones e integraciones</h2>
          <p>La aplicación puede utilizar proveedores técnicos necesarios para funciones como correo electrónico, almacenamiento, calendario y otras integraciones expresamente configuradas. Solo se comparte con cada proveedor la información necesaria para ejecutar la función correspondiente.</p>
        </section>

        <section className={styles.section}>
          <h2>5. Conservación y seguridad</h2>
          <p>Los datos se conservan durante el tiempo necesario para prestar el servicio y cumplir las obligaciones aplicables. Se aplican medidas técnicas y organizativas destinadas a proteger las credenciales, limitar el acceso y evitar accesos no autorizados.</p>
        </section>

        <section className={styles.section}>
          <h2>6. Control sobre las integraciones</h2>
          <p>El acceso concedido a Google puede revocarse desde la configuración de seguridad de la propia cuenta de Google. La revocación impedirá que CYA Hub continúe accediendo a los recursos afectados hasta una nueva autorización.</p>
        </section>

        <section className={styles.section}>
          <h2>7. Derechos y contacto</h2>
          <p>Para consultas sobre privacidad, acceso, rectificación, supresión u otras solicitudes relacionadas con los datos tratados por CYA Hub, puedes escribir a <a className={styles.link} href="mailto:hola@carlosyandy.com">hola@carlosyandy.com</a>.</p>
        </section>

        <section className={styles.section}>
          <h2>8. Cambios</h2>
          <p>Esta política puede actualizarse cuando cambien las funciones, integraciones o requisitos aplicables. La fecha de actualización se mostrará en esta página.</p>
        </section>
      </article>
    </main>
  );
}
