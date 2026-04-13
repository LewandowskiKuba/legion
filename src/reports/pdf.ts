// ─────────────────────────────────────────────────────────────────────────────
// PDF report generator
// ─────────────────────────────────────────────────────────────────────────────

import PDFDocument from "pdfkit";
import type { StudyReport } from "./aggregator.js";
import type { AdMaterial } from "../personas/schema.js";

const PURPLE = "#6366f1";
const DARK = "#18181b";
const GRAY = "#71717a";
const GREEN = "#22c55e";
const RED = "#ef4444";
const WHITE = "#ffffff";

function deltaColor(val: number): string {
  if (val > 0) return GREEN;
  if (val < 0) return RED;
  return GRAY;
}

function deltaText(val: number): string {
  return val > 0 ? `+${val}` : String(val);
}

export function generatePDF(
  ad: AdMaterial,
  report: StudyReport,
  adB?: AdMaterial,
  reportB?: StudyReport
): Buffer {
  const doc = new PDFDocument({ margin: 50, size: "A4" });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));

  const isAB = !!adB && !!reportB;

  // ── Header ──────────────────────────────────────────────────────────────────
  doc.rect(0, 0, doc.page.width, 80).fill(DARK);
  doc.fillColor(WHITE).fontSize(18).font("Helvetica-Bold")
    .text("Synthetic Population Sandbox", 50, 25);
  doc.fillColor(GRAY).fontSize(10).font("Helvetica")
    .text(isAB ? "Raport A/B" : "Raport badania", 50, 50);
  doc.fillColor(GRAY).fontSize(9)
    .text(new Date(report.meta.timestamp).toLocaleString("pl-PL"), 400, 50, { align: "right" });

  doc.moveDown(3);

  // ── Meta ────────────────────────────────────────────────────────────────────
  doc.fillColor(GRAY).fontSize(9).font("Helvetica")
    .text(`Populacja: ${report.meta.populationSize} botów  ·  Model: ${report.meta.model}`, { align: "center" });
  doc.moveDown(1.5);

  // ── Ad material ─────────────────────────────────────────────────────────────
  if (isAB) {
    sectionTitle(doc, "Wariant A");
    adBlock(doc, ad);
    sectionTitle(doc, "Wariant B");
    adBlock(doc, adB!);
  } else {
    sectionTitle(doc, "Materiał reklamowy");
    adBlock(doc, ad);
  }

  // ── Aggregate metrics ───────────────────────────────────────────────────────
  sectionTitle(doc, isAB ? "Wyniki – porównanie A/B" : "Wyniki agregat");

  if (isAB) {
    abMetricsTable(doc, report, reportB!);
  } else {
    metricsRow(doc, report.aggregate);
  }

  doc.moveDown(1);

  // ── Segments ────────────────────────────────────────────────────────────────
  sectionTitle(doc, "Segmentacja wiekowa");
  segmentTable(doc, report.byAgeGroup, isAB ? reportB!.byAgeGroup : undefined);

  sectionTitle(doc, "Segmentacja płci");
  segmentTable(doc, report.byGender, isAB ? reportB!.byGender : undefined);

  sectionTitle(doc, "Segmentacja typ miejscowości");
  segmentTable(doc, report.bySettlement, isAB ? reportB!.bySettlement : undefined);

  // ── Qualitative ─────────────────────────────────────────────────────────────
  sectionTitle(doc, "Co zapamiętali (top recall)");
  bulletList(doc, report.topRecalls.slice(0, 5));

  if (isAB) {
    doc.fillColor(PURPLE).fontSize(9).text("Wariant B:", { indent: 10 });
    bulletList(doc, reportB!.topRecalls.slice(0, 5));
  }

  sectionTitle(doc, "Sygnały odrzucenia");
  bulletList(doc, report.allRejections.slice(0, 8), RED);

  if (isAB && reportB!.allRejections.length > 0) {
    doc.fillColor(PURPLE).fontSize(9).text("Wariant B:", { indent: 10 });
    bulletList(doc, reportB!.allRejections.slice(0, 8), RED);
  }

  // ── Footer ──────────────────────────────────────────────────────────────────
  doc.moveDown(2);
  doc.fillColor(GRAY).fontSize(8)
    .text("Wyniki oparte na syntetycznej populacji LLM. Nie zastępują badań z udziałem rzeczywistych respondentów.", {
      align: "center",
    });

  doc.end();
  return Buffer.concat(chunks);
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function sectionTitle(doc: PDFKit.PDFDocument, title: string) {
  doc.moveDown(0.5);
  doc.fillColor(PURPLE).fontSize(11).font("Helvetica-Bold").text(title.toUpperCase());
  doc.moveTo(doc.x, doc.y).lineTo(doc.page.width - 50, doc.y).strokeColor(PURPLE).lineWidth(0.5).stroke();
  doc.moveDown(0.5);
}

