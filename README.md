# PoshanVaani: speak the reading while the child is still on the scale

**A hands-free, voice-first growth-monitoring register for India's anganwadi workers.** The worker says *"Riya Pawar, saha point saha kilo, chauhattar centimetre"* in Marathi, Hindi, English or a mix. PoshanVaani then:
1. Finds the child.
2. Reads the reading back.
3. **Catches wrong numbers before they are saved.**
4. Works out WHO z-scores.
5. Speaks a malnutrition alert and prepares a referral slip.

It works offline and exports for Poshan Tracker.

> ASHA voice tools record what she says. **PoshanVaani catches what she mis-said.**

Theme: **Healthcare access** · Scaler × Wispr Flow hackathon, Round 2.

---

## Run it (one command, no keys)

```bash
docker compose up --build
```

Open **http://localhost:8080** in **Google Chrome**. No API key is needed:
- Speech recognition uses Chrome's built-in Web Speech API.
- Speech output uses the browser's voices.
- A keypad and a typed-input box are always available.

To also enable **Sarvam AI** speech (better Indian-language recognition and voices), copy `.env.example` to `.env` and set `SARVAM_API_KEY`. Without the key the Settings screen shows "key not set" and everything else works.

Microphone access needs `localhost` or HTTPS. On a phone, use an HTTPS deployment.

**Try it without speaking:** type into the "or type what you would say" box. It goes through exactly the same engine as speech.

### Demo script (seed data is built in)

| Say (or type) | What happens |
|---|---|
| `Riya, saha point saha kilo, chauhattar centimetre` | Two Riyas in the centre, so it asks *"Riya Pawar or Riya Shinde?"* |
| `Pawar` | Reads back *"Riya Pawar. 6.6 kilo, 74 centimetre. Correct?"* |
| `haan` / `ho` | Saves, then speaks *"Riya Pawar lost 600 grams. Severe acute malnutrition. Added to the referral list."* The growth chart point drops into the red band, and a WhatsApp referral slip is ready. |
| `Aarav, 10.8 kilo, 28 centimetre` | *"Last month 80.5 centimetre. Now 28? Did you mean 82?"* (digit swap caught) |
| `haan`, then `haan` | Applies 82 and reads back, then saves |
| `kon baaki aahe` / `kaun baaki hai` | Speaks the names of children not weighed yet |
| `maagcha radd kara` / `pichhla wapas lo` | Undoes the last entry |
| `session band kara` | Speaks the summary; then Summary has the CSV export and the sync queue |

Marathi script works too: `रिया पवार सहा पॉइंट सहा किलो चौऱ्याहत्तर सेंटीमीटर`.

---

## The problem

- **Scale:** every month, about 13.3 lakh anganwadi workers weigh and measure the children in their care. Poshan Tracker tracks about 7.7 crore children monthly across 14 lakh centres (PIB, July 2026).
- **How readings are captured today:** each reading is typed field by field into Poshan Tracker, on a cheap phone, usually hours later from a scribbled note.
- **Typos are costly:**
  - One wrong digit (28 for 82, 92 for 9.2) can label a healthy child "severely malnourished".
  - The app makes such entries hard to undo.
  - Hindi YouTube tutorials on *correcting wrong height/weight entries* have over 5 lakh views.
  - In a 2023 comparison, Poshan Tracker showed wasting 12 percentage points lower than NFHS-5. Part of that gap is bad data.
- **Why voice is essential:** the worker's hands are holding a squirming child on the scale at the exact moment the number exists. She already says it aloud to the mother. PoshanVaani listens to that speech, so typing later is no longer the step where errors happen.

## What is built (and where)

