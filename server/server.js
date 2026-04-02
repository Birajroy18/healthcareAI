require("dotenv").config();

const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3001;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const GEMINI_MAX_RETRIES = 3;

app.use(cors());
app.use(express.json());

const queryHistory = [];

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildGeminiRequest(prompt) {
    return {
        contents: [{ parts: [{ text: prompt }] }],
        tools: [{ google_search: {} }],
        generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 2048,
        },
    };
}

function extractJsonPayload(rawText) {
    const trimmed = String(rawText || "").trim();
    if (!trimmed) return "";

    const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fencedMatch) return fencedMatch[1].trim();

    const firstBrace = trimmed.indexOf("{");
    const lastBrace = trimmed.lastIndexOf("}");

    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        return trimmed.slice(firstBrace, lastBrace + 1);
    }

    return trimmed;
}

function parseGeminiJson(rawText) {
    const payload = extractJsonPayload(rawText);
    if (!payload) {
        throw new Error("Empty JSON response from Gemini.");
    }

    return JSON.parse(payload);
}

function summarizeRawOutput(rawText, maxLength = 240) {
    return String(rawText || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, maxLength);
}

function extractGroundingSources(geminiData) {
    const chunks = geminiData?.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const seen = new Set();

    return chunks
        .map((chunk) => chunk?.web)
        .filter((web) => web?.uri)
        .filter((web) => {
            if (seen.has(web.uri)) return false;
            seen.add(web.uri);
            return true;
        })
        .slice(0, 6)
        .map((web) => ({
            title: web.title || "Source",
            uri: web.uri,
        }));
}

