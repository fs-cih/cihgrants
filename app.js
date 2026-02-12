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
const PAT_PERMISSION_HELP = `

Your Personal Access Token (PAT) needs additional permissions:
• For Classic PATs: Enable both 'repo' and 'workflow' scopes
• For Fine-grained PATs: Grant 'Actions' → 'Read and write' permission

Please create a new token at: https://github.com/settings/tokens`;
const PAT_INVALID_HELP = `

Your token may be invalid or expired. Please verify it at: https://github.com/settings/tokens`;

let grants = [];
let vocab = {};
let editIndex = null;

const els = {
  list: document.getElementById("list"),
  q: document.getElementById("q"),
  funderType: document.getElementById("funderType"),
  eligibility: document.getElementById("eligibility"),
  flagForPi: document.getElementById("flagForPi"),
  keywords: document.getElementById("keywords"),
  limitations: document.getElementById("limitations"),
  sortBy: document.getElementById("sortBy"),
  resultCount: document.getElementById("resultCount"),
  clearFilters: document.getElementById("clearFilters"),
  refreshData: document.getElementById("refreshData"),
  adminPlus: document.getElementById("adminPlus"),
  adminDialog: document.getElementById("adminDialog"),
  adminDialogTitle: document.getElementById("adminDialogTitle"),
  saveBtn: document.getElementById("saveBtn"),
  deleteBtn: document.getElementById("deleteBtn"),
  cancelBtn: document.getElementById("cancelBtn"),
  adminStatus: document.getElementById("adminStatus")
};

async function loadData(options = {}) {
  const bustCache = Boolean(options.bustCache);
  const suffix = bustCache ? `?t=${Date.now()}` : "";
  vocab = await fetch(`data/vocab.json${suffix}`, { cache: "no-store" }).then(r => r.json());
  grants = await fetch(`data/grants.json${suffix}`, { cache: "no-store" }).then(r => r.json());
  initFilters();
  if (!options.skipBindEvents) {
    bindEvents();
  }
  els.sortBy.value = CIH_CONFIG.defaultSort || "deadlineAsc";
  apply();
}

function initFilters() {
  fillSelect(els.funderType, vocab.funderTypes || [], "All funders");
  fillSelect(els.eligibility, vocab.eligibility || [], "All eligibility");
  fillMulti(els.flagForPi, vocab.flagForPi || []);
  fillMulti(els.keywords, vocab.keywords || []);
  fillMulti(els.limitations, vocab.limitations || []);

  fillSelect(document.getElementById("a_funderType"), vocab.funderTypes || []);
  fillSelect(document.getElementById("a_eligibility"), vocab.eligibility || []);
  fillSelect(document.getElementById("a_amountIdc"), vocab.amountIdcOptions || ["Not specified"]);
  fillMulti(document.getElementById("a_keywords"), vocab.keywords || []);
  fillMulti(document.getElementById("a_flagForPi"), vocab.flagForPi || []);
  fillMulti(document.getElementById("a_limitations"), vocab.limitations || []);
  fillSelect(document.getElementById("a_geography"), ["None", ...US_STATES]);
  fillSelect(document.getElementById("a_piRestriction"), PI_RESTRICTIONS);

  document.getElementById("a_addedDate").value = TODAY;
}

