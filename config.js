window.CIH_CONFIG = {
  githubOwner: "fs-cih",
  githubRepo: "cihgrants",
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
