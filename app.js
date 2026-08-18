import { DEFAULT_PRESET_CHANNELS } from './presets.js';
import { parseChannelFile, autoDetectCategory } from './sdxParser.js';
import { exportToXML_SDX, exportToSatcoDX, exportToCSV, exportToJSON, triggerDownload, sanitizeTVCharacters } from './sdxExporter.js';

// Application State
let channels = [];
let selectedIds = new Set();
let lastSelectedIdx = null;

let activeFilter = 'all';
let searchQuery = '';
let historyStack = [];
let redoStack = [];
let dragSourceIndex = null;

// DOM Elements
const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const channelTableBody = document.getElementById('channelTableBody');
const selectAllCheckbox = document.getElementById('selectAllCheckbox');
const searchInput = document.getElementById('searchInput');
const filterBtns = document.querySelectorAll('.filter-btn');

const btnFixTVChars = document.getElementById('btnFixTVChars');
const btnLoadPreset = document.getElementById('btnLoadPreset');
const btnAddChannel = document.getElementById('btnAddChannel');
const btnAutoRenumber = document.getElementById('btnAutoRenumber');
const btnClearAll = document.getElementById('btnClearAll');

const btnUndo = document.getElementById('btnUndo');
const btnRedo = document.getElementById('btnRedo');

const btnExportMenu = document.getElementById('btnExportMenu');
const exportDropdown = document.getElementById('exportDropdown');

// Bulk Toolbar Elements
const bulkToolbar = document.getElementById('bulkToolbar');
const bulkCount = document.getElementById('bulkCount');
const btnBulkMoveTop = document.getElementById('btnBulkMoveTop');
const btnBulkMoveUp = document.getElementById('btnBulkMoveUp');
const btnBulkMoveDown = document.getElementById('btnBulkMoveDown');
const btnBulkMoveBottom = document.getElementById('btnBulkMoveBottom');
const moveTargetNum = document.getElementById('moveTargetNum');
const btnBulkMoveToPos = document.getElementById('btnBulkMoveToPos');
const btnBulkFavorite = document.getElementById('btnBulkFavorite');
const btnBulkDelete = document.getElementById('btnBulkDelete');
const btnDeselectAll = document.getElementById('btnDeselectAll');

const editModal = document.getElementById('editModal');
const channelForm = document.getElementById('channelForm');

// Stats Elements
const statTotal = document.getElementById('statTotal');
const statTV = document.getElementById('statTV');
const statRadio = document.getElementById('statRadio');
const statFav = document.getElementById('statFav');
const statSelected = document.getElementById('statSelected');

// Initialize App — Türksat Güncel Liste ile başlat
document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  loadChannels([...DEFAULT_PRESET_CHANNELS]);
  showToast('Güncel Türksat (436 şifresiz kanal & popüler radyo) yüklendi.', 'success');
});

