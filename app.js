const TODAY = new Date().toISOString().slice(0, 10);

let grants = [];
let vocab = {};

const els = {
  list: document.getElementById("list"),
  q: document.getElementById("q"),
  funderType: document.getElementById("funderType"),
  eligibility: document.getElementById("eligibility"),
  keywords: document.getElementById("keywords"),
  limitations: document.getElementById("limitations"),
  sortBy: document.getElementById("sortBy"),
  resultCount: document.getElementById("resultCount"),
  clearFilters: document.getElementById("clearFilters"),
  adminPlus: document.getElementById("adminPlus"),
  adminDialog: document.getElementById("adminDialog"),
  saveBtn: document.getElementById("saveBtn"),
  adminStatus: document.getElementById("adminStatus")
};

async function loadData() {
  vocab = await fetch("data/vocab.json").then(r => r.json());
  grants = await fetch("data/grants.json").then(r => r.json());
  initFilters();
  bindEvents();
  els.sortBy.value = CIH_CONFIG.defaultSort || "deadlineAsc";
  apply();
}

function initFilters() {
  fillSelect(els.funderType, vocab.funderTypes || [], "All funders");
  fillSelect(els.eligibility, vocab.eligibility || [], "All eligibility");
  fillMulti(els.keywords, vocab.keywords || []);
  fillMulti(els.limitations, vocab.limitations || []);

  fillSelect(document.getElementById("a_funderType"), vocab.funderTypes || []);
  fillSelect(document.getElementById("a_eligibility"), vocab.eligibility || []);
  fillSelect(document.getElementById("a_amountIdc"), vocab.amountIdcOptions || ["Not specified"]);
  fillMulti(document.getElementById("a_keywords"), vocab.keywords || []);
  fillMulti(document.getElementById("a_limitations"), vocab.limitations || []);

  document.getElementById("a_addedDate").value = TODAY;
}

function bindEvents() {
  [els.q, els.funderType, els.eligibility, els.keywords, els.limitations, els.sortBy].forEach(el => {
    el.addEventListener("input", apply);
    el.addEventListener("change", apply);
  });

  els.clearFilters.onclick = () => {
    els.q.value = "";
    els.funderType.value = "";
    els.eligibility.value = "";
    [...els.keywords.options].forEach(o => { o.selected = false; });
    [...els.limitations.options].forEach(o => { o.selected = false; });
    els.sortBy.value = CIH_CONFIG.defaultSort || "deadlineAsc";
    apply();
  };
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
  const byKeywords = selectedValues(els.keywords);
  const byLimitations = selectedValues(els.limitations);

  let filtered = grants
    .filter(g => nextDeadline(g))
    .filter(g => !byFunder || g.funderType === byFunder)
    .filter(g => !byEligibility || g.eligibility === byEligibility)
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

function renderGrant(g) {
  const div = document.createElement("article");
  div.className = "grant";

  const previewLimit = CIH_CONFIG.descriptionPreviewChars || 220;
  const preview = (g.description || "").slice(0, previewLimit);
  const rest = (g.description || "").slice(previewLimit);

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
    <p class="meta-row"><strong>Next deadline:</strong> ${formatDate(nextDeadline(g))}</p>
    <p class="meta-row"><strong>Amount:</strong> ${formatAmount(g.amount)} <span class="muted">(${g.amountIdc || "Not specified"})</span></p>
    <p class="meta-row"><strong>Duration:</strong> ${g.duration || "Not specified"}</p>
    <p class="meta-row"><strong>Eligibility:</strong> ${g.eligibility || "Not specified"}</p>
    <p class="desc-preview">${preview}${rest ? "…" : ""}</p>
    ${rest ? `<p class="desc-full">${rest}</p><button class="toggle">▼ Expand</button>` : ""}
    ${limitations ? `<div class="tag-row">${limitations}</div>` : ""}
  `;

  if (rest) {
    const btn = div.querySelector(".toggle");
    const full = div.querySelector(".desc-full");
    btn.onclick = () => {
      const open = full.style.display === "block";
      full.style.display = open ? "none" : "block";
      btn.textContent = open ? "▼ Expand" : "▲ Collapse";
    };
  }
  return div;
}

els.adminPlus.onclick = () => els.adminDialog.showModal();

els.saveBtn.onclick = async () => {
  const grant = {
    title: document.getElementById("a_title").value,
    funderType: document.getElementById("a_funderType").value,
    eligibility: document.getElementById("a_eligibility").value,
    amount: Number(document.getElementById("a_amount").value || 0),
    amountIdc: document.getElementById("a_amountIdc").value,
    duration: document.getElementById("a_duration").value,
    addedDate: document.getElementById("a_addedDate").value || TODAY,
    deadlines: document.getElementById("a_deadlines").value.split(",").map(s => s.trim()),
    link: document.getElementById("a_link").value,
    description: document.getElementById("a_description").value,
    keywords: [...document.getElementById("a_keywords").selectedOptions].map(o => o.value),
    limitations: [...document.getElementById("a_limitations").selectedOptions].map(o => o.value)
  };

  els.adminStatus.textContent = "Submitting…";

  await fetch(
    `https://api.github.com/repos/${CIH_CONFIG.githubOwner}/${CIH_CONFIG.githubRepo}/actions/workflows/add-grant.yml/dispatches`,
    {
      method: "POST",
      headers: { "Accept": "application/vnd.github+json" },
      body: JSON.stringify({ ref: CIH_CONFIG.githubBranch, inputs: { payload: JSON.stringify(grant) } })
    }
  );

  els.adminStatus.textContent = "Submitted. Grant will appear shortly.";
};

loadData();
