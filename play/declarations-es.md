# Declaraciones de «Contenido de la app»

Dónde: **Play Console → Contenido de la app** (en el menú izquierdo, «Política y programas»). Completa cada tarjeta hasta que todas aparezcan con ✓. Si Play Console muestra una declaración que no está aquí y no aplica a Conversa, la respuesta es **No**.

| Declaración | Respuesta para Conversa | Detalle |
|---|---|---|
| Política de privacidad | `https://[DOMINIO-APP]/legal/privacidad.html` | Debe abrir sin iniciar sesión y desde cualquier red. |
| Acceso a la app | Algunas funciones están restringidas | Cuenta demo: ver `app-access-es.md`. |
| Anuncios | **No, mi app no contiene anuncios** | Tampoco hay anuncios de terceros dentro de la web que muestra la app. |
| Clasificación del contenido | Cuestionario IARC | Ver `content-rating-es.md`. |
| Público objetivo y contenido | **Solo 18 años o más** | Ver detalle abajo. |
| Seguridad de los datos | Formulario | Ver `data-safety-es.md`. |
| Apps de noticias | **No**, mi app no es de noticias | |
| Apps gubernamentales | **No** | Conversa no es de ni para un organismo público. |
| Funciones financieras | **Mi app no ofrece ninguna función financiera** | Sin pagos, préstamos, inversiones ni criptoactivos. |
| Apps de salud | **Mi app no tiene funciones de salud** | |
| ID de publicidad | **No**, mi app no usa el ID de publicidad | Conversa no usa bibliotecas de anuncios ni analítica. Después de subir el .aab, confirma en Play Console → Explorador de app bundle → Permisos que no aparece `com.google.android.gms.permission.AD_ID`. |
| Rastreo de contactos / estado de salud (COVID-19) | **Ninguna de las anteriores** (si aparece) | |
| Eliminación de la cuenta | `https://[DOMINIO-APP]/legal/eliminar-cuenta.html` | Se pide dentro de «Seguridad de los datos». La app también permite eliminarla en Ajustes → Eliminar cuenta. |
| VPN, servicio en primer plano, intents de pantalla completa, alarmas exactas, permisos de fotos y videos | No aplica | La app solo pide Internet y notificaciones. |

## Público objetivo y contenido (detalle)

1. **Grupos de edad objetivo:** marca solo **18 años o más**. No marques ningún rango menor.
2. **¿La app podría atraer a niños sin querer?** Responde **No**: es una herramienta de trabajo para negocios, sin personajes, juegos ni contenido infantil.
3. Al elegir solo 18+, Play no exige la Política para Familias. Las páginas legales ya dicen que la app es solo para mayores de 18 años.

## Configuración de la tienda (otra pantalla, pero se completa a la vez)

- **Precio:** Gratis. Si más adelante quieres cobrar, hazlo con suscripciones o compras dentro de la app: una app publicada como gratuita no puede pasar a ser de pago.
- **Compras en la app:** No (por ahora).
- **Categoría:** Empresa.
- **Países:** empieza por Perú y los países donde puedas dar soporte en español. Puedes agregar más después.
- **Lineamientos para el contenido y leyes de exportación de EE. UU.:** acepta ambos.

## Revisión rápida antes de enviar

- [ ] Las tres URL legales abren desde el teléfono con datos móviles, sin iniciar sesión.
- [ ] Ninguna página legal tiene placeholders sin completar (busca «[»).
- [ ] La cuenta demo entra y muestra datos ficticios.
- [ ] En la app existe Ajustes → Eliminar cuenta y funciona.
- [ ] La ficha no usa «WhatsApp» en el nombre, el icono ni la descripción breve.
