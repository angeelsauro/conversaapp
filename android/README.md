# App Android de Conversa (TWA con Bubblewrap) en Windows

La app de Android es una **Trusted Web Activity (TWA)**: una app pequeña que abre `https://[DOMINIO-APP]` a pantalla completa con el motor de Chrome. No hay código Android propio que mantener.

- Paquete: `com.andinamusic.conversa` (no se puede cambiar después de publicar).
- Configuración: `android/twa-manifest.json`.
- Los cambios en la web se ven en la app sin publicar una nueva versión. Solo hay que recompilar si cambian el nombre, el icono, los colores, el dominio o el paquete.

Antes de empezar, la web debe estar publicada en `https://[DOMINIO-APP]`, sin Cloudflare Access ni otro inicio de sesión delante, y deben abrir:

- `https://[DOMINIO-APP]/manifest.webmanifest`
- `https://[DOMINIO-APP]/icon-512.png`
- `https://[DOMINIO-APP]/icon-maskable-512.png`

## 1. Instalar las herramientas (una sola vez)

Abre **PowerShell** (menú Inicio → escribe «PowerShell»).

1. Node.js (si no lo tienes):
   ```powershell
   winget install OpenJS.NodeJS.LTS
   ```
   Cierra y vuelve a abrir PowerShell.
2. JDK 17 (incluye `keytool`, que usaremos para la llave):
   ```powershell
   winget install Microsoft.OpenJDK.17
   ```
   Cierra y vuelve a abrir PowerShell. Comprueba con `keytool -help`.
3. Bubblewrap:
   ```powershell
   npm i -g @bubblewrap/cli
   ```
4. Ejecuta `bubblewrap doctor`. La primera vez que usas Bubblewrap, pregunta:
   - **¿Instalar el JDK?** Si ya instalaste el JDK 17 en el paso 2, responde **No** e indica su carpeta (por ejemplo `C:\Program Files\Microsoft\jdk-17…`). Si no, responde **Sí** y Bubblewrap lo instala.
   - **¿Instalar el Android SDK (herramientas de línea de comandos)?** Responde **Sí** y acepta las licencias. Si prefieres instalarlo tú, descarga «Command line tools only» de developer.android.com/studio e indica la carpeta.

   Al final, `bubblewrap doctor` debe decir que el JDK y el Android SDK están bien.

## 2. Crear la llave de subida (una sola vez)

La llave de subida firma cada `.aab` que envías a Google Play. Google vuelve a firmar la app con su propia llave (Play App Signing).

```powershell
mkdir C:\conversa-llaves
keytool -genkeypair -v -keystore C:\conversa-llaves\conversa-upload.keystore -alias conversa-upload -keyalg RSA -keysize 2048 -validity 10000
```

Te pedirá una contraseña y tus datos (nombre, organización «Andina Music», país «PE»). Usa una contraseña larga.

**Guarda la llave y su contraseña en un lugar seguro:**

- Guarda el archivo `conversa-upload.keystore` y la contraseña en un gestor de contraseñas, y una copia del archivo en un USB guardado bajo llave.
- **Nunca** los subas a git, ni los envíes por chat o correo, ni los pegues en un ticket.
- Si pierdes la llave de subida, se puede pedir a Google que la restablezca (Play Console → Integridad de la app), pero toma días.

## 3. Preparar el proyecto

1. Crea la carpeta del proyecto y copia el archivo de configuración:
   ```powershell
   mkdir C:\conversa-android
   copy <carpeta-del-repo>\android\twa-manifest.json C:\conversa-android\
   cd C:\conversa-android
   notepad twa-manifest.json
   ```
2. En el Bloc de notas:
   - reemplaza las 5 apariciones de `[DOMINIO-APP]` por el dominio real, sin `https://` en `host` (por ejemplo `app.ejemplo.com`);
   - reemplaza `[RUTA-AL-KEYSTORE]` por `C:/conversa-llaves` (con barras `/`).

   Guarda el archivo.
3. Genera el proyecto Android a partir de ese archivo:
   ```powershell
   bubblewrap update --skipVersionUpgrade
   ```
   `--skipVersionUpgrade` mantiene la versión 1.0.0 (código 1) para la primera subida.

**Alternativa:** en una carpeta vacía, ejecuta `bubblewrap init --manifest https://[DOMINIO-APP]/manifest.webmanifest` y responde las preguntas con los valores de `twa-manifest.json`:

| Pregunta | Valor |
|---|---|
| Application ID | `com.andinamusic.conversa` |
| App name / Launcher name | `Conversa` |
| Display mode / Orientation | `standalone` / `portrait` |
| Status bar color / Splash color | `#123F3C` / `#0C2E2B` |
| Starting URL | `/` |
| Play Billing / Geolocalización | No / No |
| Key store | la llave del paso 2 (`C:\conversa-llaves\conversa-upload.keystore`, alias `conversa-upload`) |

