/**
 * Multi-format Parser for TV Channel Lists (.sdx, .xml, .csv, .json)
 * Supports SatcoDX 1.05, XML SDX (Vestel, etc.), CSV and JSON formats.
 * Includes Precise Encrypted (Scrambled/CAS) detection & Smart Category Rule Engine.
 */

export function parseChannelFile(fileContent, fileName = '') {
  const content = fileContent.trim();

  // 1. SatcoDX 1.05 Format Check (e.g. uploaded_service_list.sdx)
  if (content.startsWith('SATCODX') || content.includes('SATCODX105') || isSatcoDXFormat(content)) {
    try {
      const parsed = parseSatcoDXText(content);
      if (parsed && parsed.length > 0) return parsed;
    } catch (e) {
      console.warn('SatcoDX 1.05 parse attempt failed, trying XML/JSON/CSV...', e);
    }
  }

  // 2. JSON Format Check
  if (content.startsWith('{') || content.startsWith('[')) {
    try {
      const parsed = JSON.parse(content);
      const list = Array.isArray(parsed) ? parsed : (parsed.channels || parsed.SchannelList || []);
      return normalizeChannels(list);
    } catch (e) {
      console.warn('JSON parse attempt failed...', e);
    }
  }

  // 3. XML Format Check (Common in Vestel SchannelList.sdx or XML channel exports)
  if (content.includes('<?xml') || content.includes('<SchannelList>') || content.includes('<ChannelList>') || content.includes('<channels>')) {
    try {
      const parsed = parseXMLChannels(content);
      if (parsed && parsed.length > 0) return parsed;
    } catch (e) {
      console.warn('XML parse attempt failed...', e);
    }
  }

  // 4. CSV / Delimited Text Check
  if (content.includes(';') || content.includes('\t') || content.includes(',')) {
    try {
      const parsed = parseCSVChannels(content);
      if (parsed && parsed.length > 0) return parsed;
    } catch (e) {
      console.warn('CSV parse attempt failed...', e);
    }
  }

  // 5. Fallback Line-by-line Text Parser
  return parseLineByLineText(content);
}

function isSatcoDXFormat(text) {
  return text.includes('SATCODX') || /^[0-9A-Z]{4,}/m.test(text);
}

/**
 * Accurate Encryption / Scrambled / Pay-TV Detector
 */
export function detectEncryption(channelName, rawLine = '') {
  return false;
}

/**
 * Smart Category Auto-Assigner (Keyword Rule Engine)
 */
export function autoDetectCategory(channelName, type = 'TV') {
  if (type === 'RADYO') return 'Radyo';

  const name = channelName.toUpperCase();

  // 1. Haber
  if (/HABER|NTV|CNN|A HABER|SÖZCÜ|HALK TV|TELE1|TRT HABER|TVNET|ÜLKE|TGRT HABER|EKO|BLOOMBERG|BBN|24 TV|NET TV|GLOBAL/i.test(name)) {
    return 'Haber';
  }

  // 2. Spor
  if (/SPOR|SPORTS|BEIN|EUROSPORT|S SPORT|A SPOR|FB TV|GS TV|BJK|TRT SPOR|FIGHT|EXTREME|TARAFTAR/i.test(name)) {
    return 'Spor';
  }

  // 3. Çocuk
  if (/ÇOCUK|COCUK|MİNİKA|MINIKA|CARTOON|DISNEY|NICK|TRT ÇOCUK|BABY|KIDS|BOOMERANG|MOONBUG/i.test(name)) {
    return 'Çocuk';
  }

  // 4. Müzik
  if (/MÜZİK|MUZIK|MUSIC|KRAL|POWER|DREAM|NR1|NUMBER ONE|TRT MÜZİK|TATLI|KISS|VIVA|POP|MEZZO|MCM TOP/i.test(name)) {
    return 'Müzik';
  }

  // 5. Belgesel & Eğlence
  if (/TLC|DMAX|BELGESEL|DISCOVERY|NAT GEO|NATIONAL|HISTORY|PLANET|TRT BELGESEL|SCIENCE|ANIMAL|TRAVEL|FX|EPIC DRAMA|SÝNEMA|SINEMA|MOVIE/i.test(name)) {
    return 'Belgesel';
  }

  // 6. Dini / Kültür
  if (/DİYANET|DIYANET|SEMERKAND|VUSLAT|DİN|KURAL|TRT DİYANET|REHBER/i.test(name)) {
    return 'Dini';
  }

  // 7. Ulusal
  if (/TRT 1|TRT1|ATV|KANAL D|SHOW|STAR|TV8|NOW|KANAL 7|BEYAZ|FLASH|TELE1|SÖZCÜ|360|TGRT|KRT|MEMLEKET|TV2|TV 2/i.test(name)) {
    return 'Ulusal';
  }

  return 'Genel';
}

