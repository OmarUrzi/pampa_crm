export type CatalogoActividad = {
  id: string;
  nombre: string;
  descripcion: string;
  categoria: string;
  precioUsd: number;
  proveedorSugerido: string;
  fotos: Array<{ id: string; url: string }>;
};

export const catalogoActividades: CatalogoActividad[] = [
  {
    id: "act-1",
    nombre: "Cabalgata en los Andes",
    descripcion:
      "Experiencia guiada con vistas a la cordillera, ideal para grupos corporativos. Incluye traslado y briefing de seguridad.",
    categoria: "Outdoor",
    precioUsd: 85,
    proveedorSugerido: "Cabalgatas Patagonia",
    fotos: [],
  },
  {
    id: "act-2",
    nombre: "Cata de Vinos Premium",
    descripcion:
      "Cata dirigida por sommelier con selección premium. Perfecta para bienvenida o after office.",
    categoria: "Gastronomía",
    precioUsd: 65,
    proveedorSugerido: "Bodegas Zuccardi",
    fotos: [],
  },
  {
    id: "act-3",
    nombre: "Kayak Nahuel Huapi",
    descripcion:
      "Actividad outdoor en lago con guías y equipamiento incluido. Opción de circuito suave o intermedio.",
    categoria: "Outdoor",
    precioUsd: 70,
    proveedorSugerido: "Cabalgatas Patagonia",
    fotos: [],
  },
  {
    id: "act-4",
    nombre: "Gala de Cierre",
    descripcion:
      "Producción integral de gala: ambientación, timing, coordinación de proveedores y experiencia de cierre.",
    categoria: "Eventos",
    precioUsd: 150,
    proveedorSugerido: "Chef & Events",
    fotos: [],
  },
  {
    id: "act-5",
    nombre: "Team Building Culinario",
    descripcion:
      "Dinámica por equipos con estación de cocina y jurado final. Se adapta a restricciones alimentarias.",
    categoria: "Team Building",
    precioUsd: 90,
    proveedorSugerido: "Chef & Events",
    fotos: [],
  },
  {
    id: "act-6",
    nombre: "Esquí en Cerro Catedral",
    descripcion:
      "Jornada completa con pases, logística y asistencia. Opciones para principiantes (clase + equipo).",
    categoria: "Outdoor",
    precioUsd: 180,
    proveedorSugerido: "Cabalgatas Patagonia",
    fotos: [],
  },
  {
    id: "act-7",
    nombre: "City Tour Bariloche",
    descripcion:
      "Recorrido guiado por puntos icónicos con paradas fotográficas y coordinación de tiempos para el grupo.",
    categoria: "Cultural",
    precioUsd: 45,
    proveedorSugerido: "Traslados VIP",
    fotos: [],
  },
  {
    id: "act-8",
    nombre: "Workshop de Innovación",
    descripcion:
      "Workshop facilitado con dinámicas de ideación y priorización. Se puede adaptar a objetivos del cliente.",
    categoria: "Team Building",
    precioUsd: 55,
    proveedorSugerido: "—",
    fotos: [],
  },
];

