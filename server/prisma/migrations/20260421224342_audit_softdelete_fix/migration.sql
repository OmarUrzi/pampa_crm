-- CreateEnum
CREATE TYPE "UserId" AS ENUM ('Laura', 'Melanie');

-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('USD', 'ARS');

-- CreateEnum
CREATE TYPE "EventoStatus" AS ENUM ('consulta', 'cotizando', 'enviada', 'negociacion', 'confirmado', 'perdido');

-- CreateEnum
CREATE TYPE "CommTipo" AS ENUM ('Mail', 'WhatsApp');

-- CreateEnum
CREATE TYPE "PagoTipo" AS ENUM ('cobro_cliente', 'pago_proveedor');

-- CreateTable
CREATE TABLE "AppUser" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Empresa" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "sector" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Empresa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contacto" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "cargo" TEXT,
    "email" TEXT,
    "telefono" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contacto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Evento" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "contactoRef" TEXT,
    "locacion" TEXT NOT NULL,
    "fechaLabel" TEXT NOT NULL,
    "pax" INTEGER NOT NULL,
    "status" "EventoStatus" NOT NULL,
    "currency" "Currency" NOT NULL,
    "responsable" "UserId" NOT NULL,
    "tipo" TEXT NOT NULL,
    "cotizadoTotal" INTEGER NOT NULL DEFAULT 0,
    "costoEstimado" INTEGER NOT NULL DEFAULT 0,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Evento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CotizacionVersion" (
    "id" TEXT NOT NULL,
    "eventoId" TEXT NOT NULL,
    "versionNo" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CotizacionVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CotizacionItem" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "servicio" TEXT NOT NULL,
    "proveedor" TEXT NOT NULL,
    "pax" INTEGER NOT NULL,
    "unitCur" "Currency" NOT NULL DEFAULT 'USD',
    "unit" INTEGER NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "CotizacionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Proveedor" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "categoria" TEXT,
    "contacto" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Proveedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProveedorPedido" (
    "id" TEXT NOT NULL,
    "eventoId" TEXT NOT NULL,
    "proveedorId" TEXT,
    "proveedorTxt" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "pedidoLabel" TEXT NOT NULL,
    "pedidoAt" TIMESTAMP(3),
    "respondioLabel" TEXT,
    "respondioAt" TIMESTAMP(3),
    "montoLabel" TEXT,
    "rating" INTEGER,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProveedorPedido_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pago" (
    "id" TEXT NOT NULL,
    "eventoId" TEXT NOT NULL,
    "concepto" TEXT NOT NULL,
    "tipo" "PagoTipo" NOT NULL,
    "monto" INTEGER NOT NULL,
    "moneda" "Currency" NOT NULL,
    "fechaLabel" TEXT NOT NULL,
    "ok" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pago_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventoComm" (
    "id" TEXT NOT NULL,
    "eventoId" TEXT NOT NULL,
    "de" TEXT NOT NULL,
    "msg" TEXT NOT NULL,
    "horaLabel" TEXT NOT NULL,
    "dir" TEXT NOT NULL,
    "tipo" "CommTipo" NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventoComm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventoChatMsg" (
    "id" TEXT NOT NULL,
    "eventoId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "msg" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventoChatMsg_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiPromptLog" (
    "id" TEXT NOT NULL,
    "eventoId" TEXT,
    "prompt" TEXT NOT NULL,
    "response" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiPromptLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActividadCatalogo" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "categoria" TEXT NOT NULL,
    "duracion" TEXT,
    "capacidad" TEXT,
    "precioUsd" INTEGER,
    "proveedorTxt" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActividadCatalogo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActividadTemporada" (
    "id" TEXT NOT NULL,
    "actividadId" TEXT NOT NULL,
    "temporada" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ActividadTemporada_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActividadFoto" (
    "id" TEXT NOT NULL,
    "actividadId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "caption" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActividadFoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userEmail" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "summary" TEXT,
    "data" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AppUser_email_key" ON "AppUser"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Empresa_nombre_key" ON "Empresa"("nombre");

-- CreateIndex
CREATE INDEX "Contacto_empresaId_idx" ON "Contacto"("empresaId");

-- CreateIndex
CREATE INDEX "Evento_empresaId_idx" ON "Evento"("empresaId");

-- CreateIndex
CREATE INDEX "Evento_status_idx" ON "Evento"("status");

-- CreateIndex
CREATE INDEX "Evento_responsable_idx" ON "Evento"("responsable");

-- CreateIndex
CREATE INDEX "CotizacionVersion_eventoId_idx" ON "CotizacionVersion"("eventoId");

-- CreateIndex
CREATE UNIQUE INDEX "CotizacionVersion_eventoId_versionNo_key" ON "CotizacionVersion"("eventoId", "versionNo");

-- CreateIndex
CREATE INDEX "CotizacionItem_versionId_idx" ON "CotizacionItem"("versionId");

-- CreateIndex
CREATE UNIQUE INDEX "Proveedor_nombre_key" ON "Proveedor"("nombre");

-- CreateIndex
CREATE INDEX "ProveedorPedido_eventoId_idx" ON "ProveedorPedido"("eventoId");

-- CreateIndex
CREATE INDEX "ProveedorPedido_proveedorId_idx" ON "ProveedorPedido"("proveedorId");

-- CreateIndex
CREATE INDEX "Pago_eventoId_idx" ON "Pago"("eventoId");

-- CreateIndex
CREATE INDEX "Pago_tipo_idx" ON "Pago"("tipo");

-- CreateIndex
CREATE INDEX "Pago_ok_idx" ON "Pago"("ok");

-- CreateIndex
CREATE INDEX "EventoComm_eventoId_idx" ON "EventoComm"("eventoId");

-- CreateIndex
CREATE INDEX "EventoComm_tipo_idx" ON "EventoComm"("tipo");

-- CreateIndex
CREATE INDEX "EventoChatMsg_eventoId_idx" ON "EventoChatMsg"("eventoId");

-- CreateIndex
CREATE INDEX "AiPromptLog_eventoId_idx" ON "AiPromptLog"("eventoId");

-- CreateIndex
CREATE INDEX "ActividadTemporada_actividadId_idx" ON "ActividadTemporada"("actividadId");

-- CreateIndex
CREATE UNIQUE INDEX "ActividadTemporada_actividadId_temporada_key" ON "ActividadTemporada"("actividadId", "temporada");

-- CreateIndex
CREATE INDEX "ActividadFoto_actividadId_idx" ON "ActividadFoto"("actividadId");

-- CreateIndex
CREATE INDEX "AuditLog_userEmail_idx" ON "AuditLog"("userEmail");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "Contacto" ADD CONSTRAINT "Contacto_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evento" ADD CONSTRAINT "Evento_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CotizacionVersion" ADD CONSTRAINT "CotizacionVersion_eventoId_fkey" FOREIGN KEY ("eventoId") REFERENCES "Evento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CotizacionItem" ADD CONSTRAINT "CotizacionItem_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "CotizacionVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProveedorPedido" ADD CONSTRAINT "ProveedorPedido_eventoId_fkey" FOREIGN KEY ("eventoId") REFERENCES "Evento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProveedorPedido" ADD CONSTRAINT "ProveedorPedido_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "Proveedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pago" ADD CONSTRAINT "Pago_eventoId_fkey" FOREIGN KEY ("eventoId") REFERENCES "Evento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventoComm" ADD CONSTRAINT "EventoComm_eventoId_fkey" FOREIGN KEY ("eventoId") REFERENCES "Evento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventoChatMsg" ADD CONSTRAINT "EventoChatMsg_eventoId_fkey" FOREIGN KEY ("eventoId") REFERENCES "Evento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActividadTemporada" ADD CONSTRAINT "ActividadTemporada_actividadId_fkey" FOREIGN KEY ("actividadId") REFERENCES "ActividadCatalogo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActividadFoto" ADD CONSTRAINT "ActividadFoto_actividadId_fkey" FOREIGN KEY ("actividadId") REFERENCES "ActividadCatalogo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