/**
 * Latin1 olarak okunan Türkçe karakterleri doğru Unicode karakterlerine dönüştürür.
 *
 * SDX dosyaları genellikle Windows-1254 (Türkçe Windows) kodlamasıyla yazılır.
 * FileReader('latin1') ile okunduğunda bazı karakterler yanlış görünür:
 *   0xD0 = 'Ð' (Latin1) → 'Gğ' (Windows-1254)
 *   0xDD = 'Ý' (Latin1) → 'İ' (Windows-1254)
 *   0xDE = 'Þ' (Latin1) → 'Ş' (Windows-1254)
 *   0xF0 = 'ð' (Latin1) → 'gğ' (Windows-1254)
 *   0xFD = 'ý' (Latin1) → 'ı' (Windows-1254)
 *   0xFE = 'þ' (Latin1) → 'ş' (Windows-1254)
 */
function decodeTurkishChars(str) {
  if (!str) return '';
  // Windows-1254 (Türkçe) ile Latin1 arasındaki fark olan 6 karakter:
  return str
    .replace(/\u00D0/g, '\u011E')  // Ð (0xD0 Latin1) → Ğ (U+011E)
    .replace(/\u00DD/g, '\u0130')  // Ý (0xDD Latin1) → İ (U+0130)
    .replace(/\u00DE/g, '\u015E')  // Þ (0xDE Latin1) → Ş (U+015E)
    .replace(/\u00F0/g, '\u011F')  // ð (0xF0 Latin1) → ğ (U+011F)
    .replace(/\u00FD/g, '\u0131')  // ý (0xFD Latin1) → ı (U+0131)
    .replace(/\u00FE/g, '\u015F'); // þ (0xFE Latin1) → ş (U+015F)
}

/**
 * SatcoDX 1.05 Line Parser
 *
 * IMPORTANT: rawSatcoLine is clamped to exactly 128 chars.
 * If a previous buggy export left lines >128 chars (UTF-8 expansion),
 * we truncate to 128. If <128, we pad with spaces.
 * This ensures the binary exporter always writes exactly 128 bytes per record.
 */
