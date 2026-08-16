/**
 * Channel List Exporter — SDX Channel Editor
 *
 * SatcoDX 1.05 TV Export Format (yeni_list.sdx uyumlu):
 *   - 128 byte kanal verisi
 *   - 5 byte ayırıcı: 0x20 0x20 0x20 0x20 0x0A  ("    \n")
 *   - Toplam: 133 byte / kayıt (Vestel / Grundig / Regal firmware bunu bekler)
 *
 * Name field layout:
 *   [43..51]  = baseName: kanal adının ilk 8 karakteri (boşlukla doldurulur)
 *   [113..128]= suffix  : DAİMA "_ _" ile başlar + kanal adının 9–21. karakterleri
 *
 * Türkçe karakterler Latin1 tek-byte olarak korunur (Ü=0xDC, Ş=0xDE vs.)
 * Binary Uint8Array kullanıldığı için UTF-8 genişleme sorunu yaşanmaz.
 */

/**
 * Turkish → ASCII karakter dönüştürücü
 * (Yalnızca "TV Karakter Temizleme" butonu için — TV export'u için artık gerekli değil)
 */
export function sanitizeTVCharacters(str) {
  if (!str) return '';
  return str
    .replace(/[ĞğÐð]/g, 'G')
    .replace(/[Üü]/g, 'U')
    .replace(/[ŞşÞþ]/g, 'S')
    .replace(/[İıÝý]/g, 'I')
    .replace(/[Öö]/g, 'O')
    .replace(/[Çç]/g, 'C')
    .replace(/[^\x20-\x7E]/g, '')
    .toUpperCase();
}

/**
 * SatcoDX 1.05 formatında binary export.
 *
 * yeni_list.sdx referans dosyasıyla birebir aynı format:
 *   • 133 byte/kayıt (128 veri + "    \n")
 *   • suffix alanı daima "__" ile başlar
 *   • Türkçe karakterler Latin1 byte olarak saklanır
 *
 * @param {Array}   channels       - Kanal nesneleri dizisi
 * @param {Object}  options
 * @param {boolean} options.sanitizeTV  - true ise Türkçe → ASCII dönüşümü yapılır
 * @returns {Uint8Array} Binary dosya içeriği
 */
export function exportToSatcoDX(channels, options = { sanitizeTV: false }) {
  const RECORD_SIZE = 128;
  // yeni_list.sdx ayırıcısı: 4 boşluk + LF
  const SEPARATOR = [0x20, 0x20, 0x20, 0x20, 0x0A];
  const TOTAL_PER_RECORD = RECORD_SIZE + SEPARATOR.length; // 133

  const output = new Uint8Array(channels.length * TOTAL_PER_RECORD);

  channels.forEach((ch, idx) => {
    const recordOffset = idx * TOTAL_PER_RECORD;

    // ─── 128 byte'lık kayıt tamponunu boşluk (0x20) ile doldur ───────────────
    const record = new Uint8Array(RECORD_SIZE).fill(0x20);

    // ─── rawSatcoLine byte'larını kopyala ────────────────────────────────────
    // FileReader('latin1') ile okunduğu için charCode === orijinal byte değeri.
    // charCode & 0xFF ile yazar — UTF-8 genişlemesi yaşanmaz.
    if (ch.rawSatcoLine && ch.rawSatcoLine.startsWith('SATCODX')) {
      const raw = ch.rawSatcoLine;
      const copyLen = Math.min(raw.length, RECORD_SIZE);
      for (let i = 0; i < copyLen; i++) {
        record[i] = raw.charCodeAt(i) & 0xFF;
      }
    } else {
      // rawSatcoLine yoksa (elle eklenen kanallar) fallback kayıt oluştur
      _writeFallbackRecord(record, ch);
    }

    // ─── Kanal adını hazırla ─────────────────────────────────────────────────
    let nameStr = options.sanitizeTV
      ? sanitizeTVCharacters(ch.name)          // ASCII only (Türkçe → Latin)
      : ch.name.toUpperCase();                  // Latin1 Türkçe karakterleri koru

    // baseName: adın ilk 8 karakteri, sağ boşlukla doldurulmuş
    const baseName = nameStr.substring(0, 8).padEnd(8, ' ');

    // suffix: DAİMA "__" ile başlar + adın 9–21. karakterleri (13 char)
    // Bu yeni_list.sdx formatının zorunlu kuralı!
    const suffixContent = nameStr.substring(8).padEnd(13, ' ').substring(0, 13);
    const suffix = '__' + suffixContent; // 2 + 13 = 15 byte

    // ─── baseName ve suffix byte'larını yaz ───────────────────────────────────
    // turkishCharToByte ile İ→0xDD, Ş→0xDE, Ğ→0xD0 gibi doğru byte'lar üretilir.
    const baseBytes = strToWin1254Bytes(baseName, 8);
    const sufBytes  = strToWin1254Bytes(suffix, 15);

    baseBytes.forEach((b, i) => { record[43 + i] = b; });
    sufBytes.forEach((b, i) => { record[113 + i] = b; });

    // ─── Kaydı çıktı tamponuna kopyala ───────────────────────────────────────
    output.set(record, recordOffset);

    // ─── Ayırıcıyı yaz: 4 boşluk + LF ───────────────────────────────────────
    output[recordOffset + 128] = 0x20; // ' '
    output[recordOffset + 129] = 0x20; // ' '
    output[recordOffset + 130] = 0x20; // ' '
    output[recordOffset + 131] = 0x20; // ' '
    output[recordOffset + 132] = 0x0A; // '\n'
  });

  return output;
}

/**
 * rawSatcoLine olmadığında fallback SatcoDX 1.05 kaydı oluşturur.
 * Elle eklenen veya CSV/JSON'dan gelen kanallar için kullanılır.
 */
