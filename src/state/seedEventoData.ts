import type {
  ChatMsg,
  CotizacionVersion,
  EventoComm,
  Pago,
  ProveedorPedido,
} from "../types";

export function seedCotizaciones(eventoId: string): CotizacionVersion[] {
  if (eventoId !== "1") return [];
  return [
    {
      id: "v1",
      label: "v1",
      createdAtLabel: "03 Ene",
      items: [
        { id: "i1", servicio: "Transfer BUE→Bariloche", proveedor: "Traslados VIP", pax: 80, unitCur: "USD", unit: 120 },
        { id: "i2", servicio: "Alojamiento 3 noches", proveedor: "Hotel Llao Llao", pax: 80, unitCur: "USD", unit: 280 },
        { id: "i3", servicio: "Cabalgata en los Andes", proveedor: "Cabalgatas Patagonia", pax: 80, unitCur: "USD", unit: 85 },
      ],
    },
    {
      id: "v2",
      label: "v2",
      createdAtLabel: "08 Ene",
      items: [
        { id: "i1", servicio: "Transfer BUE→Bariloche", proveedor: "Traslados VIP", pax: 80, unitCur: "USD", unit: 120 },
        { id: "i2", servicio: "Alojamiento 3 noches", proveedor: "Hotel Llao Llao", pax: 80, unitCur: "USD", unit: 280 },
        { id: "i3", servicio: "Cabalgata en los Andes", proveedor: "Cabalgatas Patagonia", pax: 80, unitCur: "USD", unit: 85 },
        { id: "i4", servicio: "Gala de cierre + catering", proveedor: "Chef & Events", pax: 80, unitCur: "USD", unit: 150 },
      ],
    },
    {
      id: "v3",
      label: "v3",
      createdAtLabel: "15 Ene ✓",
      items: [
        { id: "i1", servicio: "Transfer BUE→Bariloche", proveedor: "Traslados VIP", pax: 80, unitCur: "USD", unit: 120 },
        { id: "i2", servicio: "Alojamiento 3 noches", proveedor: "Hotel Llao Llao", pax: 80, unitCur: "USD", unit: 280 },
        { id: "i3", servicio: "Cabalgata en los Andes", proveedor: "Cabalgatas Patagonia", pax: 80, unitCur: "USD", unit: 85 },
        { id: "i4", servicio: "Gala de cierre + catering", proveedor: "Chef & Events", pax: 80, unitCur: "USD", unit: 150 },
        { id: "i5", servicio: "Sonido e iluminación", proveedor: "Sonido Pro BA", pax: 1, unitCur: "USD", unit: 2200 },
      ],
    },
  ];
}

export function seedProveedoresPedidos(eventoId: string): ProveedorPedido[] {
  if (eventoId !== "1") return [];
  return [
    { id: "p1", proveedorId: "prov-3", proveedor: "Hotel Llao Llao", categoria: "Alojamiento", pedidoLabel: "03 Ene", pedidoAt: 1735862400000, respondioLabel: null, respondioAt: undefined, montoLabel: null },
    { id: "p2", proveedorId: "prov-1", proveedor: "Cabalgatas Patagonia", categoria: "Outdoor", pedidoLabel: "03 Ene", pedidoAt: 1735862400000, respondioLabel: "05 Ene", respondioAt: 1736035200000, montoLabel: "U$D 6.800", rating: 5 },
    { id: "p3", proveedorId: "prov-5", proveedor: "Chef & Events", categoria: "Catering", pedidoLabel: "03 Ene", pedidoAt: 1735862400000, respondioLabel: "04 Ene", respondioAt: 1735948800000, montoLabel: "U$D 12.000", rating: 4 },
    { id: "p4", proveedorId: "prov-6", proveedor: "Traslados VIP", categoria: "Transporte", pedidoLabel: "05 Ene", pedidoAt: 1736035200000, respondioLabel: "05 Ene", respondioAt: 1736035200000, montoLabel: "U$D 9.600", rating: 4 },
    { id: "p5", proveedorId: "prov-4", proveedor: "Sonido Pro BA", categoria: "Audio", pedidoLabel: "08 Ene", pedidoAt: 1736294400000, respondioLabel: "09 Ene", respondioAt: 1736380800000, montoLabel: "U$D 2.200", rating: 4 },
  ];
}

export function seedPagos(eventoId: string): Pago[] {
  if (eventoId !== "1") return [];
  return [
    { id: "pay1", concepto: "Seña 30%", tipo: "cobro_cliente", monto: 15900, moneda: "USD", fechaLabel: "10 Ene 2025", ok: true },
    { id: "pay2", concepto: "Saldo restante", tipo: "cobro_cliente", monto: 37100, moneda: "USD", fechaLabel: "10 Feb 2025", ok: false },
    { id: "pay3", concepto: "Pago Hotel Llao Llao", tipo: "pago_proveedor", monto: 22400, moneda: "USD", fechaLabel: "20 Ene 2025", ok: false },
    { id: "pay4", concepto: "Pago Cabalgatas Patagonia", tipo: "pago_proveedor", monto: 6800, moneda: "USD", fechaLabel: "15 Feb 2025", ok: false },
  ];
}

export function seedComms(eventoId: string): EventoComm[] {
  if (eventoId !== "1") return [];
  return [
    { id: "m1", de: "Martín Pérez", msg: "Confirmamos el 15 de febrero. ¿Pueden incluir transfer aeropuerto?", horaLabel: "Hoy 10:23", dir: "in", tipo: "Mail" },
    { id: "m2", de: "Laura V.", msg: "Perfecto Martín, incluimos el transfer. Adjuntamos cotización actualizada v3.", horaLabel: "Hoy 09:15", dir: "out", tipo: "Mail" },
    { id: "m3", de: "Martín Pérez", msg: "¿El tema de los esquís para los que no saben está cubierto?", horaLabel: "Ayer 18:40", dir: "in", tipo: "WhatsApp" },
    { id: "m4", de: "Laura V.", msg: "Sí, Cabalgatas Patagonia incluye instructor y equipo básico.", horaLabel: "Ayer 18:55", dir: "out", tipo: "WhatsApp" },
  ];
}

export function seedChat(eventoId: string, eventoNombre: string): ChatMsg[] {
  if (eventoId !== "1") return [];
  return [
    { id: "c1", r: "ai", m: `Hola, soy el asistente de Pampa. Tengo acceso a toda la información del evento "${eventoNombre}". ¿En qué te puedo ayudar?` },
  ];
}

