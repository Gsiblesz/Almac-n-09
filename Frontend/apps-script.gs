const SPREADSHEET_ID = "1mrBkcP3Wz04KfBxmNXP0tn6GI645lKctT095uW43ezw";
const SHEET_NAME = "Entradas09";

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents || "{}");
    const { numero_lote, producto, cantidad_almacen, fecha_entrada } = payload;

    if (!numero_lote || !producto || cantidad_almacen === undefined) {
      return jsonResponse({ ok: false, error: "Datos incompletos" }, 400);
    }

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) {
      return jsonResponse({ ok: false, error: "Hoja no encontrada" }, 404);
    }

    const data = sheet.getDataRange().getValues();
    let updated = 0;
    const fecha = fecha_entrada ? new Date(fecha_entrada) : new Date();

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const lote = row[0];
      const prod = row[1];

      if (String(lote).trim() === String(numero_lote).trim() &&
          String(prod).trim() === String(producto).trim()) {
        sheet.getRange(i + 1, 5).setValue(cantidad_almacen);
        sheet.getRange(i + 1, 6).setValue(fecha);
        updated++;
      }
    }

    if (updated === 0) {
      return jsonResponse({ ok: false, error: "No se encontró el lote/producto" }, 404);
    }

    return jsonResponse({ ok: true, updated });
  } catch (err) {
    return jsonResponse({ ok: false, error: "Error interno" }, 500);
  }
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
