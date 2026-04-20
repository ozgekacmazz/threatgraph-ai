import { jsPDF } from "jspdf";
import unicodeFontUrl from "../assets/fonts/ArialUnicode.ttf";
import { buildSummaryGraph } from "../components/graph/visNetworkAdapter";
import { exportGraphAsPng } from "../components/graph/VisNetworkGraph";

const FONT_FILE_NAME = "ArialUnicode.ttf";
const FONT_FAMILY = "ArialUnicode";
const PAGE_MARGIN_X = 18;
const PAGE_MARGIN_TOP = 18;
const PAGE_MARGIN_BOTTOM = 18;
const PARAGRAPH_LINE_HEIGHT = 5.4;
const BULLET_LINE_HEIGHT = 5.4;
const BULLET_INDENT = 6;
const FOOTER_TEXT = "ThreatGraph AI tarafından oluşturulmuştur.";
const COLOR_PRIMARY = [15, 44, 83];
const COLOR_SECONDARY = [88, 101, 120];
const COLOR_TEXT = [33, 42, 56];
const COLOR_PANEL_FILL = [246, 249, 253];
const COLOR_PANEL_BORDER = [212, 222, 235];
const COLOR_ACCENT_FILL = [232, 241, 251];
const COLOR_GRAPH_PANEL = [245, 248, 252];

let fontBinaryPromise = null;

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function slugify(value) {
  return String(value || "analiz-raporu")
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "analiz-raporu";
}

function arrayBufferToBinaryString(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 32768;
  let result = "";

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    result += String.fromCharCode(...chunk);
  }

  return result;
}

async function loadUnicodeFont(doc) {
  if (!fontBinaryPromise) {
    fontBinaryPromise = fetch(unicodeFontUrl)
      .then((response) => {
        if (!response.ok) {
          throw new Error("Font yüklenemedi.");
        }

        return response.arrayBuffer();
      })
      .then(arrayBufferToBinaryString);
  }

  const fontBinary = await fontBinaryPromise;

  if (!doc.getFontList()[FONT_FAMILY]) {
    doc.addFileToVFS(FONT_FILE_NAME, fontBinary);
    doc.addFont(FONT_FILE_NAME, FONT_FAMILY, "normal");
  }

  doc.setFont(FONT_FAMILY, "normal");
}

function maxContentY(doc) {
  return doc.internal.pageSize.getHeight() - PAGE_MARGIN_BOTTOM;
}

function ensureSpace(doc, currentY, requiredHeight) {
  if (currentY + requiredHeight <= maxContentY(doc)) {
    return currentY;
  }

  doc.addPage();
  return PAGE_MARGIN_TOP;
}

function countWrappedLines(doc, text, width) {
  return doc.splitTextToSize(text, width).length;
}

function writeParagraph(doc, text, x, y, width, lineHeight) {
  const lines = doc.splitTextToSize(text, width);
  doc.text(lines, x, y);
  return y + lines.length * lineHeight;
}

function drawRoundedPanel(doc, x, y, width, height, { fillColor = COLOR_PANEL_FILL, borderColor = COLOR_PANEL_BORDER } = {}) {
  doc.setFillColor(...fillColor);
  doc.setDrawColor(...borderColor);
  doc.setLineWidth(0.25);
  doc.roundedRect(x, y, width, height, 3.5, 3.5, "FD");
}

function writeBullets(doc, bullets, x, y, width) {
  let nextY = y;

  bullets.forEach((bullet) => {
    const lines = doc.splitTextToSize(bullet, width - BULLET_INDENT);
    nextY = ensureSpace(doc, nextY, lines.length * BULLET_LINE_HEIGHT + 4.2);
    doc.setFillColor(...COLOR_PRIMARY);
    doc.circle(x + 1.3, nextY - 1.2, 0.7, "F");
    doc.setTextColor(...COLOR_TEXT);
    doc.text(lines, x + BULLET_INDENT, nextY);
    nextY += lines.length * BULLET_LINE_HEIGHT + 3;
  });

  return nextY;
}

function formatStructuredLines(items = [], { includeDescriptions = true } = {}) {
  return items
    .map((item) => {
      if (typeof item === "string") {
        return normalizeText(item);
      }

      const title = normalizeText(item?.title || "");
      const description = includeDescriptions ? normalizeText(item?.description || "") : "";

      if (title && description) {
        return `${title}: ${description}`;
      }

      return title || description;
    })
    .filter(Boolean);
}

