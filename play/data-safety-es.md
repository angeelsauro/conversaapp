# Formulario «Seguridad de los datos» (Data safety)

Dónde: **Play Console → Contenido de la app (Política y programas) → Seguridad de los datos**.

Las respuestas se basan solo en cómo funciona Conversa hoy. Si cambia algo (por ejemplo, se agrega analítica, reportes de errores, anuncios o pagos), hay que actualizar este formulario **antes** de publicar esa versión. El formulario cubre todo lo que recopila la app, también lo que pasa por la web que muestra la app (TWA).

## Paso 1. Recopilación y seguridad de los datos

| Pregunta | Respuesta |
|---|---|
| ¿Tu app recopila o comparte alguno de los tipos de datos del usuario obligatorios? | **Sí** |
| ¿Todos los datos del usuario que recopila tu app están encriptados en tránsito? | **Sí** (HTTPS/TLS entre la app y el servidor; notificaciones cifradas de extremo a extremo) |
| ¿Qué métodos de creación de cuentas admite tu app? | **Nombre de usuario, contraseña y otro tipo de autenticación** (número de WhatsApp + contraseña + código de vinculación). *Si el registro no exige el código de vinculación, elige «Nombre de usuario y contraseña». Confírmalo con ingeniería.* |
| Vínculo para solicitar que se borre la cuenta | `https://[DOMINIO-APP]/legal/eliminar-cuenta.html` |
| ¿Proporcionas una forma para que los usuarios soliciten que se borren algunos o todos sus datos sin borrar su cuenta? | **Sí** (pueden borrar chats y respuestas guardadas, desactivar notificaciones y desvincular WhatsApp desde la app) |

## Paso 2. Tipos de datos

Marca **solo** estos tipos. Todo lo que no aparece aquí queda **sin marcar**.

| Categoría | Tipo de datos | Qué es en Conversa |
|---|---|---|
| Información personal | **Nombre** | Nombre del perfil de la cuenta de WhatsApp conectada |
| Información personal | **Número de teléfono** | Número de WhatsApp del usuario (también es su usuario) |
| Mensajes | **Otros mensajes en la app** | Mensajes de los chats del usuario |
| Fotos y videos | **Fotos** | Miniaturas de mensajes, vistas previas de fotos de perfil y fotos que el usuario abre |
| Fotos y videos | **Videos** | Miniaturas de videos y videos que el usuario abre |
| Archivos de audio | **Grabaciones de voz o sonido** | Notas de voz que el usuario abre |
| Archivos de audio | **Otros archivos de audio** | Audios recibidos que no son notas de voz, cuando el usuario los abre |
| Archivos y documentos | **Archivos y documentos** | Documentos que el usuario abre o descarga |
| Contactos | **Contactos** | Nombres y números de las personas con las que el usuario chatea |
| Actividad en la app | **Otro contenido generado por el usuario** | Respuestas guardadas y palabras clave |
| IDs de dispositivo u otros IDs | **IDs de dispositivo u otros IDs** | Suscripción a notificaciones push del navegador o dispositivo |

**No marcar:** Ubicación (aproximada y precisa), Correo electrónico, IDs de usuario (el identificador de la cuenta es el número de teléfono, ya declarado), Dirección, Otra información personal, Información financiera, Salud y actividad física, Correos electrónicos, SMS o MMS, Archivos de música, Calendario, Interacciones con la app, Historial de búsqueda en la app, Apps instaladas, Otras acciones, Historial de navegación web, Registros de fallas, Diagnóstico, Otros datos de rendimiento de la app.

## Paso 3. Uso y manejo de cada tipo de datos

Para **todos** los tipos marcados:

- **¿Se recopilan?** Sí.
- **¿Se comparten?** **No.** Los proveedores de infraestructura (alojamiento [Hostinger], Cloudflare y los servicios push de Google, Apple y Mozilla) procesan datos por cuenta de Andina Music. Google no considera eso «compartir». Los mensajes que el usuario envía a sus contactos son transferencias iniciadas por el usuario y tampoco cuentan como «compartir».
- **¿Se procesan de forma efímera?** **No.** (Se guardan cifrados, o en el caso de archivos completos, quedan un tiempo en la caché de memoria del servidor; por eso no se declaran como efímeros.)

| Tipo de datos | ¿Obligatorio u opcional? | Propósitos (marcar solo estos) |
|---|---|---|
| Nombre | Obligatorio | Funcionalidad de la app |
| Número de teléfono | Obligatorio | Funcionalidad de la app · Administración de la cuenta |
| Otros mensajes en la app | Obligatorio | Funcionalidad de la app |
| Fotos | Obligatorio | Funcionalidad de la app |
| Videos | Obligatorio | Funcionalidad de la app |
| Grabaciones de voz o sonido | Obligatorio | Funcionalidad de la app |
| Otros archivos de audio | Obligatorio | Funcionalidad de la app |
| Archivos y documentos | Obligatorio | Funcionalidad de la app |
| Contactos | Obligatorio | Funcionalidad de la app |
| Otro contenido generado por el usuario | Opcional (el usuario decide si crea respuestas) | Funcionalidad de la app |
| IDs de dispositivo u otros IDs | Opcional (solo si activa las notificaciones) | Funcionalidad de la app |

**Nunca marcar** como propósito: Analíticas, Comunicaciones del desarrollador, Publicidad o marketing, Personalización.

## Paso 4. Prácticas de seguridad (aparecen en la vista previa)

| Pregunta | Respuesta |
|---|---|
| Datos encriptados en tránsito | Sí |
| Puedes solicitar que se borren los datos | Sí |
| Revisión de seguridad independiente (MASA) | No (déjalo sin marcar, salvo que se contrate una) |
| Compromiso con la Política para Familias | No aplica (app solo para mayores de 18 años) |

## Coherencia con la política de privacidad

Revisa que coincidan con `public/legal/privacidad.html`:

- sin anuncios, sin analítica y sin seguimiento;
- sin venta de datos ni «compartir» con terceros;
- cifrado en tránsito y en reposo;
- eliminación de la cuenta en la app y en la URL pública;
- copias de seguridad cifradas que se borran en [N días].

Google compara el formulario con la política y con el comportamiento real de la app. Una diferencia es motivo frecuente de rechazo.
