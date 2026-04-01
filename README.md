# HealthcareAI - Healthcare Symptom Checker

HealthcareAI is an AI-powered educational symptom checker built with a lightweight client and a Node.js server. Users can describe symptoms, add quick symptom tags, include demographic and location context, and receive probable conditions, recommended next steps, and optional region-aware activity signals grounded with Google Search through Gemini.

> Disclaimer: This project is for educational awareness only. It does not provide medical advice, diagnosis, or treatment. Always consult a licensed healthcare professional.

## Features

- AI symptom analysis powered by Google Gemini
- Quick symptom tags plus free-text symptom input
- Age group, gender, duration, state, and town/city context
- Searchable state and town fields with town filtering by selected state
- Region-aware disease activity summary using Gemini Google Search grounding
- Search sources shown only when relevant regional activity is found
- Prompt rules to keep condition names specific instead of grouped
- Urgent-care banner for potentially serious symptom patterns
- Recent query history with reload support
- Dark and light theme toggle with saved preference
- Responsive UI for desktop and mobile

## Current Project Structure

```text
healthcare symptom checker/
|-- client/
|   |-- index.html
|   |-- style.css
|   |-- script.js
|   `-- locations.js
|-- server/
|   |-- package.json
|   |-- package-lock.json
|   `-- server.js
|-- .gitignore
`-- README.md
```

## Tech Stack

| Layer | Technology |
| --- | --- |
| Client | HTML, CSS, Vanilla JavaScript |
| Server | Node.js, Express, CORS, dotenv |
| AI | Google Gemini |
| Grounding | Gemini `google_search` tool |

## How It Works

1. The user enters symptoms and optional context such as age group, gender, duration, state, and town.
2. The client sends the payload to `POST /api/analyse`.
3. The server builds a constrained prompt and calls Gemini.
4. Gemini returns:
   - likely conditions
   - recommended next steps
   - urgent flag and reason
   - optional `regionalContext` when recent, symptom-relevant local search signals exist
5. The server stores the successful result in an in-memory history array.
6. The client displays the result and can reload previous entries from history.

## Regional Search Behavior

The regional activity section is intentionally conservative.

- It uses Gemini with Google Search grounding.
- It should only appear when there is recent, location-relevant, symptom-related information.
- Old, weak, broad, or clearly unrelated disease news should be filtered out.
- If no reliable regional signal is found, the UI should show no regional activity section and no search sources section.

## Prerequisites

- Node.js 18 or newer
- A Google Gemini API key

## Getting Started

### 1. Install server dependencies

```bash
cd server
npm install
```

### 2. Create your environment file

Create `server/.env` with:

```env
GEMINI_API_KEY=your_gemini_api_key_here
PORT=3001
GEMINI_MODEL=gemini-2.5-flash
```

### 3. Start the server

```bash
cd server
npm start
```

Expected output:

```text
SymptomAI backend running on http://localhost:3001
```

If PowerShell blocks `npm.ps1` on your system, use:

```powershell
cmd /c npm start
```

### 4. Open the client

Open [client/index.html](c:/Users/User/OneDrive/Desktop/healthcare%20symptom%20checker/client/index.html) in your browser.

On Windows, you can simply double-click the file. On macOS or Linux, you can open it from the terminal if you prefer.

## API Endpoints

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/api/health` | Basic server health check |
| POST | `/api/analyse` | Analyse symptoms with Gemini |
| GET | `/api/history` | Get recent stored analyses |
| GET | `/api/history/:id` | Get one stored analysis by ID |

### Example `POST /api/analyse` request

```json
{
  "symptoms": "fever, cough, body aches for 2 days",
  "ageGroup": "adult (19-60)",
  "gender": "female",
  "state": "Assam",
  "town": "Silchar",
  "duration": "1-3 days"
}
```

### Example response shape

```json
{
  "success": true,
  "data": {
    "conditions": [
      {
        "name": "Influenza",
        "likelihood": "High",
        "description": "A common viral respiratory illness that can cause fever, cough, headache, and body aches."
      }
    ],
    "steps": [
      "Rest and stay hydrated."
    ],
    "regionalContext": "Similar respiratory illnesses appear to be circulating in the area.",
    "urgent": false,
    "urgentReason": "",
    "sources": [
      {
        "title": "Example source",
        "uri": "https://example.com"
      }
    ]
  },
  "historyId": 123456789
}
```

## History Storage

History is currently stored in memory on the server.

- Successful analyses are added to an in-memory `queryHistory` array.
- The history is capped at 50 entries.
- Restarting the server clears history.
- This is not a database-backed or permanent storage system.

## Security Notes

- The Gemini API key stays on the server and is not exposed to the browser.
- `server/.env` is ignored by Git.
- The app always presents results as educational guidance, not diagnosis.

## Limitations

- Regional activity depends on Gemini search grounding and the quality of available public web information.
- History is not persistent across server restarts.
- The client is currently served as a static file, not by the Express server.
- AI output can still be imperfect and should not be treated as medical fact.

## Deployment Notes

### Server

Deploy the `server/` app to a Node-compatible platform such as Render or Railway and set:

- `GEMINI_API_KEY`
- `PORT` if required by the platform
- `GEMINI_MODEL` if you want to override the default

### Client

If you deploy the client separately, update the `API_BASE` constant in [client/script.js](c:/Users/User/OneDrive/Desktop/healthcare%20symptom%20checker/client/script.js) to point to your deployed server URL.

## License

MIT
