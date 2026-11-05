# Conectar la API oficial de WhatsApp (Cloud API de Meta)

Esta guía explica cómo conectar Conversa con la **API oficial de WhatsApp** de
Meta, en lugar del conector por código QR que se usa hoy. Está escrita para que
la siga una persona sin conocimientos técnicos.

> **Importante:** el código ya está listo y probado, pero **viene apagado**. No
> cambia nada hasta que tú pongas las credenciales en el servidor. Mientras no
> lo actives, Conversa sigue funcionando igual que ahora (conexión por QR).

---

## 1. ¿Qué cambia con la API oficial?

| | Conector actual (QR) | API oficial (Cloud API) |
|---|---|---|
| Cómo se conecta | Escaneas un QR, como WhatsApp Web | Con credenciales de Meta (token) |
| Estabilidad | Puede desconectarse solo | Muy estable, pensada para empresas |
| El número | Es tu WhatsApp normal del teléfono | Se convierte en un número **dedicado** |
| Costo | Gratis | Gratis hasta cierto punto, luego se paga por conversación |
| Riesgo de bloqueo | Existe (es no oficial) | Ninguno (es la vía oficial) |

### ⚠️ La decisión más importante antes de activar

Cuando un número entra a la API oficial, **deja de poder usarse como WhatsApp
normal en un teléfono**. Pasa a ser un número "de empresa" que solo responde por
la API. Por eso hay que decidir:

- **Opción A — Número nuevo dedicado (recomendado):** consigues un número nuevo
  (un chip o un número virtual) solo para Conversa. Tu WhatsApp personal de
  Andina Music sigue intacto en el teléfono. Es la opción segura.
- **Opción B — Tu número actual:** migras el número que ya usas. Ya **no** podrás
  tener ese WhatsApp abierto en el teléfono. Solo hazlo si estás seguro.

Decide esto **antes** de dar de alta el número en Meta.

---

## 2. Lo que ya está hecho y PROBADO (del lado de Conversa)

- ✅ El conector oficial (envía y recibe por la API de Meta).
- ✅ El webhook público en `https://app.mutuomatch.com/api/wa/webhook`.
- ✅ **Probado de verdad:** Meta llega al servidor y la firma de seguridad valida
  (se comprobó con el botón "Probar" de Meta → el servidor registró `ok:true`).
- ✅ Un comando a prueba de errores para poner las credenciales: **`conversa wa`**.
- ✅ Todo apagado por defecto: no afecta la app publicada.

Solo falta usar un **número que sea tuyo** (ver la sección sobre el número de
prueba, abajo).

### ⚠️ Importante: el número de PRUEBA de Meta no sirve para recibir

El número de prueba gratis (`+1 555 605-5877`) **pertenece a Meta**, no a ti.
Meta recibe tus mensajes, pero **no los entrega a tu servidor** y **no te deja
administrar su suscripción** (da `missing permissions`), porque esa cuenta no es
tuya. Esto es un límite del número de prueba, no de Conversa. **Para recibir
mensajes necesitas tu propio número dedicado** (sección 7).

---

## 3. Paso a paso para activar

### Paso 1 — En Meta (developers.facebook.com → tu app → WhatsApp)

1. Ten a la mano, de la pantalla de tu app:
   - El **Identificador del número de teléfono** (Phone number ID).
   - El **token de acceso** (temporal al inicio; luego uno permanente).
   - El **secreto de la app** (Configuración → Básica → Secreto de la app).
2. Ve a **WhatsApp → Configuración → Webhooks** (o "Configuration").
3. En **URL de devolución de llamada (Callback URL)**, escribe:

   ```
   https://app.mutuomatch.com/api/wa/webhook
   ```

4. En **Token de verificación (Verify token)**, inventa una palabra secreta
   (por ejemplo `conversa-andina-2026`) y **anótala**. La usarás igual en el
   servidor en el Paso 2.
5. Pulsa **Verificar y guardar**. Debe quedar en verde. (Esto funciona solo
   después de hacer el Paso 2, así que puedes hacer primero el Paso 2 y volver
   aquí.)
6. En **Campos del webhook (Webhook fields)**, suscríbete a **messages**.

### Paso 2 — En el servidor (comando `conversa wa`)

Entra por SSH y ejecuta:

```
conversa wa
```