function setupEventListeners() {
  // Drag and Drop File Upload
  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('drag-over');
  });

  dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('drag-over');
  });

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('drag-over');
    if (e.dataTransfer.files.length > 0) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleFileUpload(e.target.files[0]);
    }
  });

  // Search & Filter
  searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value.toLowerCase().trim();
    renderTable();
  });

  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeFilter = btn.getAttribute('data-filter');
      renderTable();
    });
  });

  // Select All Checkbox
  selectAllCheckbox.addEventListener('change', (e) => {
    const visibleChannels = getFilteredChannels();
    if (e.target.checked) {
      visibleChannels.forEach(ch => selectedIds.add(ch.id));
    } else {
      visibleChannels.forEach(ch => selectedIds.delete(ch.id));
    }
    renderTable();
  });

  // TV Characters Fix Button
  btnFixTVChars.addEventListener('click', () => {
    pushHistory();
    channels.forEach(ch => {
      ch.name = sanitizeTVCharacters(ch.name);
    });
    renderTable();
    showToast('Tüm kanal isimleri TV garanti uyumlu karakterlere dönüştürüldü.', 'success');
  });



  // Nav Actions
  btnLoadPreset.addEventListener('click', () => {
    pushHistory();
    selectedIds.clear();
    loadChannels([...DEFAULT_PRESET_CHANNELS]);
    showToast('Güncel Türksat şifresiz kanal ve radyo listesi yüklendi.', 'success');
  });

  btnAddChannel.addEventListener('click', () => {
    openModalForAdd();
  });

  btnAutoRenumber.addEventListener('click', () => {
    pushHistory();
    autoRenumberChannels();
    renderTable();
    showToast('Kanallar 1’den itibaren yeniden numaralandırıldı.');
  });

  btnClearAll.addEventListener('click', () => {
    if (confirm('Tüm kanal listesini silmek istediğinizden emin misiniz?')) {
      pushHistory();
      channels = [];
      selectedIds.clear();
      renderTable();
      showToast('Tüm liste temizlendi.', 'warning');
    }
  });

  // Bulk Toolbar Actions
  btnDeselectAll.addEventListener('click', () => {
    selectedIds.clear();
    renderTable();
  });

  btnBulkDelete.addEventListener('click', () => {
    if (selectedIds.size === 0) return;
    if (confirm(`Seçili ${selectedIds.size} kanalı silmek istediğinizden emin misiniz?`)) {
      pushHistory();
      channels = channels.filter(ch => !selectedIds.has(ch.id));
      const count = selectedIds.size;
      selectedIds.clear();
      autoRenumberChannels();
      renderTable();
      showToast(`${count} kanal silindi.`, 'warning');
    }
  });

  btnBulkMoveTop.addEventListener('click', () => {
    if (selectedIds.size === 0) return;
    pushHistory();
    const selected = channels.filter(ch => selectedIds.has(ch.id));
    const unselected = channels.filter(ch => !selectedIds.has(ch.id));
    channels = [...selected, ...unselected];
    autoRenumberChannels();
    renderTable();
    showToast(`${selected.length} kanal listenin en başına taşındı.`);
  });

  btnBulkMoveBottom.addEventListener('click', () => {
    if (selectedIds.size === 0) return;
    pushHistory();
    const selected = channels.filter(ch => selectedIds.has(ch.id));
    const unselected = channels.filter(ch => !selectedIds.has(ch.id));
    channels = [...unselected, ...selected];
    autoRenumberChannels();
    renderTable();
    showToast(`${selected.length} kanal listenin en sonuna taşındı.`);
  });

  btnBulkMoveUp.addEventListener('click', () => {
    if (selectedIds.size === 0) return;
    pushHistory();
    for (let i = 1; i < channels.length; i++) {
      if (selectedIds.has(channels[i].id) && !selectedIds.has(channels[i - 1].id)) {
        const temp = channels[i];
        channels[i] = channels[i - 1];
        channels[i - 1] = temp;
      }
    }
    autoRenumberChannels();
    renderTable();
  });

  btnBulkMoveDown.addEventListener('click', () => {
    if (selectedIds.size === 0) return;
    pushHistory();
    for (let i = channels.length - 2; i >= 0; i--) {
      if (selectedIds.has(channels[i].id) && !selectedIds.has(channels[i + 1].id)) {
        const temp = channels[i];
        channels[i] = channels[i + 1];
        channels[i + 1] = temp;
      }
    }
    autoRenumberChannels();
    renderTable();
  });

  btnBulkMoveToPos.addEventListener('click', () => {
    const targetNum = parseInt(moveTargetNum.value, 10);
    if (isNaN(targetNum) || targetNum < 1 || targetNum > channels.length || selectedIds.size === 0) {
      showToast('Geçerli bir sıra numarası girin (1 - ' + channels.length + ').', 'danger');
      return;
    }

    pushHistory();
    const targetIdx = targetNum - 1;
    const selected = channels.filter(ch => selectedIds.has(ch.id));
    const unselected = channels.filter(ch => !selectedIds.has(ch.id));

    unselected.splice(targetIdx, 0, ...selected);
    channels = unselected;
    autoRenumberChannels();
    renderTable();
    showToast(`${selected.length} kanal ${targetNum}. pozisyona taşındı.`);
  });

  btnBulkFavorite.addEventListener('click', () => {
    if (selectedIds.size === 0) return;
    pushHistory();
    const hasNonFav = channels.some(ch => selectedIds.has(ch.id) && !ch.favorite);
    channels.forEach(ch => {
      if (selectedIds.has(ch.id)) {
        ch.favorite = hasNonFav;
      }
    });
    renderTable();
    showToast(`${selectedIds.size} kanalın favori durumu güncellendi.`);
  });

  // Undo / Redo
  btnUndo.addEventListener('click', handleUndo);
  btnRedo.addEventListener('click', handleRedo);

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey) {
      if (e.key.toLowerCase() === 'z') {
        if (e.shiftKey) handleRedo();
        else handleUndo();
      } else if (e.key.toLowerCase() === 'y') {
        handleRedo();
      } else if (e.key.toLowerCase() === 'a' && document.activeElement.tagName !== 'INPUT') {
        e.preventDefault();
        const visibleChannels = getFilteredChannels();
        visibleChannels.forEach(ch => selectedIds.add(ch.id));
        renderTable();
      }
    }
  });

  // Export Menu Toggle
  btnExportMenu.addEventListener('click', (e) => {
    e.stopPropagation();
    exportDropdown.style.display = exportDropdown.style.display === 'none' ? 'block' : 'none';
  });

  document.addEventListener('click', () => {
    exportDropdown.style.display = 'none';
  });

  // Export Buttons
  document.getElementById('exportSDX_SatcoTV').addEventListener('click', (e) => {
    e.preventDefault();
    // yeni_list.sdx formatıyla birebir: 133 byte/kayıt, Latin1 Türkçe karakter korumalı
    const content = exportToSatcoDX(channels, { sanitizeTV: false });
    triggerDownload(content, 'uploaded_service_list.sdx', 'application/octet-stream');
    showToast('uploaded_service_list.sdx (TV Garanti Uyumlu, 133-byte) indirildi.', 'success');
  });

  document.getElementById('exportSDX_Satco').addEventListener('click', (e) => {
    e.preventDefault();
    // ASCII karakter temizliği ile (opsiyonel)
    const content = exportToSatcoDX(channels, { sanitizeTV: true });
    triggerDownload(content, 'uploaded_service_list.sdx', 'application/octet-stream');
    showToast('uploaded_service_list.sdx (Türkçe→ASCII, 133-byte) indirildi.');
  });

  document.getElementById('exportSDX_XML').addEventListener('click', (e) => {
    e.preventDefault();
    const content = exportToXML_SDX(channels);
    triggerDownload(content, 'SchannelList.sdx', 'application/xml');
    showToast('SchannelList.sdx (XML) indirildi.');
  });

  document.getElementById('exportCSV').addEventListener('click', (e) => {
    e.preventDefault();
    const content = exportToCSV(channels);
    triggerDownload(content, 'kanal_listesi.csv', 'text/csv;charset=utf-8;');
    showToast('kanal_listesi.csv indirildi.');
  });

  document.getElementById('exportJSON').addEventListener('click', (e) => {
    e.preventDefault();
    const content = exportToJSON(channels);
    triggerDownload(content, 'kanal_listesi.json', 'application/json');
    showToast('kanal_listesi.json indirildi.');
  });

  // Modal Form Submission
  channelForm.addEventListener('submit', (e) => {
    e.preventDefault();
    saveModalData();
  });
}

