const TODAY = new Date().toISOString().slice(0, 10);
const US_STATES = [
  "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut", "Delaware",
  "Florida", "Georgia", "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky",
  "Louisiana", "Maine", "Maryland", "Massachusetts", "Michigan", "Minnesota", "Mississippi", "Missouri",
  "Montana", "Nebraska", "Nevada", "New Hampshire", "New Jersey", "New Mexico", "New York",
  "North Carolina", "North Dakota", "Ohio", "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island",
  "South Carolina", "South Dakota", "Tennessee", "Texas", "Utah", "Vermont", "Virginia", "Washington",
  "West Virginia", "Wisconsin", "Wyoming"
];
const PI_RESTRICTIONS = ["None", "New Investigator", "Early Stage Investigator", "Established Investigator"];
const FEDERAL_AGENCIES = [
  "ACF",
  "BIA",
  "CDC",
  "CMS",
  "DOJ",
  "HHS Other",
  "HRSA",
  "IHS",
  "NIH",
  "Other Federal",
  "SAMHSA"
];
const PAT_PERMISSION_HELP = `

Your Personal Access Token (PAT) needs additional permissions:
• For Classic PATs: Enable both 'repo' and 'workflow' scopes
• For Fine-grained PATs: Grant 'Actions' → 'Read and write' permission

Please create a new token at: https://github.com/settings/tokens`;
const PAT_INVALID_HELP = `

Your token may be invalid or expired. Please verify it at: https://github.com/settings/tokens`;

// Fields that should be highlighted if they contain apostrophes
const APOSTROPHE_CHECK_FIELDS = [
  'a_title', 'a_duration', 'a_deadlines', 'a_deadlineRecurring',
  'a_link', 'a_description'
];

const APOSTROPHE_CHECK_FIELDS_PROSPECTS = [
  'p_funder', 'p_link', 'p_notes'
];

let grants = [];
let prospects = [];
let vocab = {};
let editIndex = null;
let prospectEditIndex = null;
let currentView = 'grants'; // 'grants' or 'prospects'
let mutationQueue = Promise.resolve();
let queuedMutations = 0;

const els = {
  list: document.getElementById("list"),
  q: document.getElementById("q"),
  resultCount: document.getElementById("resultCount"),
  clearFilters: document.getElementById("clearFilters"),
  adminPlus: document.getElementById("adminPlus"),
  adminDialog: document.getElementById("adminDialog"),
  adminDialogTitle: document.getElementById("adminDialogTitle"),
  saveBtn: document.getElementById("saveBtn"),
  deleteBtn: document.getElementById("deleteBtn"),
  cancelBtn: document.getElementById("cancelBtn"),
  adminStatus: document.getElementById("adminStatus"),
  prospectDialog: document.getElementById("prospectDialog"),
  prospectDialogTitle: document.getElementById("prospectDialogTitle"),
  prospectSaveBtn: document.getElementById("prospectSaveBtn"),
  prospectDeleteBtn: document.getElementById("prospectDeleteBtn"),
  prospectCancelBtn: document.getElementById("prospectCancelBtn"),
  prospectStatus: document.getElementById("prospectStatus"),
  toggleGrants: document.getElementById("toggleGrants"),
  toggleProspects: document.getElementById("toggleProspects"),
  downloadBtn: document.getElementById("downloadBtn")
};

async function enqueueMutation(task, statusEl) {
  const queuePosition = ++queuedMutations;
  if (statusEl && queuePosition > 1) {
    statusEl.textContent = `Queued (#${queuePosition - 1} ahead)…`;
  }

  const nextTask = mutationQueue.then(() => task());

  mutationQueue = nextTask.catch(() => {}).finally(() => {
    queuedMutations = Math.max(queuedMutations - 1, 0);
  });

  return nextTask;
}

async function loadData(options = {}) {
  // Always cache-bust to ensure users see the most current data (per requirement #3)
  const suffix = `?t=${Date.now()}`;
  vocab = await fetch(`data/vocab.json${suffix}`, { cache: "no-store" }).then(r => r.json());
  grants = await fetch(`data/grants.json${suffix}`, { cache: "no-store" }).then(r => r.json());
  prospects = await fetch(`data/prospects.json${suffix}`, { cache: "no-store" }).then(r => r.json());
  
  // Ensure all grants have unique IDs for proper edit tracking
  const timestamp = Date.now();
  grants.forEach((g, index) => {
    if (!g.id) {
      g.id = generateGrantId(timestamp, index);
    }
  });
  
  // Ensure all prospects have unique IDs for proper edit tracking
  prospects.forEach((p, index) => {
    if (!p.id) {
      p.id = generateProspectId(timestamp, index);
    }
  });
  
  initFilters();
  if (!options.skipBindEvents) {
    bindEvents();
  }
  apply();
  updateKeywordPillStates();
  updateToggleSlider();
}


function generateGrantId(timestamp, index) {
  return `grant_${timestamp}_${index}_${Math.random().toString(36).substr(2, 9)}`;
}

function generateProspectId(timestamp, index) {
  return `prospect_${timestamp}_${index}_${Math.random().toString(36).substr(2, 9)}`;
}

function initFilters() {
  // Create Funder Type checkboxes
  const funderTypeContainer = document.getElementById("funderTypeCheckboxes");
  funderTypeContainer.innerHTML = "";
  (vocab.funderTypes || []).forEach(type => {
    const label = document.createElement("label");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.name = "funderType";
    checkbox.value = type;
    label.appendChild(checkbox);
    label.appendChild(document.createTextNode(type));
    funderTypeContainer.appendChild(label);
  });

  // Create Eligibility checkboxes (Prime and Secondary only)
  const eligibilityContainer = document.getElementById("eligibilityCheckboxes");
  eligibilityContainer.innerHTML = "";
  const eligibilityOptions = ["Prime", "Secondary"];
  eligibilityOptions.forEach((type, index) => {
    const label = document.createElement("label");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.name = "eligibility";
    checkbox.value = type;
    // Neither is selected by default
    label.appendChild(checkbox);
    label.appendChild(document.createTextNode(type));
    eligibilityContainer.appendChild(label);
  });

  // Create Keyword pills in alphabetical order
  const keywordContainer = document.getElementById("keywordPills");
  keywordContainer.innerHTML = "";
  const sortedKeywords = [...(vocab.keywords || [])].sort();
  sortedKeywords.forEach(keyword => {
    const pill = document.createElement("span");
    pill.className = "keyword-pill";
    pill.textContent = keyword;
    pill.dataset.keyword = keyword;
    keywordContainer.appendChild(pill);
  });

  // Admin dialog selects
  fillSelect(document.getElementById("a_funderType"), vocab.funderTypes || []);
  // Eligibility is hardcoded to "Prime" and "Secondary" per requirements (task #7)
  fillSelect(document.getElementById("a_eligibility"), ["Prime", "Secondary"]);
  fillSelect(document.getElementById("a_amountDetail"), ["per year", "over total award period"]);
  fillSelect(document.getElementById("a_amountIdc"), vocab.amountIdcOptions || ["Not specified"]);
  fillMulti(document.getElementById("a_keywords"), vocab.keywords || []);
  fillMulti(document.getElementById("a_geography"), US_STATES);
  fillSelect(document.getElementById("a_piRestriction"), PI_RESTRICTIONS);

  // Prospect dialog selects
  fillSelect(document.getElementById("p_funderType"), vocab.funderTypes || []);
  fillMulti(document.getElementById("p_keywords"), vocab.keywords || []);
  fillMulti(document.getElementById("p_geography"), US_STATES);
  fillSelect(document.getElementById("p_piRestriction"), PI_RESTRICTIONS);

  document.getElementById("a_addedDate").value = TODAY;
  updateAgencyNameField();
}

function updateKeywordPillStates() {
  // Get active grants (with active deadlines) or all prospects based on current view
  let activeItems;
  if (currentView === 'prospects') {
    activeItems = prospects;
  } else {
    activeItems = grants.filter(g => hasActiveDeadline(g));
  }
  
  // Get all keywords used in active items
  const activeKeywords = new Set();
  activeItems.forEach(item => {
    (item.keywords || []).forEach(kw => activeKeywords.add(kw));
  });
  
  // Update each keyword pill
  document.querySelectorAll('.keyword-pill').forEach(pill => {
    const keyword = pill.dataset.keyword;
    if (activeKeywords.has(keyword)) {
      pill.classList.remove('inactive');
    } else {
      pill.classList.add('inactive');
    }
  });
}

function bindEvents() {
  // Helper to call the right apply function based on current view
  const applyFilters = () => {
    if (currentView === 'prospects') {
      applyProspectFilters();
    } else {
      apply();
    }
  };

  // Search input
  els.q.addEventListener("input", applyFilters);
  els.q.addEventListener("change", applyFilters);

  // Funder Type checkboxes
  document.querySelectorAll('input[name="funderType"]').forEach(cb => {
    cb.addEventListener("change", applyFilters);
  });

  // Eligibility checkboxes
  document.querySelectorAll('input[name="eligibility"]').forEach(cb => {
    cb.addEventListener("change", applyFilters);
  });

  // Keyword pills
  document.querySelectorAll('.keyword-pill').forEach(pill => {
    pill.addEventListener("click", () => {
      // Don't allow toggling inactive pills
      if (pill.classList.contains('inactive')) {
        return;
      }
      pill.classList.toggle("selected");
      applyFilters();
    });
  });

  els.clearFilters.onclick = () => {
    els.q.value = "";
    document.querySelectorAll('input[name="funderType"]').forEach(cb => { cb.checked = false; });
    document.querySelectorAll('input[name="eligibility"]').forEach(cb => { 
      cb.checked = false;
    });
    document.querySelectorAll('.keyword-pill').forEach(pill => { pill.classList.remove("selected"); });
    applyFilters();
  };

  els.adminPlus.onclick = () => {
    if (currentView === 'grants') {
      openAdminDialog();
    } else {
      openProspectDialog();
    }
  };
  els.cancelBtn.onclick = () => closeAdminDialog();
  els.deleteBtn.onclick = () => deleteCurrentGrant();
  
  // Prospect dialog handlers
  els.prospectCancelBtn.onclick = () => closeProspectDialog();
  els.prospectDeleteBtn.onclick = () => deleteCurrentProspect();
  
  // Toggle handlers
  els.toggleGrants.onclick = () => switchView('grants');
  els.toggleProspects.onclick = () => switchView('prospects');
  
  // Download button
  els.downloadBtn.onclick = () => downloadCurrentViewPdf();
  
  // Handle deadline type radio buttons
  document.querySelectorAll('input[name="deadlineType"]').forEach(radio => {
    radio.addEventListener('change', updateDeadlineFields);
  });

  document.getElementById("a_funderType").addEventListener("change", updateAgencyNameField);
  
  // Set up apostrophe highlighting for admin form fields
  APOSTROPHE_CHECK_FIELDS.forEach(fieldId => {
    const field = document.getElementById(fieldId);
    if (field) {
      field.addEventListener('input', highlightApostropheFields);
    }
  });
  
  // Set up apostrophe highlighting for prospect form fields
  APOSTROPHE_CHECK_FIELDS_PROSPECTS.forEach(fieldId => {
    const field = document.getElementById(fieldId);
    if (field) {
      field.addEventListener('input', highlightApostropheFieldsProspects);
    }
  });

  window.addEventListener('resize', updateToggleSlider);
}


