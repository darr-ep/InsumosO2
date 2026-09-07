import { chromium } from "playwright-core";
import { createServer } from "vite";
import fs from "node:fs";
import path from "node:path";

const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const outputDir = path.resolve(process.cwd(), ".screenshots");

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Mock database strictly following PocketBase + app schemas
const mockUsers = [
  { id: "u1", name: "David", phone: "5511112222", avatar: "", created: "2026-01-01" },
  { id: "u2", name: "Ana", phone: "5522223333", avatar: "", created: "2026-01-01" },
  { id: "u3", name: "Carlos", phone: "5533334444", avatar: "", created: "2026-01-01" },
];

const mockSettings = {
  id: "s1",
  total_concentradores: 6,
  total_tanques: 4,
};

const mockCustomers = [
  { id: "c1", name: "Juan Pérez", phone: "5524681357", credential_photo: "cred1.jpg", created: "2026-01-10" },
  { id: "c2", name: "Bicho", phone: "7751567242", credential_photo: "", created: "2026-02-15" },
  { id: "c3", name: "María González", phone: "5598765432", credential_photo: "cred3.jpg", created: "2026-03-01" },
];

const mockRentals = [
  {
    id: "r1",
    folio: "R-029",
    customer_id: "c1",
    status: "ACTIVE",
    initial_rent_amount: 2200,
    deposit_amount: 2000,
    created: "2026-09-02T12:00:00.000Z",
    expand: { customer_id: mockCustomers[0] },
  },
  {
    id: "r2",
    folio: "R-030",
    customer_id: "c2",
    status: "ACTIVE",
    initial_rent_amount: 2500,
    deposit_amount: 2000,
    created: "2026-09-02T12:00:00.000Z",
    expand: { customer_id: mockCustomers[1] },
  },
  {
    id: "r3",
    folio: "R-031",
    customer_id: "c3",
    status: "ACTIVE",
    initial_rent_amount: 2500,
    deposit_amount: 2000,
    created: "2026-09-02T12:00:00.000Z",
    expand: { customer_id: mockCustomers[2] },
  }
];

const mockRentalItems = [
  { id: "ri1", rental_id: "r1", item_type: "concentrator", quantity: 1 },
  { id: "ri2", rental_id: "r2", item_type: "concentrator", quantity: 1 },
  { id: "ri3", rental_id: "r3", item_type: "tank", quantity: 1 },
];

const mockPayments = [
  { id: "p1", rental_id: "r1", amount: 2000, payment_type: "deposit", created: "2026-09-02T12:00:00.000Z", expand: { created_by: mockUsers[0] } },
  { id: "p2", rental_id: "r1", amount: 2200, payment_type: "rent", created: "2026-09-02T12:05:00.000Z", expand: { created_by: mockUsers[0] } },
];

