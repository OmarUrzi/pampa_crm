import { apiFetch } from "./client";
import type { CotizacionVersion, Currency } from "../types";

type DbCotizacionItem = {
  id: string;
  servicio: string;
  proveedor: string;
  pax: number;
  unitCur: Currency;
  unit: number;
};

type DbCotizacionVersion = {
  id: string;
  label: string;
  versionNo: number;
  createdAt: string;
  items: DbCotizacionItem[];
};

function fmtCreatedAt(createdAt: string) {
  const d = new Date(createdAt);
  const dd = String(d.getDate()).padStart(2, "0");
  const mmm = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"][
    d.getMonth()
  ];
  return `${dd} ${mmm}`;
}

export function mapDbVersions(versions: DbCotizacionVersion[]): CotizacionVersion[] {
  return versions
    .slice()
    .sort((a, b) => a.versionNo - b.versionNo)
    .map((v) => ({
      id: v.id,
      label: v.label,
      createdAtLabel: fmtCreatedAt(v.createdAt),
      items: v.items.map((it) => ({
        id: it.id,
        servicio: it.servicio ?? "",
        proveedor: it.proveedor ?? "",
        pax: it.pax ?? 0,
        unitCur: it.unitCur ?? "USD",
        unit: it.unit ?? 0,
      })),
    }));
}

export async function apiFetchEventoCotizaciones(eventoId: string) {
  const res = await apiFetch<{ evento: { cotizaciones: DbCotizacionVersion[] } }>(`/eventos/${eventoId}`);
  return mapDbVersions(res.evento.cotizaciones ?? []);
}

export async function apiCreateCotizacionVersion(eventoId: string) {
  const res = await apiFetch<{ version: DbCotizacionVersion }>(`/eventos/${eventoId}/cotizaciones/version`, {
    method: "POST",
    body: JSON.stringify({}),
  });
  return res.version;
}

export async function apiAddCotizacionItem(eventoId: string, versionId: string, data: Partial<DbCotizacionItem>) {
  return await apiFetch<{ item: DbCotizacionItem }>(
    `/eventos/${eventoId}/cotizaciones/${versionId}/items`,
    {
      method: "POST",
      body: JSON.stringify(data),
    },
  );
}

export async function apiPatchCotizacionItem(
  eventoId: string,
  versionId: string,
  itemId: string,
  patch: Partial<DbCotizacionItem>,
) {
  return await apiFetch<{ item: DbCotizacionItem }>(
    `/eventos/${eventoId}/cotizaciones/${versionId}/items/${itemId}`,
    {
      method: "PATCH",
      body: JSON.stringify(patch),
    },
  );
}

export async function apiDeleteCotizacionItem(eventoId: string, versionId: string, itemId: string) {
  return await apiFetch<{ ok: boolean }>(
    `/eventos/${eventoId}/cotizaciones/${versionId}/items/${itemId}`,
    { method: "DELETE" },
  );
}

