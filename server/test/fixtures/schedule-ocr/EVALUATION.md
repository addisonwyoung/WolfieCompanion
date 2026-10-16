# Schedule OCR evaluation

All six PNGs are synthetic and contain no student identities. `samples.json` lists layout and expected codes. Clear and components variants cover full schedules; cropped variants remove the third class and add slight blur. Calendars repeat each class three times. Components variants add a CSE lecture/lab pairing.

## Procedure

1. Configure Google billing, Vision API, and ADC following `server/README.md`.
2. From `server`, invoke each image explicitly:

   ```sh
   node --import tsx src/ocr/cli.ts --image test/fixtures/schedule-ocr/class-list-clear.png --layout class-list
   node --import tsx src/ocr/cli.ts --image test/fixtures/schedule-ocr/weekly-calendar-clear.png --layout weekly-calendar
   ```

   Repeat for `components` and `cropped`. Each invocation is one paid/free-tier OCR unit. Do not include live runs in default tests.
3. Compare class codes and metadata to the manifest. Record per-image totals, warnings and corrections. Clear examples must recover all expected codes without false additions or duplicates.
4. Repeat with consented/anonymized real screenshots outside the repository before claiming real-world accuracy. Crop student names, IDs, grades, and unrelated information. Never commit private images, raw OCR output, or credentials.

Precision = correctly detected expected codes / all returned codes. Recall = correctly detected expected codes / all expected codes. For no detections, precision is N/A; for no expected classes, recall is N/A. Count false additions, missed codes, and duplicates separately. Count one metadata correction per incorrect/missing field (term, title, section/component); missing fields in cropped source are limitations rather than evidence of successful extraction. Aggregate true/false/missed counts separately for each layout rather than averaging image percentages.

Missing credentials, cloud failures, or unavailable real samples must be recorded as unverified. Passing offline parser fixtures is not measured Google OCR accuracy. Record sanitized results here; never persist raw OCR output automatically.

## Current verification (2026-10-06)

- Offline: 14 server tests passed; server and client builds passed.
- Live: attempted the clear class-list sample with ADC. Google returned status 7 (access denied); diagnostic classification identified billing not enabled. No successful live extraction or accuracy metrics are available.
- Next: enable billing for the ADC quota project, then repeat all six samples and record per-layout metrics and metadata corrections.
- Real-world accuracy remains unverified because no actual student schedule screenshots were supplied.
