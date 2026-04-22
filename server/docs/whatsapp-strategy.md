# WhatsApp — estrategia recomendada

## Opciones

### 1) WhatsApp Business API (oficial)
- **Pros**: estable, soporte, cumplimiento.
- **Contras**: onboarding/aprobación, costos por conversación, requiere número Business.
- **Recomendado**: si quieren que sea parte central del CRM.

### 2) Proveedor / bridge (Twilio, 360dialog, etc.)
- **Pros**: simplifica onboarding y hosting.
- **Contras**: costos + lock-in.

### 3) Automatizaciones (Make/Zapier)
- **Pros**: muy rápido para MVP; permite “copiar” mensajes a un webhook.
- **Contras**: menos integrado, mantenimiento de escenarios.
- **Recomendado**: primer paso si WhatsApp es “semi informal”.

### 4) whatsapp-web.js (no oficial)
- **Pros**: rápido y barato.
- **Contras**: riesgo de bloqueo, inestabilidad.
- **No recomendado** para un sistema de trabajo diario.

## Recomendación por fases
- **Fase MVP**: registrar comunicaciones manualmente + “inbox” dentro del evento (lo que ya tenemos en UI).
- **Fase Integración**: Make/Zapier → webhook a `/comms/import` con metadatos mínimos.
- **Fase Producto**: Business API oficial cuando definan número y costos.

