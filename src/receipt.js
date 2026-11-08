// Kassenbon-QR-Codes auslesen
// Österreich (RKSV): _R1-AT1_KassenID_BelegNr_2024-01-15T10:22:33_Normal_Ermäßigt1_Ermäßigt2_Null_Besonders_Umsatzzähler_Zertifikat_SigVorher_Signatur
// Deutschland (TSE, DSFinV-K): V0;Kasse;Kassenbeleg-V1;Beleg^19%_7%_10,7%_5,5%_0%^Betrag:Bar_Betrag:Unbar;TA-Nr;Sig-Zähler;Start;Ende;…
const num = (x) => {
  const v = Number(String(x || "").trim().replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(v) ? v : 0;
};
const r2 = (v) => Math.round(v * 100) / 100;

export function parseReceiptQR(text) {
  const t = String(text || "").trim();
  if (/^_R1-[A-Z]{2}\d*_/.test(t)) {
    const p = t.split("_");
    // p[0]="" p[1]="R1-AT1" p[2]=KassenID p[3]=BelegNr p[4]=Datum p[5..9]=Beträge nach Steuersatz
    const dt = p[4] || "";
    const parts = p.slice(5, 10).map(num);
    const rates = [["20 %", parts[0]], ["10 %", parts[1]], ["13 %", parts[2]], ["0 %", parts[3]], ["besonders", parts[4]]].filter((x) => x[1]);
    return {
      kind: "RKSV (Österreich)", total: r2(parts.reduce((s, v) => s + v, 0)), date: /^\d{4}-\d{2}-\d{2}/.test(dt) ? dt.slice(0, 10) : "",
      time: dt.slice(11, 16), register: p[2] || "", receiptNo: p[3] || "", vat: rates.map(([k, v]) => ({ rate: k, gross: r2(v) }))
    };
  }
  if (/^V0;/.test(t)) {
    const p = t.split(";");
    const data = p.find((x) => x.includes("^")) || "";
    const [, gross = "", pay = ""] = data.split("^");
    const amounts = gross.split("_").map(num);
    let total = r2(amounts.reduce((s, v) => s + v, 0));
    if (!total && pay) total = r2(pay.split("_").reduce((s, x) => s + num(x.split(":")[0]), 0));
    const times = p.filter((x) => /^\d{4}-\d{2}-\d{2}T/.test(x));
    const dt = times[times.length - 1] || "";
    return { kind: "TSE (Deutschland)", total, date: dt.slice(0, 10), time: dt.slice(11, 16), register: p[1] || "", receiptNo: p[4] || "", vat: [] };
  }
  return null;
}

// Datum nur übernehmen, wenn es heute oder in der Vergangenheit liegt
export function pastOrToday(d, today) {
  return /^\d{4}-\d{2}-\d{2}$/.test(d || "") && d <= today ? d : today;
}
