# Acceso a la app para revisores (App access)

Dónde: **Play Console → Contenido de la app → Acceso a la app**.

1. Elige **«Todas las funciones o algunas de ellas están restringidas»**.
2. Pulsa **«Agregar instrucciones»** y completa los campos con el texto de abajo.
3. Marca **«No se requiere ninguna otra información para acceder a mi app»** solo si la cuenta demo funciona sin pasos extra (así es como está pensada).
4. Guarda.

Antes de enviar a revisión, comprueba tú mismo que la cuenta demo entra y muestra los datos ficticios desde un teléfono Android con la app instalada desde la prueba interna.

## Campos del formulario

- **Nombre de la instrucción:** `Cuenta demo con datos ficticios`
- **Nombre de usuario, correo o número de teléfono:** `[NÚMERO DEMO]`
- **Contraseña:** `[CONTRASEÑA DEMO]`
- **Otra información necesaria para acceder a tu app:** pega el texto en inglés (los revisores trabajan en varios idiomas; el inglés es lo más seguro). Debajo está la versión en español, como referencia.

### Texto para pegar (inglés)

```
Demo account with fictional data. It does NOT require linking a real WhatsApp number.

1. Open Conversa. On the sign-in screen enter the number [NÚMERO DEMO] and the password [CONTRASEÑA DEMO], then tap "Entrar".
2. "Mensajes" tab: inbox with fictional chats. Use the search box and the filters (Todos, No leídos, Revisión, Bot).
3. Tap "Elena Castro": a chat with a photo and a voice note. Tap the photo to open it and the play button to hear the voice note. Type a reply in "Escribe un mensaje".
4. In the chat, tap the contact's name or avatar to open the contact profile (number, shared files).
5. "Mi bot" tab: saved replies with their keywords. The bot only sends the owner's exact saved text, once, to new chats the owner reviewed, then hands the chat back to the human. No AI, no generated messages.
6. Notifications: when asked, allow notifications to receive alerts for new messages.
7. Account deletion: "Ajustes" > "Eliminar cuenta" (please do not confirm it on the demo account, so other reviewers can still use it). Public deletion page: https://[DOMINIO-APP]/legal/eliminar-cuenta.html

About real accounts: a real user links their own WhatsApp number as a "linked device" by entering a pairing code in WhatsApp > Linked devices > Link with phone number. This is an unofficial connection (not the WhatsApp Business Platform); the app shows the risk and asks the user to accept it explicitly before linking. Conversa is not affiliated with WhatsApp or Meta.

Contact: [CORREO DE CONTACTO]
```

### Versión en español (referencia)

```
Cuenta demo con datos ficticios. NO requiere vincular un número de WhatsApp real.

1. Abre Conversa. En la pantalla de acceso escribe el número [NÚMERO DEMO] y la contraseña [CONTRASEÑA DEMO] y pulsa «Entrar».
2. Pestaña «Mensajes»: bandeja con chats ficticios. Prueba la búsqueda y los filtros (Todos, No leídos, Revisión, Bot).
3. Abre «Elena Castro»: un chat con una foto y una nota de voz. Toca la foto para verla y el botón de reproducir para escuchar el audio. Escribe una respuesta en «Escribe un mensaje».
4. En el chat, toca el nombre o la foto del contacto para abrir su perfil (número y archivos compartidos).
5. Pestaña «Mi bot»: respuestas guardadas con sus palabras clave. El bot solo envía el texto exacto guardado por el dueño, una sola vez, a chats nuevos que el dueño revisó, y luego le devuelve el chat. Sin IA ni mensajes generados.
6. Notificaciones: cuando la app lo pida, permite las notificaciones para recibir avisos de mensajes nuevos.
7. Eliminación de cuenta: «Ajustes» → «Eliminar cuenta» (por favor, no la confirmes en la cuenta demo, para que otros revisores puedan usarla). Página pública: https://[DOMINIO-APP]/legal/eliminar-cuenta.html

Sobre las cuentas reales: el usuario vincula su propio número de WhatsApp como «dispositivo vinculado» ingresando un código de vinculación en WhatsApp → Dispositivos vinculados → Vincular con el número de teléfono. Es una conexión no oficial (no es la plataforma oficial de WhatsApp Business); la app muestra el riesgo y pide aceptarlo de forma expresa antes de vincular. Conversa no está afiliada a WhatsApp ni a Meta.

Contacto: [CORREO DE CONTACTO]
```

## Requisitos de la cuenta demo (para ingeniería)

- Debe funcionar siempre, sin código de verificación, sin vincular WhatsApp y sin depender de una IP o un país.
- Debe mostrar solo datos ficticios (los mismos chats de la demo: Elena Castro, Lucía Fernández, Marcos Ruiz, etc.).
- No debe poder enviar mensajes reales a nadie.
- Si un revisor la elimina, debe poder recrearse (o restablecerse sola) para la siguiente revisión.
- No cambies la contraseña mientras haya una revisión en curso. Si la cambias, actualiza este formulario.
- Las pantallas que nombran estas instrucciones («Mensajes», «Mi bot», «Ajustes → Eliminar cuenta») deben existir con esos nombres en la versión enviada.