// File Handler
function handleFileUpload(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const parsed = parseChannelFile(e.target.result, file.name);
      if (parsed && parsed.length > 0) {
        pushHistory();
        selectedIds.clear();
        loadChannels(parsed);
        showToast(`"${file.name}" başarıyla yüklendi (${parsed.length} kanal).`, 'success');
      } else {
        showToast('Dosyada geçerli kanal bulunamadı.', 'danger');
      }
    } catch (err) {
      console.error(err);
      showToast('Dosya ayrıştırılamadı. Format desteklenmiyor olabilir.', 'danger');
    }
  };
  reader.readAsText(file, 'latin1');
}

// State Operations
function loadChannels(newList) {
  channels = newList;
  autoRenumberChannels();
  renderTable();
}

function autoRenumberChannels() {
  channels.forEach((ch, i) => ch.number = i + 1);
}



function pushHistory() {
  historyStack.push(JSON.stringify(channels));
  redoStack = [];
  updateUndoRedoState();
}

function handleUndo() {
  if (historyStack.length > 0) {
    redoStack.push(JSON.stringify(channels));
    channels = JSON.parse(historyStack.pop());
    renderTable();
    updateUndoRedoState();
    showToast('Son işlem geri alındı.');
  }
}

function handleRedo() {
  if (redoStack.length > 0) {
    historyStack.push(JSON.stringify(channels));
    channels = JSON.parse(redoStack.pop());
    renderTable();
    updateUndoRedoState();
    showToast('İşlem yinelendi.');
  }
}

