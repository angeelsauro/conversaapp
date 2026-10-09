# Publicar Conversa en Google Play, paso a paso

Guía para el propietario, en Windows. Andina Music tiene una cuenta de **organización** en Play Console con D-U-N-S, así que **no aplica** la regla de 12 testers durante 14 días de las cuentas personales nuevas. Aun así, empieza con una **prueba interna**.

Archivos que vas a usar:

| Qué | Dónde |
|---|---|
| Textos de la ficha, gráficos y capturas | carpeta `play/` |
| Respuestas de los formularios | `play/data-safety-es.md`, `play/app-access-es.md`, `play/content-rating-es.md`, `play/declarations-es.md` |
| Páginas legales | `public/legal/` (se publican en `https://[DOMINIO-APP]/legal/…`) |
| App Android | `android/twa-manifest.json` y `android/README.md` |

---

## Antes de empezar (comprobaciones)

1. La web está publicada en `https://[DOMINIO-APP]` y **cualquiera** puede abrirla. Si delante hay Cloudflare Access u otro inicio de sesión, la app de Android no funcionará y Google no podrá revisarla.
2. Ya existen las cuentas de usuario con número y contraseña, **Ajustes → Eliminar cuenta** y la cuenta demo para revisores (ver `play/app-access-es.md`).
3. Desde tu celular, **con datos móviles**, abren estas tres páginas:
   - `https://[DOMINIO-APP]/legal/privacidad.html`
   - `https://[DOMINIO-APP]/legal/terminos.html`
   - `https://[DOMINIO-APP]/legal/eliminar-cuenta.html`

## 1. Completar los datos pendientes

En los archivos hay textos entre corchetes que debes reemplazar. Abre cada archivo con el Bloc de notas, pulsa **Ctrl+H**, escribe el texto con corchetes y su valor, y pulsa **Reemplazar todo**. Al final, busca «[» (Ctrl+F) para comprobar que no queda ninguno.

| Texto | Qué poner | Archivos |
|---|---|---|
| `[RAZÓN SOCIAL]`, `[RUC]`, `[DIRECCIÓN]` | Datos legales de Andina Music | `public/legal/*.html` |
| `[CORREO DE CONTACTO]` | Correo de soporte que revises a diario | `public/legal/*.html`, `play/*.md` |
| `[DOMINIO-APP]` | Dominio de la app, sin `https://` (ej.: `app.tudominio.com`) | todos |
| `[FECHA]` | Fecha de publicación de las páginas (ej.: 15 de octubre de 2026) | `public/legal/*.html` |
| `[N días]` | **Dos plazos distintos:** cuántos días duran las copias de seguridad, y en cuántos días borras una cuenta pedida por correo | `public/legal/*.html`, `play/data-safety-es.md` |
| `[Hostinger]`, `[PAÍS DEL SERVIDOR]` | Proveedor del servidor (confirmar) y país donde está | `public/legal/privacidad.html`, `play/data-safety-es.md` |
| `[NOMBRE Y CÓDIGO DE INSCRIPCIÓN DEL BANCO DE DATOS…]` | Inscripción ante la Autoridad de Protección de Datos Personales, si corresponde | `public/legal/privacidad.html` |
| `[NÚMERO DEMO]`, `[CONTRASEÑA DEMO]` | Cuenta demo para revisores | `play/app-access-es.md` |
| `[RUTA-AL-KEYSTORE]` | `C:/conversa-llaves` | `android/twa-manifest.json` |

Haz revisar las páginas legales por un abogado: las partes marcadas «confirmar con asesoría legal» lo necesitan.

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
2. **Presencia en la tienda → Configuración de la tienda:** categoría **Empresa**, correo [CORREO DE CONTACTO] y sitio web `https://[DOMINIO-APP]`.
3. Guarda.

## 5. Contenido de la app (Política y programas → Contenido de la app)

Completa cada tarjeta con las respuestas preparadas:

1. **Política de privacidad:** `https://[DOMINIO-APP]/legal/privacidad.html`.
2. **Acceso a la app:** cuenta demo → `play/app-access-es.md`.
3. **Anuncios:** No contiene anuncios.
4. **Clasificación del contenido:** `play/content-rating-es.md`.
5. **Público objetivo:** solo **18 años o más** → `play/declarations-es.md`.
6. **Seguridad de los datos:** `play/data-safety-es.md`. Ahí va la URL de eliminación: `https://[DOMINIO-APP]/legal/eliminar-cuenta.html`.
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
4. Abre `https://[DOMINIO-APP]/.well-known/assetlinks.json`: debe mostrar el paquete y las dos huellas.

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