function _writeFallbackRecord(record, ch) {
  const writeStr = (str, offset, length) => {
    const padded = str.padEnd(length, ' ').substring(0, length);
    for (let i = 0; i < length; i++) {
      record[offset + i] = (padded.charCodeAt(i) || 0x20) & 0xFF;
    }
  };
  const writeAscii = (str, offset) => {
    for (let i = 0; i < str.length; i++) {
      record[offset + i] = (str.charCodeAt(i) || 0x20) & 0xFF;
    }
  };

  const sat      = (ch.satellite || 'Turksat (42.0E)').padEnd(18, ' ').substring(0, 18);
  const typeCode = ch.type === 'RADYO' ? 'RMPG' : 'TMPG';
  const polCode  = ch.polarization === 'V' ? '1' : '2';
  const freq     = String(ch.frequency || 12000).padStart(5, '0').substring(0, 5);
  const sr       = String(ch.symbolRate || 27500).padEnd(6, '0').substring(0, 6);
  const mid      = `0420TUR     ______${sr}____________106010107031001____tr_____`;

  writeAscii('SATCODX105', 0);
  writeStr(sat, 10, 18);
  writeAscii(typeCode, 28);
  writeAscii(polCode + '0' + freq + '0000', 32);
  writeStr(mid.padEnd(62, '_').substring(0, 62), 51, 62);
}

/**
 * Unicode Türkçe karakteri → Windows-1254 byte değerine dönüştürür.
 *
 * decodeTurkishChars() ile düzgün Unicode'a çevrilmiş karakterleri
 * dosyaya geri yazarken doğru byte değerini üretmek için kullanılır.
 * Örn: 'İ' (U+0130) → 0xDD, 'Ş' (U+015E) → 0xDE
 */
function turkishCharToByte(char) {
  const cp = char.codePointAt(0);
  switch (cp) {
    case 0x011E: return 0xD0; // Ğ
    case 0x011F: return 0xF0; // ğ
    case 0x0130: return 0xDD; // İ
    case 0x0131: return 0xFD; // ı
    case 0x015E: return 0xDE; // Ş
    case 0x015F: return 0xFE; // ş
    default:    return cp & 0xFF;
  }
}

/**
 * Bir karakter dizisini Windows-1254 byte dizisine dönüştürür.
 * Türkçe ve ASCII karakterlerin ikisini de doğru şekilde işler.
 */
function strToWin1254Bytes(str, length) {
  const bytes = new Uint8Array(length).fill(0x20);
  for (let i = 0; i < Math.min(str.length, length); i++) {
    bytes[i] = turkishCharToByte(str[i]);
  }
  return bytes;
}

// ─── XML SDX (Vestel/Grundig SchannelList) ────────────────────────────────────

export function exportToXML_SDX(channels) {
  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<SchannelList Generator="SDX Channel Editor v1.0" Count="${channels.length}">\n`;
  channels.forEach(ch => {
    xml += `  <Channel>\n`;
    xml += `    <Number>${ch.number}</Number>\n`;
    xml += `    <Name>${escapeXML(ch.name)}</Name>\n`;
    xml += `    <Type>${ch.type}</Type>\n`;
    xml += `    <Category>${escapeXML(ch.category)}</Category>\n`;
    xml += `    <Frequency>${ch.frequency}</Frequency>\n`;
    xml += `    <SymbolRate>${ch.symbolRate}</SymbolRate>\n`;
    xml += `    <Polarization>${ch.polarization}</Polarization>\n`;
    xml += `    <ServiceId>${ch.serviceId}</ServiceId>\n`;
    xml += `    <Satellite>${escapeXML(ch.satellite)}</Satellite>\n`;
    xml += `    <Favorite>${ch.favorite ? 1 : 0}</Favorite>\n`;
    xml += `    <Locked>${ch.locked ? 1 : 0}</Locked>\n`;
    xml += `    <Encrypted>${ch.encrypted ? 1 : 0}</Encrypted>\n`;
    xml += `  </Channel>\n`;
  });
  xml += `</SchannelList>`;
  return xml;
}

// ─── CSV ──────────────────────────────────────────────────────────────────────

export function exportToCSV(channels) {
  let csv = `No;Kanal Adı;Kategori;Tür;Frekans;Polarizasyon;Sembol Oranı;Service ID;Uydu;Favori;Şifreli\n`;
  channels.forEach(ch => {
    csv += [
      ch.number,
      `"${ch.name.replace(/"/g, '""')}"`,
      `"${ch.category}"`,
      ch.type,
      ch.frequency,
      ch.polarization,
      ch.symbolRate,
      ch.serviceId,
      `"${ch.satellite}"`,
      ch.favorite ? 'Evet' : 'Hayır',
      ch.encrypted ? 'Evet' : 'Hayır'
    ].join(';') + '\n';
  });
  return csv;
}

// ─── JSON ─────────────────────────────────────────────────────────────────────

export function exportToJSON(channels) {
  return JSON.stringify({
    generator: 'SDX Channel Editor',
    exportedAt: new Date().toISOString(),
    totalChannels: channels.length,
    channels: channels
  }, null, 2);
}

// ─── Download Helper ──────────────────────────────────────────────────────────

/**
 * Dosya indirme başlatır.
 * Binary Uint8Array veya metin string kabul eder.
 * SDX binary export için application/octet-stream kullanın.
 */
export function triggerDownload(content, fileName, mimeType = 'application/octet-stream') {
  const blob = new Blob([content], { type: mimeType });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 150);
}

// ─── Internal ─────────────────────────────────────────────────────────────────

function escapeXML(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}
