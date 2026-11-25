# Library photograph credits and permission status

The user has manually approved all five photographs and explicitly authorized their inclusion in the production application and eligibility for Git tracking. This authorization replaces the earlier local-review-only restriction. It does **not** verify third-party reuse rights: no photographer identity or asset-specific permission has been confirmed for these files. Source attribution is not permission. Unresolved license/rights-holder questions remain documented below; images are easily replaced through metadata and local WebP files if a concern arises. No deployment, commit or push is part of this pass.

## Sources

| Library / ID | Original filename | Production optimized filename | Publishing source / original URL | License or permission status |
| --- | --- | --- | --- | --- |
| North Reading Room / 1 | `north_reading_room.jpg` | `north_reading_room.webp` | [Stony Brook University News](https://news.stonybrook.edu/university/stony-brook-university-libraries-named-finalist-for-international-innovation-award/) | Article identifies North Reading Room imagery. No asset-specific permission or photographer credit verified; third-party reuse permission unverified; user has authorized production inclusion. |
| Central Reading Room / 2 | `central_reading_room.jpg` | `central_reading_room.webp` | [Stony Brook University Libraries](https://library.stonybrook.edu/redesigned-spaces/) | User-selected room association. Page has a site-wide CC BY-NC 4.0 notice; applicability to this exact gallery image and intended deployment is unverified. Third-party reuse permission unverified; user has authorized production inclusion. |
| Health Sciences Library / 3 | `health_sciences.jpg` | `health_sciences.webp` | [William Wertheim's LinkedIn post](https://www.linkedin.com/posts/william-wertheim-3a75299_stonybrook-healthsciences-activity-7146228317656948736-8_3T) | Post describes touring this library; posting author is not necessarily photographer/rights holder. No reuse permission verified; third-party reuse permission unverified; user has authorized production inclusion. |
| Music Library / 4 | `music_library.jpg` | `music_library.webp` | [Stony Brook University Libraries on Facebook](https://www.facebook.com/stonybrooklibrary/photos/good-luck-to-all-stony-brook-university-students-on-your-finals-if-youre-looking/10162784796475010/) | Source and room association supplied by user. Automated source fetch was unavailable; photographer and license unverified. Third-party reuse permission unverified; user has authorized production inclusion. |
| 3rd Floor / 5 | `third_floor.jpg` | `third_floor.webp` | [Stony Brook University Libraries](https://library.stonybrook.edu/redesigned-spaces/) | User-selected representative staircase photograph. It is not a photograph of Main Stacks; exact floor/relationship to sensor footprint is unverified. Site-wide CC BY-NC 4.0 notice does not establish asset-specific permission. Third-party reuse permission unverified; user has authorized production inclusion. |

Source pages checked November 24, 2026. Detail credits identify publishing sources, not an invented photographer. Health Sciences displays only "LinkedIn" while retaining the full William Wertheim post URL and source information here. The third-floor alt text describes the curved red staircase overlooking study tables without identifying it as Main Stacks or exclusive sensor coverage.

## Image processing

All originals remain unchanged in `client/public/images/library/`. Installed Chrome's canvas WebP encoder created copies without adding dependencies. Width is limited to 1200 pixels, never upscaled; height follows the original aspect ratio. No crop is baked into the copies. Browser decoding/re-encoding removes the originals' embedded metadata. Sizes below are exact bytes (decimal KB = bytes / 1000).

| Image | Original JPEG dimensions | Original bytes | WebP dimensions | WebP bytes | Encoder quality | Cover position |
| --- | --- | ---: | --- | ---: | ---: | --- |
| North | 1000 x 667 | 293248 | 1000 x 667 | 210514 | 0.90 | 50% 60% |
| Central | 4898 x 3265 | 1263866 | 1200 x 800 | 103046 | 0.90 | 50% 65% |
| Health Sciences | 1152 x 1536 | 337536 | 1152 x 1536 | 219138 | 0.75 | 50% 52% |
| Music | 1200 x 629 | 123748 | 1200 x 629 | 149510 | 0.90 | 50% 50% |
| 3rd Floor | 3270 x 4905 | 1896498 | 1200 x 1800 | 220564 | 0.85 | 50% 65% |

Music's WebP is larger than its already compressed JPEG but remains approximately 150 KB and provides a consistent review format. All copies meet the approximately 100-250 KB target. Total bytes fall from 3914896 to 902772 (about 77% smaller).

The existing card/detail aspect ratios reserve space before loading. Images use `object-fit: cover`, natural proportions and per-image positions chosen after inspecting originals. Portrait Health Sciences and staircase images necessarily lose upper/lower areas in the landscape presentation. The Health Sciences crop retains shelves and study carrels; the staircase crop retains the curved red stairs and study-area context. Failed/missing images restore the same named placeholder without changing its dimensions. Credits appear only beneath detail photographs, and disappear when a photograph fails.

## Production assets and replaceability

- `.gitignore` excludes local originals and other files in the directory, with an exception for optimized WebP assets. The five WebP files are tracked in the feature checkpoint; originals remain ignored.
- `libraryDetails.ts` supplies the same five photos in development and production, without a development-only condition. Existing mappings, alt text, cover positions and failure placeholders are preserved.
- Vite's build-only public copy filter includes exactly the five named WebP files from `images/library`, excluding original JPEGs and other files in that directory. Other public assets remain unchanged. Vercel can serve the resulting `/images/library/*.webp` static URLs without external hosting or backend changes.
- Preserve JPEG originals locally. Do not force-add originals. Replacing an image requires changing its WebP file and, as appropriate, its metadata/credit and this document. A filename change also requires updating the build allowlist.
- Unverified third-party permissions and the staircase's exact floor/sensor relationship remain unresolved. Production inclusion is the user's explicit decision, not evidence of a license grant.

No hotlinks, storage services, image endpoints, occupancy requests, caching changes or runtime dependencies were introduced by the photograph pass. That historical pass ended at 14/22; current overall progress is 22/22 after retirement, local integration and functional hosted acceptance. This does not resolve photograph reuse permissions.

## Verification

Production photograph inclusion refinement: following manual visual approval, the user explicitly authorized production assets and WebP Git eligibility, superseding the local-review restriction without claiming verified third-party reuse rights. Removed development-only metadata gates, shortened Health Sciences credit to LinkedIn with unchanged original post URL, allowed optimized WebP tracking, and changed the Vite public-copy filter to include exactly the five named WebP files while preserving/ignoring/excluding original JPEGs. Existing mappings/crops/alt/fallback and all occupancy behavior are unchanged. Updated source/permission documentation and OpenSpec requirements. Verification: 379/379 frontend tests, lint, normal production build, strict OpenSpec validation and diff checks passed. Normal build output contains five byte-identical WebP assets and no JPEGs. Local production-mode browser preview used the same UI and config with an isolated synthetic-data entry (not included in the normal app build), verified all five card/detail images, exact attribution URLs, LinkedIn label, real failed-image fallback in cards/details, responsive 1280/820/375px layouts and retained graph/request behavior; screenshots inspected. Git status lists five add-eligible WebP files; JPEG originals remain ignored. Existing bundle-size advisory remains. No new dependencies, backend changes, Groups 4/5 work, staging, commits, pushes or deployment. OpenSpec remains 14/22.