function updateUndoRedoState() {
  btnUndo.disabled = historyStack.length === 0;
  btnUndo.style.opacity = historyStack.length === 0 ? '0.4' : '1';
  btnRedo.disabled = redoStack.length === 0;
  btnRedo.style.opacity = redoStack.length === 0 ? '0.4' : '1';
}

function getFilteredChannels() {
  return channels.filter(ch => {
    const matchesSearch = !searchQuery || 
      ch.name.toLowerCase().includes(searchQuery) ||
      String(ch.number).includes(searchQuery) ||
      String(ch.frequency).includes(searchQuery);

    if (!matchesSearch) return false;

    if (activeFilter === 'all') return true;
    if (activeFilter === 'TV') return ch.type === 'TV';
    if (activeFilter === 'RADYO') return ch.type === 'RADYO';
    if (activeFilter === 'FAVORITE') return ch.favorite;
    return ch.category === activeFilter;
  });
}

// Render Table
function renderTable() {
  channelTableBody.innerHTML = '';
  const filtered = getFilteredChannels();

  updateStats();

  if (filtered.length > 0) {
    const allSelected = filtered.every(ch => selectedIds.has(ch.id));
    selectAllCheckbox.checked = allSelected;
  } else {
    selectAllCheckbox.checked = false;
  }

  if (selectedIds.size > 0) {
    bulkToolbar.style.display = 'flex';
    bulkCount.textContent = selectedIds.size;
  } else {
    bulkToolbar.style.display = 'none';
  }

  if (filtered.length === 0) {
    channelTableBody.innerHTML = `
      <tr>
        <td colspan="10" style="text-align:center; padding:40px; color:var(--text-muted);">
          <i class="fa-solid fa-folder-open" style="font-size:32px; margin-bottom:10px; opacity:0.5; display:block;"></i>
          Gösterilecek kanal bulunamadı.
        </td>
      </tr>
    `;
    return;
  }

  filtered.forEach((ch, filteredIdx) => {
    const globalIdx = channels.indexOf(ch);
    const isSelected = selectedIds.has(ch.id);

    const tr = document.createElement('tr');
    tr.className = `channel-row ${isSelected ? 'selected' : ''}`;
    tr.draggable = true;
    tr.dataset.index = globalIdx;

    const typeBadgeClass = ch.type === 'RADYO' ? 'badge-radio' : 'badge-tv';

    tr.innerHTML = `
      <td style="text-align:center;" onclick="event.stopPropagation();">
        <input type="checkbox" class="row-checkbox" data-id="${ch.id}" ${isSelected ? 'checked' : ''} style="cursor:pointer; accent-color:#6366f1; width:16px; height:16px;">
      </td>
      <td><i class="fa-solid fa-grip-vertical drag-handle"></i></td>
      <td class="channel-num">${ch.number}</td>
      <td class="channel-name-cell">
        <span>${escapeHTML(ch.name)}</span>
      </td>
      <td><span class="badge ${typeBadgeClass}">${ch.type}</span></td>
      <td><span class="badge badge-cat">${escapeHTML(ch.category || 'Genel')}</span></td>
      <td>${ch.frequency} MHz</td>
      <td>${ch.polarization}</td>
      <td>${ch.symbolRate}</td>
      <td style="text-align: right;">
        <div class="action-btn-group" style="justify-content: flex-end;">
          <button class="action-icon-btn ${ch.favorite ? 'active-fav' : ''}" onclick="toggleFavorite(${globalIdx})" title="Favori Ekle/Çıkar">
            <i class="fa-${ch.favorite ? 'solid' : 'regular'} fa-star"></i>
          </button>
          <button class="action-icon-btn ${ch.locked ? 'active-lock' : ''}" onclick="toggleLock(${globalIdx})" title="Ebeveyn Kilidi / Şifre">
            <i class="fa-solid fa-lock${ch.locked ? '' : '-open'}"></i>
          </button>
          <button class="action-icon-btn" onclick="moveChannelUp(${globalIdx})" title="Yukarı Taşı">
            <i class="fa-solid fa-arrow-up"></i>
          </button>
          <button class="action-icon-btn" onclick="moveChannelDown(${globalIdx})" title="Aşağı Taşı">
            <i class="fa-solid fa-arrow-down"></i>
          </button>
          <button class="action-icon-btn" onclick="openModalForEdit(${globalIdx})" title="Düzenle">
            <i class="fa-solid fa-pen"></i>
          </button>
          <button class="action-icon-btn" onclick="deleteChannel(${globalIdx})" title="Sil" style="color:#ef4444;">
            <i class="fa-solid fa-trash-can"></i>
          </button>
        </div>
      </td>
    `;

    // Row Click Selection (supporting Shift+Click for range selection)
    tr.addEventListener('click', (e) => {
      if (e.target.tagName === 'BUTTON' || e.target.closest('button') || e.target.tagName === 'INPUT') return;

      if (e.shiftKey && lastSelectedIdx !== null) {
        const start = Math.min(lastSelectedIdx, filteredIdx);
        const end = Math.max(lastSelectedIdx, filteredIdx);
        for (let i = start; i <= end; i++) {
          selectedIds.add(filtered[i].id);
        }
      } else if (e.ctrlKey || e.metaKey) {
        if (selectedIds.has(ch.id)) selectedIds.delete(ch.id);
        else selectedIds.add(ch.id);
        lastSelectedIdx = filteredIdx;
      } else {
        selectedIds.clear();
        selectedIds.add(ch.id);
        lastSelectedIdx = filteredIdx;
      }
      renderTable();
    });

    const checkbox = tr.querySelector('.row-checkbox');
    checkbox.addEventListener('change', (e) => {
      e.stopPropagation();
      if (checkbox.checked) selectedIds.add(ch.id);
      else selectedIds.delete(ch.id);
      lastSelectedIdx = filteredIdx;
      renderTable();
    });

    // Drag & Drop Reordering
    tr.addEventListener('dragstart', (e) => {
      dragSourceIndex = globalIdx;
      if (!selectedIds.has(ch.id)) {
        selectedIds.clear();
        selectedIds.add(ch.id);
      }
      tr.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });

    tr.addEventListener('dragend', () => {
      tr.classList.remove('dragging');
      document.querySelectorAll('.channel-row').forEach(row => {
        row.classList.remove('drag-over-top', 'drag-over-bottom');
      });
    });

    tr.addEventListener('dragover', (e) => {
      e.preventDefault();
      const rect = tr.getBoundingClientRect();
      const mid = rect.top + rect.height / 2;
      tr.classList.remove('drag-over-top', 'drag-over-bottom');
      if (e.clientY < mid) {
        tr.classList.add('drag-over-top');
      } else {
        tr.classList.add('drag-over-bottom');
      }
    });

    tr.addEventListener('drop', (e) => {
      e.preventDefault();
      const targetIdx = globalIdx;
      if (dragSourceIndex !== null && dragSourceIndex !== targetIdx) {
        pushHistory();
        const selectedList = channels.filter(item => selectedIds.has(item.id));
        const unselectedList = channels.filter(item => !selectedIds.has(item.id));
        
        let insertAt = unselectedList.indexOf(channels[targetIdx]);
        if (insertAt === -1) insertAt = targetIdx;

        unselectedList.splice(insertAt, 0, ...selectedList);
        channels = unselectedList;

        autoRenumberChannels();
        renderTable();
        showToast(`${selectedList.length} kanal taşındı.`);
      }
    });

    channelTableBody.appendChild(tr);
  });
}

