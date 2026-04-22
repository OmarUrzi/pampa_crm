import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Users (for auth restriction later)
  await prisma.appUser.upsert({
    where: { email: "laura@example.com" },
    update: { name: "Laura" },
    create: { email: "laura@example.com", name: "Laura" },
  });
  await prisma.appUser.upsert({
    where: { email: "melanie@example.com" },
    update: { name: "Melanie" },
    create: { email: "melanie@example.com", name: "Melanie" },
  });

  // Empresas + contactos
  const techcorp = await prisma.empresa.upsert({
    where: { nombre: "TechCorp SA" },
    update: {},
    create: { nombre: "TechCorp SA", sector: "Tecnología" },
  });

  await prisma.contacto.upsert({
    where: { id: "seed-ct-martin" },
    update: {
      empresaId: techcorp.id,
      nombre: "Martín Pérez",
      cargo: "HR",
      email: "martin@techcorp.example",
    },
    create: {
      id: "seed-ct-martin",
      empresaId: techcorp.id,
      nombre: "Martín Pérez",
      cargo: "HR",
      email: "martin@techcorp.example",
    },
  });

  // Proveedores
  const provTraslados = await prisma.proveedor.upsert({
    where: { nombre: "Traslados VIP" },
    update: { categoria: "Transporte" },
    create: { nombre: "Traslados VIP", categoria: "Transporte" },
  });
  const provCabalgatas = await prisma.proveedor.upsert({
    where: { nombre: "Cabalgatas Patagonia" },
    update: { categoria: "Outdoor" },
    create: { nombre: "Cabalgatas Patagonia", categoria: "Outdoor" },
  });
  const provChef = await prisma.proveedor.upsert({
    where: { nombre: "Chef & Events" },
    update: { categoria: "Catering" },
    create: { nombre: "Chef & Events", categoria: "Catering" },
  });

  // Proveedor contactos (nuevo modelo)
  await prisma.proveedorContacto.deleteMany({
    where: { proveedorId: { in: [provTraslados.id, provCabalgatas.id, provChef.id] } },
  });
  await prisma.proveedorContacto.createMany({
    data: [
      {
        proveedorId: provTraslados.id,
        nombre: "Juan Rodríguez",
        email: "juan@trasladosvip.example",
        telefono: "+54 9 11 5555-6666",
      },
      {
        proveedorId: provCabalgatas.id,
        nombre: "Roberto Sosa",
        email: "roberto@cabalgatas.example",
        telefono: "+54 9 11 5555-1111",
      },
      {
        proveedorId: provChef.id,
        nombre: "Marina Torres",
        email: "marina@chef-events.example",
        telefono: "+54 9 11 5555-5555",
      },
    ],
  });

  // Evento demo
  const ev = await prisma.evento.upsert({
    where: { id: "seed-ev-1" },
    update: {},
    create: {
      id: "seed-ev-1",
      empresaId: techcorp.id,
      nombre: "Retiro Corporativo Verano",
      contactoRef: "Martín Pérez",
      locacion: "Bariloche",
      fechaLabel: "15 Feb 2025",
      pax: 80,
      status: "confirmado",
      currency: "USD",
      responsable: "Laura",
      tipo: "Corporativo",
      cotizadoTotal: 53000,
      costoEstimado: 31000,
    },
  });

  // Cotización v1 current
  const v1 = await prisma.cotizacionVersion.upsert({
    where: { eventoId_versionNo: { eventoId: ev.id, versionNo: 1 } },
    update: { label: "v1", isCurrent: true },
    create: { eventoId: ev.id, versionNo: 1, label: "v1", isCurrent: true },
  });

  await prisma.cotizacionItem.deleteMany({ where: { versionId: v1.id } });
  await prisma.cotizacionItem.createMany({
    data: [
      {
        versionId: v1.id,
        servicio: "Transfer BUE→Bariloche",
        proveedor: provTraslados.nombre,
        pax: 80,
        unitCur: "USD",
        unit: 120,
      },
      {
        versionId: v1.id,
        servicio: "Cabalgata en los Andes",
        proveedor: provCabalgatas.nombre,
        pax: 80,
        unitCur: "USD",
        unit: 85,
      },
      {
        versionId: v1.id,
        servicio: "Gala de Cierre",
        proveedor: provChef.nombre,
        pax: 80,
        unitCur: "USD",
        unit: 150,
      },
    ],
  });

  // Pedidos a proveedores (para estadísticas)
  await prisma.proveedorPedido.upsert({
    where: { id: "seed-pp-1" },
    update: {},
    create: {
      id: "seed-pp-1",
      eventoId: ev.id,
      proveedorId: provCabalgatas.id,
      proveedorTxt: provCabalgatas.nombre,
      categoria: provCabalgatas.categoria ?? "Outdoor",
      pedidoLabel: "03 Ene 2025",
      pedidoAt: new Date("2025-01-03T12:00:00Z"),
      respondioLabel: "05 Ene 2025",
      respondioAt: new Date("2025-01-05T12:00:00Z"),
      montoLabel: "U$D 6.800",
      rating: 5,
    },
  });

  // Catálogo + fotos
  const act = await prisma.actividadCatalogo.upsert({
    where: { id: "seed-act-1" },
    update: {},
    create: {
      id: "seed-act-1",
      nombre: "Cabalgata en los Andes",
      descripcion: "Experiencia guiada con vistas a la cordillera. Incluye briefing y coordinación para grupos.",
      categoria: "Outdoor",
      precioUsd: 85,
      proveedorTxt: provCabalgatas.nombre,
    },
  });

  await prisma.actividadFoto.deleteMany({ where: { actividadId: act.id } });
  await prisma.actividadFoto.createMany({
    data: [
      { actividadId: act.id, url: "https://picsum.photos/seed/pampa1/1200/800", caption: "Vista panorámica" },
      { actividadId: act.id, url: "https://picsum.photos/seed/pampa2/1200/800", caption: "Actividad en grupo" },
    ],
  });
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });

