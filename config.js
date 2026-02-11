window.CIH_CONFIG = {
  githubOwner: "YOUR_GITHUB_ORG",
  githubRepo: "YOUR_REPO_NAME",
  githubBranch: "main",
  // Fine-grained PAT with Actions: Read and write + Contents: Read and write.
  // Required for browser-triggered workflow_dispatch API calls.
  githubToken: "",

  // UI behavior
  newGrantWindowDays: 30,
  descriptionPreviewChars: 220,
  defaultSort: "deadlineAsc",

  // Display helpers
  currency: "USD",
  locale: "en-US"
};
