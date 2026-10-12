# Publicar Conversa en Google Play, paso a paso

Guía para el propietario, en Windows. Andina Music tiene una cuenta de **organización** en Play Console con D-U-N-S, así que **no aplica** la regla de 12 testers durante 14 días de las cuentas personales nuevas. Aun así, empieza con una **prueba interna**.

Archivos que vas a usar:

| Qué | Dónde |
|---|---|
| Textos de la ficha, gráficos y capturas | carpeta `play/` |
| Respuestas de los formularios | `play/data-safety-es.md`, `play/app-access-es.md`, `play/content-rating-es.md`, `play/declarations-es.md` |
| Páginas legales | `public/legal/` (se publican en `https://app.mutuomatch.com/legal/…`) |
| App Android | `android/twa-manifest.json` y `android/README.md` |

---

## Probar hoy, sin esperar a Google Play

Requisito para ambas opciones: el servidor actualizado y la app pública abriendo en `https://app.mutuomatch.com` (sin Cloudflare Access).

**Opción A, la más rápida (2 minutos):** en el Android, abre `https://app.mutuomatch.com` en **Chrome** → menú ⋮ → **Instalar app**. Chrome crea una app real (icono, pantalla completa, notificaciones), igual a la de Play por dentro, sin instalar archivos de origen desconocido.

**Opción B, archivo .apk para instalar y compartir (10 minutos, en la PC):**
1. Abre **pwabuilder.com** (herramienta gratuita de Microsoft), escribe `https://app.mutuomatch.com` y pulsa **Start**.
2. **Package for stores → Android → Generate package.** Package ID: `com.andinamusic.conversa`. En **Signing key** deja **Create new**. Descarga el .zip.
3. Del .zip:
   - `*.apk`: es el archivo para instalar. Pásalo al teléfono, ábrelo y permite «Instalar apps desconocidas» para ese origen.
   - `signing.keystore` y `signing-key-info.txt`: la llave y sus contraseñas. **Guárdalas en un lugar seguro y no las envíes a nadie.** Puedes usarla luego como llave de subida en Play.
   - `assetlinks.json`: contiene la huella SHA-256 de esa llave.
4. Para que la app abra sin la barra de dirección, pon en el servidor esa huella (paso 7, `CONVERSA_ANDROID_SHA256`) con el paquete `com.andinamusic.conversa`. Sin esto la app funciona igual, solo que con la barra arriba.
5. Si después instalas la versión de Play, desinstala antes esta: están firmadas con llaves distintas.

## Antes de empezar (comprobaciones)

1. La web está publicada en `https://app.mutuomatch.com` y **cualquiera** puede abrirla. Si delante hay Cloudflare Access u otro inicio de sesión, la app de Android no funcionará y Google no podrá revisarla.
2. Ya existen las cuentas de usuario con número y contraseña, **Ajustes → Eliminar cuenta** y la cuenta demo para revisores (ver `play/app-access-es.md`).
3. Desde tu celular, **con datos móviles**, abren estas tres páginas:
   - `https://app.mutuomatch.com/legal/privacidad.html`
   - `https://app.mutuomatch.com/legal/terminos.html`
   - `https://app.mutuomatch.com/legal/eliminar-cuenta.html`

## 1. Datos ya completados

Las páginas legales y la ficha ya están rellenadas con los datos reales:

- **Responsable:** Andina Music L.L.C. — 30 N Gould St Ste N, Sheridan, WY 82801-6317, Estados Unidos.
- **Correo de contacto:** cobol@andinamusic.com
- **Dominio de la app:** app.mutuomatch.com
- **Fecha de las páginas:** 12 de octubre de 2026
- **Plazos:** 30 días para copias de seguridad y para el borrado de cuenta.
- **Servidor:** Hostinger, en Estados Unidos.
- **Cuenta demo:** 51900000000 / ConversaDemo2026

Pendiente, y conviene hacerlo antes de un lanzamiento público amplio:

- **Confirmar el país del servidor:** se puso Estados Unidos. Si tu VPS de Hostinger está en otro país (lo ves en hPanel → VPS), cámbialo en `public/legal/privacidad.html` y `play/data-safety-es.md`.
- **Revisión legal:** las partes marcadas «Pendiente: confirmar con asesoría legal» (ley aplicable y jurisdicción) las debe revisar un abogado, por ser una sociedad de EE. UU. que presta el servicio a usuarios en Perú.
- **Keystore de subida:** la ruta `[RUTA-AL-KEYSTORE]` en `android/twa-manifest.json` solo importa si vuelves a compilar tú mismo; el `.aab` ya está firmado y listo para subir.

## 2. Crear el archivo de la app (.aab)

Sigue `android/README.md`, pasos 1 a 4. Al final tendrás `C:\conversa-android\app-release-bundle.aab`.

## 3. Crear la app en Play Console

1. Entra en play.google.com/console con la cuenta de Andina Music.
2. Pulsa **Crear app**.
3. Nombre: el elegido en `play/listing-es.md` (recomendado: «Conversa: chats de tu negocio»). Idioma predeterminado: **Español (Latinoamérica)**. Tipo: **App**. Precio: **Gratis**.
4. Acepta las declaraciones (políticas para desarrolladores y leyes de exportación de EE. UU.) y pulsa **Crear app**.

## 4. Ficha de la tienda

1. **Presencia en la tienda → Ficha principal de la tienda:** copia el nombre, la descripción breve y la completa de `play/listing-es.md`. Sube:
   - icono: `public/icon-512.png`;
   - gráfico de funciones: `play/feature-graphic.png`;
   - capturas de teléfono: `play/screenshots/01…05` en ese orden.
2. **Presencia en la tienda → Configuración de la tienda:** categoría **Empresa**, correo cobol@andinamusic.com y sitio web `https://app.mutuomatch.com`.
3. Guarda.

## 5. Contenido de la app (Política y programas → Contenido de la app)

Completa cada tarjeta con las respuestas preparadas:

1. **Política de privacidad:** `https://app.mutuomatch.com/legal/privacidad.html`.
2. **Acceso a la app:** cuenta demo → `play/app-access-es.md`.
3. **Anuncios:** No contiene anuncios.
4. **Clasificación del contenido:** `play/content-rating-es.md`.
5. **Público objetivo:** solo **18 años o más** → `play/declarations-es.md`.
6. **Seguridad de los datos:** `play/data-safety-es.md`. Ahí va la URL de eliminación: `https://app.mutuomatch.com/legal/eliminar-cuenta.html`.
7. **Apps gubernamentales:** No. **Funciones financieras:** ninguna. **Salud:** ninguna. **Noticias:** No. **ID de publicidad:** No.

## 6. Prueba interna (hoy)

1. **Probar y publicar → Pruebas → Prueba interna → Testers:** crea una lista con los correos de Gmail de tu equipo y guarda.
2. En la misma sección, pulsa **Crear versión**.
3. **Firma de apps de Google Play:** deja la opción recomendada (Google genera y guarda la llave de firma). Tu llave de `C:\conversa-llaves` queda como llave de subida.
4. Sube `app-release-bundle.aab`. Si Play Console lo rechaza por el «nivel de API objetivo», actualiza Bubblewrap (`npm i -g @bubblewrap/cli@latest`), ejecuta `bubblewrap update` y `bubblewrap build`, y súbelo de nuevo.
5. Notas de la versión: las de `play/listing-es.md`.
6. **Siguiente → Guardar → Lanzar en prueba interna.**
7. En **Testers**, copia el **enlace para unirse** y envíalo a tu equipo. Cada tester lo abre en su Android, acepta y descarga la app desde Play. Suele estar disponible en minutos.

## 7. Conectar la app con el dominio (huellas SHA-256)

Sin este paso la app se abre con una barra de navegador arriba.

