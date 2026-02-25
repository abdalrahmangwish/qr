const fs = require("fs");
const path = require("path");
const QRCode = require("qrcode");
const readline = require("readline");

// =========================
// Validations
// =========================
function validateTRN(trn) {
  const t = String(trn ?? "").trim();

  if (!/^\d{15}$/.test(t)) {
    return "TRN must consist of exactly 15 digits.";
  }
  if (t[0] !== "3" || t[t.length - 1] !== "3") {
    return "TRN must start with 3 and end with 3.";
  }
  return null;
}

function validateNoDecimalInteger(value, fieldName) {
  const v = String(value ?? "").trim();

  if (/[.,]/.test(v)) {
    return `${fieldName} must not contain decimals.`;
  }
  if (!/^\d+$/.test(v)) {
    return `${fieldName} must be digits only (integer).`;
  }
  return null;
}

// =========================
// TLV encode (Tag=1 byte, Length=1 byte, Value=utf8)
// =========================
function tlv(tag, value) {
  const v = Buffer.from(String(value ?? ""), "utf8");
  if (v.length > 255) {
    throw new Error(`Value too long for tag ${tag} (max 255 bytes)`);
  }
  return Buffer.concat([Buffer.from([tag]), Buffer.from([v.length]), v]);
}

// =========================
// ZATCA base64 (Simplified Tax Invoice - 5 fields)
// =========================
function zatcaBase64({
  sellerName,
  sellerTRN,
  invoiceDateISO,
  invoiceTotal,
  vatTotal,
}) {
  const payload = Buffer.concat([
    tlv(1, sellerName),
    tlv(2, sellerTRN),
    tlv(3, invoiceDateISO),
    tlv(4, invoiceTotal),
    tlv(5, vatTotal),
  ]);
  return payload.toString("base64");
}

function ask(rl, q) {
  return new Promise((resolve) =>
    rl.question(q, (ans) => resolve(ans?.trim()))
  );
}

function toISODate(input) {
  if (!input) return "";
  if (input.includes("T")) return input;

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) return `${input}T00:00:00+03:00`;

  // YYYY-MM-DD HH:mm
  if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}$/.test(input)) {
    const [d, t] = input.split(/\s+/);
    return `${d}T${t}:00+03:00`;
  }

  return input;
}

async function main() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const sellerName = await ask(rl, "Seller name: ");
    const sellerTRN = await ask(rl, "Seller TRN (15 digits, start/end with 3): ");
    const invoiceDateRaw = await ask(
      rl,
      "Invoice Date (ISO مثل 2026-02-23T18:30:00+03:00 أو 2026-02-23 18:30): "
    );
    const invoiceTotal = await ask(rl, "Invoice Total (integer, no decimals): ");
    const vatTotal = await ask(rl, "VAT Total (integer, no decimals): ");

    const invoiceDateISO = toISODate(invoiceDateRaw);

    //
    const missing = [];
    if (!sellerName) missing.push("sellerName");
    if (!sellerTRN) missing.push("sellerTRN");
    if (!invoiceDateISO) missing.push("invoiceDateISO");
    if (!invoiceTotal) missing.push("invoiceTotal");
    if (!vatTotal) missing.push("vatTotal");
    if (missing.length) {
      throw new Error(`Missing fields: ${missing.join(", ")}`);
    }

    // 
    const errors = [];

    const trnError = validateTRN(sellerTRN);
    if (trnError) errors.push(trnError);

    const invError = validateNoDecimalInteger(invoiceTotal, "Invoice Total");
    if (invError) errors.push(invError);

    const vatError = validateNoDecimalInteger(vatTotal, "VAT Total");
    if (vatError) errors.push(vatError);

    if (errors.length) {
      throw new Error(errors.join("\n"));
    }

    // Generate base64 + QR
    const b64 = zatcaBase64({
      sellerName,
      sellerTRN,
      invoiceDateISO,
      invoiceTotal,
      vatTotal,
    });

    const outDir = path.resolve(process.cwd(), "out");
    fs.mkdirSync(outDir, { recursive: true });

    const filePath = path.join(outDir, "zatca_qr.png");
    await QRCode.toFile(filePath, b64, { errorCorrectionLevel: "M" });

    console.log("\nBase64:");
    console.log(b64);

    console.log("\nQR saved to:");
    console.log(filePath);
  } catch (e) {
    console.error("\nError:");
    console.error(e.message || e);
    process.exitCode = 1;
  } finally {
    rl.close();
  }
}

main();