// Global Single Row Actions
window.toggleFavorite = function(idx) {
  pushHistory();
  channels[idx].favorite = !channels[idx].favorite;
  renderTable();
};

window.toggleLock = function(idx) {
  pushHistory();
  channels[idx].locked = !channels[idx].locked;
  renderTable();
};

window.moveChannelUp = function(idx) {
  if (idx > 0) {
    pushHistory();
    const temp = channels[idx];
    channels[idx] = channels[idx - 1];
    channels[idx - 1] = temp;
    autoRenumberChannels();
    renderTable();
  }
};

window.moveChannelDown = function(idx) {
  if (idx < channels.length - 1) {
    pushHistory();
    const temp = channels[idx];
    channels[idx] = channels[idx + 1];
    channels[idx + 1] = temp;
    autoRenumberChannels();
    renderTable();
  }
};

window.deleteChannel = function(idx) {
  if (confirm(`"${channels[idx].name}" kanalını silmek istediğinizden emin misiniz?`)) {
    pushHistory();
    const deletedId = channels[idx].id;
    channels.splice(idx, 1);
    selectedIds.delete(deletedId);
    autoRenumberChannels();
    renderTable();
    showToast('Kanal silindi.', 'warning');
  }
};

// Modal Operations
window.openModalForEdit = function(idx) {
  const ch = channels[idx];
  document.getElementById('modalTitle').textContent = 'Kanal Düzenle';
  document.getElementById('editChannelId').value = idx;
  document.getElementById('editNumber').value = ch.number;
  document.getElementById('editName').value = ch.name;
  document.getElementById('editType').value = ch.type;
  document.getElementById('editCategory').value = ch.category || '';
  document.getElementById('editFrequency').value = ch.frequency || 11000;
  document.getElementById('editPolarization').value = ch.polarization || 'H';
  document.getElementById('editSymbolRate').value = ch.symbolRate || 27500;
  document.getElementById('editSatellite').value = ch.satellite || 'Turksat (42.0E)';

  editModal.classList.add('active');
};