function buildAnalysisSections(displayedResult) {
  const sections = [];
  const entries = [
    ["Doğrudan saldırılar", displayedResult.direct_attacks, { includeDescriptions: true }],
    ["Etkilenebilecek varlıklar", displayedResult.may_impact_artifacts, { includeDescriptions: false }],
    ["Yayılım kaynaklı saldırılar", displayedResult.may_impact_attacks, { includeDescriptions: false }],
    ["Doğrudan tactic'ler", displayedResult.direct_tactics, { includeDescriptions: false }],
    ["Olası sonraki tactic'ler", displayedResult.next_tactics, { includeDescriptions: false }],
    ["Top-5 saldırı tahmini", displayedResult.predicted_attacks_top5, { includeDescriptions: true }],
    ["Savunma önerileri", displayedResult.defense_suggestions, { includeDescriptions: true }],
  ];

  entries.forEach(([title, items, options]) => {
    const bullets = formatStructuredLines(items, options);
    if (bullets.length) {
      sections.push({ title, bullets });
    }
  });

  if (normalizeText(displayedResult.low_confidence_reason || "")) {
    sections.push({
      title: "Düşük güven açıklaması",
      paragraphs: [displayedResult.low_confidence_reason],
    });
  }

  return sections;
}

function estimateSectionHeight(doc, section, contentWidth) {
  const headingHeight = 18;
  const dividerAndPadding = 10;
  let bodyHeight = 0;

  if (section.paragraphs?.length) {
    bodyHeight += section.paragraphs.reduce(
      (total, paragraph) => total + countWrappedLines(doc, paragraph, contentWidth) * PARAGRAPH_LINE_HEIGHT + 3.2,
      0
    );
  }

  if (section.bullets?.length) {
    bodyHeight += section.bullets.reduce(
      (total, bullet) =>
        total + countWrappedLines(doc, bullet, contentWidth - BULLET_INDENT) * BULLET_LINE_HEIGHT + 3,
      0
    );
  }

  return headingHeight + dividerAndPadding + Math.max(bodyHeight, PARAGRAPH_LINE_HEIGHT * 2) + 6;
}

function drawHeaderBlock(doc, summaryRows, timestamp, contentWidth) {
  let currentY = PAGE_MARGIN_TOP;

  doc.setTextColor(...COLOR_SECONDARY);
  doc.setFontSize(9.6);
  currentY = writeParagraph(doc, "ThreatGraph AI", PAGE_MARGIN_X, currentY, contentWidth, 4.6);

  currentY += 1.8;
  doc.setTextColor(...COLOR_PRIMARY);
  doc.setFontSize(21);
  currentY = writeParagraph(doc, "Analiz ve Graph Raporu", PAGE_MARGIN_X, currentY, contentWidth, 7.8);

  currentY += 2.6;
  doc.setTextColor(...COLOR_SECONDARY);
  doc.setFontSize(10.1);
  currentY = writeParagraph(
    doc,
    "Bu rapor, mevcut analiz sonucu ile aynı oturumda üretilen graph bağlamını tek belgede birleştirir.",
    PAGE_MARGIN_X,
    currentY,
    contentWidth - 32,
    5.2
  );

  doc.setTextColor(...COLOR_SECONDARY);
  doc.setFontSize(9.4);
  doc.text(timestamp, PAGE_MARGIN_X + contentWidth, PAGE_MARGIN_TOP + 4.8, { align: "right" });

  currentY += 7;
  currentY = drawSummaryBlock(doc, summaryRows, currentY, contentWidth);
  return currentY + 8;
}

function drawSummaryItem(doc, item, x, y, width, height, { highlight = false } = {}) {
  drawRoundedPanel(doc, x, y, width, height, {
    fillColor: highlight ? COLOR_ACCENT_FILL : COLOR_PANEL_FILL,
    borderColor: highlight ? [189, 212, 236] : COLOR_PANEL_BORDER,
  });

  const innerX = x + 4.5;
  const innerY = y + 6;
  const innerWidth = width - 9;

  doc.setTextColor(...COLOR_SECONDARY);
  doc.setFontSize(8.9);
  doc.text(item.label.toUpperCase(), innerX, innerY);

  doc.setTextColor(...(highlight ? COLOR_PRIMARY : COLOR_TEXT));
  doc.setFontSize(highlight ? 12.3 : 10.9);
  writeParagraph(doc, item.value, innerX, innerY + 5.4, innerWidth, highlight ? 5.8 : 5.2);
}

function drawSummaryBlock(doc, summaryRows, currentY, contentWidth) {
  const columnGap = 6;
  const columnWidth = (contentWidth - columnGap) / 2;
  const cardHeight = 22;
  const rowGap = 5;

  let nextY = ensureSpace(doc, currentY, cardHeight * 2 + rowGap + 10);

  doc.setTextColor(...COLOR_PRIMARY);
  doc.setFontSize(11.6);
  doc.text("Özet", PAGE_MARGIN_X, nextY);

  nextY += 5;

  const cards = summaryRows.slice(0, 4);
  cards.forEach((item, index) => {
    const row = Math.floor(index / 2);
    const column = index % 2;
    const x = PAGE_MARGIN_X + column * (columnWidth + columnGap);
    const y = nextY + row * (cardHeight + rowGap);
    drawSummaryItem(doc, item, x, y, columnWidth, cardHeight, { highlight: item.highlight });
  });

  return nextY + cardHeight * 2 + rowGap;
}