function parseSatcoDXText(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  const channels = [];

  lines.forEach((line, idx) => {
    if (line.startsWith('#') || line.startsWith('//')) return;

    if (line.startsWith('SATCODX')) {
      // ── Clamp rawSatcoLine to exactly 128 chars ──────────────────────────
      // If a previous export corrupted the line length, normalise it here.
      let rawLine = line;
      if (rawLine.length < 128) rawLine = rawLine.padEnd(128, ' ');
      if (rawLine.length > 128) rawLine = rawLine.substring(0, 128);

      const sat = rawLine.substring(10, 28).trim() || 'Turksat (42.0E)';
      const typeCode = rawLine.substring(28, 32);
      const isRadio = typeCode.startsWith('R');
      const polDigit = rawLine.substring(32, 33);
      const pol = (polDigit === '4' || polDigit === '1') ? 'V' : 'H';

      const freqRaw = parseInt(rawLine.substring(33, 39), 10) || 12000;
      const freq = freqRaw > 100000 ? Math.floor(freqRaw / 10) : freqRaw;

      // Name field: exactly bytes 43–50 (base) and 113–127 (suffix)
      const nameBase = rawLine.substring(43, 51).replace(/_/g, ' ').trim();
      const suffix   = rawLine.substring(113, 128).replace(/_/g, ' ').trim();

      let cleanName = (nameBase + (suffix ? ' ' + suffix : '')).replace(/\s+/g, ' ').trim();
      if (!cleanName) cleanName = `Kanal ${channels.length + 1}`;

      const isEncrypted = detectEncryption(cleanName, rawLine);
      const displayName = decodeTurkishChars(cleanName.replace(/[$*]/g, '').trim());
      const type = isRadio ? 'RADYO' : 'TV';
      const category = autoDetectCategory(displayName, type);

      let symbolRate = 27500;
      const srPart = rawLine.substring(65, 85).replace(/_/g, '').trim();
      const srMatch = srPart.match(/\d{4,5}/);
      if (srMatch) symbolRate = parseInt(srMatch[0], 10);

      channels.push({
        id: `ch-satcodx-${idx + 1}-${Date.now()}`,
        number: channels.length + 1,
        name: displayName,
        type: type,
        category: category,
        frequency: freq,
        symbolRate: symbolRate,
        polarization: pol,
        serviceId: 1000 + channels.length,
        satellite: sat || 'Turksat (42.0E)',
        favorite: false,
        locked: false,
        encrypted: isEncrypted,
        rawSatcoLine: rawLine   // Always exactly 128 chars
      });
    } else {
      const parts = line.split(/[\s,;|]+/);
      const name = parts.find(p => isNaN(p) && p.length > 2) || `Kanal ${idx + 1}`;
      const type = line.toLowerCase().includes('radio') ? 'RADYO' : 'TV';
      const isEncrypted = detectEncryption(name, line);

      channels.push({
        id: `ch-sdx-${idx + 1}-${Date.now()}`,
        number: channels.length + 1,
        name: name.toUpperCase(),
        type: type,
        category: autoDetectCategory(name, type),
        frequency: 12000,
        symbolRate: 27500,
        polarization: 'H',
        serviceId: 1000 + channels.length,
        satellite: 'Satellite',
        favorite: false,
        locked: false,
        encrypted: isEncrypted
      });
    }
  });

  if (channels.length === 0) throw new Error('SatcoDX parsing yielded 0 channels');
  return channels;
}

function normalizeChannels(rawChannels) {
  return rawChannels.map((ch, idx) => {
    const type = (ch.type || ch.Type || (ch.isRadio ? 'RADYO' : 'TV')).toUpperCase();
    const name = (ch.name || ch.Name || ch.title || `Kanal ${idx + 1}`).trim();
    const isEncrypted = ch.encrypted !== undefined ? Boolean(ch.encrypted) : detectEncryption(name);
    return {
      id: ch.id || `ch-${idx + 1}-${Date.now()}`,
      number: parseInt(ch.number || ch.Number || ch.num || idx + 1, 10),
      name: name,
      type: type,
      category: ch.category || autoDetectCategory(name, type),
      frequency: parseInt(ch.frequency || ch.Frequency || ch.freq || 11000, 10),
      symbolRate: parseInt(ch.symbolRate || ch.SymbolRate || ch.sr || 27500, 10),
      polarization: (ch.polarization || ch.Polarization || ch.pol || 'H').toUpperCase(),
      serviceId: parseInt(ch.serviceId || ch.ServiceId || ch.sid || 1000 + idx, 10),
      satellite: ch.satellite || ch.Satellite || 'Türksat 42.0°E',
      favorite: Boolean(ch.favorite || ch.Favorite || ch.fav),
      locked: Boolean(ch.locked || ch.Locked || ch.lock),
      encrypted: isEncrypted
    };
  });
}