function adBlock(doc: PDFKit.PDFDocument, ad: AdMaterial) {
  doc.fillColor(DARK).rect(50, doc.y, doc.page.width - 100, 1).fill();
  const startY = doc.y + 8;
  doc.fillColor("#27272a").rect(50, startY - 4, doc.page.width - 100, 70).fill();

  doc.fillColor(WHITE).fontSize(12).font("Helvetica-Bold")
    .text(ad.headline, 60, startY, { width: doc.page.width - 120 });
  doc.fillColor(GRAY).fontSize(9).font("Helvetica")
    .text(ad.cta, 60, doc.y + 4);
  if (ad.brandName) {
    doc.fillColor(PURPLE).fontSize(9).text(`Marka: ${ad.brandName}`, { continued: true });
    if (ad.productCategory) doc.text(`  ·  Kategoria: ${ad.productCategory}`);
    else doc.text("");
  }
  doc.moveDown(1.5);
}

function metricsRow(doc: PDFKit.PDFDocument, seg: { attentionScore: number; resonanceScore: number; purchaseIntentDelta: number; trustImpact: number }) {
  const metrics = [
    { label: "Attention", value: `${seg.attentionScore}/10`, color: PURPLE },
    { label: "Resonance", value: `${seg.resonanceScore}/10`, color: PURPLE },
    { label: "Purchase Intent Δ", value: deltaText(seg.purchaseIntentDelta), color: deltaColor(seg.purchaseIntentDelta) },
    { label: "Trust Impact Δ", value: deltaText(seg.trustImpact), color: deltaColor(seg.trustImpact) },
  ];
  const colW = (doc.page.width - 100) / 4;
  const startY = doc.y;
  metrics.forEach((m, i) => {
    const x = 50 + i * colW;
    doc.fillColor("#27272a").rect(x + 2, startY, colW - 8, 55).fill();
    doc.fillColor(m.color).fontSize(20).font("Helvetica-Bold").text(m.value, x + 2, startY + 8, { width: colW - 8, align: "center" });
    doc.fillColor(GRAY).fontSize(8).font("Helvetica").text(m.label, x + 2, startY + 36, { width: colW - 8, align: "center" });
  });
  doc.moveDown(4.5);
}

function abMetricsTable(doc: PDFKit.PDFDocument, a: StudyReport, b: StudyReport) {
  const rows = [
    { label: "Attention Score", a: a.aggregate.attentionScore, b: b.aggregate.attentionScore, suffix: "/10" },
    { label: "Resonance Score", a: a.aggregate.resonanceScore, b: b.aggregate.resonanceScore, suffix: "/10" },
    { label: "Purchase Intent Δ", a: a.aggregate.purchaseIntentDelta, b: b.aggregate.purchaseIntentDelta, suffix: "" },
    { label: "Trust Impact Δ", a: a.aggregate.trustImpact, b: b.aggregate.trustImpact, suffix: "" },
  ];
  const cols = [200, 100, 100, 100];
  const headers = ["Metryka", "Wariant A", "Wariant B", "Różnica"];

  // Header row
  let x = 50;
  let y = doc.y;
  doc.fillColor(DARK).rect(50, y, doc.page.width - 100, 20).fill();
  headers.forEach((h, i) => {
    doc.fillColor(WHITE).fontSize(9).font("Helvetica-Bold").text(h, x + 4, y + 5, { width: cols[i] - 8 });
    x += cols[i];
  });
  y += 20;

  rows.forEach((row, ri) => {
    x = 50;
    const bg = ri % 2 === 0 ? "#18181b" : "#27272a";
    doc.fillColor(bg).rect(50, y, doc.page.width - 100, 20).fill();

    const diff = Math.round((row.b - row.a) * 10) / 10;
    const cells = [
      { text: row.label, color: WHITE },
      { text: `${row.a}${row.suffix}`, color: PURPLE },
      { text: `${row.b}${row.suffix}`, color: PURPLE },
      { text: `${diff > 0 ? "+" : ""}${diff}`, color: deltaColor(diff) },
    ];
    cells.forEach((cell, i) => {
      doc.fillColor(cell.color).fontSize(9).font("Helvetica").text(cell.text, x + 4, y + 5, { width: cols[i] - 8 });
      x += cols[i];
    });
    y += 20;
  });
  doc.moveDown(4);
}

