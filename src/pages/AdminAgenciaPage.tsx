import { useEffect, useMemo, useState } from "react";
import { Button, Pill } from "../ui/ui";
import { useAuthGate } from "../auth/useAuthGate";
import { useAuthStore } from "../state/useAuthStore";
import {
  apiAdminAgenciaGetAssets,
  apiAdminAgenciaGetProfile,
  apiAdminAgenciaPutProfile,
  apiAdminAgenciaUploadAsset,
  apiAdminAgenciaDeleteAsset,
  type AgenciaAsset,
} from "../api/agencia";
import { ConfirmModal } from "../ui/ConfirmModal";
import { API_BASE, getToken } from "../api/client";

type Profile = {
  name: string;
  tagline: string;
  about: string;
  contact: string;
  website: string;
};

const KIND_LABEL: Record<string, string> = {
  logo_square: "Logo (cuadrado)",
  logo_wide: "Logo (horizontal)",
  photo: "Foto",
};

function assetBlobUrl(assetId: string) {
  const token = getToken();
  const q = token ? `?token=${encodeURIComponent(token)}` : "";
  return `${API_BASE}/agencia/assets/${encodeURIComponent(assetId)}/blob${q}`;
}

export function AdminAgenciaPage() {
  const me = useAuthStore((s) => s.user);
  const { run, info } = useAuthGate();
  const isAdmin = (me?.role ?? "user") === "admin";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [assets, setAssets] = useState<AgenciaAsset[]>([]);
  const [confirmDel, setConfirmDel] = useState<AgenciaAsset | null>(null);
  const [kind, setKind] = useState<"logo_square" | "logo_wide" | "photo">("logo_wide");
  const [label, setLabel] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const [p, setP] = useState<Profile>({
    name: "Pampa",
    tagline: "",
    about: "",
    contact: "",
    website: "",
  });

  async function refresh() {
    setLoading(true);
    try {
      const [profRes, assetsRes] = await Promise.all([run(apiAdminAgenciaGetProfile), run(apiAdminAgenciaGetAssets)]);
      const prof = profRes?.profile ?? null;
      setP({
        name: prof?.name ?? "Pampa",
        tagline: prof?.tagline ?? "",
        about: prof?.about ?? "",
        contact: prof?.contact ?? "",
        website: prof?.website ?? "",
      });
      setAssets((assetsRes?.assets ?? []) as AgenciaAsset[]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!isAdmin) return;
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  const hasSquare = useMemo(() => assets.some((a) => a.kind === "logo_square"), [assets]);
  const hasWide = useMemo(() => assets.some((a) => a.kind === "logo_wide"), [assets]);

  if (!isAdmin) {
    return (
      <div style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: 12, padding: 14 }}>
        <div style={{ fontWeight: 900, marginBottom: 6 }}>Acceso denegado</div>
        <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
          Necesitás rol <strong>admin</strong> para ver esta pantalla.
        </div>
      </div>
    );
  }

  return (
    <div>
      {confirmDel ? (
        <ConfirmModal
          title="Eliminar asset"
          message={`¿Eliminar "${confirmDel.label ?? confirmDel.filename ?? confirmDel.id}"?`}
          confirmText="Sí, eliminar"
          cancelText="Cancelar"
          danger
          onClose={() => setConfirmDel(null)}
          onConfirm={() => {
            const id = confirmDel.id;
            setConfirmDel(null);
            void run(async () => {
              await apiAdminAgenciaDeleteAsset(id);
              info("Asset eliminado.");
              await refresh();
            });
          }}
        />
      ) : null}

      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 14 }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-serif)", fontSize: 20, margin: 0, fontWeight: 600 }}>Admin · Agencia</h1>
          <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 4 }}>
            Perfil + logos/fotos para que Claude los use en Slides.
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gap: 12 }}>
        <div style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: 12, padding: 14 }}>
          <div style={{ fontWeight: 900, marginBottom: 10 }}>Perfil</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={labelStyle}>Nombre</label>
              <input value={p.name} onChange={(e) => setP((s) => ({ ...s, name: e.target.value }))} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Tagline</label>
              <input value={p.tagline} onChange={(e) => setP((s) => ({ ...s, tagline: e.target.value }))} style={inputStyle} />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={labelStyle}>Sobre la agencia</label>
              <textarea
                value={p.about}
                onChange={(e) => setP((s) => ({ ...s, about: e.target.value }))}
                style={{ ...inputStyle, minHeight: 90, resize: "vertical", fontFamily: "inherit" }}
              />
            </div>
            <div>
              <label style={labelStyle}>Contacto</label>
              <input value={p.contact} onChange={(e) => setP((s) => ({ ...s, contact: e.target.value }))} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Website</label>
              <input value={p.website} onChange={(e) => setP((s) => ({ ...s, website: e.target.value }))} style={inputStyle} />
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
            <Button
              variant="primary"
              type="button"
              disabled={saving || loading || !p.name.trim()}
              onClick={() => {
                void run(async () => {
                  setSaving(true);
                  try {
                    await apiAdminAgenciaPutProfile({
                      name: p.name.trim(),
                      tagline: p.tagline.trim() || undefined,
                      about: p.about.trim() || undefined,
                      contact: p.contact.trim() || undefined,
                      website: p.website.trim() || undefined,
                    });
                    info("Perfil guardado.");
                    await refresh();
                  } finally {
                    setSaving(false);
                  }
                });
              }}
            >
              {saving ? "Guardando…" : "Guardar perfil"}
            </Button>
          </div>
        </div>

        <div style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: 12, padding: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
            <div>
              <div style={{ fontWeight: 900 }}>Assets</div>
              <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 4 }}>
                Recomendado: cargar <strong>logo_square</strong> y <strong>logo_wide</strong>.
              </div>
            </div>
            <Pill style={{ background: "var(--color-background-secondary)", color: "var(--color-text-secondary)" }}>
              {hasSquare ? "logo cuadrado ✓" : "sin logo cuadrado"} · {hasWide ? "logo ancho ✓" : "sin logo ancho"}
            </Pill>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1.4fr", gap: 10, marginTop: 12, alignItems: "end" }}>
            <div>
              <label style={labelStyle}>Tipo</label>
              <select value={kind} onChange={(e) => setKind(e.target.value as any)} style={{ ...inputStyle, padding: "8px 10px" }}>
                <option value="logo_wide">{KIND_LABEL.logo_wide}</option>
                <option value="logo_square">{KIND_LABEL.logo_square}</option>
                <option value="photo">{KIND_LABEL.photo}</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Etiqueta (opcional)</label>
              <input value={label} onChange={(e) => setLabel(e.target.value)} style={inputStyle} placeholder="Ej: Lufthansa" />
            </div>
            <div>
              <label style={labelStyle}>Archivo</label>
              <input type="file" accept="image/*" onChange={(e) => setFile((e.target.files?.[0] as any) ?? null)} style={inputStyle} />
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 10 }}>
            <Button
              variant="primary"
              type="button"
              disabled={!file || uploading}
              onClick={() => {
                if (!file) return;
                void run(async () => {
                  setUploading(true);
                  try {
                    await apiAdminAgenciaUploadAsset({ kind, label: label.trim() || undefined, file });
                    setFile(null);
                    setLabel("");
                    info("Asset subido.");
                    await refresh();
                  } finally {
                    setUploading(false);
                  }
                });
              }}
            >
              {uploading ? "Subiendo…" : "Subir asset"}
            </Button>
          </div>

          <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 10 }}>
            {(assets ?? []).map((a) => {
              const url = a.bytes ? assetBlobUrl(a.id) : a.url ?? "";
              return (
                <div key={a.id} style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: 12, overflow: "hidden" }}>
                  <div style={{ height: 110, background: "var(--color-background-secondary)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {url ? <img src={url} alt="" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} /> : <span style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>sin preview</span>}
                  </div>
                  <div style={{ padding: 10, display: "grid", gap: 6 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                      <div style={{ fontSize: 11, fontWeight: 900 }}>{KIND_LABEL[a.kind] ?? a.kind}</div>
                      <button
                        type="button"
                        onClick={() => setConfirmDel(a)}
                        style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--color-text-secondary)", fontWeight: 900 }}
                        title="Eliminar"
                      >
                        ×
                      </button>
                    </div>
                    <div style={{ fontSize: 11, color: "var(--color-text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {a.label ?? a.filename ?? a.id}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {loading ? <div style={{ marginTop: 10, fontSize: 12, color: "var(--color-text-secondary)" }}>cargando…</div> : null}
        </div>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 900,
  color: "var(--color-text-secondary)",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  border: "0.5px solid var(--color-border-secondary)",
  borderRadius: 10,
  padding: "8px 11px",
  background: "var(--color-background-primary)",
  color: "var(--color-text-primary)",
  fontSize: 12,
  marginTop: 6,
};