function writeSection(doc, section, currentY, contentWidth) {
  const sectionHeight = estimateSectionHeight(doc, section, contentWidth);
  let nextY = ensureSpace(doc, currentY, sectionHeight);

  doc.setDrawColor(215, 224, 234);
  doc.setLineWidth(0.3);
  doc.line(PAGE_MARGIN_X, nextY, PAGE_MARGIN_X + contentWidth, nextY);
  nextY += 7;

  doc.setFontSize(13);
  doc.setTextColor(...COLOR_PRIMARY);
  doc.text(section.title, PAGE_MARGIN_X, nextY);

  nextY += 2.8;
  doc.setDrawColor(188, 204, 223);
  doc.setLineWidth(0.45);
  doc.line(PAGE_MARGIN_X, nextY, PAGE_MARGIN_X + 28, nextY);
  nextY += 6;

  doc.setFontSize(10.6);
  doc.setTextColor(...COLOR_TEXT);

  if (section.paragraphs?.length) {
    section.paragraphs.forEach((paragraph) => {
      nextY = ensureSpace(doc, nextY, PARAGRAPH_LINE_HEIGHT * 2 + 2);
      nextY = writeParagraph(doc, paragraph, PAGE_MARGIN_X, nextY, contentWidth, PARAGRAPH_LINE_HEIGHT);
      nextY += 3;
    });
  }

  if (section.bullets?.length) {
    nextY = writeBullets(doc, section.bullets, PAGE_MARGIN_X, nextY, contentWidth);
  }

  return nextY + 2;
}

function drawMetaPanel(doc, x, y, width, items) {
  const panelPaddingX = 4.5;
  const panelPaddingY = 5;
  const columnGap = 5;
  const columnWidth = (width - panelPaddingX * 2 - columnGap) / 2;
  const rowHeight = 16;
  const rows = Math.ceil(items.length / 2);
  const height = panelPaddingY * 2 + rows * rowHeight;

  drawRoundedPanel(doc, x, y, width, height, {
    fillColor: COLOR_GRAPH_PANEL,
    borderColor: COLOR_PANEL_BORDER,
  });

  items.forEach((item, index) => {
    const row = Math.floor(index / 2);
    const column = index % 2;
    const itemX = x + panelPaddingX + column * (columnWidth + columnGap);
    const itemY = y + panelPaddingY + row * rowHeight;

    doc.setTextColor(...COLOR_SECONDARY);
    doc.setFontSize(8.7);
    doc.text(item.label, itemX, itemY + 3.2);

    doc.setTextColor(...COLOR_TEXT);
    doc.setFontSize(10.2);
    writeParagraph(doc, item.value, itemX, itemY + 8.5, columnWidth, 4.8);
  });

  return height;
}

function drawGraphSection(doc, currentY, contentWidth, graphImageDataUrl, graphMeta, graphImageWarning) {
  let nextY = ensureSpace(doc, currentY, 145);

  doc.setDrawColor(215, 224, 234);
  doc.setLineWidth(0.3);
  doc.line(PAGE_MARGIN_X, nextY, PAGE_MARGIN_X + contentWidth, nextY);
  nextY += 8;

  doc.setFontSize(13);
  doc.setTextColor(...COLOR_PRIMARY);
  doc.text("Graph özeti", PAGE_MARGIN_X, nextY);

  nextY += 2.8;
  doc.setDrawColor(188, 204, 223);
  doc.setLineWidth(0.45);
  doc.line(PAGE_MARGIN_X, nextY, PAGE_MARGIN_X + 24, nextY);
  nextY += 6;

  if (graphImageDataUrl) {
    const imageWidth = contentWidth;
    const imageHeight = 92;
    nextY = ensureSpace(doc, nextY, imageHeight + 34);
    drawRoundedPanel(doc, PAGE_MARGIN_X, nextY, imageWidth, imageHeight, {
      fillColor: [251, 252, 254],
      borderColor: [218, 226, 237],
    });
    doc.addImage(graphImageDataUrl, "PNG", PAGE_MARGIN_X + 3, nextY + 3, imageWidth - 6, imageHeight - 6, undefined, "FAST");
    nextY += imageHeight + 6;
  } else if (graphImageWarning) {
    const warningHeight = countWrappedLines(doc, graphImageWarning, contentWidth - 10) * 5 + 10;
    nextY = ensureSpace(doc, nextY, warningHeight + 8);
    drawRoundedPanel(doc, PAGE_MARGIN_X, nextY, contentWidth, warningHeight, {
      fillColor: [252, 248, 239],
      borderColor: [228, 212, 177],
    });
    doc.setTextColor(117, 88, 27);
    doc.setFontSize(10);
    nextY = writeParagraph(doc, graphImageWarning, PAGE_MARGIN_X + 5, nextY + 7, contentWidth - 10, 5);
    nextY += 4;
  }

  const metaItems = [
    { label: "Graph odağı", value: graphMeta.focusArtifact },
    { label: "Eşleşen artifact", value: graphMeta.matchedArtifact },
    { label: "Analiz modu", value: graphMeta.analysisMode },
    { label: "Düğüm sayısı", value: graphMeta.nodeCount },
    { label: "Kenar sayısı", value: graphMeta.edgeCount },
  ];

  const metaHeight = drawMetaPanel(doc, PAGE_MARGIN_X, nextY, contentWidth, metaItems);
  return nextY + metaHeight + 3;
}