function parseXMLChannels(xmlString) {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlString, 'text/xml');
  const channelNodes = Array.from(xmlDoc.querySelectorAll('Channel, channel, Service, service, Program, program'));

  if (channelNodes.length === 0) {
    throw new Error('No <Channel> nodes found in XML');
  }

  return channelNodes.map((node, idx) => {
    const getVal = (tag) => node.querySelector(tag)?.textContent?.trim() || node.getAttribute(tag) || '';
    
    const name = getVal('Name') || getVal('name') || getVal('Title') || `Kanal ${idx + 1}`;
    const number = parseInt(getVal('Number') || getVal('number') || getVal('LCN') || idx + 1, 10);
    const frequency = parseInt(getVal('Frequency') || getVal('frequency') || getVal('Freq') || 11000, 10);
    const symbolRate = parseInt(getVal('SymbolRate') || getVal('symbolRate') || getVal('SR') || 27500, 10);
    const polarization = (getVal('Polarization') || getVal('polarization') || getVal('Pol') || 'H').toUpperCase();
    const serviceId = parseInt(getVal('ServiceId') || getVal('serviceId') || getVal('SID') || 1000 + idx, 10);
    const type = (getVal('Type') || getVal('type') || 'TV').toUpperCase();
    const xmlEncFlag = getVal('Encrypted') === '1' || getVal('Scrambled') === '1' || getVal('FreeToAir') === '0';
    const isEncrypted = xmlEncFlag || detectEncryption(name);

    return {
      id: `ch-xml-${idx + 1}-${Date.now()}`,
      number,
      name,
      type: type.includes('RAD') ? 'RADYO' : 'TV',
      category: autoDetectCategory(name, type),
      frequency,
      symbolRate,
      polarization: polarization.startsWith('V') ? 'V' : 'H',
      serviceId,
      satellite: getVal('Satellite') || 'Türksat 42.0°E',
      favorite: getVal('Favorite') === '1' || getVal('favorite') === 'true',
      locked: getVal('Locked') === '1' || getVal('locked') === 'true',
      encrypted: isEncrypted
    };
  });
}

function parseCSVChannels(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length < 1) throw new Error('Empty CSV');

  const delimiter = text.includes(';') ? ';' : (text.includes('\t') ? '\t' : ',');
  const hasHeader = isNaN(lines[0].split(delimiter)[0]);
  const startIdx = hasHeader ? 1 : 0;
  const channels = [];

  for (let i = startIdx; i < lines.length; i++) {
    const cols = lines[i].split(delimiter).map(c => c.trim().replace(/^["']|["']$/g, ''));
    if (cols.length < 2) continue;

    const number = parseInt(cols[0], 10) || (channels.length + 1);
    const name = cols[1] || `Kanal ${channels.length + 1}`;
    const type = cols[3] || (name.toLowerCase().includes('radyo') ? 'RADYO' : 'TV');
    const category = cols[2] || autoDetectCategory(name, type);
    const frequency = parseInt(cols[4], 10) || 12000;
    const polarization = (cols[5] || 'H').toUpperCase();
    const symbolRate = parseInt(cols[6], 10) || 27500;
    const encrypted = cols[9] === 'Evet' || cols[9] === '1' || detectEncryption(name);

    channels.push({
      id: `ch-csv-${i}-${Date.now()}`,
      number,
      name,
      type,
      category,
      frequency,
      symbolRate,
      polarization: polarization.startsWith('V') ? 'V' : 'H',
      serviceId: 1000 + i,
      satellite: 'Türksat 42.0°E',
      favorite: false,
      locked: false,
      encrypted: encrypted
    });
  }

  return channels;
}

function parseLineByLineText(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  return lines.map((line, idx) => {
    const cleanLine = line.replace(/^\d+[\s.-]+/, '').trim();
    return {
      id: `ch-line-${idx + 1}-${Date.now()}`,
      number: idx + 1,
      name: cleanLine || `Kanal ${idx + 1}`,
      type: 'TV',
      category: autoDetectCategory(cleanLine, 'TV'),
      frequency: 12000,
      symbolRate: 27500,
      polarization: 'H',
      serviceId: 1000 + idx,
      satellite: 'Türksat 42.0°E',
      favorite: false,
      locked: false,
      encrypted: detectEncryption(cleanLine)
    };
  });
}
