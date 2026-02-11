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
  keywordCards: document.getElementById("keywordCards"),
  resultCount: document.getElementById("resultCount"),
  adminPlus: document.getElementById("adminPlus"),
  adminDialog: document.getElementById("adminDialog"),
  saveBtn: document.getElementById("saveBtn"),
  adminStatus: document.getElementById("adminStatus")
};

async function loadData() {
  vocab = await fetch("data/vocab.json").then(r => r.json());
  grants = await fetch("data/grants.json").then(r => r.json());
  initFilters();
  apply();
}

function initFilters() {
  fillSelect(els.funderType, vocab.funderTypes, "All funders");
  fillSelect(els.eligibility, vocab.eligibility, "All eligibility");
  fillMulti(els.keywords, vocab.keywords);
  fillMulti(els.limitations, vocab.limitations);

  fillSelect(document.getElementById("a_funderType"), vocab.funderTypes);
  fillSelect(document.getElementById("a_eligibility"), vocab.eligibility);
  fillMulti(document.getElementById("a_keywords"), vocab.keywords);
  fillMulti(document.getElementById("a_limitations"), vocab.limitations);
}

function fillSelect(el, arr, first) {
  el.innerHTML = "";
  if (first) el.append(new Option(first, ""));
  arr.forEach(v => el.append(new Option(v, v)));
}

function fillMulti(el, arr) {
  el.innerHTML = "";
  arr.forEach(v => el.append(new Option(v, v)));
}

function nextDeadline(g) {
  return g.deadlines.filter(d => d >= TODAY).sort()[0] || null;
}

function apply() {
  let filtered = grants.filter(g => nextDeadline(g));
  render(filtered);
}

function render(list) {
  els.list.innerHTML = "";
  els.resultCount.textContent = `${list.length} opportunities`;
  list.forEach(g => els.list.append(renderGrant(g)));
}

function renderGrant(g) {
  const div = document.createElement("div");
  div.className = "grant";

  const preview = g.description.slice(0, 200);
  const rest = g.description.slice(200);

  div.innerHTML = `
    <h3><a href="${g.link}" target="_blank">${g.title}</a></h3>
    <p><strong>Next deadline:</strong> ${nextDeadline(g)}</p>
    <p class="desc-preview">${preview}${rest ? "…" : ""}</p>
    ${rest ? `<p class="desc-full">${rest}</p>
    <button class="toggle">▼ Expand</button>` : ""}
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
