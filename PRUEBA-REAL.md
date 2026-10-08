# Prueba real con tu WhatsApp (Windows)

Se hace en tu PC: tus chats y la sesión de WhatsApp quedan solo en la carpeta `.data` de ese equipo, cifrados. Necesitas tu teléfono a mano y otra persona que pueda escribirte.

## 1. Abrir Conversa (sin comandos)

1. Clic derecho en el ZIP > **Extraer todo**.
2. Si tenías otro Conversa abierto, reinicia el PC. Si sigue abierto, el paso siguiente te avisa.
3. En la carpeta extraída, entra en **Conversa** y haz doble clic en **Abrir-Conversa.cmd**. Si Windows pregunta si quieres ejecutarlo, pulsa **Ejecutar**, o **Más información** > **Ejecutar de todas formas**.
   - La primera vez instala lo necesario; tarda alrededor de un minuto.
   - Si falta Node.js, te ofrece instalarlo: responde `S` y, cuando termine, vuelve a hacer doble clic.
4. Se abre el panel en el navegador, ya con tu acceso privado. No compartas esa dirección.

Otro día, el mismo doble clic vuelve a abrir el panel.

## 2. Vincular

1. En **Conexión**, pulsa **Generar QR**.
2. En el teléfono, abre WhatsApp > Dispositivos vinculados > Vincular un dispositivo, y escanea el QR.
3. Espera a que el panel diga «Conectado». En **Mensajes** irán apareciendo tus chats: el historial que WhatsApp envía puede tardar unos minutos y llegar incompleto.

Todos los chats que ya existían quedan excluidos del bot. Es lo esperado.

## 3. Probar que responde

**Opción A, con un contacto que ya tienes (la más rápida).** Elige a alguien de confianza que sepa que es una prueba.

1. En **Mensajes**, abre su chat y pulsa **⋯**.
2. Pulsa **Prueba real (PRUEBA)** y luego **Activar prueba**.
3. Pídele que te escriba exactamente `PRUEBA` en los próximos 10 minutos.
4. Conversa le responderá una sola vez «Mensaje de prueba recibido correctamente.» y el chat pasará a «Para tu revisión».

Esta prueba no activa el bot para nadie más y solo funciona una vez. Si el botón no aparece en un chat, prueba con otro contacto.

**Opción B, el flujo completo con un número que nunca te haya escrito.**

1. En **Mi bot**, guarda una respuesta con una palabra clave, por ejemplo `horario`.
2. Esa persona te escribe «Hola».
3. En su chat, pulsa **⋯** > **Revisar chat nuevo** y confirma que es nuevo.
4. En **Mi bot**, pulsa **Activar bot**.
5. La persona escribe un mensaje con la palabra clave. El bot responde una vez con tu texto exacto y el chat pasa a revisión.
6. Al terminar, pulsa **Detener bot**.

El PC tiene que seguir encendido con Conversa abierto para recibir y responder; el navegador se puede cerrar.

## Si algo falla

- El panel no abre: revisa `.data\server-error.log`. Los registros no contienen mensajes, números ni códigos.
- WhatsApp no muestra el QR o se desconecta: en **Conexión**, pulsa **Pausar** y luego **Reanudar conexión**.
- Para terminar: en **Conexión**, pulsa **Desvincular**, o cierra la sesión «Conversa» desde Dispositivos vinculados en el teléfono.
- No ejecutes dos Conversa a la vez con el mismo WhatsApp.