function addFooter(doc) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const totalPages = doc.getNumberOfPages();

  for (let page = 1; page <= totalPages; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(221, 228, 236);
    doc.setLineWidth(0.2);
    doc.line(PAGE_MARGIN_X, pageHeight - 14.5, pageWidth - PAGE_MARGIN_X, pageHeight - 14.5);
    doc.setFont(FONT_FAMILY, "normal");
    doc.setFontSize(8.2);
    doc.setTextColor(128, 136, 147);
    doc.text(FOOTER_TEXT, PAGE_MARGIN_X, pageHeight - 9);
    doc.text(`Sayfa ${page}/${totalPages}`, pageWidth - PAGE_MARGIN_X, pageHeight - 9, {
      align: "right",
    });
  }
}

function deriveModeLabel(mode) {
  return mode === "known" ? "Mevcut artifact" : "Yeni artifact";
}

function formatConfidenceValue(value) {
  const normalized = normalizeText(value || "");
  return normalized || "-";
}

export async function exportAnalysisPdf({
  artifactName,
  mode,
  result,
  displayedResult,
  graphData,
}) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  await loadUnicodeFont(doc);

  const contentWidth = doc.internal.pageSize.getWidth() - PAGE_MARGIN_X * 2;
  const summaryGraph = buildSummaryGraph(graphData);
  let graphImageDataUrl = null;
  let graphImageWarning = "";

  try {
    if (summaryGraph?.nodes?.length) {
      graphImageDataUrl = await exportGraphAsPng(summaryGraph, { mode: "summary" });
    }
  } catch {
    graphImageWarning =
      "Graph görseli eklenemedi. Metinsel analiz içeriği ve graph özeti yine de rapora dahil edildi.";
  }

  const timestamp = new Date().toLocaleString("tr-TR", {
    dateStyle: "long",
    timeStyle: "short",
  });
  const inputArtifact = normalizeText(result?.input_artifact || artifactName || "Belirtilmedi");
  const matchedArtifact = normalizeText(displayedResult?.matched_artifact || "Eşleşme bulunamadı");
  const graphMeta = {
    focusArtifact: normalizeText(summaryGraph?.focus?.artifact || inputArtifact || "Belirtilmedi"),
    matchedArtifact: normalizeText(summaryGraph?.focus?.matched_artifact || matchedArtifact),
    analysisMode: deriveModeLabel(summaryGraph?.focus?.analysis_mode || mode),
    nodeCount: String(summaryGraph?.nodes?.length || 0),
    edgeCount: String(summaryGraph?.edges?.length || 0),
  };

  const summaryRows = [
    { label: "Girdi artifact", value: inputArtifact },
    { label: "Eşleşen artifact", value: matchedArtifact },
    { label: "Analiz modu", value: deriveModeLabel(mode) },
    { label: "Güven düzeyi", value: formatConfidenceValue(displayedResult?.confidence_score), highlight: true },
  ];

  let currentY = drawHeaderBlock(doc, summaryRows, timestamp, contentWidth);

  buildAnalysisSections(displayedResult).forEach((section) => {
    currentY = writeSection(doc, section, currentY, contentWidth);
  });

  currentY = drawGraphSection(doc, currentY, contentWidth, graphImageDataUrl, graphMeta, graphImageWarning);

  addFooter(doc);

  const fileName = `threatgraph-ai-analiz-raporu-${slugify(inputArtifact)}.pdf`;
  doc.save(fileName);
  return { fileName, graphImageIncluded: Boolean(graphImageDataUrl) };
}