function updateDeadlineFields() {
  const deadlineType = document.querySelector('input[name="deadlineType"]:checked').value;
  const deadlinesLabel = document.getElementById('a_deadlines_label');
  const deadlinesInput = document.getElementById('a_deadlines');
  const recurringLabel = document.getElementById('a_deadlineRecurring_label');
  const recurringInput = document.getElementById('a_deadlineRecurring');
  
  if (deadlineType === 'deadline') {
    deadlinesLabel.style.display = '';
    deadlinesInput.required = true;
    recurringLabel.style.display = 'none';
    recurringInput.required = false;
  } else if (deadlineType === 'open') {
    deadlinesLabel.style.display = 'none';
    deadlinesInput.required = false;
    recurringLabel.style.display = 'none';
    recurringInput.required = false;
  } else if (deadlineType === 'recurring') {
    deadlinesLabel.style.display = 'none';
    deadlinesInput.required = false;
    recurringLabel.style.display = '';
    recurringInput.required = true;
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function sanitizeUrl(url) {
  if (!url) return '#';
  
  // Trim whitespace and decode any encoded characters to prevent bypasses
  const trimmedUrl = url.trim();
  
  try {
    // Use URL constructor to parse and validate
    const urlObj = new URL(trimmedUrl, window.location.href);
    
    // Only allow http and https protocols
    if (urlObj.protocol === 'http:' || urlObj.protocol === 'https:') {
      return urlObj.href;
    }
  } catch (e) {
    // Invalid URL, return safe fallback
  }
  
  return '#';
}

function updateAgencyNameField() {
  const funderType = document.getElementById("a_funderType").value;
  const agencyLabel = document.getElementById("a_agencyName_label");
  const agencyInput = document.getElementById("a_agencyName");
  const shouldShow = funderType === "Federal" || funderType === "Foundation" || funderType === "State";
  agencyLabel.style.display = shouldShow ? "" : "none";
  agencyInput.required = false;
  if (!shouldShow) {
    agencyInput.value = "";
  }
}

function fillSelect(el, arr, first) {
  el.innerHTML = "";
  if (first) {
    el.append(new Option(first, ""));
  }
  arr.forEach(v => el.append(new Option(v, v)));
}

function fillMulti(el, arr) {
  el.innerHTML = "";
  arr.forEach(v => el.append(new Option(v, v)));
}

function selectedValues(selectEl) {
  return [...selectEl.selectedOptions].map(o => o.value);
}

function pluralize(count, singular, plural) {
  return count === 1 ? singular : (plural || `${singular}s`);
}

// Check if a grant has an active deadline (either upcoming dates, always open, or recurring)
function hasActiveDeadline(g) {
  // Open and recurring deadlines are always "active"
  if (g.deadlineOpen || g.deadlineRecurring) {
    return true;
  }
  // Regular deadlines: check if there are any future dates
  return (g.deadlines || []).filter(d => d >= TODAY).length > 0;
}

function nextDeadline(g) {
  return (g.deadlines || []).filter(d => d >= TODAY).sort()[0] || null;
}

function upcomingDeadlines(g) {
  return (g.deadlines || []).filter(d => d >= TODAY).sort();
}

function isNewGrant(g) {
  if (!g.addedDate) {
    return false;
  }
  const ms = new Date(TODAY).getTime() - new Date(g.addedDate).getTime();
  const days = ms / (1000 * 60 * 60 * 24);
  return days >= 0 && days <= (CIH_CONFIG.newGrantWindowDays || 30);
}

function daysBetween(from, to) {
  const ms = new Date(to).getTime() - new Date(from).getTime();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

function formatDate(value) {
  if (!value) {
    return "—";
  }
  return new Date(`${value}T00:00:00`).toLocaleDateString(CIH_CONFIG.locale || "en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
}

function formatAmount(value) {
  if (!value) {
    return "Not specified";
  }
  return new Intl.NumberFormat(CIH_CONFIG.locale || "en-US", {
    style: "currency",
    currency: CIH_CONFIG.currency || "USD",
    maximumFractionDigits: 0
  }).format(value);
}

function formatIdcNote(grant) {
  if (!grant.amount) {
    return "IDC not specified";
  }
  return grant.amountIdc || "Not specified";
}

function apply() {
  const q = els.q.value.trim().toLowerCase();
  
  // Get checked funder types
  const byFunder = Array.from(document.querySelectorAll('input[name="funderType"]:checked'))
    .map(cb => cb.value);
  
  // Get checked eligibility
  const byEligibility = Array.from(document.querySelectorAll('input[name="eligibility"]:checked'))
    .map(cb => cb.value);
  
  // Get selected keywords from pills
  const byKeywords = Array.from(document.querySelectorAll('.keyword-pill.selected'))
    .map(pill => pill.dataset.keyword);

  // Check if any filters are active
  const hasActiveFilters = q || byFunder.length || byEligibility.length || byKeywords.length;

  // Note: Limitations and Sort filters were removed per UI redesign requirements
  let filtered = grants
    .filter(g => hasActiveDeadline(g))
    .filter(g => {
      // Show grants without parents, or nested grants whose parent is inactive
      if (!g.parentGrantId) return true;
      const parent = grants.find(p => p.id === g.parentGrantId);
      return !parent || !hasActiveDeadline(parent);
    })
    .filter(g => !byFunder.length || byFunder.includes(g.funderType))
    .filter(g => !byEligibility.length || byEligibility.includes(g.eligibility))
    .filter(g => !byKeywords.length || byKeywords.some(k => (g.keywords || []).includes(k)))
    .filter(g => {
      if (!q) {
        return true;
      }
      const hay = [g.title || "", g.description || "", g.agencyName || "", g.federalAgency || "", ...(g.keywords || [])].join(" ").toLowerCase();
      return hay.includes(q);
    });

  // Sort: Pinned grants first (when no filters), then new grants, then by deadline proximity, then recurring, then always open
  filtered.sort((a, b) => {
    // Note: Nested grants are already filtered out, so we don't need to check for nesting here
    
    // If keyword filters are active, sort by number of matching keywords first
    if (byKeywords.length > 0) {
      const aMatches = byKeywords.filter(k => (a.keywords || []).includes(k)).length;
      const bMatches = byKeywords.filter(k => (b.keywords || []).includes(k)).length;
      if (aMatches !== bMatches) {
        return bMatches - aMatches; // More matches first
      }
    }
    
    // If no filters are active, pinned grants (that are not nested) come first
    if (!hasActiveFilters) {
      const aPinned = a.pin === true;
      const bPinned = b.pin === true;
      if (aPinned && !bPinned) return -1;
      if (!aPinned && bPinned) return 1;
    }
    
    const aIsNew = isNewGrant(a);
    const bIsNew = isNewGrant(b);
    
    // New grants come first
    if (aIsNew && !bIsNew) return -1;
    if (!aIsNew && bIsNew) return 1;
    
    // Within same new/not-new category, sort by deadline type
    const aNextDeadline = nextDeadline(a);
    const bNextDeadline = nextDeadline(b);
    
    // Both have future deadlines - sort by days until deadline
    if (aNextDeadline && bNextDeadline) {
      const aDays = daysBetween(TODAY, aNextDeadline);
      const bDays = daysBetween(TODAY, bNextDeadline);
      if (aDays !== bDays) {
        return aDays - bDays;
      }
      // If same days, sort alphabetically
      return (a.title || "").localeCompare(b.title || "");
    }
    
    // One has future deadline, one doesn't
    if (aNextDeadline && !bNextDeadline) return -1;
    if (!aNextDeadline && bNextDeadline) return 1;
    
    // Neither has future deadline - recurring comes before always open
    const aIsRecurring = !!a.deadlineRecurring;
    const bIsRecurring = !!b.deadlineRecurring;
    
    if (aIsRecurring && !bIsRecurring) return -1;
    if (!aIsRecurring && bIsRecurring) return 1;
    
    // Both same type (recurring or open), sort alphabetically
    return (a.title || "").localeCompare(b.title || "");
  });

  render(filtered, byKeywords);
}

function applyProspectFilters() {
  const q = els.q.value.trim().toLowerCase();
  
  // Get checked funder types
  const byFunder = Array.from(document.querySelectorAll('input[name="funderType"]:checked'))
    .map(cb => cb.value);
  
  // Get selected keywords from pills
  const byKeywords = Array.from(document.querySelectorAll('.keyword-pill.selected'))
    .map(pill => pill.dataset.keyword);

  // Filter prospects
  let filtered = prospects
    .filter(p => !byFunder.length || byFunder.includes(p.funderType))
    .filter(p => !byKeywords.length || byKeywords.some(k => (p.keywords || []).includes(k)))
    .filter(p => {
      if (!q) {
        return true;
      }
      const hay = [p.funder, p.notes, p.funderType, ...(p.keywords || [])].join(" ").toLowerCase();
      return hay.includes(q);
    });

  renderProspects(filtered);
}

function switchView(view) {
  currentView = view;
  const toggleContainer = document.querySelector('.toggle-container');
  const eligibilityFilterRow = document.getElementById('eligibilityFilterRow');
  
  if (view === 'prospects') {
    toggleContainer.classList.add('prospects');
    els.toggleGrants.classList.remove('active');
    els.toggleProspects.classList.add('active');
    // Hide eligibility filter for prospects
    if (eligibilityFilterRow) {
      eligibilityFilterRow.style.display = 'none';
    }
    updateKeywordPillStates();
    applyProspectFilters();
    updateToggleSlider();
  } else {
    toggleContainer.classList.remove('prospects');
    els.toggleGrants.classList.add('active');
    els.toggleProspects.classList.remove('active');
    // Show eligibility filter for grants
    if (eligibilityFilterRow) {
      eligibilityFilterRow.style.display = '';
    }
    updateKeywordPillStates();
    apply();
    updateToggleSlider();
  }
}

function updateToggleSlider() {
  const slider = document.querySelector('.toggle-slider');
  const container = document.querySelector('.toggle-container');
  const activeBtn = document.querySelector('.toggle-btn.active');
  if (!slider || !container || !activeBtn) {
    return;
  }

  const left = activeBtn.offsetLeft - 2;
  const width = activeBtn.offsetWidth;
  slider.style.width = `${width}px`;
  slider.style.transform = `translateX(${left}px)`;
}


function render(list, selectedKeywords = []) {
  els.list.innerHTML = "";
  
  // Pre-compute nested grant counts for better performance
  const nestedCountMap = new Map();
  grants.forEach(ng => {
    if (ng.parentGrantId && hasActiveDeadline(ng)) {
      nestedCountMap.set(ng.parentGrantId, (nestedCountMap.get(ng.parentGrantId) || 0) + 1);
    }
  });
  
  // Count total opportunities including nested grants
  let totalCount = list.length;
  list.forEach(g => {
    totalCount += (nestedCountMap.get(g.id) || 0);
  });
  
  els.resultCount.textContent = `${totalCount} ${pluralize(totalCount, 'opportunity', 'opportunities')}`;
  list.forEach(g => els.list.append(renderGrant(g, selectedKeywords)));
}

function renderProspects(filteredProspects = prospects) {
  els.list.innerHTML = "";
  
  // Sort prospects alphabetically by funder name, with pinned ones first
  const sorted = [...filteredProspects].sort((a, b) => {
    const aPinned = a.pin === true;
    const bPinned = b.pin === true;
    if (aPinned && !bPinned) return -1;
    if (!aPinned && bPinned) return 1;
    return (a.funder || "").localeCompare(b.funder || "");
  });
  
  els.resultCount.textContent = `${sorted.length} ${pluralize(sorted.length, 'prospect')}`;
  sorted.forEach(p => els.list.append(renderProspect(p)));
}

function renderProspect(p) {
  const div = document.createElement("article");
  div.className = "grant"; // Reuse grant card styling
  
  const keywords = [];
  // Add pin indicator as first pill if pinned
  if (p.pin) {
    keywords.push({ text: "★ Pinned", className: "pin-indicator" });
  }
  // Add invitation only as maroon pill before other keywords
  if (p.invitationOnly) {
    keywords.push({ text: "Invitation Only", className: "kcard-invitation-only" });
  }
  // Add funder type as blue pill after pin
  if (p.funderType) {
    keywords.push({ text: p.funderType, className: "kcard-funder-type" });
  }
  if (p.piRestriction && p.piRestriction !== "None") {
    keywords.push({ text: p.piRestriction, className: "kcard-pi-restriction" });
  }
  if (p.geography && Array.isArray(p.geography) && p.geography.length > 0) {
    // Sort states alphabetically and add each as a pill
    const sortedStates = [...p.geography].sort();
    sortedStates.forEach(state => {
      keywords.push({ text: state, className: "kcard-state" });
    });
  }
  (p.keywords || []).forEach(kw => {
    keywords.push({ text: kw, className: "" });
  });
  
  const keywordPills = keywords
    .map(kw => {
      if (kw.className === "pin-indicator") {
        return `<span class="${kw.className}">${kw.text}</span>`;
      }
      return `<span class="kcard ${kw.className}">${kw.text}</span>`;
    })
    .join("");
  
  const hasNotes = p.notes && p.notes.trim().length > 0;
  const fullNotes = p.notes || "";
  
  // Build hyperlink pills
  const hyperlinkPills = (p.hyperlinks || [])
    .map(link => `<a href="${sanitizeUrl(link.url)}" target="_blank" rel="noopener noreferrer" class="hyperlink-pill">${escapeHtml(link.text)} ↗</a>`)
    .join("");
  
  div.innerHTML = `
    <h3><a href="${p.link}" target="_blank" rel="noopener noreferrer">${p.funder}</a></h3>
    <div class="grant-top">${keywordPills}</div>
    ${hyperlinkPills ? `<div class="hyperlink-pills">${hyperlinkPills}</div>` : ""}
    ${hasNotes ? `<p class="meta-row"><strong>Notes:</strong> ${escapeHtml(fullNotes)}</p>` : ""}
    <div class="card-actions">
      <button class="btn btn-small edit-prospect">Edit</button>
    </div>
  `;
  
  // Handle edit
  div.querySelector(".edit-prospect").addEventListener("click", () => {
    openProspectDialog(prospects.indexOf(p));
  });
  
  // Handle hyperlink pill clicks to stop propagation
  div.querySelectorAll(".hyperlink-pill").forEach(pill => {
    pill.addEventListener("click", (e) => {
      e.stopPropagation();
    });
  });
  
  // Add click event listeners to clickable pills
  div.querySelectorAll('.kcard-state').forEach(pill => {
    pill.addEventListener('click', (e) => {
      e.stopPropagation();
      showPillFilter('state', pill.textContent);
    });
  });

  div.querySelectorAll('.kcard-pi-restriction').forEach(pill => {
    pill.addEventListener('click', (e) => {
      e.stopPropagation();
      showPillFilter('piRestriction', pill.textContent);
    });
  });

  div.querySelectorAll('.kcard-invitation-only').forEach(pill => {
    pill.addEventListener('click', (e) => {
      e.stopPropagation();
      showPillFilter('invitationOnly', null);
    });
  });
  
  return div;
}

function deadlineMarkup(g) {
  // Handle open deadlines
  if (g.deadlineOpen) {
    return `<p class="meta-row"><strong>Deadline:</strong> Always Open</p>`;
  }
  
  // Handle recurring deadlines
  if (g.deadlineRecurring) {
    return `<p class="meta-row"><strong>Deadline:</strong> ${g.deadlineRecurring}</p>`;
  }
  
  // Handle regular deadlines
  const deadlines = upcomingDeadlines(g);
  if (!deadlines.length) {
    return `<p class="meta-row"><strong>Deadline:</strong> —</p>`;
  }
  
  // Helper to create day badge
  const dayBadge = (date) => {
    const days = daysBetween(TODAY, date);
    let badgeClass = 'deadline-badge-green';
    if (days <= 10) {
      badgeClass = 'deadline-badge-maroon';
    } else if (days <= 30) {
      badgeClass = 'deadline-badge-mustard';
    }
    return `<span class="deadline-badge ${badgeClass}">${days}</span>`;
  };
  
  if (deadlines.length === 1) {
    return `<p class="meta-row"><strong>Deadline:</strong> ${formatDate(deadlines[0])} ${dayBadge(deadlines[0])}</p>`;
  }
  return `
    <p class="meta-row"><strong>Next Deadline:</strong> ${formatDate(deadlines[0])} ${dayBadge(deadlines[0])}</p>
    <p class="meta-row"><strong>Additional Deadlines:</strong> ${deadlines.slice(1).map(d => formatDate(d)).join(", ")}</p>
  `;
}

function rfaPillHtml(grant, alwaysShow = false) {
  // Show RFA pill if deadline is open OR if alwaysShow is true (for nested grants)
  // Note: For nested grants, we always show the RFA pill to provide direct access to the RFA document,
  // regardless of deadline status. The "Open RFA" text refers to opening the RFA document, not the deadline status.
  if (!grant.deadlineOpen && !alwaysShow) {
    return '';
  }
  return `<a href="${grant.link}" target="_blank" rel="noopener noreferrer" class="rfa-pill" onclick="event.stopPropagation()">Open RFA ↗</a>`;
}

function renderGrant(g, selectedKeywords = []) {
  const div = document.createElement("article");
  div.className = "grant";

  const previewLimit = CIH_CONFIG.descriptionPreviewChars || 220;
  const fullDescription = g.description || "";
  const hasOverflow = fullDescription.length > previewLimit;
  const preview = hasOverflow ? fullDescription.slice(0, previewLimit).trimEnd() : fullDescription;
  const rest = hasOverflow ? fullDescription.slice(previewLimit) : "";

  // Organize pills into two rows
  // Row 1: Pinned (if applicable), New (if applicable), Keywords
  const row1Pills = [];
  const row2Pills = [];
  
  // Row 1: Add pin indicator as first pill if pinned
  if (g.pin) {
    row1Pills.push({ text: "★ Pinned", className: "pin-indicator" });
  }
  // Row 1: Add "New" badge
  if (isNewGrant(g)) {
    row1Pills.push({ text: "New", className: "kcard-new" });
  }
  // Row 1: Add keywords
  (g.keywords || []).forEach(kw => {
    // Check if this keyword matches any selected keyword
    const isMatched = selectedKeywords.includes(kw);
    row1Pills.push({ text: kw, className: isMatched ? "kcard-matched" : "" });
  });
  
  // Row 2: LOI, PI restrictions, Geographic restrictions
  // Add Letter of Interest pill if applicable
  if (g.letterOfInterest) {
    row2Pills.push({ text: "Letter of Interest", className: "kcard-loi" });
  }
  // Add PI restriction
  if (g.piRestriction && g.piRestriction !== "None") {
    row2Pills.push({ text: g.piRestriction, className: "kcard-pi-restriction" });
  }
  // Add geographic restrictions
  if (g.geography && Array.isArray(g.geography) && g.geography.length > 0) {
    // Sort states alphabetically and add each as a pill
    const sortedStates = [...g.geography].sort();
    sortedStates.forEach(state => {
      row2Pills.push({ text: state, className: "kcard-state" });
    });
  }

  const formatPills = (pills) => pills
    .map(pill => {
      // For pin-indicator, don't add kcard class
      if (pill.className === "pin-indicator") {
        return `<span class="${pill.className}">${pill.text}</span>`;
      }
      return `<span class="kcard ${pill.className}">${pill.text}</span>`;
    })
    .join("");

  const row1Markup = row1Pills.length > 0 ? `<div class="grant-pills-row1">${formatPills(row1Pills)}</div>` : "";
  const row2Markup = row2Pills.length > 0 ? `<div class="grant-pills-row2">${formatPills(row2Pills)}</div>` : "";
  const pillsMarkup = row1Markup || row2Markup ? `<div class="grant-top">${row1Markup}${row2Markup}</div>` : "";

  const limitations = (g.limitations || []).map(l => `<span class="meta-tag">${l}</span>`).join("");

  // Build funder type display with agency pill for Federal, Foundation, and State
  let funderTypeMarkup = "";
  if (g.funderType) {
    const agencyName = g.agencyName || g.federalAgency; // Support both old and new field names
    if ((g.funderType === "Federal" || g.funderType === "Foundation" || g.funderType === "State") && agencyName) {
      // Show funder type in regular text with agency in a small pill
      funderTypeMarkup = `<p class="meta-row"><strong>Funder Type:</strong> ${g.funderType} <span class="agency-pill">${agencyName}</span></p>`;
    } else {
      // Show funder type as regular text
      funderTypeMarkup = `<p class="meta-row"><strong>Funder Type:</strong> ${g.funderType}</p>`;
    }
  }

  // Build eligibility display - no pills, Primary is black, Secondary is maroon
  let eligibilityClass = "";
  if (g.eligibility === "Secondary") {
    eligibilityClass = "eligibility-secondary";
  }
  const eligibilityText = g.eligibility || "Not specified";

  // Get nested grants (only those with active deadlines)
  const nestedGrants = grants.filter(ng => 
    ng.parentGrantId === g.id && hasActiveDeadline(ng)
  );

  div.innerHTML = `
    ${pillsMarkup}
    <h3><a href="${g.link}" target="_blank" rel="noopener noreferrer">${g.title}</a></h3>
    ${funderTypeMarkup}
    ${deadlineMarkup(g)}
    <p class="meta-row"><strong>Amount:</strong> ${formatAmount(g.amount)}${g.amountDetail ? ` ${g.amountDetail}` : ""} <span class="muted">(${formatIdcNote(g)})</span></p>
    <p class="meta-row"><strong>Duration:</strong> ${g.duration || "Not specified"}</p>
    <p class="meta-row"><strong>Eligibility:</strong> <span class="${eligibilityClass}">${eligibilityText}</span></p>
    <p class="meta-row desc-preview"><strong>Description:</strong> ${preview}${rest ? `<span class="ellipsis">...</span><span class="desc-rest">${rest}</span>` : ""}</p>
    ${rest ? `<button class="toggle">▼ Expand</button>` : ""}
    ${nestedGrants.length > 0 ? '<p class="meta-row"><strong>Related Grants:</strong></p>' : ''}
    ${nestedGrants.length > 0 ? '<div class="nested-grants"></div>' : ''}
    ${limitations ? `<div class="tag-row">${limitations}</div>` : ""}
    <div class="card-actions"><button class="btn edit-btn" type="button">Edit</button></div>
  `;

  const editBtn = div.querySelector(".edit-btn");
  editBtn.onclick = () => {
    const index = grants.findIndex(candidate => candidate.id === g.id);
    openAdminDialog(g, index);
  };

  if (rest) {
    const btn = div.querySelector(".toggle");
    const restSpan = div.querySelector(".desc-rest");
    btn.onclick = () => {
      const ellipsis = div.querySelector(".ellipsis");
      const open = restSpan.style.display === "inline";
      restSpan.style.display = open ? "none" : "inline";
      if (ellipsis) {
        ellipsis.style.display = open ? "inline" : "none";
      }
      btn.textContent = open ? "▼ Expand" : "▲ Collapse";
    };
  }

  // Render nested grants
  if (nestedGrants.length > 0) {
    const nestedContainer = div.querySelector(".nested-grants");
    nestedGrants.forEach(ng => {
      const nestedItem = document.createElement("div");
      nestedItem.className = "nested-grant-item";
      nestedItem.dataset.expanded = "false";
      
      // Initial collapsed view - just title
      nestedItem.innerHTML = `
        <div class="nested-grant-title">${ng.title}</div>
        <div class="nested-grant-pills">
          ${rfaPillHtml(ng, true)}
        </div>
      `;
      
      nestedItem.onclick = () => {
        const isExpanded = nestedItem.dataset.expanded === "true";
        
        if (isExpanded) {
          // Collapse: show only title
          nestedItem.innerHTML = `
            <div class="nested-grant-title">${ng.title}</div>
            <div class="nested-grant-pills">
              ${rfaPillHtml(ng, true)}
            </div>
          `;
          nestedItem.dataset.expanded = "false";
        } else {
          // Expand: show full details
          const nestedKeywords = [];
          if (isNewGrant(ng)) {
            nestedKeywords.push({ text: "New", className: "kcard-new" });
          }
          if (ng.piRestriction && ng.piRestriction !== "None") {
            nestedKeywords.push({ text: ng.piRestriction, className: "kcard-pi-restriction" });
          }
          if (ng.geography && Array.isArray(ng.geography) && ng.geography.length > 0) {
            // Sort states alphabetically and add each as a pill
            const sortedStates = [...ng.geography].sort();
            sortedStates.forEach(state => {
              nestedKeywords.push({ text: state, className: "kcard-state" });
            });
          }
          (ng.keywords || []).forEach(kw => {
            // Check if this keyword matches any selected keyword
            const isMatched = selectedKeywords.includes(kw);
            nestedKeywords.push({ text: kw, className: isMatched ? "kcard-matched" : "" });
          });
          
          const nestedKeywordPills = nestedKeywords
            .map(kw => {
              // For pin-indicator, don't add kcard class (consistency with parent grants)
              if (kw.className === "pin-indicator") {
                return `<span class="${kw.className}">${kw.text}</span>`;
              }
              return `<span class="kcard ${kw.className}">${kw.text}</span>`;
            })
            .join("");
          
          // Build funder type display
          let nestedFunderTypeMarkup = "";
          if (ng.funderType) {
            if (ng.funderType === "Federal" && ng.federalAgency) {
              nestedFunderTypeMarkup = `<p class="meta-row"><strong>Funder Type:</strong> Federal <span class="agency-pill">${ng.federalAgency}</span></p>`;
            } else {
              nestedFunderTypeMarkup = `<p class="meta-row"><strong>Funder Type:</strong> ${ng.funderType}</p>`;
            }
          }
          
          // Build eligibility display
          let nestedEligibilityClass = "";
          if (ng.eligibility === "Secondary") {
            nestedEligibilityClass = "eligibility-secondary";
          }
          const nestedEligibilityText = ng.eligibility || "Not specified";
          
          // Build limitations
          const nestedLimitations = (ng.limitations || []).map(l => `<span class="meta-tag">${l}</span>`).join("");
          
          // Handle description preview
          const nestedPreviewLimit = CIH_CONFIG.descriptionPreviewChars || 220;
          const nestedFullDescription = ng.description || "";
          const nestedHasOverflow = nestedFullDescription.length > nestedPreviewLimit;
          const nestedPreview = nestedHasOverflow ? nestedFullDescription.slice(0, nestedPreviewLimit).trimEnd() : nestedFullDescription;
          const nestedRest = nestedHasOverflow ? nestedFullDescription.slice(nestedPreviewLimit) : "";
          
          nestedItem.innerHTML = `
            <div class="nested-grant-title">${ng.title}</div>
            <div class="nested-grant-expanded">
              <div class="grant-top">
                ${rfaPillHtml(ng, true)}
                ${nestedKeywordPills}
              </div>
              ${nestedFunderTypeMarkup}
              ${deadlineMarkup(ng)}
              <p class="meta-row"><strong>Amount:</strong> ${formatAmount(ng.amount)}${ng.amountDetail ? ` ${ng.amountDetail}` : ""} <span class="muted">(${formatIdcNote(ng)})</span></p>
              <p class="meta-row"><strong>Duration:</strong> ${ng.duration || "Not specified"}</p>
              <p class="meta-row"><strong>Eligibility:</strong> <span class="${nestedEligibilityClass}">${nestedEligibilityText}</span></p>
              <p class="meta-row desc-preview"><strong>Description:</strong> ${nestedPreview}${nestedRest ? `<span class="ellipsis">...</span><span class="desc-rest">${nestedRest}</span>` : ""}</p>
              ${nestedRest ? `<button class="toggle">▼ Expand</button>` : ""}
              ${nestedLimitations ? `<div class="tag-row">${nestedLimitations}</div>` : ""}
              <div class="card-actions"><button class="btn edit-nested-btn" type="button">Edit</button></div>
            </div>
          `;
          nestedItem.dataset.expanded = "true";
          
          // Add edit button functionality for nested grant
          const editNestedBtn = nestedItem.querySelector(".edit-nested-btn");
          editNestedBtn.onclick = (e) => {
            e.stopPropagation(); // Prevent collapsing the nested grant
            const index = grants.findIndex(candidate => candidate.id === ng.id);
            openAdminDialog(ng, index);
          };
          
          // Add expand/collapse functionality for description
          if (nestedRest) {
            const btn = nestedItem.querySelector(".toggle");
            const restSpan = nestedItem.querySelector(".desc-rest");
            btn.onclick = (e) => {
              e.stopPropagation(); // Prevent collapsing the nested grant
              const ellipsis = nestedItem.querySelector(".ellipsis");
              const open = restSpan.style.display === "inline";
              restSpan.style.display = open ? "none" : "inline";
              if (ellipsis) {
                ellipsis.style.display = open ? "inline" : "none";
              }
              btn.textContent = open ? "▼ Expand" : "▲ Collapse";
            };
          }
        }
      };
      
      nestedContainer.appendChild(nestedItem);
    });
  }

  // Add click event listeners to clickable pills
  div.querySelectorAll('.kcard-state').forEach(pill => {
    pill.addEventListener('click', (e) => {
      e.stopPropagation();
      showPillFilter('state', pill.textContent);
    });
  });

  div.querySelectorAll('.kcard-pi-restriction').forEach(pill => {
    pill.addEventListener('click', (e) => {
      e.stopPropagation();
      showPillFilter('piRestriction', pill.textContent);
    });
  });

  div.querySelectorAll('.kcard-loi').forEach(pill => {
    pill.addEventListener('click', (e) => {
      e.stopPropagation();
      showPillFilter('letterOfInterest', null);
    });
  });

  return div;
}

function resetAdminForm() {
  document.getElementById("a_token").value = "";
  document.getElementById("a_pin_no").checked = true;
  document.getElementById("a_loi_no").checked = true;
  document.getElementById("a_title").value = "";
  document.getElementById("a_funderType").value = "";
  document.getElementById("a_eligibility").value = "";
  document.getElementById("a_agencyName").value = "";
  document.getElementById("a_amount").value = "";
  document.getElementById("a_amountDetail").value = "";
  document.getElementById("a_amountIdc").value = "";
  document.getElementById("a_duration").value = "";
  document.getElementById("a_addedDate").value = TODAY;
  document.getElementById("a_deadlineType_deadline").checked = true;
  document.getElementById("a_deadlines").value = "";
  document.getElementById("a_deadlineRecurring").value = "";
  updateDeadlineFields();
  [...document.getElementById("a_geography").options].forEach(o => { o.selected = false; });
  document.getElementById("a_piRestriction").value = "None";
  document.getElementById("a_link").value = "";
  document.getElementById("a_description").value = "";
  [...document.getElementById("a_keywords").options].forEach(o => { o.selected = false; });
  document.getElementById("a_parentGrantId").value = "";
  updateAgencyNameField();
}

// Helper function to check if a grant is a descendant of another grant
function isDescendantOf(grantId, potentialAncestorId) {
  if (!grantId || !potentialAncestorId) return false;
  
  const grant = grants.find(g => g.id === grantId);
  if (!grant || !grant.parentGrantId) return false;
  
  // Direct parent match
  if (grant.parentGrantId === potentialAncestorId) return true;
  
  // Check parent's parent recursively
  return isDescendantOf(grant.parentGrantId, potentialAncestorId);
}

function populateParentGrantSelect(currentGrantId = null) {
  const select = document.getElementById("a_parentGrantId");
  select.innerHTML = '<option value="">None (standalone grant)</option>';
  
  // Only show grants that are:
  // 1. Not nested themselves
  // 2. Have active deadlines
  // 3. Not the current grant (prevent self-nesting)
  // 4. Not descendants of the current grant (prevent circular dependencies)
  const availableGrants = grants.filter(g => 
    !g.parentGrantId && 
    hasActiveDeadline(g) && 
    g.id !== currentGrantId &&
    !isDescendantOf(g.id, currentGrantId)
  );
  
  // Sort by title for easier selection
  availableGrants.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
  
  availableGrants.forEach(g => {
    const option = document.createElement("option");
    option.value = g.id;
    option.textContent = g.title;
    select.appendChild(option);
  });
}

function openAdminDialog(grant = null, index = null) {
  els.adminStatus.textContent = "";
  editIndex = index;
  
  // Populate parent grant select
  populateParentGrantSelect(grant ? grant.id : null);
  
  if (!grant) {
    els.adminDialogTitle.textContent = "Add Grant";
    els.deleteBtn.hidden = true;
    resetAdminForm();
    highlightApostropheFields();
    els.adminDialog.showModal();
    return;
  }

  els.adminDialogTitle.textContent = "Edit Grant";
  els.deleteBtn.hidden = false;
  document.getElementById("a_token").value = "";
  
  // Set pin radio buttons
  if (grant.pin) {
    document.getElementById("a_pin_yes").checked = true;
  } else {
    document.getElementById("a_pin_no").checked = true;
  }
  
  // Set LOI radio buttons
  if (grant.letterOfInterest) {
    document.getElementById("a_loi_yes").checked = true;
  } else {
    document.getElementById("a_loi_no").checked = true;
  }
  
  document.getElementById("a_title").value = grant.title || "";
  document.getElementById("a_funderType").value = grant.funderType || "";
  // Support both old (federalAgency) and new (agencyName) field names
  document.getElementById("a_agencyName").value = grant.agencyName || grant.federalAgency || "";
  document.getElementById("a_eligibility").value = grant.eligibility || "";
  document.getElementById("a_amount").value = grant.amount || "";
  document.getElementById("a_amountDetail").value = grant.amountDetail || "";
  document.getElementById("a_amountIdc").value = grant.amountIdc || "";
  document.getElementById("a_duration").value = grant.duration || "";
  document.getElementById("a_addedDate").value = grant.addedDate || TODAY;
  
  // Set deadline type and fields
  if (grant.deadlineOpen) {
    document.getElementById("a_deadlineType_open").checked = true;
    document.getElementById("a_deadlines").value = "";
    document.getElementById("a_deadlineRecurring").value = "";
  } else if (grant.deadlineRecurring) {
    document.getElementById("a_deadlineType_recurring").checked = true;
    document.getElementById("a_deadlines").value = "";
    document.getElementById("a_deadlineRecurring").value = grant.deadlineRecurring;
  } else {
    document.getElementById("a_deadlineType_deadline").checked = true;
    document.getElementById("a_deadlines").value = (grant.deadlines || []).join(", ");
    document.getElementById("a_deadlineRecurring").value = "";
  }
  updateDeadlineFields();
  
  [...document.getElementById("a_geography").options].forEach(o => { o.selected = (grant.geography || []).includes(o.value); });
  document.getElementById("a_piRestriction").value = grant.piRestriction || "None";
  document.getElementById("a_link").value = grant.link || "";
  document.getElementById("a_description").value = grant.description || "";
  [...document.getElementById("a_keywords").options].forEach(o => { o.selected = (grant.keywords || []).includes(o.value); });
  document.getElementById("a_parentGrantId").value = grant.parentGrantId || "";
  updateAgencyNameField();
  
  highlightApostropheFields();
  els.adminDialog.showModal();
}

function closeAdminDialog() {
  els.adminDialog.close("cancel");
  els.adminStatus.textContent = "";
  editIndex = null;
}

function highlightApostropheFields() {
  APOSTROPHE_CHECK_FIELDS.forEach(fieldId => {
    const field = document.getElementById(fieldId);
    if (field) {
      const value = field.value || '';
      if (value.includes("'")) {
        field.style.backgroundColor = '#ffcccc';
      } else {
        field.style.backgroundColor = '';
      }
    }
  });
}

function highlightApostropheFieldsProspects() {
  APOSTROPHE_CHECK_FIELDS_PROSPECTS.forEach(fieldId => {
    const field = document.getElementById(fieldId);
    if (field) {
      const value = field.value || '';
      if (value.includes("'")) {
        field.style.backgroundColor = '#ffcccc';
      } else {
        field.style.backgroundColor = '';
      }
    }
  });
}

function openProspectDialog(index = null) {
  prospectEditIndex = index;
  els.prospectStatus.textContent = "";
  
  if (index !== null && prospects[index]) {
    els.prospectDialogTitle.textContent = "Edit Prospect";
    els.prospectDeleteBtn.hidden = false;
    populateProspectDialog(prospects[index]);
  } else {
    els.prospectDialogTitle.textContent = "Add Prospect";
    els.prospectDeleteBtn.hidden = true;
    populateProspectDialog();
  }
}

function populateProspectDialog(prospect = {}) {
  document.getElementById("p_token").value = "";
  
  const pinValue = prospect.pin ? "yes" : "no";
  if (pinValue === "yes") {
    document.getElementById("p_pin_yes").checked = true;
  } else {
    document.getElementById("p_pin_no").checked = true;
  }
  
  document.getElementById("p_funder").value = prospect.funder || "";
  document.getElementById("p_funderType").value = prospect.funderType || "";
  [...document.getElementById("p_geography").options].forEach(o => { o.selected = (prospect.geography || []).includes(o.value); });
  document.getElementById("p_piRestriction").value = prospect.piRestriction || "None";
  
  document.getElementById("p_invitationOnly_yes").checked = prospect.invitationOnly === true;
  document.getElementById("p_invitationOnly_no").checked = prospect.invitationOnly !== true;
  
  document.getElementById("p_link").value = prospect.link || "";
  [...document.getElementById("p_keywords").options].forEach(o => { o.selected = (prospect.keywords || []).includes(o.value); });
  document.getElementById("p_notes").value = prospect.notes || "";
  
  // Populate hyperlinks
  const hyperlinks = prospect.hyperlinks || [];
  for (let i = 1; i <= 5; i++) {
    const link = hyperlinks[i - 1] || {};
    document.getElementById(`p_hyperlink${i}_text`).value = link.text || "";
    document.getElementById(`p_hyperlink${i}_url`).value = link.url || "";
  }
  
  highlightApostropheFieldsProspects();
  els.prospectDialog.showModal();
}

function closeProspectDialog() {
  els.prospectDialog.close("cancel");
  els.prospectStatus.textContent = "";
  prospectEditIndex = null;
}

els.saveBtn.onclick = async () => enqueueMutation(async () => {
  const token = document.getElementById("a_token").value.trim();
  if (!token) {
    els.adminStatus.textContent = "GitHub token is required.";
    return;
  }

  const title = document.getElementById("a_title").value.trim();
  const link = document.getElementById("a_link").value.trim();
  const deadlineType = document.querySelector('input[name="deadlineType"]:checked').value;
  
  // Validate based on deadline type
  if (!title || !link) {
    els.adminStatus.textContent = "Title and link are required.";
    return;
  }
  
  if (deadlineType === 'deadline') {
    const deadlines = document.getElementById("a_deadlines").value
      .split(",")
      .map(s => s.trim())
      .filter(Boolean);
    if (!deadlines.length) {
      els.adminStatus.textContent = "At least one deadline is required.";
      return;
    }
  } else if (deadlineType === 'recurring') {
    const recurringText = document.getElementById("a_deadlineRecurring").value.trim();
    if (!recurringText) {
      els.adminStatus.textContent = "Recurring deadline description is required.";
      return;
    }
  }

  const grant = {
    title,
    funderType: document.getElementById("a_funderType").value,
    agencyName: document.getElementById("a_agencyName").value,
    eligibility: document.getElementById("a_eligibility").value,
    amount: Number(document.getElementById("a_amount").value || 0),
    amountDetail: document.getElementById("a_amountDetail").value,
    amountIdc: document.getElementById("a_amountIdc").value,
    duration: document.getElementById("a_duration").value,
    addedDate: document.getElementById("a_addedDate").value || TODAY,
    geography: [...document.getElementById("a_geography").selectedOptions].map(o => o.value),
    piRestriction: document.getElementById("a_piRestriction").value,
    link,
    description: document.getElementById("a_description").value,
    keywords: [...document.getElementById("a_keywords").selectedOptions].map(o => o.value)
  };

  // Add pin field
  const pinValue = document.querySelector('input[name="pin"]:checked').value;
  if (pinValue === "yes") {
    grant.pin = true;
  } else {
    grant.pin = false;
  }
  
  // Add Letter of Interest field
  const loiValue = document.querySelector('input[name="loi"]:checked')?.value || 'no';
  if (loiValue === "yes") {
    grant.letterOfInterest = true;
  } else {
    grant.letterOfInterest = false;
  }
  
  // Add parent grant ID if selected
  const parentGrantId = document.getElementById("a_parentGrantId").value;
  if (parentGrantId) {
    grant.parentGrantId = parentGrantId;
    // Nesting overrides pin (but we preserve the pin value)
    // The pin won't be applied while nested, but will be preserved if un-nested later
  }

  // Clean up empty agency name
  if (!grant.agencyName) {
    delete grant.agencyName;
  }
  
  // Preserve ID when editing, generate new one when adding
  if (editIndex !== null && grants[editIndex]) {
    grant.id = grants[editIndex].id;
  } else {
    grant.id = generateGrantId(Date.now(), grants.length);
  }
  
  // Add deadline information based on type
  if (deadlineType === 'deadline') {
    grant.deadlines = document.getElementById("a_deadlines").value
      .split(",")
      .map(s => s.trim())
      .filter(Boolean);
  } else if (deadlineType === 'open') {
    grant.deadlineOpen = true;
  } else if (deadlineType === 'recurring') {
    grant.deadlineRecurring = document.getElementById("a_deadlineRecurring").value.trim();
  }

  const localGrant = { ...grant };
  if (localGrant.geography && localGrant.geography.length === 0) {
    delete localGrant.geography;
  }
  if (localGrant.piRestriction === "None") {
    delete localGrant.piRestriction;
  }

  const payload = { ...localGrant };
  const mode = editIndex === null ? "add" : "edit";
  if (editIndex !== null) {
    payload.editIndex = editIndex;
  }
  payload.id = localGrant.id;

  els.adminStatus.textContent = "Saving…";

  try {
    await saveGrant(mode, payload, token);

    if (editIndex === null) {
      grants.push(localGrant);
    } else {
      grants[editIndex] = localGrant;
    }

    apply();
    closeAdminDialog();
  } catch (error) {
    console.error(error);
    els.adminStatus.textContent = `Save failed: ${error.message}`;
  }
}, els.adminStatus);


async function deleteCurrentGrant() {
  return enqueueMutation(async () => {
  if (editIndex === null) {
    return;
  }

  const token = document.getElementById("a_token").value.trim();
  if (!token) {
    els.adminStatus.textContent = "GitHub token is required.";
    return;
  }

  const shouldDelete = window.confirm("Delete this grant entry permanently?");
  if (!shouldDelete) {
    return;
  }

  els.adminStatus.textContent = "Deleting…";

  try {
    await saveGrant("delete", { editIndex, id: grants[editIndex]?.id }, token);
    grants.splice(editIndex, 1);
    apply();
    closeAdminDialog();
  } catch (error) {
    console.error(error);
    els.adminStatus.textContent = `Delete failed: ${error.message}`;
  }
}, els.adminStatus);
}

els.prospectSaveBtn.onclick = async () => enqueueMutation(async () => {
  const token = document.getElementById("p_token").value.trim();
  if (!token) {
    els.prospectStatus.textContent = "GitHub token is required.";
    return;
  }

  const funder = document.getElementById("p_funder").value.trim();
  const link = document.getElementById("p_link").value.trim();
  
  if (!funder || !link) {
    els.prospectStatus.textContent = "Funder and link are required.";
    return;
  }

  const prospect = {
    funder,
    funderType: document.getElementById("p_funderType").value,
    geography: [...document.getElementById("p_geography").selectedOptions].map(o => o.value),
    piRestriction: document.getElementById("p_piRestriction").value,
    link,
    keywords: [...document.getElementById("p_keywords").selectedOptions].map(o => o.value),
    notes: document.getElementById("p_notes").value
  };

  // Add pin field
  const pinValue = document.querySelector('input[name="p_pin"]:checked').value;
  if (pinValue === "yes") {
    prospect.pin = true;
  } else {
    prospect.pin = false;
  }
  
  // Add invitation only field
  const invitationOnlyValue = document.querySelector('input[name="p_invitationOnly"]:checked').value;
  prospect.invitationOnly = invitationOnlyValue === "yes";
  
  // Add hyperlinks
  const hyperlinks = [];
  for (let i = 1; i <= 5; i++) {
    const text = document.getElementById(`p_hyperlink${i}_text`).value.trim();
    const url = document.getElementById(`p_hyperlink${i}_url`).value.trim();
    if (text && url) {
      hyperlinks.push({ text, url });
    }
  }
  if (hyperlinks.length > 0) {
    prospect.hyperlinks = hyperlinks;
  } else {
    delete prospect.hyperlinks;
  }
  
  // Preserve ID when editing, generate new one when adding
  if (prospectEditIndex !== null && prospects[prospectEditIndex]) {
    prospect.id = prospects[prospectEditIndex].id;
  } else {
    prospect.id = generateProspectId(Date.now(), prospects.length);
  }

  const localProspect = { ...prospect };
  if (localProspect.geography && localProspect.geography.length === 0) {
    delete localProspect.geography;
  }
  if (localProspect.piRestriction === "None") {
    delete localProspect.piRestriction;
  }
  if (!localProspect.invitationOnly) {
    delete localProspect.invitationOnly;
  }

  const payload = { ...localProspect };
  const mode = prospectEditIndex === null ? "add" : "edit";
  if (prospectEditIndex !== null) {
    payload.editIndex = prospectEditIndex;
  }
  payload.id = localProspect.id;

  els.prospectStatus.textContent = "Saving…";

  try {
    await saveProspect(mode, payload, token);

    if (prospectEditIndex === null) {
      prospects.push(localProspect);
    } else {
      prospects[prospectEditIndex] = localProspect;
    }

    renderProspects();
    closeProspectDialog();
  } catch (error) {
    console.error(error);
    els.prospectStatus.textContent = `Save failed: ${error.message}`;
  }
}, els.prospectStatus);

async function deleteCurrentProspect() {
  return enqueueMutation(async () => {
  if (prospectEditIndex === null) {
    return;
  }

  const token = document.getElementById("p_token").value.trim();
  if (!token) {
    els.prospectStatus.textContent = "GitHub token is required.";
    return;
  }

  const shouldDelete = window.confirm("Delete this prospect entry permanently?");
  if (!shouldDelete) {
    return;
  }

  els.prospectStatus.textContent = "Deleting…";

  try {
    await saveProspect("delete", { editIndex: prospectEditIndex, id: prospects[prospectEditIndex]?.id, funder: prospects[prospectEditIndex]?.funder }, token);
    prospects.splice(prospectEditIndex, 1);
    renderProspects();
    closeProspectDialog();
  } catch (error) {
    console.error(error);
    els.prospectStatus.textContent = `Delete failed: ${error.message}`;
  }
}, els.prospectStatus);
}

async function saveGrant(mode, payload, tokenInput) {
  const owner = CIH_CONFIG.githubOwner;
  const repo = CIH_CONFIG.githubRepo;
  const branch = CIH_CONFIG.githubBranch || "main";
  const token = (tokenInput || "").trim();

  if (!owner || !repo || owner === "YOUR_GITHUB_ORG" || repo === "YOUR_REPO_NAME") {
    throw new Error("GitHub repository is not configured. Set githubOwner and githubRepo in config.js.");
  }

  if (!token) {
    throw new Error("GitHub token is missing. Enter a PAT in the admin dialog.");
  }

  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/actions/workflows/add-grant.yml/dispatches`,
    {
      method: "POST",
      headers: {
        "Accept": "application/vnd.github+json",
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        ref: branch,
        inputs: {
          mode,
          payload: JSON.stringify(payload)
        }
      })
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage = `GitHub dispatch failed (${response.status}): ${errorText || "Unknown error"}`;
    
    // Provide helpful guidance for common authentication errors
    if (response.status === 403) {
      let needsPermissionHelp = false;
      try {
        const errorData = JSON.parse(errorText);
        needsPermissionHelp = errorData.message && errorData.message.includes("Resource not accessible by personal access token");
      } catch (e) {
        needsPermissionHelp = errorText.includes("Resource not accessible by personal access token");
      }
      if (needsPermissionHelp) {
        errorMessage += PAT_PERMISSION_HELP;
      }
    } else if (response.status === 401) {
      errorMessage += PAT_INVALID_HELP;
    }
    
    throw new Error(errorMessage);
  }
}

async function saveProspect(mode, payload, tokenInput) {
  const owner = CIH_CONFIG.githubOwner;
  const repo = CIH_CONFIG.githubRepo;
  const branch = CIH_CONFIG.githubBranch || "main";
  const token = (tokenInput || "").trim();

  if (!owner || !repo || owner === "YOUR_GITHUB_ORG" || repo === "YOUR_REPO_NAME") {
    throw new Error("GitHub repository is not configured. Set githubOwner and githubRepo in config.js.");
  }

  if (!token) {
    throw new Error("GitHub token is missing. Enter a PAT in the prospect dialog.");
  }

  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/actions/workflows/add-prospect.yml/dispatches`,
    {
      method: "POST",
      headers: {
        "Accept": "application/vnd.github+json",
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        ref: branch,
        inputs: {
          mode,
          payload: JSON.stringify(payload)
        }
      })
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage = `GitHub dispatch failed (${response.status}): ${errorText || "Unknown error"}`;
    
    // Provide helpful guidance for common authentication errors
    if (response.status === 403) {
      let needsPermissionHelp = false;
      try {
        const errorData = JSON.parse(errorText);
        needsPermissionHelp = errorData.message && errorData.message.includes("Resource not accessible by personal access token");
      } catch (e) {
        needsPermissionHelp = errorText.includes("Resource not accessible by personal access token");
      }
      if (needsPermissionHelp) {
        errorMessage += PAT_PERMISSION_HELP;
      }
    } else if (response.status === 401) {
      errorMessage += PAT_INVALID_HELP;
    }
    
    throw new Error(errorMessage);
  }
}


function createPillText(items = []) {
  return items.filter(Boolean).join(' • ');
}

function formatGeographyForPDF(geography) {
  return Array.isArray(geography) && geography.length > 0 
    ? [...geography].sort().join(', ') 
    : '';
}

function downloadCurrentViewPdf() {
  if (!window.jspdf || !window.jspdf.jsPDF) {
    alert('PDF library failed to load. Please refresh and try again.');
    return;
  }

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ unit: 'pt', format: 'letter' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 40;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  const sanitize = (value = '') => value.replace(/\s+/g, ' ').trim();

  const ensureSpace = (heightNeeded = 0) => {
    if (y + heightNeeded > pageHeight - margin) {
      pdf.addPage();
      y = margin;
    }
  };

  const drawCard = ({ title, subtitle, pills, bodyLines = [] }) => {
    const titleLines = pdf.splitTextToSize(title || 'Untitled', contentWidth - 24);
    const subtitleLines = subtitle ? pdf.splitTextToSize(subtitle, contentWidth - 24) : [];
    const pillLines = pills ? pdf.splitTextToSize(pills, contentWidth - 24) : [];
    const bodySegments = bodyLines.map(line => pdf.splitTextToSize(line, contentWidth - 24));

    let cardHeight = 20 + titleLines.length * 14;
    if (subtitleLines.length) cardHeight += subtitleLines.length * 12 + 4;
    if (pillLines.length) cardHeight += pillLines.length * 11 + 10;
    bodySegments.forEach(lines => {
      cardHeight += lines.length * 11 + 3;
    });
    cardHeight += 10;

    ensureSpace(cardHeight + 8);
    pdf.setDrawColor(215, 210, 195);
    pdf.setFillColor(255, 255, 255);
    pdf.roundedRect(margin, y, contentWidth, cardHeight, 10, 10, 'FD');

    let cursorY = y + 18;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(12);
    pdf.setTextColor(29, 42, 57);
    pdf.text(titleLines, margin + 12, cursorY);
    cursorY += titleLines.length * 14;

    if (subtitleLines.length) {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(10);
      pdf.setTextColor(9, 105, 218);
      pdf.text(subtitleLines, margin + 12, cursorY);
      cursorY += subtitleLines.length * 12 + 4;
    }

    if (pillLines.length) {
      pdf.setFillColor(246, 248, 251);
      const pillBoxHeight = pillLines.length * 11 + 8;
      pdf.roundedRect(margin + 10, cursorY - 9, contentWidth - 20, pillBoxHeight, 8, 8, 'F');
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(9);
      pdf.setTextColor(51, 65, 85);
      pdf.text(pillLines, margin + 16, cursorY);
      cursorY += pillLines.length * 11 + 10;
    }

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    pdf.setTextColor(31, 41, 55);
    bodySegments.forEach(lines => {
      pdf.text(lines, margin + 12, cursorY);
      cursorY += lines.length * 11 + 3;
    });

    y += cardHeight + 8;
  };

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(18);
  const heading = currentView === 'prospects' ? 'Prospects Summary' : 'Grants Summary';
  pdf.text(heading, margin, y);
  y += 18;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  pdf.setTextColor(75, 85, 99);
  pdf.text(`Generated ${new Date().toLocaleString()}`, margin, y);
  y += 18;

  if (currentView === 'prospects') {
    const sorted = [...prospects].sort((a, b) => (a.funder || '').localeCompare(b.funder || ''));
    sorted.forEach((p, idx) => {
      const geographyText = formatGeographyForPDF(p.geography);
      const pills = createPillText([
        p.pin ? 'Pinned' : '',
        p.funderType || '',
        geographyText,
        p.piRestriction && p.piRestriction !== 'None' ? p.piRestriction : '',
        ...(p.keywords || [])
      ]);
      drawCard({
        title: `${idx + 1}. ${p.funder || 'Untitled Prospect'}`,
        subtitle: p.link || '',
        pills,
        bodyLines: [p.notes ? `Notes: ${sanitize(p.notes)}` : 'Notes: —']
      });
    });
    pdf.save('prospects-summary.pdf');
    return;
  }

  const activeGrants = grants.filter(g => hasActiveDeadline(g));
  const topLevel = activeGrants.filter(g => !g.parentGrantId).sort((a, b) => (a.title || '').localeCompare(b.title || ''));

  topLevel.forEach((g, idx) => {
    const geographyText = formatGeographyForPDF(g.geography);
    const pills = createPillText([
      g.pin ? 'Pinned' : '',
      g.funderType || '',
      g.eligibility || '',
      geographyText,
      g.piRestriction && g.piRestriction !== 'None' ? g.piRestriction : '',
      ...(g.keywords || [])
    ]);

    const deadlineText = sanitize(deadlineMarkup(g).replace(/<[^>]*>/g, '')) || 'Deadline: —';

    drawCard({
      title: `${idx + 1}. ${g.title || 'Untitled Grant'}`,
      subtitle: g.link || '',
      pills,
      bodyLines: [
        `Amount: ${formatAmount(g.amount)}`,
        g.duration ? `Duration: ${sanitize(g.duration)}` : 'Duration: —',
        deadlineText,
        g.description ? `Description: ${sanitize(g.description)}` : 'Description: —'
      ]
    });

    const children = activeGrants
      .filter(ng => ng.parentGrantId === g.id)
      .sort((a, b) => (a.title || '').localeCompare(b.title || ''));

    children.forEach((child, childIndex) => {
      const childGeographyText = formatGeographyForPDF(child.geography);
      const childPills = createPillText([
        child.funderType || '', 
        child.eligibility || '', 
        childGeographyText,
        child.piRestriction && child.piRestriction !== 'None' ? child.piRestriction : '',
        ...(child.keywords || [])
      ]);
      drawCard({
        title: `↳ ${idx + 1}.${childIndex + 1} ${child.title || 'Nested Grant'}`,
        subtitle: child.link || '',
        pills: childPills,
        bodyLines: [
          `Amount: ${formatAmount(child.amount)}`,
          child.duration ? `Duration: ${sanitize(child.duration)}` : 'Duration: —',
          child.description ? `Description: ${sanitize(child.description)}` : 'Description: —'
        ]
      });
    });
  });

  pdf.save('grants-summary.pdf');
}

// Pill filter popup functionality
const pillFilterDialog = document.getElementById('pillFilterDialog');
const pillFilterClose = document.getElementById('pillFilterClose');
const pillFilterTitle = document.getElementById('pillFilterTitle');
const grantsSection = document.getElementById('grantsSection');
const prospectsSection = document.getElementById('prospectsSection');
const grantsSectionContent = document.getElementById('grantsSectionContent');
const prospectsSectionContent = document.getElementById('prospectsSectionContent');
const grantsSectionLabel = document.getElementById('grantsSectionLabel');
const prospectsSectionLabel = document.getElementById('prospectsSectionLabel');
const grantsCards = document.getElementById('grantsCards');
const prospectsCards = document.getElementById('prospectsCards');

// Close dialog on close button click
pillFilterClose.addEventListener('click', () => {
  pillFilterDialog.close();
});

// Close dialog on backdrop click
pillFilterDialog.addEventListener('click', (e) => {
  if (e.target === pillFilterDialog) {
    pillFilterDialog.close();
  }
});

// Toggle sections
grantsSection.addEventListener('click', () => {
  const toggle = grantsSection.querySelector('.pill-filter-section-toggle');
  const content = grantsSectionContent;
  
  if (content.classList.contains('expanded')) {
    content.classList.remove('expanded');
    toggle.classList.remove('expanded');
  } else {
    content.classList.add('expanded');
    toggle.classList.add('expanded');
  }
});

prospectsSection.addEventListener('click', () => {
  const toggle = prospectsSection.querySelector('.pill-filter-section-toggle');
  const content = prospectsSectionContent;
  
  if (content.classList.contains('expanded')) {
    content.classList.remove('expanded');
    toggle.classList.remove('expanded');
  } else {
    content.classList.add('expanded');
    toggle.classList.add('expanded');
  }
});

// Function to render grant card without edit button
function renderGrantForPopup(g, selectedKeywords = []) {
  const div = document.createElement("article");
  div.className = "grant";

  const previewLimit = CIH_CONFIG.descriptionPreviewChars || 220;
  const fullDescription = g.description || "";
  const hasOverflow = fullDescription.length > previewLimit;
  const preview = hasOverflow ? fullDescription.slice(0, previewLimit).trimEnd() : fullDescription;
  const rest = hasOverflow ? fullDescription.slice(previewLimit) : "";

  // Organize pills into two rows (same as normal rendering)
  const row1Pills = [];
  const row2Pills = [];
  
  if (g.pin) {
    row1Pills.push({ text: "★ Pinned", className: "pin-indicator" });
  }
  if (isNewGrant(g)) {
    row1Pills.push({ text: "New", className: "kcard-new" });
  }
  (g.keywords || []).forEach(kw => {
    const isMatched = selectedKeywords.includes(kw);
    row1Pills.push({ text: kw, className: isMatched ? "kcard-matched" : "" });
  });
  
  if (g.letterOfInterest) {
    row2Pills.push({ text: "Letter of Interest", className: "kcard-loi" });
  }
  if (g.piRestriction && g.piRestriction !== "None") {
    row2Pills.push({ text: g.piRestriction, className: "kcard-pi-restriction" });
  }
  if (g.geography && Array.isArray(g.geography) && g.geography.length > 0) {
    const sortedStates = [...g.geography].sort();
    sortedStates.forEach(state => {
      row2Pills.push({ text: state, className: "kcard-state" });
    });
  }

  const formatPills = (pills) => pills
    .map(pill => {
      if (pill.className === "pin-indicator") {
        return `<span class="${pill.className}">${pill.text}</span>`;
      }
      return `<span class="kcard ${pill.className}">${pill.text}</span>`;
    })
    .join("");

  const row1Markup = row1Pills.length > 0 ? `<div class="grant-pills-row1">${formatPills(row1Pills)}</div>` : "";
  const row2Markup = row2Pills.length > 0 ? `<div class="grant-pills-row2">${formatPills(row2Pills)}</div>` : "";
  const pillsMarkup = row1Markup || row2Markup ? `<div class="grant-top">${row1Markup}${row2Markup}</div>` : "";

  const funderTypeMarkup = g.funderType === "Federal" && g.agencyName
    ? `<span class="agency-pill">${g.agencyName}</span>`
    : g.funderType
      ? `<span class="kcard kcard-funder-type">${g.funderType}</span>`
      : "";

  const eligibilityMarkup = g.eligibility === "Prime"
    ? `<span class="eligibility-primary">Prime</span>`
    : `<span class="eligibility-secondary">${g.eligibility}</span>`;

  div.innerHTML = `
    <h3><a href="${g.link}" target="_blank" rel="noopener noreferrer">${g.title}</a></h3>
    ${pillsMarkup}
    ${deadlineMarkup(g)}
    <p class="meta-row">
      <strong>Funder:</strong> ${funderTypeMarkup} | 
      <strong>Eligibility:</strong> ${eligibilityMarkup}
    </p>
    ${g.amount ? `<p class="meta-row"><strong>Amount:</strong> $${g.amount.toLocaleString()} ${g.amountDetail || ""}</p>` : ""}
    ${g.duration ? `<p class="meta-row"><strong>Duration:</strong> ${g.duration}</p>` : ""}
    <p class="desc-preview meta-row">${escapeHtml(preview)}${hasOverflow ? `<span class="ellipsis">…</span><span class="desc-rest">${escapeHtml(rest)}</span>` : ""}</p>
    ${hasOverflow ? `<button class="toggle">Show more</button>` : ""}
    ${rfaPillHtml(g)}
  `;

  // Handle show more/less toggle
  if (hasOverflow) {
    const toggleBtn = div.querySelector(".toggle");
    const descPreview = div.querySelector(".desc-preview");
    toggleBtn.addEventListener("click", () => {
      const ellipsis = descPreview.querySelector(".ellipsis");
      const descRest = descPreview.querySelector(".desc-rest");
      if (descRest.style.display === "inline") {
        descRest.style.display = "none";
        ellipsis.style.display = "inline";
        toggleBtn.textContent = "Show more";
      } else {
        descRest.style.display = "inline";
        ellipsis.style.display = "none";
        toggleBtn.textContent = "Show less";
      }
    });
  }

  // Check for nested grants
  const nestedGrants = grants.filter(ng => 
    ng.parentGrantId === g.id && hasActiveDeadline(ng)
  );

  if (nestedGrants.length > 0) {
    const nestedContainer = document.createElement("div");
    nestedContainer.className = "nested-grants";
    
    nestedGrants.forEach(nested => {
      const nestedItem = document.createElement("div");
      nestedItem.className = "nested-grant-item";
      
      const nestedPills = [];
      if (nested.letterOfInterest) {
        nestedPills.push({ text: "Letter of Interest", className: "kcard-loi" });
      }
      if (nested.piRestriction && nested.piRestriction !== "None") {
        nestedPills.push({ text: nested.piRestriction, className: "kcard-pi-restriction" });
      }
      if (nested.geography && Array.isArray(nested.geography) && nested.geography.length > 0) {
        const sortedStates = [...nested.geography].sort();
        sortedStates.forEach(state => {
          nestedPills.push({ text: state, className: "kcard-state" });
        });
      }
      (nested.keywords || []).forEach(kw => {
        nestedPills.push({ text: kw, className: "" });
      });
      
      const nestedPillsMarkup = nestedPills.length > 0
        ? `<div class="nested-grant-pills grant-top"><div class="grant-pills-row1">${formatPills(nestedPills)}</div></div>`
        : "";
      
      nestedItem.innerHTML = `
        <div class="nested-grant-title">${nested.title}</div>
        ${nestedPillsMarkup}
        ${deadlineMarkup(nested)}
      `;
      
      nestedItem.addEventListener("click", () => {
        if (nestedItem.classList.contains("expanded")) {
          const expanded = nestedItem.querySelector(".nested-grant-expanded");
          if (expanded) expanded.remove();
          nestedItem.classList.remove("expanded");
        } else {
          const expandedDiv = document.createElement("div");
          expandedDiv.className = "nested-grant-expanded";
          
          const nestedFullDesc = nested.description || "";
          const nestedHasOverflow = nestedFullDesc.length > previewLimit;
          const nestedPreview = nestedHasOverflow ? nestedFullDesc.slice(0, previewLimit).trimEnd() : nestedFullDesc;
          const nestedRest = nestedHasOverflow ? nestedFullDesc.slice(previewLimit) : "";
          
          const nestedFunderTypeMarkup = nested.funderType === "Federal" && nested.agencyName
            ? `<span class="agency-pill">${nested.agencyName}</span>`
            : nested.funderType
              ? `<span class="kcard kcard-funder-type">${nested.funderType}</span>`
              : "";
          
          const nestedEligibilityMarkup = nested.eligibility === "Prime"
            ? `<span class="eligibility-primary">Prime</span>`
            : `<span class="eligibility-secondary">${nested.eligibility}</span>`;
          
          expandedDiv.innerHTML = `
            <p class="meta-row">
              <strong>Funder:</strong> ${nestedFunderTypeMarkup} | 
              <strong>Eligibility:</strong> ${nestedEligibilityMarkup}
            </p>
            ${nested.amount ? `<p class="meta-row"><strong>Amount:</strong> $${nested.amount.toLocaleString()} ${nested.amountDetail || ""}</p>` : ""}
            ${nested.duration ? `<p class="meta-row"><strong>Duration:</strong> ${nested.duration}</p>` : ""}
            <p class="desc-preview meta-row">${escapeHtml(nestedPreview)}${nestedHasOverflow ? `<span class="ellipsis">…</span><span class="desc-rest">${escapeHtml(nestedRest)}</span>` : ""}</p>
            ${nestedHasOverflow ? `<button class="toggle">Show more</button>` : ""}
            ${rfaPillHtml(nested, true)}
          `;
          
          if (nestedHasOverflow) {
            const nestedToggleBtn = expandedDiv.querySelector(".toggle");
            const nestedDescPreview = expandedDiv.querySelector(".desc-preview");
            nestedToggleBtn.addEventListener("click", (e) => {
              e.stopPropagation();
              const ellipsis = nestedDescPreview.querySelector(".ellipsis");
              const descRest = nestedDescPreview.querySelector(".desc-rest");
              if (descRest.style.display === "inline") {
                descRest.style.display = "none";
                ellipsis.style.display = "inline";
                nestedToggleBtn.textContent = "Show more";
              } else {
                descRest.style.display = "inline";
                ellipsis.style.display = "none";
                nestedToggleBtn.textContent = "Show less";
              }
            });
          }
          
          nestedItem.appendChild(expandedDiv);
          nestedItem.classList.add("expanded");
        }
      });
      
      nestedContainer.appendChild(nestedItem);
    });
    
    div.appendChild(nestedContainer);
  }

  return div;
}

// Function to render prospect card without edit button
function renderProspectForPopup(p) {
  const div = document.createElement("article");
  div.className = "grant";
  
  const keywords = [];
  if (p.pin) {
    keywords.push({ text: "★ Pinned", className: "pin-indicator" });
  }
  if (p.invitationOnly) {
    keywords.push({ text: "Invitation Only", className: "kcard-invitation-only" });
  }
  if (p.funderType) {
    keywords.push({ text: p.funderType, className: "kcard-funder-type" });
  }
  if (p.piRestriction && p.piRestriction !== "None") {
    keywords.push({ text: p.piRestriction, className: "kcard-pi-restriction" });
  }
  if (p.geography && Array.isArray(p.geography) && p.geography.length > 0) {
    const sortedStates = [...p.geography].sort();
    sortedStates.forEach(state => {
      keywords.push({ text: state, className: "kcard-state" });
    });
  }
  (p.keywords || []).forEach(kw => {
    keywords.push({ text: kw, className: "" });
  });
  
  const keywordPills = keywords
    .map(kw => {
      if (kw.className === "pin-indicator") {
        return `<span class="${kw.className}">${kw.text}</span>`;
      }
      return `<span class="kcard ${kw.className}">${kw.text}</span>`;
    })
    .join("");
  
  const hasNotes = p.notes && p.notes.trim().length > 0;
  const fullNotes = p.notes || "";
  
  const hyperlinkPills = (p.hyperlinks || [])
    .map(link => `<a href="${sanitizeUrl(link.url)}" target="_blank" rel="noopener noreferrer" class="hyperlink-pill">${escapeHtml(link.text)} ↗</a>`)
    .join("");
  
  div.innerHTML = `
    <h3><a href="${p.link}" target="_blank" rel="noopener noreferrer">${p.funder}</a></h3>
    <div class="grant-top">${keywordPills}</div>
    ${hyperlinkPills ? `<div class="hyperlink-pills">${hyperlinkPills}</div>` : ""}
    ${hasNotes ? `<p class="meta-row"><strong>Notes:</strong> ${escapeHtml(fullNotes)}</p>` : ""}
  `;
  
  div.querySelectorAll(".hyperlink-pill").forEach(pill => {
    pill.addEventListener("click", (e) => {
      e.stopPropagation();
    });
  });
  
  return div;
}

// Function to filter and show grants/prospects by pill type and value
function showPillFilter(pillType, pillValue) {
  // Filter grants based on pill type and value
  const filteredGrants = grants.filter(g => {
    if (!hasActiveDeadline(g)) return false;
    
    // Don't show nested grants as separate items
    if (g.parentGrantId) {
      const parent = grants.find(p => p.id === g.parentGrantId);
      if (parent && hasActiveDeadline(parent)) return false;
    }
    
    switch(pillType) {
      case 'state':
        return g.geography && g.geography.includes(pillValue);
      case 'piRestriction':
        return g.piRestriction === pillValue;
      case 'letterOfInterest':
        return g.letterOfInterest === true;
      case 'invitationOnly':
        return false; // Grants don't have invitation only
      default:
        return false;
    }
  });
  
  // Filter prospects based on pill type and value
  const filteredProspects = prospects.filter(p => {
    switch(pillType) {
      case 'state':
        return p.geography && p.geography.includes(pillValue);
      case 'piRestriction':
        return p.piRestriction === pillValue;
      case 'letterOfInterest':
        return false; // Prospects don't have letter of interest
      case 'invitationOnly':
        return p.invitationOnly === true;
      default:
        return false;
    }
  });
  
  // Update dialog title
  let titleText = '';
  switch(pillType) {
    case 'state':
      titleText = `${pillValue} Restriction`;
      break;
    case 'piRestriction':
      titleText = `${pillValue}`;
      break;
    case 'letterOfInterest':
      titleText = 'Letter of Interest Required';
      break;
    case 'invitationOnly':
      titleText = 'Invitation Only';
      break;
  }
  pillFilterTitle.textContent = titleText;
  
  // Update section labels with counts
  grantsSectionLabel.textContent = `Grants (${filteredGrants.length})`;
  prospectsSectionLabel.textContent = `Prospects (${filteredProspects.length})`;
  
  // Clear previous cards
  grantsCards.innerHTML = '';
  prospectsCards.innerHTML = '';
  
  // Render grants
  filteredGrants.forEach(g => {
    const card = renderGrantForPopup(g);
    grantsCards.appendChild(card);
  });
  
  // Render prospects
  filteredProspects.forEach(p => {
    const card = renderProspectForPopup(p);
    prospectsCards.appendChild(card);
  });
  
  // Reset sections to collapsed state
  grantsSectionContent.classList.remove('expanded');
  prospectsSectionContent.classList.remove('expanded');
  grantsSection.querySelector('.pill-filter-section-toggle').classList.remove('expanded');
  prospectsSection.querySelector('.pill-filter-section-toggle').classList.remove('expanded');
  
  // Show dialog
  pillFilterDialog.showModal();
}


loadData({ skipBindEvents: false });
