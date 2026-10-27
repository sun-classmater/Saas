import zlib from "node:zlib";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function readWorkbookRows(buffer) {
  const files = readZip(buffer);
  const sharedStrings = files.get("xl/sharedStrings.xml")
    ? parseSharedStrings(decoder.decode(files.get("xl/sharedStrings.xml")))
    : [];
  const sheetPath = firstWorksheetPath(files);
  const sheetXml = files.get(sheetPath);
  if (!sheetXml) throw new Error("Excel 文件中没有可读取的工作表");
  const rows = [];
  const rowPattern = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
  let rowMatch;
  while ((rowMatch = rowPattern.exec(decoder.decode(sheetXml)))) {
    const cells = [];
    const cellPattern = /<c\b([^>]*)>([\s\S]*?)<\/c>/g;
    let cellMatch;
    while ((cellMatch = cellPattern.exec(rowMatch[1]))) {
      const attributes = cellMatch[1];
      const reference = attribute(attributes, "r");
      const type = attribute(attributes, "t");
      const index = columnIndex(reference);
      let value = "";
      if (type === "inlineStr") {
        value = joinTextNodes(cellMatch[2]);
      } else {
        const valueMatch = cellMatch[2].match(/<v\b[^>]*>([\s\S]*?)<\/v>/);
        const rawValue = valueMatch ? decodeXml(valueMatch[1]) : "";
        value = type === "s" ? (sharedStrings[Number(rawValue)] ?? "") : rawValue;
      }
      cells[index] = value;
    }
    if (cells.some((value) => value !== undefined && value !== "")) rows.push(cells);
  }
  if (rows.length === 0) return [];
  const headers = rows.shift().map((header) => String(header || "").trim());
  return rows.map((values) => Object.fromEntries(
    headers.map((header, index) => [header, values[index] ?? ""])
  ));
}

export function writeWorkbookRows(headers, rows, sheetName = "数据") {
  const sheetRows = [headers, ...rows];
  const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    ${sheetRows.map((row, rowIndex) => `<row r="${rowIndex + 1}">${row.map((value, column) => {
      const ref = `${columnName(column)}${rowIndex + 1}`;
      return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
    }).join("")}</row>`).join("")}
  </sheetData>
</worksheet>`;
  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="${escapeXml(sheetName)}" sheetId="1" r:id="rId1"/></sheets>
</workbook>`;
  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`;
  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`;
  return createZip([
    ["[Content_Types].xml", encoder.encode(contentTypes)],
    ["_rels/.rels", encoder.encode(rootRels)],
    ["xl/workbook.xml", encoder.encode(workbook)],
    ["xl/_rels/workbook.xml.rels", encoder.encode(workbookRels)],
    ["xl/worksheets/sheet1.xml", encoder.encode(sheetXml)]
  ]);
}

function parseSharedStrings(xml) {
  const values = [];
  const itemPattern = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
  let match;
  while ((match = itemPattern.exec(xml))) values.push(joinTextNodes(match[1]));
  return values;
}

function joinTextNodes(xml) {
  const values = [];
  const textPattern = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
  let match;
  while ((match = textPattern.exec(xml))) values.push(decodeXml(match[1]));
  return values.join("");
}

function firstWorksheetPath(files) {
  const workbook = decoder.decode(files.get("xl/workbook.xml") || encoder.encode(""));
  const sheet = workbook.match(/<sheet\b[^>]*\br:id="([^"]+)"[^>]*\/?>/);
  const relationships = decoder.decode(files.get("xl/_rels/workbook.xml.rels") || encoder.encode(""));
  if (sheet) {
    const relationship = relationships.match(new RegExp(`<Relationship\\b[^>]*Id="${escapeRegex(sheet[1])}"[^>]*>`));
    if (relationship) {
      const target = relationship[0].match(/\bTarget="([^"]+)"/)?.[1];
      if (target) return `xl/${target.replace(/^\/?xl\//, "").replace(/^\//, "")}`;
    }
  }
  return "xl/worksheets/sheet1.xml";
}

function attribute(attributes, name) {
  return attributes.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1] || "";
}

function columnIndex(reference) {
  const letters = String(reference).match(/^[A-Z]+/)?.[0] || "A";
  let index = 0;
  for (const char of letters) index = index * 26 + char.charCodeAt(0) - 64;
  return index - 1;
}

function columnName(index) {
  let value = index + 1;
  let name = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    value = Math.floor((value - 1) / 26);
  }
  return name;
}

function escapeXml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function decodeXml(value) {
  return String(value)
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)));
}

function readZip(buffer) {
  const source = Buffer.from(buffer);
  const eocd = findEocd(source);
  const entryCount = source.readUInt16LE(eocd + 10);
  let offset = source.readUInt32LE(eocd + 16);
  const files = new Map();
  for (let index = 0; index < entryCount; index += 1) {
    if (source.readUInt32LE(offset) !== 0x02014b50) throw new Error("Excel ZIP 目录损坏");
    const method = source.readUInt16LE(offset + 10);
    const compressedSize = source.readUInt32LE(offset + 20);
    const nameLength = source.readUInt16LE(offset + 28);
    const extraLength = source.readUInt16LE(offset + 30);
    const commentLength = source.readUInt16LE(offset + 32);
    const localOffset = source.readUInt32LE(offset + 42);
    const name = source.subarray(offset + 46, offset + 46 + nameLength).toString("utf8");
    const localNameLength = source.readUInt16LE(localOffset + 26);
    const localExtraLength = source.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = source.subarray(dataStart, dataStart + compressedSize);
    let content;
    if (method === 0) content = Buffer.from(compressed);
    else if (method === 8) content = zlib.inflateRawSync(compressed);
    else throw new Error("Excel ZIP 使用了不支持的压缩算法");
    files.set(name, content);
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

function findEocd(source) {
  const start = Math.max(0, source.length - 65557);
  for (let index = source.length - 22; index >= start; index -= 1) {
    if (source.readUInt32LE(index) === 0x06054b50) return index;
  }
  throw new Error("不是有效的 XLSX 文件");
}

function createZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const [name, rawContent] of entries) {
    const nameBytes = encoder.encode(name);
    const content = Buffer.from(rawContent);
    const crc = crc32(content);
    const local = Buffer.alloc(30 + nameBytes.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(0, 10);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(content.length, 18);
    local.writeUInt32LE(content.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28);
    nameBytes.forEach((byte, index) => { local[30 + index] = byte; });
    localParts.push(local, content);

    const central = Buffer.alloc(46 + nameBytes.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt32LE(0, 12);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(content.length, 20);
    central.writeUInt32LE(content.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    nameBytes.forEach((byte, index) => { central[46 + index] = byte; });
    centralParts.push(central);
    offset += local.length + content.length;
  }
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, ...centralParts, end]);
}

let crcTable;
function crc32(buffer) {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let index = 0; index < 256; index += 1) {
      let value = index;
      for (let bit = 0; bit < 8; bit += 1) {
        value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
      }
      crcTable[index] = value >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
