# AI Course Poster Visual System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce three premium 9:16 course-overview posters with generated material imagery and deterministic Chinese typography.

**Architecture:** Imagegen produces three text-free visual foundations guided by the approved references. A focused local Pillow compositor adds exact course copy, typography, separators, and final export validation without modifying application code.

**Tech Stack:** Built-in imagegen, Python 3, Pillow, installed Windows fonts.

---

### Task 1: Generate the three visual foundations

**Files:**
- Create: `docs/tutorial-assets/course-system/premium-posters/background-a-obsidian-mountain.png`
- Create: `docs/tutorial-assets/course-system/premium-posters/background-b-golden-architecture.png`
- Create: `docs/tutorial-assets/course-system/premium-posters/background-c-bronze-data-core.png`

- [ ] **Step 1: Generate the black obsidian mountain foundation**

Use references `c967a6b3b7eec8cafaa3bccce9250cd7.jpg` and `a57d68bc2565300ce4a4bd2c5d4ce4df.jpg`. Request a 9:16 original dark mountain-like AI core with copper-gold seams, no text, no people, and reserved dark space for typography.

- [ ] **Step 2: Generate the golden architecture foundation**

Use reference `a57d68bc2565300ce4a4bd2c5d4ce4df.jpg`. Request a 9:16 original future digital infrastructure complex merged with black-white stone and restrained gold seams, no text, no people.

- [ ] **Step 3: Generate the bronze data-core foundation**

Use references `4d03f68e33b991004664e21e1753ae22.jpg` and `1d288309c394cb21ae533b8e737d3fa6.jpg`. Request a 9:16 black-metal data core with bronze signal paths and subtle business-output motifs, no text, no people.

- [ ] **Step 4: Copy generated assets into the workspace**

Run:

```powershell
Copy-Item -LiteralPath '<generated-a>' -Destination 'docs/tutorial-assets/course-system/premium-posters/background-a-obsidian-mountain.png'
Copy-Item -LiteralPath '<generated-b>' -Destination 'docs/tutorial-assets/course-system/premium-posters/background-b-golden-architecture.png'
Copy-Item -LiteralPath '<generated-c>' -Destination 'docs/tutorial-assets/course-system/premium-posters/background-c-bronze-data-core.png'
```

Expected: three readable PNG files.

### Task 2: Build the deterministic compositor

**Files:**
- Create: `scripts/build_course_overview_posters.py`

- [ ] **Step 1: Detect available fonts**

Search `C:\Windows\Fonts` for a Chinese serif title font, Chinese sans-serif body font, English serif font, and condensed English sans-serif font. Store the selected absolute paths in the script.

- [ ] **Step 2: Implement common typography helpers**

Implement helpers for text measurement, tracked English text, multiline Chinese layout, translucent black overlays, copper rules, and footer labels.

- [ ] **Step 3: Implement the common course-information model**

Define the exact approved strings for the title, subtitle, dual value, four phases, tool system, and six-step capability chain.

- [ ] **Step 4: Implement three layout functions**

Create `compose_obsidian()`, `compose_architecture()`, and `compose_data_core()`. Each must use the same information model but different placement and image treatment.

- [ ] **Step 5: Export final PNG files**

Write:

```text
docs/tutorial-assets/course-system/premium-posters/course-overview-a-obsidian-mountain.png
docs/tutorial-assets/course-system/premium-posters/course-overview-b-golden-architecture.png
docs/tutorial-assets/course-system/premium-posters/course-overview-c-bronze-data-core.png
```

### Task 3: Validate the deliverables

**Files:**
- Verify: `docs/tutorial-assets/course-system/premium-posters/*.png`

- [ ] **Step 1: Run the compositor**

Run:

```powershell
python scripts/build_course_overview_posters.py
```

Expected: exit code 0 and three final-output paths.

- [ ] **Step 2: Check dimensions and file integrity**

Run:

```powershell
python -c "from PIL import Image; from pathlib import Path; files=list(Path('docs/tutorial-assets/course-system/premium-posters').glob('course-overview-*.png')); print([(p.name, Image.open(p).size) for p in files])"
```

Expected: each selected final file reports `(1440, 2560)`.

- [ ] **Step 3: Inspect each poster visually**

Open all three final images and verify no people, no malformed text, readable title hierarchy, complete four-stage structure, and consistent black-copper brand language.

- [ ] **Step 4: Commit only the poster deliverables**

Run:

```powershell
git add docs/superpowers/specs/2026-07-28-ai-course-poster-visual-system-design.md docs/superpowers/plans/2026-07-28-ai-course-poster-visual-system.md scripts/build_course_overview_posters.py docs/tutorial-assets/course-system/premium-posters
git commit -m "feat: add premium AI course overview posters"
```

Expected: one focused commit without unrelated working-tree changes.
