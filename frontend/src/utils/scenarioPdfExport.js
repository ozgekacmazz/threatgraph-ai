import { jsPDF } from "jspdf";
import unicodeFontUrl from "../assets/fonts/ArialUnicode.ttf";

const FONT_FILE_NAME = "ArialUnicode.ttf";
const FONT_FAMILY = "ArialUnicode";
const PAGE_MARGIN_X = 18;
const PAGE_MARGIN_TOP = 18;
const PAGE_MARGIN_BOTTOM = 18;
const SECTION_HEADING_GAP_BEFORE = 7;
const SECTION_HEADING_GAP_AFTER = 5;
const PARAGRAPH_LINE_HEIGHT = 5.4;
const BULLET_LINE_HEIGHT = 5.2;
const BULLET_INDENT = 6;
const FOOTER_TEXT = "ThreatGraph AI tarafından oluşturulmuştur.";

let fontBinaryPromise = null;

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function slugify(value) {
  return String(value || "senaryo-analiz")
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "senaryo-analiz";
}

function itemLines(items = []) {
  return items
    .map((item) => {
      if (typeof item === "string") {
        return normalizeText(item);
      }

      return normalizeText(item?.title || "");
    })
    .filter(Boolean);
}

function resolveExportScenarioTitle(scenario, displayedResult) {
  if (displayedResult?.scenarioProfile === "credential_dumping") {
    return "Credential Dumping senaryosu";
  }

  return normalizeText(scenario?.title || "Senaryo analizi");
}

