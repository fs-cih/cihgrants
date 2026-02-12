# CIH Grant Opportunities Tracker

A web-based tool for tracking and managing grant opportunities for the Center for Interdisciplinary Health.

## Features

- Browse and filter grant opportunities by funder type, eligibility, keywords, and more
- Sort by deadline, amount, or title
- Add and edit grant information through an admin interface
- Automatic GitHub-based data persistence

## Setup

1. Clone this repository
2. Configure `config.js` with your GitHub repository details
3. Open `index.html` in a web browser or serve via a web server

## Configuration

Edit `config.js` to customize:
- `githubOwner`: Your GitHub organization or username
- `githubRepo`: Your repository name
- `githubBranch`: Branch to commit to (default: "main")
- Other UI preferences (currency, locale, sort defaults, etc.)

## Adding or Editing Grants

To add or edit grants, you'll need a GitHub Personal Access Token (PAT) with the appropriate permissions.

### Required PAT Permissions

The token needs permission to trigger GitHub Actions workflows:

#### For Classic Personal Access Tokens:
1. Go to https://github.com/settings/tokens
2. Click "Generate new token" → "Generate new token (classic)"
3. Enable these scopes:
   - ✅ **`repo`** (Full control of private repositories) - OR `public_repo` if only working with public repos
   - ✅ **`workflow`** (Update GitHub Action workflows) - **REQUIRED** for workflow dispatch
4. Generate and save your token securely

#### For Fine-grained Personal Access Tokens:
1. Go to https://github.com/settings/personal-access-tokens/new
2. Configure:
   - **Repository access**: Select your repository
   - **Permissions** → **Actions**: Set to **"Read and write"** - **REQUIRED** for workflow dispatch
   - **Permissions** → **Contents**: Set to **"Read and write"** (the workflow needs this)
3. Generate and save your token securely

### Using Your Token

1. Click the **＋** button in the top-right corner
2. Enter your GitHub Personal Access Token in the provided field
3. Fill in the grant details
4. Click **Save**

The app will use your token to trigger a GitHub Actions workflow that commits the changes to your repository.

### Troubleshooting Authentication Errors

**Error: "Resource not accessible by personal access token" (403)**
- Your token is missing the required permissions
- For Classic PATs: Ensure both `repo` and `workflow` scopes are enabled
- For Fine-grained PATs: Ensure "Actions" permission is set to "Read and write"
- Create a new token with the correct permissions

**Error: 401 (Unauthorized)**
- Your token may be invalid, expired, or revoked
- Verify your token still exists at https://github.com/settings/tokens
- Generate a new token if needed

## Data Structure

Grant data is stored in `data/grants.json`. Each grant includes:
- `title`: Grant name
- `funderType`: Type of funding organization
- `eligibility`: Who can apply
- `amount`: Funding amount in USD
- `amountIdc`: Whether amount includes indirect costs
- `duration`: Grant duration
- `deadlines`: Array of deadline dates (YYYY-MM-DD format)
- `geography`: Geographic restrictions (optional)
- `piRestriction`: PI eligibility restrictions (optional)
- `link`: URL to the grant announcement
- `description`: Detailed description
- `keywords`: Array of relevant keywords
- `limitations`: Array of limitations or restrictions
- `addedDate`: Date added to the system (YYYY-MM-DD format)

## Security Notes

- Never commit your Personal Access Token to the repository
- Store your token securely (e.g., in a password manager)
- Tokens are entered per-session and not stored by the application
- Regularly rotate your tokens for security
- Use fine-grained tokens with minimal required permissions when possible

## How It Works

1. The frontend (`index.html` + `app.js`) provides the user interface
2. When saving a grant, the app calls the GitHub API to trigger a workflow dispatch
3. The GitHub Actions workflow (`add-grant.yml`) runs and commits the changes
4. The updated data becomes available when the page is refreshed

## License

This project is maintained by the Center for Interdisciplinary Health.