async function main() {
  console.log("Starting Vite dev server...");
  const server = await createServer({
    server: { port: 5188 },
  });
  await server.listen();
  const address = server.httpServer.address();
  const baseUrl = `https://localhost:${address.port}`;
  console.log(`Vite running at ${baseUrl}`);

  console.log("Launching Chrome...");
  const browser = await chromium.launch({
    executablePath: chromePath,
    headless: true,
    args: ["--ignore-certificate-errors"],
  });

  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: "es-MX",
    ignoreHTTPSErrors: true,
  });

  const page = await context.newPage();

  // Mock navigator.bluetooth
  await page.addInitScript(() => {
    // @ts-ignore
    navigator.bluetooth = {
      getAvailability: async () => true,
      requestDevice: async () => ({
        name: "MTP-II",
        gatt: {
          connect: async () => ({
            getPrimaryService: async () => ({
              getCharacteristic: async () => ({
                writeValue: async () => {},
                writeValueWithoutResponse: async () => {},
              }),
            }),
          }),
        },
      }),
      addEventListener: () => {},
      removeEventListener: () => {},
    };
  });

  // Mock API routes
  await page.route("**/api/**", async (route) => {
    const url = route.request().url();

    if (url.includes("/api/login-directory")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockUsers),
      });
    }

    if (url.includes("/collections/users/records")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: mockUsers, totalItems: mockUsers.length }),
      });
    }

    if (url.includes("/collections/business_settings/records")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: [mockSettings], totalItems: 1 }),
      });
    }

    if (url.includes("/collections/customers/records/")) {
      const idMatch = url.match(/\/records\/([a-zA-Z0-9]+)/);
      const found = mockCustomers.find(c => c.id === idMatch?.[1]) || mockCustomers[0];
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(found),
      });
    }

    if (url.includes("/collections/customers/records")) {
      const urlObj = new URL(url);
      const filter = urlObj.searchParams.get("filter") || "";
      let filtered = mockCustomers;
      if (filter.includes("Nuevo Prospecto") || filter.includes("nonexistent")) {
        filtered = [];
      } else if (filter) {
        const match = filter.match(/~ '([^']+)'/);
        if (match) {
          const q = match[1].toLowerCase();
          filtered = mockCustomers.filter(c => c.name.toLowerCase().includes(q) || c.phone.includes(q));
        }
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: filtered, totalItems: filtered.length }),
      });
    }

    if (url.includes("/collections/rentals/records/")) {
      const idMatch = url.match(/\/records\/([a-zA-Z0-9]+)/);
      const found = mockRentals.find(r => r.id === idMatch?.[1]) || mockRentals[0];
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(found),
      });
    }

    if (url.includes("/collections/rentals/records")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: mockRentals, totalItems: mockRentals.length }),
      });
    }

    if (url.includes("/collections/rental_items/records")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: mockRentalItems, totalItems: mockRentalItems.length }),
      });
    }

    if (url.includes("/collections/payments/records")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: mockPayments, totalItems: mockPayments.length }),
      });
    }

    if (url.includes("/auth-with-password")) {
      const mockJwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjIwMDAwMDAwMDAsImlkIjoidTEiLCJ1c2VyIjp7ImlkIjoidTEiLCJuYW1lIjoiRGF2aWQiLCJwaG9uZSI6IjU1MTExMTIyMjIifX0.sig";
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          token: mockJwt,
          record: mockUsers[0],
        }),
      });
    }

    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({}),
    });
  });

  console.log("1. Capturing Login - Usuarios...");
  await page.goto(`${baseUrl}/login`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(outputDir, "01_Login_Usuarios.png") });

  console.log("2. Capturing Login - Usuario seleccionado...");
  await page.locator('button:has-text("David")').click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(outputDir, "02_Login_Usuario_Seleccionado.png") });

  console.log("3. Capturing Login - Contraseña...");
  await page.locator('button:has-text("Continuar")').click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(outputDir, "03_Login_Password.png") });

  console.log("Logging in...");
  await page.locator('#login-password').fill("12345678");
  await page.locator('button:has-text("Entrar")').click();
  await page.waitForURL("**/dashboard");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(600);

  console.log("4. Capturing Dashboard / Inicio...");
  await page.screenshot({ path: path.join(outputDir, "04_Inicio_Dashboard.png") });

  console.log("5. Capturing Inicio - Menú perfil...");
  await page.locator('button[aria-label="Cuenta"]').click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(outputDir, "05_Inicio_Menu_Perfil.png") });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);

  console.log("6. Capturing Inicio - Menú impresora...");
  await page.locator('button[aria-label*="Impresora"]').click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(outputDir, "06_Inicio_Menu_Impresora.png") });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);

  console.log("7. Capturing Detalle de Renta...");
  await page.locator('button:has-text("R-029")').click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(outputDir, "07_Modal_Renta.png") });

  console.log("8. Capturing Registrar Pago - Pago...");
  await page.locator('button:has-text("Registrar pago")').click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(outputDir, "08_Registrar_Pago_Pago.png") });

  console.log("9. Capturing Registrar Pago - Ajuste...");
  await page.locator('button[role="radio"]:has-text("Ajuste")').click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(outputDir, "09_Registrar_Pago_Ajuste.png") });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);

  console.log("10. Capturing Devolver Renta...");
  await page.locator('button:has-text("Devolver")').click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(outputDir, "10_Devolver_Renta.png") });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);

  // Close rental sheet if open
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);

  console.log("11. Capturing Clientes Screen...");
  await page.goto(`${baseUrl}/clientes`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(outputDir, "11_Clientes_Lista.png") });

  console.log("12. Capturing Ficha Cliente - Activas...");
  await page.locator('#app-layout-clientes-panel button:has-text("Juan Pérez")').click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(outputDir, "12_Modal_Cliente_Activas.png") });

  console.log("13. Capturing Ficha Cliente - Historial...");
  await page.locator('button[role="radio"]:has-text("Historial")').click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(outputDir, "13_Modal_Cliente_Historial.png") });

  console.log("14. Capturing Ficha Cliente - Editar...");
  await page.locator('button[aria-label="Editar cliente"]').click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(outputDir, "14_Modal_Cliente_Editar.png") });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);

  console.log("15. Capturing Nueva Renta - Paso 1 Cliente...");
  await page.goto(`${baseUrl}/nueva-renta`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(outputDir, "15_Nueva_Renta_Paso_1.png") });

  console.log("16. Capturing Nueva Renta - Crear cliente...");
  await page.locator('input[placeholder*="o teléfono"]').fill("Nuevo Prospecto");
  await page.waitForTimeout(600);
  await page.locator('button:has-text("Crear cliente nuevo")').click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(outputDir, "16_Nueva_Renta_Crear_Cliente.png") });

  console.log("17. Capturing Nueva Renta - Paso 2 Qué se renta...");
  await page.locator('button:has-text("‹ Volver a buscar")').click();
  await page.waitForTimeout(300);
  const discardBtn = page.locator('button:has-text("Sí, descartar")');
  if (await discardBtn.isVisible()) {
    await discardBtn.click();
    await page.waitForTimeout(300);
  }
  await page.locator('input[placeholder*="o teléfono"]').fill("Juan");
  await page.waitForTimeout(600);
  await page.locator('button:has-text("Juan Pérez")').click();
  await page.waitForTimeout(300);
  await page.locator('button:has-text("Continuar")').click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(outputDir, "17_Nueva_Renta_Paso_2.png") });

  console.log("18. Capturing Nueva Renta - Paso 3 Confirmar...");
  // Increment a product
  await page.locator('button[aria-label="Agregar un concentrador"]').click();
  await page.locator('#rental-initial-amount').fill("2200");
  await page.locator('#rental-deposit-amount').fill("2000");
  await page.waitForTimeout(300);
  await page.locator('button:has-text("Continuar")').click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(outputDir, "18_Nueva_Renta_Paso_3_Confirmar.png") });

  console.log("19. Capturing Perfil Screen...");
  await page.goto(`${baseUrl}/perfil`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(outputDir, "19_Perfil.png") });

  console.log("Finished taking all screenshots!");
  await browser.close();
  await server.close();
  process.exit(0);
}

main().catch((err) => {
  console.error("Error capturing screenshots:", err);
  process.exit(1);
});
