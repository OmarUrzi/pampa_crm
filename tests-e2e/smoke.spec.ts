import { test, expect, type Page } from "@playwright/test";

async function loginDev(page: Page, email: string) {
  await page.goto("/login");
  await page.getByPlaceholder("tu@pampa.com").fill(email);
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
}

async function loginDevWithExpiresIn(page: Page, email: string, expiresIn: string) {
  await page.goto("/login");
  await page.evaluate(
    async ({ email, expiresIn }) => {
      const res = await fetch("http://localhost:8787/auth/dev-login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, expiresIn }),
      });
      const json = await res.json();
      window.localStorage.setItem("pampa-crm:token", json.token);
      window.dispatchEvent(new Event("pampa-crm:token"));
    },
    { email, expiresIn },
  );
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
}

test("dev login redirects to dashboard", async ({ page }) => {
  await loginDev(page, "omarurzim@gmail.com");
});

test("can open admin users page (admin only)", async ({ page }) => {
  await loginDev(page, "omarurzim@gmail.com");

  // Verify role is admin in this environment
  const sess = await page.evaluate(async () => {
    const token = window.localStorage.getItem("pampa-crm:token");
    const res = await fetch("http://localhost:8787/auth/session", {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
    return await res.json();
  });
  expect(sess?.user?.role, `Expected admin role, got: ${JSON.stringify(sess?.user)}`).toBe("admin");

  await page.goto("/admin/users");
  await expect(page.getByRole("heading", { name: "Usuarios" })).toBeVisible({ timeout: 15_000 });
});

test("can create proveedor", async ({ page }) => {
  await loginDev(page, "omarurzim@gmail.com");

  const provName = `E2E Prov ${Date.now()}`;

  await page.goto("/proveedores");
  await page.getByRole("button", { name: "+ Nuevo proveedor" }).click();

  // Modal fields are not linked via htmlFor; locate via nearby labels.
  const modal = page.getByRole("dialog");
  await expect(modal).toBeVisible();

  const proveedorInput = modal.locator('label:has-text("Proveedor")').locator("..").locator("input").first();
  const categoriaInput = modal.locator('label:has-text("Categoría")').locator("..").locator("input").first();
  await proveedorInput.fill(provName);
  await categoriaInput.fill("Catering");

  await modal.getByRole("button", { name: "+ Agregar contacto" }).click();

  const nombreCt = modal.locator('label:has-text("Nombre")').locator("..").locator("input").first();
  const emailCt = modal.locator('label:has-text("Email")').locator("..").locator("input").first();
  const telCt = modal.locator('label:has-text("Teléfono")').locator("..").locator("input").first();
  await nombreCt.fill("Contacto E2E");
  await emailCt.fill("e2e@example.com");
  await telCt.fill("+54911111111");

  await modal.getByRole("button", { name: "Guardar" }).click();

  // Should be back on table and see new row
  await expect(page.getByText(provName)).toBeVisible({ timeout: 15_000 });
});

test("role change hides admin navigation for non-admin", async ({ page }) => {
  // Ensure Melanie is not admin
  await loginDev(page, "omarurzim@gmail.com");
  await page.goto("/admin/users");
  await expect(page.getByRole("heading", { name: "Usuarios" })).toBeVisible({ timeout: 15_000 });

  const row = page.locator("tr", { hasText: "melanie@example.com" });
  await expect(row).toBeVisible({ timeout: 15_000 });
  await row.getByRole("button", { name: "user", exact: true }).click();

  // logout
  await page.getByRole("button", { name: "Salir", exact: true }).click();
  await expect(page).toHaveURL(/\/login/);

  // login as non-admin
  await loginDev(page, "melanie@example.com");

  // Sidebar should not have Admin
  await expect(page.getByRole("link", { name: "Admin" })).toHaveCount(0);

  // Visiting admin route should show access denied (page-level guard)
  await page.goto("/admin/users");
  await expect(page.getByText("Acceso denegado")).toBeVisible({ timeout: 15_000 });
});

test("expired jwt forces re-login on mutation", async ({ page }) => {
  await loginDevWithExpiresIn(page, "omarurzim@gmail.com", "1s");
  await page.waitForTimeout(1500);

  await page.goto("/proveedores");
  await page.getByRole("button", { name: "+ Nuevo proveedor" }).click();
  const modal = page.getByRole("dialog");
  await expect(modal).toBeVisible();

  const proveedorInput = modal.locator('label:has-text("Proveedor")').locator("..").locator("input").first();
  const categoriaInput = modal.locator('label:has-text("Categoría")').locator("..").locator("input").first();
  await proveedorInput.fill(`Expired Prov ${Date.now()}`);
  await categoriaInput.fill("Catering");

  await modal.getByRole("button", { name: "Guardar" }).click();
  await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
  await expect(page.getByText("Tu sesión expiró. Volvé a ingresar.")).toBeVisible({ timeout: 15_000 });
});

test("expired jwt forces re-login when changing evento status", async ({ page }) => {
  await loginDevWithExpiresIn(page, "omarurzim@gmail.com", "1s");
  await page.waitForTimeout(1500);

  await page.goto("/eventos");
  // Open first status dropdown and change to a different label
  const firstRow = page.locator("tbody tr").first();
  await expect(firstRow).toBeVisible({ timeout: 15_000 });
  // Click the dropdown button (it contains the label + ▾)
  await firstRow.locator("button[aria-haspopup='menu']").click();
  // Pick "Confirmado" (exists in UI)
  await page.getByRole("menuitem", { name: /Confirmado/ }).click();

  await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
  await expect(page.getByText("Tu sesión expiró. Volvé a ingresar.")).toBeVisible({ timeout: 15_000 });
});

test("non-admin sees access denied on admin route", async ({ page }) => {
  await loginDev(page, "melanie@example.com");
  await page.goto("/admin/users");
  await expect(page.getByText("Acceso denegado")).toBeVisible({ timeout: 15_000 });
});

test("viewer cannot mutate (403) and stays on page", async ({ page }) => {
  // Ensure Melanie is viewer
  await loginDev(page, "omarurzim@gmail.com");
  await page.goto("/admin/users");
  const row = page.locator("tr", { hasText: "melanie@example.com" });
  await expect(row).toBeVisible({ timeout: 15_000 });
  await row.getByRole("button", { name: "viewer", exact: true }).click();
  await page.getByRole("button", { name: "Salir", exact: true }).click();

  // Login as viewer and try to create proveedor
  await loginDev(page, "melanie@example.com");
  await page.goto("/proveedores");
  await page.getByRole("button", { name: "+ Nuevo proveedor" }).click();
  const modal = page.getByRole("dialog");
  await expect(modal).toBeVisible();
  await modal.locator('label:has-text("Proveedor")').locator("..").locator("input").first().fill(`Viewer Prov ${Date.now()}`);
  await modal.locator('label:has-text("Categoría")').locator("..").locator("input").first().fill("Catering");
  await modal.getByRole("button", { name: "Guardar" }).click();

  // Should show forbidden notice (ApiError friendly message)
  await expect(page.getByText("No tenés permisos para esa acción.")).toBeVisible({ timeout: 15_000 });
  await expect(page).toHaveURL(/\/proveedores/);
});

