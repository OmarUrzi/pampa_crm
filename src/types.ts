export type Currency = "USD" | "ARS";
export type UserId = "Laura" | "Melanie";

export type EventoStatus =
  | "consulta"
  | "cotizando"
  | "enviada"
  | "negociacion"
  | "confirmado"
  | "perdido";

export type Evento = {
  id: string;
  nombre: string;
  empresa: string;
  contacto: string;
  clienteId?: string;
  contactoId?: string;
  locacion: string;
  fecha: string;
  pax: number;
  status: EventoStatus;
  cur: Currency;
  cotizado: number;
  costo: number;
  resp: UserId;
  tipo: string;
};

export type Contacto = {
  id: string;
  nombre: string;
  cargo?: string;
  email?: string;
  telefono?: string;
};

export type Cliente = {
  id: string;
  nombre: string;
  sector?: string;
  contactos: Contacto[];
};

export type EventoTab =
  | "resumen"
  | "cotizaciones"
  | "comunicaciones"
  | "proveedores"
  | "pagos"
  | "chat";

export type CotizacionItem = {
  id: string;
  servicio: string;
  proveedor: string;
  pax: number;
  unitCur: Currency;
  unit: number;
};

export type CotizacionVersion = {
  id: string;
  label: string;
  createdAtLabel: string;
  items: CotizacionItem[];
};

export type PagoTipo = "cobro_cliente" | "pago_proveedor";
export type Pago = {
  id: string;
  concepto: string;
  tipo: PagoTipo;
  monto: number;
  moneda: Currency;
  fechaLabel: string;
  ok: boolean;
};

export type EventoCommsTipo = "Mail" | "WhatsApp";
export type EventoComm = {
  id: string;
  de: string;
  msg: string;
  horaLabel: string;
  dir: "in" | "out";
  tipo: EventoCommsTipo;
};

export type ProveedorPedido = {
  id: string;
  proveedorId?: string;
  proveedor: string;
  categoria: string;
  pedidoLabel: string;
  pedidoAt?: number;
  respondioLabel: string | null;
  respondioAt?: number;
  montoLabel: string | null;
  rating?: number;
};

export type ChatMsg = { id: string; r: "ai" | "user"; m: string };

export type ProveedorContacto = {
  id: string;
  nombre: string;
  email?: string;
  telefono?: string;
};

export type Proveedor = {
  id: string;
  nombre: string;
  categoria: string;
  contactos: ProveedorContacto[];
};