function sanitizeRegionalContext(text) {
    return String(text || "")
        .replace(/\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\b/gi, "")
        .replace(/\b(?:Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.?\s+\d{4}\b/gi, "")
        .replace(/\b\d{4}\b/g, "")
        .replace(/\(\s*\)/g, "")
        .replace(/\s+,/g, ",")
        .replace(/\s{2,}/g, " ")
        .replace(/\s+([.,])/g, "$1")
        .trim();
}

app.get("/api/health", (req, res) => {
    res.json({ status: "ok", message: "SymptomAI backend is running." });
});

app.post("/api/analyse", async (req, res) => {
    const { symptoms, ageGroup, gender, state, town, duration } = req.body;

    if (!symptoms || symptoms.trim() === "") {
        return res.status(400).json({ error: "Symptoms field is required." });
    }

    let fullInput = symptoms.trim();
    if (ageGroup) fullInput += `. Patient age group: ${ageGroup}`;
    if (gender) fullInput += `. Patient gender: ${gender}`;
    if (state) fullInput += `. Patient state: ${state}`;
    if (town) fullInput += `. Patient town/city: ${town}`;
    if (duration) fullInput += `. Duration: ${duration}`;

    const locationText = [town, state].filter(Boolean).join(", ");

    const prompt = `You are a clinical education assistant. A user has described the following symptoms: "${fullInput}".

Respond ONLY in this exact JSON format (no markdown, no extra text):
{
  "conditions": [
    {"name": "...", "likelihood": "High|Medium|Low", "description": "One sentence educational description."},
    {"name": "...", "likelihood": "High|Medium|Low", "description": "..."},
    {"name": "...", "likelihood": "High|Medium|Low", "description": "..."}
  ],
  "steps": [
    "Step 1 recommendation",
    "Step 2 recommendation",
    "Step 3 recommendation",
    "Step 4 recommendation"
  ],
  "regionalContext": "One or two sentences summarizing whether similar illnesses appear to be actively circulating in the user's area right now, based only on Google Search grounding. Use an empty string if there is no location or no reliable signal.",
  "urgent": true or false,
  "urgentReason": "If urgent=true, one-sentence reason why they should seek emergency care immediately, else empty string."
}

Rules:
- Provide 3-4 probable educational conditions, ordered by likelihood.
- List each condition as a separate, specific entry. Never group multiple diseases into one condition using "e.g." or "or".
- Do not mention specific time-period diseases (COVID-19, Monkeypox, etc.) unless the user explicitly mentions them. Focus on timeless, common conditions.
- Each condition name must be a single specific disease, not a category.
- Steps should be practical next steps (rest, hydration, see a doctor, etc).
- Set urgent=true only for symptoms that could indicate a medical emergency.
- Maintain an educational, non-alarmist tone.
- If a location is provided (${locationText || "no location provided"}), use Google Search grounding only for recent public information from roughly the last 90 days.
- Only mention local disease activity if it is clearly related to the user's symptom pattern or the likely conditions you identified. If the match is weak, broad, seasonal, outdated, or uncertain, set "regionalContext" to an empty string.
- Never mention dates, months, or years in "regionalContext".
- Never claim a disease is spreading locally unless the grounded search results support it.
- If no location is provided or the search results are weak, set "regionalContext" to an empty string.`;

    try {
        let geminiRes;
        let geminiData;
        let result;
        let parseErrorMessage = "";

        for (let attempt = 1; attempt <= GEMINI_MAX_RETRIES; attempt += 1) {
            geminiRes = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(buildGeminiRequest(prompt)),
                }
            );

            geminiData = await geminiRes.json();

            if (geminiRes.ok) {
                const raw = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "";

                try {
                    result = parseGeminiJson(raw);
                    break;
                } catch (parseError) {
                    parseErrorMessage = parseError.message;
                    console.warn(`Gemini JSON parse warning on attempt ${attempt}: ${parseError.message}`);
                    console.warn("Gemini raw output preview:", summarizeRawOutput(raw));

                    if (attempt < GEMINI_MAX_RETRIES) {
                        await sleep(attempt * 1200);
                        continue;
                    }
                }
            }

            const shouldRetry = geminiRes.status === 503 || geminiRes.status === 429;

            if (shouldRetry && attempt < GEMINI_MAX_RETRIES) {
                await sleep(attempt * 1500);
                continue;
            }

            if (!geminiRes.ok || result) {
                break;
            }
        }

        if (!geminiRes.ok) {
            console.error("Gemini API error:", geminiData);
            const apiMessage = geminiData?.error?.message || "";

            if (geminiRes.status === 503) {
                return res.status(503).json({
                    error: "The AI service is temporarily busy. Please try again in a moment.",
                });
            }

            if (geminiRes.status === 429) {
                return res.status(429).json({
                    error: "API quota exceeded. Please check your Gemini billing or usage limits.",
                });
            }

            return res.status(500).json({
                error: apiMessage || "Gemini API request failed. Please check your API key.",
            });
        }

        if (!result) {
            return res.status(500).json({
                error: `Gemini returned an incomplete JSON response after multiple attempts. ${parseErrorMessage}`.trim(),
            });
        }

        result.regionalContext = sanitizeRegionalContext(result.regionalContext);
        result.sources = result.regionalContext ? extractGroundingSources(geminiData) : [];

        const entry = {
            id: Date.now(),
            symptoms,
            ageGroup: ageGroup || null,
            gender: gender || null,
            state: state || null,
            town: town || null,
            duration: duration || null,
            result,
            timestamp: new Date().toISOString(),
        };
        queryHistory.unshift(entry);
        if (queryHistory.length > 50) queryHistory.pop();

        return res.json({ success: true, data: result, historyId: entry.id });
    } catch (err) {
        console.error("Error:", err.message);
        return res.status(500).json({ error: "Failed to analyse symptoms. Please try again." });
    }
});

app.get("/api/history", (req, res) => {
    const limit = parseInt(req.query.limit) || 10;
    res.json({
        success: true,
        data: queryHistory.slice(0, limit).map((h) => ({
            id: h.id,
            symptoms: h.symptoms,
            timestamp: h.timestamp,
        })),
    });
});

app.delete("/api/history", (req, res) => {
    queryHistory.length = 0;
    res.json({ success: true });
});

app.get("/api/history/:id", (req, res) => {
    const entry = queryHistory.find((h) => h.id === parseInt(req.params.id));
    if (!entry) return res.status(404).json({ error: "Entry not found." });
    res.json({ success: true, data: entry });
});

app.listen(PORT, () => {
    console.log(`SymptomAI backend running on http://localhost:${PORT}`);
});
