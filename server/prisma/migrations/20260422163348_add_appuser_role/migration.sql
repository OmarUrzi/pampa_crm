-- CreateEnum
CREATE TYPE "AppUserRole" AS ENUM ('user', 'viewer', 'admin');

-- AlterTable
ALTER TABLE "AppUser" ADD COLUMN     "role" "AppUserRole" NOT NULL DEFAULT 'user';

-- CreateTable
CREATE TABLE "ProveedorContacto" (
    "id" TEXT NOT NULL,
    "proveedorId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "email" TEXT,
    "telefono" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProveedorContacto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProveedorContacto_proveedorId_idx" ON "ProveedorContacto"("proveedorId");

-- AddForeignKey
ALTER TABLE "ProveedorContacto" ADD CONSTRAINT "ProveedorContacto_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "Proveedor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