function bindEvents() {
  [els.q, els.funderType, els.eligibility, els.flagForPi, els.keywords, els.limitations, els.sortBy].forEach(el => {
    el.addEventListener("input", apply);
    el.addEventListener("change", apply);
  });

  els.clearFilters.onclick = () => {
    els.q.value = "";
    els.funderType.value = "";
    els.eligibility.value = "";
    [...els.flagForPi.options].forEach(o => { o.selected = false; });
    [...els.keywords.options].forEach(o => { o.selected = false; });
    [...els.limitations.options].forEach(o => { o.selected = false; });
    els.sortBy.value = CIH_CONFIG.defaultSort || "deadlineAsc";
    apply();
  };

  els.adminPlus.onclick = () => openAdminDialog();
  els.refreshData.onclick = () => refreshData();
  els.cancelBtn.onclick = () => closeAdminDialog();
  els.deleteBtn.onclick = () => deleteCurrentGrant();
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

function formatDate(value) {
  if (!value) {
    return "—";
  }
  return new Date(`${value}T00:00:00`).toLocaleDateString(CIH_CONFIG.locale || "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric"
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

function apply() {
  const q = els.q.value.trim().toLowerCase();
  const byFunder = els.funderType.value;
  const byEligibility = els.eligibility.value;
  const byFlagForPi = selectedValues(els.flagForPi);
  const byKeywords = selectedValues(els.keywords);
  const byLimitations = selectedValues(els.limitations);

  let filtered = grants
    .filter(g => nextDeadline(g))
    .filter(g => !byFunder || g.funderType === byFunder)
    .filter(g => !byEligibility || g.eligibility === byEligibility)
    .filter(g => !byFlagForPi.length || byFlagForPi.every(name => (g.flagForPi || []).includes(name)))
    .filter(g => !byKeywords.length || byKeywords.every(k => (g.keywords || []).includes(k)))
    .filter(g => !byLimitations.length || byLimitations.every(l => (g.limitations || []).includes(l)))
    .filter(g => {
      if (!q) {
        return true;
      }
      const hay = [g.title, g.description, ...(g.keywords || [])].join(" ").toLowerCase();
      return hay.includes(q);
    });

  filtered.sort((a, b) => {
    switch (els.sortBy.value) {
      case "deadlineDesc":
        return (nextDeadline(b) || "").localeCompare(nextDeadline(a) || "");
      case "amountDesc":
        return (b.amount || 0) - (a.amount || 0);
      case "titleAsc":
        return a.title.localeCompare(b.title);
      case "deadlineAsc":
      default:
        return (nextDeadline(a) || "9999-99-99").localeCompare(nextDeadline(b) || "9999-99-99");
    }
  });

  render(filtered);
}

function render(list) {
  els.list.innerHTML = "";
  els.resultCount.textContent = `${list.length} opportunit${list.length === 1 ? "y" : "ies"}`;
  list.forEach(g => els.list.append(renderGrant(g)));
}

function deadlineMarkup(g) {
  const deadlines = upcomingDeadlines(g);
  if (!deadlines.length) {
    return `<p class="meta-row"><strong>Deadline:</strong> —</p>`;
  }
  if (deadlines.length === 1) {
    return `<p class="meta-row"><strong>Deadline:</strong> ${formatDate(deadlines[0])}</p>`;
  }
  return `
    <p class="meta-row"><strong>Next Deadline:</strong> ${formatDate(deadlines[0])}</p>
    <p class="meta-row"><strong>Additional Deadlines:</strong> ${deadlines.slice(1).map(formatDate).join(", ")}</p>
  `;
}

function renderGrant(g) {
  const div = document.createElement("article");
  div.className = "grant";

  const previewLimit = CIH_CONFIG.descriptionPreviewChars || 220;
  const fullDescription = g.description || "";
  const hasOverflow = fullDescription.length > previewLimit;
  const preview = hasOverflow ? fullDescription.slice(0, previewLimit).trimEnd() : fullDescription;
  const rest = hasOverflow ? fullDescription.slice(previewLimit) : "";

  const keywords = [...(g.keywords || [])];
  if (isNewGrant(g)) {
    keywords.unshift("New");
  }

  const keywordPills = keywords
    .map((kw, idx) => `<span class="kcard ${idx === 0 && kw === "New" ? "kcard-new" : ""}">${kw}</span>`)
    .join("");

  const limitations = (g.limitations || []).map(l => `<span class="meta-tag">${l}</span>`).join("");

  div.innerHTML = `
    <div class="grant-top">${keywordPills}</div>
    <h3><a href="${g.link}" target="_blank" rel="noopener noreferrer">${g.title}</a></h3>
    ${deadlineMarkup(g)}
    <p class="meta-row"><strong>Amount:</strong> ${formatAmount(g.amount)} <span class="muted">(${g.amountIdc || "Not specified"})</span></p>
    <p class="meta-row"><strong>Duration:</strong> ${g.duration || "Not specified"}</p>
    <p class="meta-row"><strong>Eligibility:</strong> ${g.eligibility || "Not specified"}</p>
    ${g.geography ? `<p class="meta-row"><strong>Geography Restriction:</strong> ${g.geography}</p>` : ""}
    ${g.piRestriction && g.piRestriction !== "None" ? `<p class="meta-row"><strong>PI Restriction:</strong> ${g.piRestriction}</p>` : ""}
    ${(g.flagForPi || []).length ? `<p class="meta-row"><strong>Flag for PI:</strong> ${(g.flagForPi || []).join(", ")}</p>` : ""}
    <p class="meta-row desc-preview"><strong>Description:</strong> ${preview}${rest ? `<span class="ellipsis">...</span><span class="desc-rest">${rest}</span>` : ""}</p>
    ${rest ? `<button class="toggle">▼ Expand</button>` : ""}
    ${limitations ? `<div class="tag-row">${limitations}</div>` : ""}
    <div class="card-actions"><button class="btn edit-btn" type="button">Edit</button></div>
  `;

  const editBtn = div.querySelector(".edit-btn");
  editBtn.onclick = () => {
    const index = grants.findIndex(candidate => candidate === g);
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
  return div;
}

function resetAdminForm() {
  document.getElementById("a_token").value = "";
  document.getElementById("a_title").value = "";
  document.getElementById("a_funderType").value = "";
  document.getElementById("a_eligibility").value = "";
  document.getElementById("a_amount").value = "";
  document.getElementById("a_amountIdc").value = "";
  document.getElementById("a_duration").value = "";
  document.getElementById("a_addedDate").value = TODAY;
  document.getElementById("a_deadlines").value = "";
  document.getElementById("a_geography").value = "None";
  document.getElementById("a_piRestriction").value = "None";
  document.getElementById("a_link").value = "";
  document.getElementById("a_description").value = "";
  [...document.getElementById("a_keywords").options].forEach(o => { o.selected = false; });
  [...document.getElementById("a_flagForPi").options].forEach(o => { o.selected = false; });
  [...document.getElementById("a_limitations").options].forEach(o => { o.selected = false; });
}

function openAdminDialog(grant = null, index = null) {
  els.adminStatus.textContent = "";
  editIndex = index;
  if (!grant) {
    els.adminDialogTitle.textContent = "Add Grant";
    els.deleteBtn.hidden = true;
    resetAdminForm();
    els.adminDialog.showModal();
    return;
  }

  els.adminDialogTitle.textContent = "Edit Grant";
  els.deleteBtn.hidden = false;
  document.getElementById("a_token").value = "";
  document.getElementById("a_title").value = grant.title || "";
  document.getElementById("a_funderType").value = grant.funderType || "";
  document.getElementById("a_eligibility").value = grant.eligibility || "";
  document.getElementById("a_amount").value = grant.amount || "";
  document.getElementById("a_amountIdc").value = grant.amountIdc || "";
  document.getElementById("a_duration").value = grant.duration || "";
  document.getElementById("a_addedDate").value = grant.addedDate || TODAY;
  document.getElementById("a_deadlines").value = (grant.deadlines || []).join(", ");
  document.getElementById("a_geography").value = grant.geography || "None";
  document.getElementById("a_piRestriction").value = grant.piRestriction || "None";
  document.getElementById("a_link").value = grant.link || "";
  document.getElementById("a_description").value = grant.description || "";
  [...document.getElementById("a_keywords").options].forEach(o => { o.selected = (grant.keywords || []).includes(o.value); });
  [...document.getElementById("a_flagForPi").options].forEach(o => { o.selected = (grant.flagForPi || []).includes(o.value); });
  [...document.getElementById("a_limitations").options].forEach(o => { o.selected = (grant.limitations || []).includes(o.value); });
  els.adminDialog.showModal();
}

function closeAdminDialog() {
  els.adminDialog.close("cancel");
  els.adminStatus.textContent = "";
  editIndex = null;
}

els.saveBtn.onclick = async () => {
  const token = document.getElementById("a_token").value.trim();
  if (!token) {
    els.adminStatus.textContent = "GitHub token is required.";
    return;
  }

  const title = document.getElementById("a_title").value.trim();
  const deadlines = document.getElementById("a_deadlines").value
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
  const link = document.getElementById("a_link").value.trim();

  if (!title || !deadlines.length || !link) {
    els.adminStatus.textContent = "Title, deadlines, and link are required.";
    return;
  }

  const grant = {
    title,
    funderType: document.getElementById("a_funderType").value,
    eligibility: document.getElementById("a_eligibility").value,
    amount: Number(document.getElementById("a_amount").value || 0),
    amountIdc: document.getElementById("a_amountIdc").value,
    duration: document.getElementById("a_duration").value,
    addedDate: document.getElementById("a_addedDate").value || TODAY,
    deadlines,
    geography: document.getElementById("a_geography").value,
    piRestriction: document.getElementById("a_piRestriction").value,
    link,
    description: document.getElementById("a_description").value,
    keywords: [...document.getElementById("a_keywords").selectedOptions].map(o => o.value),
    flagForPi: [...document.getElementById("a_flagForPi").selectedOptions].map(o => o.value),
    limitations: [...document.getElementById("a_limitations").selectedOptions].map(o => o.value)
  };

  const localGrant = { ...grant };
  if (localGrant.geography === "None") {
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
};


async function deleteCurrentGrant() {
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
    await saveGrant("delete", { editIndex }, token);
    grants.splice(editIndex, 1);
    apply();
    closeAdminDialog();
  } catch (error) {
    console.error(error);
    els.adminStatus.textContent = `Delete failed: ${error.message}`;
  }
}

async function refreshData() {
  els.refreshData.disabled = true;
  const originalLabel = els.refreshData.textContent;
  els.refreshData.textContent = "Refreshing…";

  try {
    await loadData({ bustCache: true, skipBindEvents: true });
  } catch (error) {
    console.error(error);
    els.adminStatus.textContent = `Refresh failed: ${error.message}`;
  } finally {
    els.refreshData.textContent = originalLabel;
    els.refreshData.disabled = false;
  }
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

loadData({ skipBindEvents: false });
