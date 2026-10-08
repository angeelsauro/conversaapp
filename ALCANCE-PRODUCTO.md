# Alcance de Conversa para negocios

## Objetivo confirmado por el propietario

Ofrecer a negocios de distintos rubros una herramienta de automatización de mensajería: detectar palabras o frases configuradas, seleccionar una respuesta escrita y guardada por el usuario, enviarla sin generar ni modificar contenido, y dejar el chat para revisión según las reglas aplicables. No es un asistente de conversación abierta, no debe improvisar respuestas ni depender de memoria de IA. No necesita claves de OpenAI ni otro proveedor de modelos para su funcionamiento determinista.

El código incluye restos de un punto de extensión de IA de una versión anterior. No son un requisito del producto ni están activos; revisar su eliminación de la API y de la documentación antes de publicar el producto comercial. La UI actual es la biblioteca de respuestas.

## Funciones actuales y semántica

- Respuestas del propietario: nombre interno, texto y palabras/frases clave, máximo 20 respuestas por workspace.
- Coincidencia normalizada por mayúsculas y tildes, de palabra o frase completa. No hay inferencia de intención, sinónimos automáticos ni similitud mediante IA.
- Una única respuesta coincidente permite copiar su texto exacto. Si coinciden distintas respuestas, no se elige al azar.
- Sin coincidencia única y keywordOnly activo, no se envía texto. La derivación es interna y no agrega mensajes al destinatario.
- Activación global independiente de permisos por conversación; histórico importado no dispara respuestas. Chats antiguos excluidos; chats nuevos requieren verificación por historial potencialmente incompleto.
- Handoff después de una respuesta deja el chat detenido para revisión. La cuenta puede continuar personalmente desde WhatsApp.
- No enviar campañas ni iniciar conversaciones de forma espontánea. Cada respuesta automática requiere un evento entrante elegible.

## Requisitos para ofrecerlo a varios negocios (NO implementados)

- Cuentas independientes, autenticación, recuperación, roles y separación de administración y clientes.
- Aislamiento real de sesiones WhatsApp, datos, claves, respuestas, colas y límites entre clientes; no confiar solo en que el almacén acepte un nombre de workspace. Las rutas actuales trabajan con owner.
- Administración restringida al propietario mediante controles de servidor/red. El uso de aplicaciones móviles no impide que un tercero llame a una API pública.
- Gestión de organizaciones, usuarios y límites de uso por negocio.
- Aplicaciones Android/iOS o estrategia móvil definida, gestión de versiones, notificaciones y publicación/revisión en tiendas. El frontend adaptable actual no equivale a una app publicada.
- Servidor persistente, operación y observabilidad sin exponer mensajes, respaldos y recuperación, políticas de retención/borrado y soporte.
- Revisión de privacidad, consentimiento, condiciones del proveedor de mensajería y licencias. La integración actual usa Baileys como dispositivo vinculado, no una API oficial con garantías de servicio.

## Requisitos de aceptación para publicación

- Usuarios distintos no pueden consultar o modificar datos, reglas ni sesiones de otros, incluso llamando directamente a la API.
- Una regla conserva el texto y no dispara por partes accidentales de otra palabra; el comportamiento de sinónimos debe ser explícito y reproducible.
- Guardar o editar una respuesta no envía mensajes ni habilita el bot por sí solo.
- Reiniciar no reenvía automáticamente operaciones inciertas ni habilita chats excluidos o en revisión.
- Mensajes importados, duplicados o de contactos fuera de permisos no provocan respuestas.
- La interfaz distingue conexión WhatsApp, conexión con el servidor y estado del bot; salud HTTP no debe interpretarse como WhatsApp conectado.
- Los endpoints temporales de pruebas administrativas deben quedar deshabilitados o limitados antes de ofrecer el producto a clientes.
- Verificación independiente de seguridad, dispositivos móviles reales, recuperación y funcionamiento continuo en el alojamiento elegido.

## Decisiones pendientes del equipo

Definir alcance del producto, arquitectura multiusuario, proveedor de alojamiento, dominio definitivo, estrategia oficial/no oficial de integración, políticas de datos y distribución móvil. No hay infraestructura permanente contratada o desplegada en esta entrega. La base actual es un piloto local para un propietario; no presentarla a clientes como producto multiusuario terminado.
