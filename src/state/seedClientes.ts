import type { Cliente, Evento } from "../types";

export function seedClientesFromEventos(eventos: Evento[]): Cliente[] {
  const map = new Map<string, Cliente>();

  for (const e of eventos) {
    const nombre = (e.empresa ?? "").trim();
    if (!nombre || nombre === "—") continue;

    const id = slugId(nombre);
    const cur =
      map.get(id) ??
      ({
        id,
        nombre,
        sector: undefined,
        contactos: [],
      } satisfies Cliente);

    const contactoNombre = (e.contacto ?? "").trim();
    if (contactoNombre && contactoNombre !== "—") {
      if (!cur.contactos.some((c) => c.nombre === contactoNombre)) {
        cur.contactos.push({ id: slugId(`${nombre}:${contactoNombre}`), nombre: contactoNombre });
      }
    }

    map.set(id, cur);
  }

  return [...map.values()].sort((a, b) => a.nombre.localeCompare(b.nombre));
}

function slugId(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

