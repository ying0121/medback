# Medical Bot Console — User Manual

Professional clinic operations manual for **Healthcare Chat Bot (Medical Bot Console)**.

## Files

| File | Description |
|------|-------------|
| `Medical-Bot-Console-User-Manual.docx` | **Word document** for clinic delivery |
| `Medical-Bot-Console-User-Manual.html` | HTML version (browser / print to PDF) |
| `images/admin-logo.png` | Official Medical Bot Console admin logo |
| `images/` | Additional figures used in the manual |
| `build_docx.py` | Regenerates the `.docx` from the HTML source |

## How to deliver to a clinic

1. Share **`Medical-Bot-Console-User-Manual.docx`** (recommended for clinics).
2. Or open `Medical-Bot-Console-User-Manual.html` in Chrome, Edge, or Firefox and use **Print → Save as PDF**.
3. Recommended print settings: letter/A4, background graphics **on**, margins default.

## Regenerate the Word file

After editing the HTML manual:

```bash
python docs/user-manual/build_docx.py
```

## Audience

Clinic administrators and front-desk / Clinic Staff users of Medical Bot Console (`/admin`).