Después abre el `twa-manifest.json` generado, comprueba que diga `"enableNotifications": true`, `"fallbackType": "customtabs"`, `"minSdkVersion": 21` y `"appVersionCode": 1`, y si cambiaste algo ejecuta `bubblewrap update --skipVersionUpgrade`.

## 4. Compilar

```powershell
cd C:\conversa-android
bubblewrap build
```

Pide la contraseña del almacén y la de la llave: con el comando del paso 2 son la misma. Al terminar tendrás:

- `app-release-bundle.aab`: el archivo que se sube a Google Play;
- `app-release-signed.apk`: sirve para instalarlo directamente en un teléfono de prueba.

## 5. Obtener las huellas SHA-256

Necesitas **dos** huellas. La verificación de la TWA solo funciona si el servidor publica la de la llave con la que está firmada la app instalada.

1. **Llave de subida** (la tuya):
   ```powershell
   keytool -list -v -keystore C:\conversa-llaves\conversa-upload.keystore -alias conversa-upload
   ```
   Copia la línea `SHA256:` (formato `AB:CD:…`, 32 pares).
2. **Llave de firma de apps de Google** (la que firma la app que la gente descarga de Play): después de subir el primer `.aab`, ve a **Play Console → tu app → Configuración → Integridad de la app → Firma de apps** y copia la huella **SHA-256** del «Certificado de la clave de firma de apps». En esa misma página aparece también la huella del «Certificado de la clave de subida», que debe coincidir con la del punto 1.

## 6. Configurar el servidor

El servidor publica `https://[DOMINIO-APP]/.well-known/assetlinks.json` a partir de dos variables de entorno:

```
CONVERSA_ANDROID_PACKAGE=com.andinamusic.conversa
CONVERSA_ANDROID_SHA256=<huella de firma de apps de Google>,<huella de la llave de subida>
```

1. Añádelas al archivo de entorno del servidor (por ejemplo `deploy/.env`), con las dos huellas separadas por coma. Confirma el formato exacto con quien implementó esa parte del servidor.
2. Reinicia Conversa.
3. Abre `https://[DOMINIO-APP]/.well-known/assetlinks.json` en el navegador: debe mostrar el paquete y las dos huellas, sin redirecciones ni pantallas de Cloudflare.
4. Opcional: comprueba con la herramienta de Google «Statement List Generator and Tester» (developers.google.com/digital-asset-links/tools/generator).

## 7. Comprobar que la verificación funciona

Instala la app (desde la prueba interna de Play o con el `.apk`) y ábrela:

- **Bien:** se abre a pantalla completa, **sin barra de dirección** del navegador.
- **Mal:** aparece arriba una barra con la dirección del sitio. Significa que `assetlinks.json` no coincide con la llave de la app instalada. Revisa las huellas (la app de Play usa la llave de Google; el `.apk` local, la de subida), espera unos minutos, borra los datos de Chrome o reinstala la app y vuelve a probar.

## 8. Nuevas versiones

1. Abre `twa-manifest.json` y cambia lo necesario.
2. Ejecuta `bubblewrap update` (sin `--skipVersionUpgrade`): sube `appVersionCode` en 1 y actualiza `appVersionName`.
3. Ejecuta `bubblewrap build` con **la misma llave** y sube el nuevo `.aab`.

No subas `C:\conversa-android` ni la llave a git: el proyecto se puede regenerar siempre con `twa-manifest.json`.

## App de administrador (solo para ti, fuera de Google Play)

`android/admin/twa-manifest.json` genera **Conversa Admin** (`com.andinamusic.conversa.admin`), que abre tu panel privado `https://panel-q7x4.mutuomatch.com` (con Cloudflare Access y tu código privado). Se instala a mano con el `.apk`; no se publica en Play.

Compilación probada el 9 de octubre de 2026 con Bubblewrap 1.27.0, JDK 17 y las herramientas oficiales del Android SDK:

1. Copia el `twa-manifest.json` (admin o clientes) a una carpeta vacía y pon la ruta real de la llave en `signingKey.path`.
2. `bubblewrap update --skipVersionUpgrade`
3. `bash ruta/a/android/patch-template.sh` (adapta la plantilla de Bubblewrap a las herramientas actuales; ver los comentarios del script).
4. `bubblewrap build --skipPwaValidation`

Si tu SDK tiene las herramientas de línea de comandos en la raíz (con un `source.properties` ahí), Gradle no ve las plataformas instaladas: usa la estructura estándar `cmdline-tools/latest/`.

Para que una app abra sin barra de dirección, el servidor debe declararla: `CONVERSA_ANDROID_PACKAGE` admite varios paquetes separados por comas (por ejemplo `com.andinamusic.conversa.admin,com.andinamusic.conversa`) y `CONVERSA_ANDROID_SHA256` varias huellas. En el panel, además, Cloudflare Access debe dejar pasar `/.well-known/assetlinks.json` (ver SERVIDOR.md).