El comando te pide **uno por uno** y **valida antes de guardar** (si pegas algo
corto o equivocado, lo rechaza sin dañar nada):

1. **TOKEN** (largo, empieza con `EAA`, ~200 caracteres). Usa un **token
   permanente** de un "usuario del sistema" (no el temporal, que caduca en 24 h).
2. **ID del número** (Phone Number ID). Enter para el de prueba, o pega el de tu
   número real.
3. **Token de verificación** (Enter = `conversa-andina-2026`), el mismo que en Meta.
4. **SECRETO de la app** (corto, empieza con `00`, ~32 caracteres).

Luego escribes `si`, y el comando guarda, reinicia y suscribe la app solo.

> **Token permanente:** Business Settings → Usuarios del sistema → tu usuario →
> "Generar token" → app Conversa → caducidad **Nunca** → permisos
> `whatsapp_business_management` y `whatsapp_business_messaging`. Cópialo con el
> botón **Copiar** (es larguísimo) y guárdalo: se muestra una sola vez.

### Paso 3 — Probar

1. En Meta, vuelve a **Verificar y guardar** el webhook (debe quedar en verde).
2. Desde otro teléfono, escribe un WhatsApp al número conectado.
3. El mensaje debe aparecer en el panel de Conversa.
4. Responde desde el panel: debe llegar al teléfono.

Si algo falla, revisa que los cinco valores del `.env` sean correctos y que la
URL del webhook esté bien escrita.

---

## 4. Costos (resumen)

- Meta da un número de **prueba gratis** y conversaciones gratis para empezar.
- En producción se paga **por conversación** (no por mensaje), y hay un tramo
  mensual gratuito. Los precios cambian por país; revísalos en el panel de Meta
  antes de usarlo en serio.

---

## 5. Cómo apagarlo (volver al conector normal)

Borra (o deja en blanco) las cinco líneas `CONVERSA_WA_*` del `deploy/.env` y
ejecuta `conversa restart`. Conversa vuelve al conector por QR, como antes.

---

## 6. Nota sobre varios clientes

La API oficial está pensada para **un número por cuenta de empresa**. El modo
"muchos clientes con su propio WhatsApp" (que hoy usa el QR) **no encaja** con la
API oficial: cada cliente necesitaría su propia cuenta de empresa en Meta. Por
eso esta conexión oficial es, de momento, para **el número de Andina Music**, no
para las cuentas de clientes. Si en el futuro quieres ofrecer la API oficial a
clientes, hay que diseñar ese flujo aparte.

---

## 7. Conectar tu número dedicado REAL (hoja de ruta)

El número de prueba de Meta sirve para enviar, pero **no entrega los mensajes
entrantes a tu servidor** (es un número compartido de Meta). Para recibir de
verdad necesitas **tu propio número**.

### Antes de empezar: consigue el número
Un número que:
- Puedas **recibir un código** por SMS o llamada (para verificarlo una vez).
- **NO esté activo en WhatsApp** en ningún teléfono. Si ya tiene WhatsApp,
  elimínalo primero en ese teléfono (WhatsApp → Ajustes → Cuenta → Eliminar cuenta).
- Quieras dedicar **solo a Conversa** (ya no se usará como WhatsApp normal).

Puede ser un chip nuevo, un número libre, o un número virtual que reciba SMS.

### Paso 1 — Agregar el número en Meta
Tu app → **WhatsApp → "Administrar números de teléfono" → "Agregar número de
teléfono"**: nombre visible (ej. Andina Music), categoría, el número, y verifícalo
con el código por SMS o llamada. Al quedar registrado tendrá su **propio
Phone Number ID**.

### Paso 2 — Reconectar Conversa
En el servidor: `conversa wa`, y pon el **mismo token** permanente, el **NUEVO
Phone Number ID**, Enter en verify, y el **mismo secreto**. El comando suscribe la
app — y esta vez **sí funciona**, porque el número es tuyo.

### Paso 3 — Probar
Envías un WhatsApp al número real → aparece en el panel de Conversa. Respondes
desde el panel → llega al teléfono.

### Paso 4 (después, para escalar) — Verificación del negocio
Para enviar sin límites, Meta pide **verificar el negocio** (Andina Music L.L.C.):
Business Settings → Centro de seguridad → Verificación del negocio (con documentos
del negocio; lo revisa Meta en días). **No hace falta** para empezar a recibir y
responder con el número registrado.
