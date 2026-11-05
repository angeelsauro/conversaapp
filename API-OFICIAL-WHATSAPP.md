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

## 2. Lo que ya está hecho (del lado de Conversa)

- ✅ El conector oficial (envía y recibe por la API de Meta).
- ✅ El webhook público que Meta usa para entregarte los mensajes.
- ✅ Validación de seguridad (firma de Meta) para que nadie falsifique mensajes.
- ✅ Todo apagado por defecto: no afecta la app publicada.

Solo falta **tu configuración** en Meta y en el servidor.

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

### Paso 2 — En el servidor (archivo `deploy/.env`)

Entra por SSH y edita `deploy/.env` (nunca compartas estos valores en fotos ni
mensajes). Agrega estas líneas con **tus** datos:

```
CONVERSA_WA_TOKEN=el-token-de-acceso-de-meta
CONVERSA_WA_PHONE_ID=el-identificador-del-numero
CONVERSA_WA_VERIFY_TOKEN=conversa-andina-2026
CONVERSA_WA_APP_SECRET=el-secreto-de-la-app
CONVERSA_WA_NUMBER=51999888777
```

- `CONVERSA_WA_VERIFY_TOKEN` debe ser **exactamente igual** al que pusiste en
  Meta en el Paso 1.
- `CONVERSA_WA_NUMBER` es solo el número que se muestra (opcional).

Guarda el archivo y reinicia Conversa:

```
conversa restart
```

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
