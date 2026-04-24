import { Modal } from "./Modal";
import { Button } from "./ui";

export function ConfirmModal({
  title = "Confirmar",
  message = "¿Realmente querés continuar?",
  confirmText = "Sí, eliminar",
  cancelText = "Cancelar",
  danger = true,
  onConfirm,
  onClose,
  busy,
}: {
  title?: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
}) {
  return (
    <Modal
      title={title}
      onClose={() => {
        if (busy) return;
        onClose();
      }}
      footer={
        <>
          <Button type="button" onClick={onClose} disabled={!!busy}>
            {cancelText}
          </Button>
          <Button
            variant={danger ? "primary" : undefined}
            type="button"
            onClick={() => void onConfirm()}
            disabled={!!busy}
          >
            {busy ? "Procesando…" : confirmText}
          </Button>
        </>
      }
    >
      <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.55 }}>{message}</div>
    </Modal>
  );
}