1. **Configuración → Integridad de la app → Firma de apps:** copia la huella **SHA-256** del «Certificado de la clave de firma de apps» y la del «Certificado de la clave de subida».
2. En el servidor, en el archivo de entorno (por ejemplo `deploy/.env`), agrega:
   ```
   CONVERSA_ANDROID_PACKAGE=com.andinamusic.conversa
   CONVERSA_ANDROID_SHA256=<huella de firma de apps>,<huella de subida>
   ```
3. Reinicia Conversa en el servidor.
4. Abre `https://app.mutuomatch.com/.well-known/assetlinks.json`: debe mostrar el paquete y las dos huellas.

## 8. Verificar en un teléfono

Instala la app desde el enlace de prueba interna y comprueba:

1. **Se abre sin barra de navegador** (sin la dirección del sitio arriba). Esa es la señal de que la verificación funcionó. Si ves la barra, revisa el paso 7, espera unos minutos, desinstala y vuelve a instalar.
2. Inicias sesión con una cuenta de prueba y ves tus chats.
3. Al activar las notificaciones, Android pide permiso y luego llegan los avisos.
4. Con una cuenta de prueba, **Ajustes → Eliminar cuenta** borra la cuenta.
5. La cuenta demo de los revisores entra y muestra datos ficticios.

## 9. Producción

1. **Probar y publicar → Producción → Países:** agrega Perú y los países donde puedas dar soporte.
2. **Crear versión → Agregar desde la biblioteca:** elige el mismo `.aab` que probaste. Pega las notas de la versión.
3. **Siguiente → Guardar.**
4. Ve a **Resumen de publicación** y pulsa **Enviar cambios para revisión**.
5. Opcional: activa la **Publicación administrada** en esa misma pantalla, si quieres decidir tú el momento exacto en que la app aparece en Play después de aprobada.

## 10. Tiempos de revisión

- **Prueba interna:** disponible en minutos u horas.
- **Producción:** normalmente unos días. La primera app de una cuenta puede tardar más (una semana o más). Google puede pedir información adicional por correo o en la **Bandeja de entrada** de Play Console. Responde rápido y con datos concretos.
- Las actualizaciones posteriores suelen revisarse más rápido.

## 11. Riesgos que debes conocer

- **Conexión no oficial con WhatsApp.** Conversa usa una conexión de «dispositivo vinculado» no oficial (Baileys), no la plataforma oficial de WhatsApp Business. Por eso:
  - **Google puede rechazar o retirar la app**, por ejemplo, por su política de *Abuso de dispositivos y redes*, que prohíbe acceder a servicios de terceros de forma no autorizada. Rechazos o retiros repetidos pueden afectar a **toda la cuenta de desarrollador** de Andina Music y a sus otras apps.
  - **Meta puede pedir a Google que retire la app** (por marca o por sus condiciones de servicio) o reclamar directamente a Andina Music.
  - **WhatsApp puede restringir o bloquear los números de tus usuarios.** La app ya les pide aceptar ese riesgo antes de vincular; mantenlo así.
  - La alternativa estable a largo plazo es la plataforma oficial de WhatsApp Business (Cloud API).
- **Marca «WhatsApp».** Google puede pedir prueba de que tienes derecho a usar la marca si aparece en la ficha. Por eso:
  - no la uses en el nombre, el icono ni la descripción breve;
  - en la descripción completa usa solo «compatible con tu número de WhatsApp», junto con el aviso «No está afiliada a WhatsApp ni a Meta»;
  - la captura `05-perfil-contacto.png` muestra el botón «WhatsApp» de la app. Si un revisor lo objeta, quítala.
- **Coherencia.** Si cambias lo que la app hace con los datos (analítica, pagos, nuevos proveedores), actualiza primero la política de privacidad y el formulario de Seguridad de los datos.

## 12. Después de publicar

- Los cambios en la web se ven en la app sin enviar una nueva versión. Solo hay que recompilar si cambian el nombre, el icono, los colores o el dominio (`android/README.md`, paso 8).
- Guarda la llave de subida y su contraseña en un lugar seguro. Nunca las subas a git ni las envíes por chat.
- Revisa cada semana el correo de soporte y las reseñas en Play Console.
