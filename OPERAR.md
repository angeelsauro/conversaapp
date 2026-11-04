# Operar Conversa sin complicaciones

Guía para el dueño. Con la herramienta `conversa` ya **no necesitas comandos largos**: cada tarea es una palabra.

## Entrar al servidor (una vez por sesión)

1. Abre **PowerShell** en tu PC.
2. `ssh root@TU-IP` (tu IP de Hostinger, p. ej. `179.236.66.138`).
3. Pon la contraseña de **root** del servidor. ¿No la recuerdas? Resetéala en Hostinger → VPS → **"Restablece tu contraseña"** y usa la nueva.
4. Cuando veas `root@...:~#`, estás dentro.

> Si al escribir mal la contraseña varias veces sale **"Connection timed out"**, tu IP quedó bloqueada un rato por seguridad: **espera 15–20 min** y reintenta.

## Instalar la herramienta (SOLO la primera vez)

```
bash /opt/conversa/ops/conversa install
```

Eso crea el comando `conversa` y programa una **copia de seguridad automática diaria**. Desde entonces solo escribes `conversa ...`.

## Lo que usarás a diario

| Quiero… | Escribe |
|---|---|
| Ver si todo está bien | `conversa status` |
| **Apagar el bot** (que no responda solo) | `conversa bot off` |
| Volver a activar el bot | `conversa bot on` |
| Ver la dirección de mi panel | `conversa panel` |
| Entrar al panel (enlace con mi código) | `conversa code` |
| **Traer mejoras nuevas** (actualizar) | `conversa update` |
| Reiniciar la app si se pone rara | `conversa restart` |
| **Arreglar el panel si da Error 1033** | `conversa restart-tunnel` |
| Hacer una copia de seguridad ahora | `conversa backup` |
| Ver qué comandos hay | `conversa help` |

## Si el panel da "Error 1033"

1. `conversa restart-tunnel`
2. Espera 30 segundos y recarga el panel en el navegador.
3. Si sigue, en **Cloudflare → Zero Trust → Networks → Tunnels → tu túnel → Public Hostnames**, confirma que esté tu dirección del panel apuntando a `http://conversa:4318`.

## Emergencia: apagar el bot SIN servidor

Si no puedes entrar al servidor y necesitas que tu WhatsApp **deje de responder solo ya**:
- En tu teléfono: **WhatsApp → Ajustes → Dispositivos vinculados → Conversa → Cerrar sesión.**
- Eso corta las respuestas automáticas al instante (y desconecta Conversa; la reconectas luego).

## Guarda bien (en un gestor de contraseñas)

- Contraseña de **root** del servidor (Hostinger).
- Tu **PIN** del panel (ponlo en Ajustes la primera vez).
- El **código maestro** de propietario (lo ves con `conversa code`). **No lo compartas nunca.**
- La **llave de subida** de Google Play y su contraseña.

## Copias de seguridad

- Automática: cada día a las 3:00 (la programa `conversa install`), dentro del servidor.
- Manual: `conversa backup` cuando quieras.
- Recomendado: activa también el **backup diario de Hostinger** (VPS → Snapshots/Backups, ~3 USD/mes) para tener copia fuera del servidor.