function buildExportSections({ scenario, detailSummaryContent, displayedResult }) {
  const sections = [];
  const summaryText = normalizeText(detailSummaryContent?.summaryParagraph || "");
  const immediateActions = (detailSummaryContent?.immediateActions || [])
    .map((action) => normalizeText(action))
    .filter(Boolean);

  if (summaryText) {
    sections.push({ title: "Kısa özet", paragraphs: [summaryText] });
  }

  if (immediateActions.length) {
    sections.push({ title: "İlk yapılması gerekenler", bullets: immediateActions });
  }

  if (!displayedResult) {
    return sections;
  }

  (displayedResult.explanationSections || []).forEach((section) => {
    const titleText = normalizeText(section?.title || "");
    const descriptionText = normalizeText(section?.description || "");

    if (titleText && descriptionText) {
      sections.push({ title: titleText, paragraphs: [descriptionText] });
    }
  });

  [
    ["Etkilenebilecek artifact'ler", displayedResult.mayImpactArtifacts],
    ["Olası sonraki saldırılar", displayedResult.mayImpactAttacks],
    ["Doğrudan saldırılar", displayedResult.directAttacks],
    ["Doğrudan taktikler", displayedResult.directTactics],
    ["Olası sonraki taktikler", displayedResult.nextTactics],
    ["Önerilen savunma öncelikleri", displayedResult.defenses],
  ].forEach(([sectionTitle, items]) => {
    const lines = itemLines(items);
    if (lines.length) {
      sections.push({ title: sectionTitle, bullets: lines });
    }
  });

  return sections;
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

function writeBullets(doc, bullets, x, y, width) {
  let nextY = y;

  bullets.forEach((bullet) => {
    const lines = doc.splitTextToSize(bullet, width - BULLET_INDENT);
    nextY = ensureSpace(
      doc,
      nextY,
      lines.length * BULLET_LINE_HEIGHT + 2
    );
    doc.setTextColor(36, 49, 66);
    doc.text("•", x, nextY);
    doc.text(lines, x + BULLET_INDENT, nextY);
    nextY += lines.length * BULLET_LINE_HEIGHT + 2.2;
  });

  return nextY;
}

function estimateSectionHeight(doc, section, contentWidth) {
  const headingHeight = 14;
  const minContentHeight = PARAGRAPH_LINE_HEIGHT * 2;
  let bodyHeight = 0;

  if (section.paragraphs?.length) {
    bodyHeight += section.paragraphs.reduce(
      (total, paragraph) => total + countWrappedLines(doc, paragraph, contentWidth) * PARAGRAPH_LINE_HEIGHT + 2.8,
      0
    );
  }

  if (section.bullets?.length) {
    bodyHeight += section.bullets.reduce(
      (total, bullet) =>
        total + countWrappedLines(doc, bullet, contentWidth - BULLET_INDENT) * BULLET_LINE_HEIGHT + 2.2,
      0
    );
  }

  return SECTION_HEADING_GAP_BEFORE + headingHeight + Math.max(bodyHeight, minContentHeight) + 2;
}

function drawHeaderBlock(doc, scenarioTitle, contentWidth) {
  let currentY = PAGE_MARGIN_TOP;

  doc.setTextColor(17, 38, 70);
  doc.setFont(FONT_FAMILY, "normal");
  doc.setFontSize(19);
  currentY = writeParagraph(
    doc,
    "ThreatGraph AI - Senaryo Analiz Raporu",
    PAGE_MARGIN_X,
    currentY,
    contentWidth,
    7.2
  );

  currentY += 3;
  doc.setDrawColor(114, 148, 192);
  doc.setLineWidth(0.5);
  doc.line(PAGE_MARGIN_X, currentY, PAGE_MARGIN_X + 48, currentY);

  currentY += 7;
  doc.setTextColor(28, 33, 41);
  doc.setFontSize(15.5);
  currentY = writeParagraph(doc, scenarioTitle, PAGE_MARGIN_X, currentY, contentWidth, 6.2);

  return currentY + 3;
}

function writeSection(doc, section, currentY, contentWidth) {
  const sectionHeight = estimateSectionHeight(doc, section, contentWidth);
  let nextY = ensureSpace(doc, currentY, sectionHeight);

  nextY += SECTION_HEADING_GAP_BEFORE;

  doc.setFont(FONT_FAMILY, "normal");
  doc.setFontSize(12.4);
  doc.setTextColor(17, 38, 70);
  doc.text(section.title, PAGE_MARGIN_X, nextY);

  nextY += SECTION_HEADING_GAP_AFTER;
  doc.setFontSize(10.7);
  doc.setTextColor(36, 49, 66);

  if (section.paragraphs?.length) {
    section.paragraphs.forEach((paragraph) => {
      nextY = ensureSpace(doc, nextY, PARAGRAPH_LINE_HEIGHT * 2);
      nextY = writeParagraph(doc, paragraph, PAGE_MARGIN_X, nextY, contentWidth, PARAGRAPH_LINE_HEIGHT);
      nextY += 2.2;
    });
  }

  if (section.bullets?.length) {
    nextY = writeBullets(doc, section.bullets, PAGE_MARGIN_X, nextY, contentWidth);
  }

  return nextY + 1.5;
}

function addFooter(doc) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const totalPages = doc.getNumberOfPages();

  for (let page = 1; page <= totalPages; page += 1) {
    doc.setPage(page);
    doc.setFont(FONT_FAMILY, "normal");
    doc.setFontSize(8.6);
    doc.setTextColor(110, 110, 110);
    doc.text(FOOTER_TEXT, PAGE_MARGIN_X, pageHeight - 10.5);
    doc.text(`Sayfa ${page}/${totalPages}`, pageWidth - PAGE_MARGIN_X, pageHeight - 10.5, {
      align: "right",
    });
  }
}

export async function exportScenarioDetailPdf({ scenario, detailSummaryContent, displayedResult }) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  await loadUnicodeFont(doc);

  const contentWidth = doc.internal.pageSize.getWidth() - PAGE_MARGIN_X * 2;
  const scenarioTitle = resolveExportScenarioTitle(scenario, displayedResult);
  const sections = buildExportSections({ scenario, detailSummaryContent, displayedResult });

  let currentY = drawHeaderBlock(doc, scenarioTitle, contentWidth);

  sections.forEach((section) => {
    currentY = writeSection(doc, section, currentY, contentWidth);
  });

  addFooter(doc);

  const fileName = `threatgraph-ai-senaryo-analiz-${slugify(scenarioTitle)}.pdf`;
  doc.save(fileName);
  return fileName;
}
