# Gmail — estrategia recomendada (fase futura)

## Objetivo
Vincular emails a un **evento** y/o **empresa/contacto** para poder:
- ver historial completo,
- automatizar seguimiento,
- habilitar preguntas a IA (“¿qué pidió el cliente?”).

## Enfoque incremental
1. **Vinculación manual**: en el CRM, botón “Asociar hilo” pegando el `messageId/threadId`.
2. **Reglas simples**: por dominio/subject + contactos + ventana de fechas.
3. **Ingest automático**: lectura periódica (watch/push) y clasificación con reglas.

## Consideraciones
- OAuth restringido a Laura/Melanie.
- Guardar solo metadata + cuerpo, o solo metadata y link al email (según privacidad).