function openModalForAdd() {
  document.getElementById('modalTitle').textContent = 'Yeni Kanal Ekle';
  document.getElementById('editChannelId').value = '-1';
  document.getElementById('editNumber').value = channels.length + 1;
  document.getElementById('editName').value = '';
  document.getElementById('editType').value = 'TV';
  document.getElementById('editCategory').value = 'Ulusal';
  document.getElementById('editFrequency').value = 11054;
  document.getElementById('editPolarization').value = 'H';
  document.getElementById('editSymbolRate').value = 30000;
  document.getElementById('editSatellite').value = 'Turksat (42.0E)';

  editModal.classList.add('active');
}

window.closeModal = function() {
  editModal.classList.remove('active');
};

function saveModalData() {
  const idx = parseInt(document.getElementById('editChannelId').value, 10);
  const newChannel = {
    id: idx >= 0 ? channels[idx].id : `ch-custom-${Date.now()}`,
    number: parseInt(document.getElementById('editNumber').value, 10),
    name: document.getElementById('editName').value.trim(),
    type: document.getElementById('editType').value,
    category: document.getElementById('editCategory').value.trim() || 'Genel',
    frequency: parseInt(document.getElementById('editFrequency').value, 10) || 11000,
    polarization: document.getElementById('editPolarization').value,
    symbolRate: parseInt(document.getElementById('editSymbolRate').value, 10) || 27500,
    satellite: document.getElementById('editSatellite').value.trim() || 'Turksat (42.0E)',
    favorite: idx >= 0 ? channels[idx].favorite : false,
    locked: idx >= 0 ? channels[idx].locked : false,
    encrypted: idx >= 0 ? channels[idx].encrypted : false
  };

  pushHistory();
  if (idx >= 0) {
    channels[idx] = newChannel;
    showToast('Kanal bilgileri güncellendi.');
  } else {
    channels.push(newChannel);
    showToast('Yeni kanal eklendi.');
  }

  closeModal();
  autoRenumberChannels();
  renderTable();
}

function updateStats() {
  statTotal.textContent = channels.length;
  statTV.textContent = channels.filter(c => c.type === 'TV').length;
  statRadio.textContent = channels.filter(c => c.type === 'RADYO').length;
  statFav.textContent = channels.filter(c => c.favorite).length;
  statSelected.textContent = selectedIds.size;
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = 'toast';
  
  let icon = 'fa-circle-info';
  if (type === 'success') icon = 'fa-circle-check';
  if (type === 'warning') icon = 'fa-triangle-exclamation';
  if (type === 'danger') icon = 'fa-circle-xmark';

  toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${escapeHTML(message)}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function escapeHTML(str) {
  if (!str) return '';
  return str.replace(/[&<>'"]/g, 
    tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
  );
}
