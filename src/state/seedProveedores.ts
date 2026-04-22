import type { Proveedor } from "../types";

export const seedProveedores: Proveedor[] = [
  {
    id: "prov-1",
    nombre: "Cabalgatas Patagonia",
    categoria: "Outdoor",
    contactos: [{ id: "pc-1", nombre: "Roberto Sosa", email: "roberto@cabalgatas.com", telefono: "+54 9 11 5555-1111" }],
  },
  {
    id: "prov-2",
    nombre: "Bodegas Zuccardi",
    categoria: "Gastronomía",
    contactos: [{ id: "pc-2", nombre: "Luciana Zuccardi", email: "luciana@zuccardi.com", telefono: "+54 9 11 5555-2222" }],
  },
  {
    id: "prov-3",
    nombre: "Hotel Llao Llao",
    categoria: "Alojamiento",
    contactos: [{ id: "pc-3", nombre: "Carlos Méndez", email: "carlos@llaollao.com", telefono: "+54 9 11 5555-3333" }],
  },
  {
    id: "prov-4",
    nombre: "Sonido Pro BA",
    categoria: "Audio/Técnica",
    contactos: [{ id: "pc-4", nombre: "Pablo Quiroga", email: "pablo@sonidopro.com", telefono: "+54 9 11 5555-4444" }],
  },
  {
    id: "prov-5",
    nombre: "Chef & Events",
    categoria: "Catering",
    contactos: [{ id: "pc-5", nombre: "Marina Torres", email: "marina@chef-events.com", telefono: "+54 9 11 5555-5555" }],
  },
  {
    id: "prov-6",
    nombre: "Traslados VIP",
    categoria: "Transporte",
    contactos: [{ id: "pc-6", nombre: "Juan Rodríguez", email: "juan@trasladosvip.com", telefono: "+54 9 11 5555-6666" }],
  },
];