function segmentTable(
  doc: PDFKit.PDFDocument,
  segments: Record<string, { label: string; count: number; attentionScore: number; resonanceScore: number; purchaseIntentDelta: number; trustImpact: number }>,
  segmentsB?: typeof segments
) {
  const isAB = !!segmentsB;
  const cols = isAB ? [140, 50, 65, 65, 65, 65, 65] : [180, 60, 80, 80, 80, 80];
  const headers = isAB
    ? ["Segment", "n", "ATT A→B", "RES A→B", "PI A→B", "TR A→B", ""]
    : ["Segment", "n", "Attention", "Resonance", "Purchase Δ", "Trust Δ"];

  let x = 50;
  let y = doc.y;
  doc.fillColor(DARK).rect(50, y, doc.page.width - 100, 18).fill();
  headers.forEach((h, i) => {
    doc.fillColor(GRAY).fontSize(8).font("Helvetica-Bold").text(h, x + 4, y + 4, { width: cols[i] - 8 });
    x += cols[i];
  });
  y += 18;

  Object.entries(segments).forEach(([key, s], ri) => {
    const b = segmentsB?.[key];
    x = 50;
    const bg = ri % 2 === 0 ? "#18181b" : "#27272a";
    doc.fillColor(bg).rect(50, y, doc.page.width - 100, 18).fill();

    const cells = isAB && b
      ? [
          { text: s.label, color: WHITE },
          { text: String(s.count), color: GRAY },
          { text: `${s.attentionScore}→${b.attentionScore}`, color: PURPLE },
          { text: `${s.resonanceScore}→${b.resonanceScore}`, color: PURPLE },
          { text: `${deltaText(s.purchaseIntentDelta)}→${deltaText(b.purchaseIntentDelta)}`, color: deltaColor(b.purchaseIntentDelta - s.purchaseIntentDelta) },
          { text: `${deltaText(s.trustImpact)}→${deltaText(b.trustImpact)}`, color: deltaColor(b.trustImpact - s.trustImpact) },
          { text: "", color: GRAY },
        ]
      : [
          { text: s.label, color: WHITE },
          { text: String(s.count), color: GRAY },
          { text: String(s.attentionScore), color: PURPLE },
          { text: String(s.resonanceScore), color: PURPLE },
          { text: deltaText(s.purchaseIntentDelta), color: deltaColor(s.purchaseIntentDelta) },
          { text: deltaText(s.trustImpact), color: deltaColor(s.trustImpact) },
        ];

    cells.forEach((cell, i) => {
      doc.fillColor(cell.color).fontSize(8).font("Helvetica").text(cell.text, x + 4, y + 5, { width: cols[i] - 8 });
      x += cols[i];
    });
    y += 18;
  });
  doc.moveDown(3);
}

function bulletList(doc: PDFKit.PDFDocument, items: string[], color = GRAY) {
  items.forEach((item) => {
    doc.fillColor(color).fontSize(9).font("Helvetica").text(`• ${item}`, { indent: 10 });
  });
  doc.moveDown(0.5);
}