| Feature | Code |
|---|---|
| Parses spoken numbers in Marathi, Hindi and English: digits, Devanagari or romanised words, *saade/sava/paune/dedh/adhai*, "11 kilo 300 gram", "एकशे दहा", "seventy four" | [`web/src/lib/parse.ts`](web/src/lib/parse.ts), lexicon in [`web/src/data/lexicon.json`](web/src/data/lexicon.json) |
| Matches child names across scripts and spellings (रिया पवार = Riya Pawar = Reeya Powar), and asks "which child?" when names collide | [`web/src/lib/names.ts`](web/src/lib/names.ts) |
| Conversation engine with read-back confirmation, "nahi, 9.4 kilo" field correction, missing-field prompts, force-save after double confirmation, and a keypad after repeated misses | [`web/src/lib/engine.ts`](web/src/lib/engine.ts) |
| **Plausibility check before saving**, against last month and WHO velocity limits. Suggests the intended value for digit swaps, a lost decimal point, or grams said as kilos | [`web/src/lib/plausibility.ts`](web/src/lib/plausibility.ts) |
| WHO 2006 Child Growth Standards z-scores (WAZ, HAZ, WHZ) using the LMS method with WHO's restricted adjustment. SAM/MAM classification per India's 2023 MoWCD/MoHFW protocol (WHZ and MUAC) | [`web/src/lib/who.ts`](web/src/lib/who.ts), tables built by [`scripts/build-who-data.mjs`](scripts/build-who-data.mjs) |
| Speech providers: Web Speech API using N-best alternatives against the roster, with a 3-second audio clip saved per reading for audit. Sarvam STT/TTS through a server proxy, so the key never reaches the browser | [`web/src/lib/speech.ts`](web/src/lib/speech.ts), [`server/server.mjs`](server/server.mjs) |
| Offline-first storage (IndexedDB). Each reading keeps its transcript, corrected and forced flags, and engine. Undo voids the entry and never deletes it. Sync queue | [`web/src/lib/db.ts`](web/src/lib/db.ts) |
| Poshan Tracker-shaped CSV export, and a referral slip shared through a WhatsApp link | [`web/src/lib/export.ts`](web/src/lib/export.ts) |
| Mobile-first PWA UI in three languages: read-back card, WHO band ribbon, growth chart, alerts, summary, keypad, and a conversation trace on wide screens | [`web/src/App.tsx`](web/src/App.tsx), [`web/src/components/`](web/src/components) |
| Demo roster of 24 children with 3 months of WHO-realistic history | [`web/src/lib/seed.ts`](web/src/lib/seed.ts) |

**Design rule: the model transcribes, code decides.** Speech-to-text only produces text. Every number, match, check and classification is deterministic, tested code. No LLM is needed, and none is used.

## Architecture

```
 worker speaks ──▶ STT provider ──▶ transcript (+ alternatives)
                   (Web Speech │ Sarvam via /api/stt)
                                      │
                                      ▼
            parse.ts (numbers, units, intents) + names.ts (roster match)
                                      │
                                      ▼
   engine.ts state machine: listen → [which child?] → [missing field?]
            → plausibility.ts (vs last month) → read-back → "ho" saves
                                      │
                    ┌─────────────────┴──────────────────┐
                    ▼                                    ▼
      who.ts z-scores → SAM/MAM alert        db.ts IndexedDB (offline)
      spoken + referral slip (WhatsApp)      → sync queue → CSV export
                    │
                    ▼
            TTS provider speaks the reply (browser voice │ Sarvam Bulbul)
```

The server (`server/server.mjs`, with no npm dependencies) serves the built app and a small API:
- `/api/config`
- `/api/stt` and `/api/tts`: return 501 "key not set" when `SARVAM_API_KEY` is absent
- `/api/sync`
- `/api/health`

## What it depends on, and what happens if a dependency stops

| Dependency | Used for | Cost | If it gets costly or stops |
|---|---|---|---|
| Chrome Web Speech API | Speech to text (default) | Free | Switch to Sarvam (one setting), or use the keypad. All logic is local. |
| Browser `speechSynthesis` | Spoken replies | Free | Replies are always shown on screen too. |
| Sarvam AI Saaras / Bulbul (optional) | Better Indic STT/TTS | About ₹0.49 per minute of audio. A worker weighs about 40 children at about 30 s each, so about ₹10 a month. | Falls back to browser speech. The provider sits behind one interface. |
| WHO growth standard tables | z-scores | Free, bundled | No network needed |
| Poshan Tracker | System of record | — | No public API. We export a CSV in its entry shape; integration would need a state WCD partner. |

## Tests

```bash
cd web && npm install && npm test      # 84 unit and flow tests
python e2e/smoke.py http://localhost:8080   # Playwright run of the full demo flow + screenshots
```

The tests cover:
- the parser (Marathi and Hindi script, romanised and English utterances);
- name matching;
- WHO z-scores against published WHO chart values;
- plausibility (digit swap, lost decimal, grams);
- the full conversation flows in English and Marathi;
- the seeded demo stories.

## Honest limits

- **Speech recognition:** Chrome's Web Speech API sends audio to Google's servers, so voice needs internet. Offline, the keypad and typed input work, and data is stored and queued locally.
- **Poshan Tracker:** sync is simulated by `/api/sync`; no real Poshan Tracker upload exists.
- **Voice quality:** recognition of Marathi number words varies by device and accent. The read-back and plausibility checks exist because recognition will sometimes be wrong.
- **What it does not fix:** the face-authentication and network failures in today's apps.
- **Clinical scope:** the SAM/MAM alert advises referral; it does not diagnose. The AI never saves a value the worker did not confirm.

## Licence

- **Code:** MIT (see [`LICENSE`](LICENSE)).
- **WHO growth standard tables:** in `data/who-raw` and `web/src/data/who-lms.json`, from the WHO `anthro` package (GPL-3.0). See [`data/NOTICE.md`](data/NOTICE.md).
