---
date: 2026-09-23
topic: local-vision-defect-reading
---

# Local Vision Defect Reading — Requirements

## Summary

A documented, reproducible procedure that lets an agent with no vision read
visual defects out of a Rubik's Cube screenshot through a **local** VLM instead
of a cloud vision subagent. The agent hands the model a marked screenshot and
gets back a **structured finding** (what / where / severity). Delivered in
stages: a proof-of-concept one-shot CLI first, then — only if needed — a
resident vision server and an MCP tool.

---

## Problem Frame

The cube renders via CSS/HTML, so defects appear as _pixels_, not as exceptions:
a sticker briefly flashes the wrong colour, a face label sits on the wrong
corner, an animation unwinds the wrong way. The agent cannot see screenshots, so
today it spawns a **cloud** vision subagent to read them.

That works, but it costs money on every call, and the cloud round-trip is the
slowest step in the debug loop. The user already runs a capable local stack
(`d:\llms`: `llama.cpp` server + several Qwen3.6 MoE models). The missing piece
is not hardware or tooling — `llama-mtmd-cli.exe`, `llama-qwen2vl-cli.exe`, and
`llama-server` with `--mmproj` all exist in that build — but a **multimodal
model** (none of the installed GGUFs is a VLM) and a documented call path for
the agent to use it.

The remedy lives in this document: pick the model, pin the quant, and specify
how the agent invokes it and what it must receive back.

---

## Key Decisions

- **Local VLM over cloud vision subagent.** The driver is cost; the privacy and
  offline benefits are side-effects, not requirements. The cloud path remains
  available as a fallback, not the default.

- **Model: `Qwen2.5-VL-7B-Instruct`, Unsloth `IQ4_NL` text weights +
  `mmproj-F16` vision encoder** (~5.8 GB total). Verified against the official
  `unsloth` and `ggml-org` HF repos. Rationale: the vision encoder is the part
  that sees fine colour detail, so it stays near-full precision; the 7B text
  part can be quantized aggressively because the image detail is already
  tokenized by the encoder. This is the best quality-per-GB point that still
  fits ~16 GB VRAM with a large reserve.

- **Two files downloaded ready-made — no extraction.** `llama.cpp` vision uses a
  separate `mmproj` GGUF next to the model. The gist's "extract mmproj" step is
  noise: official repos ship `mmproj` as a standalone file. The model and mmproj
  are downloaded, not derived.

- **Staged delivery: POC CLI first.** Stage 1 (one-shot CLI) is the only hard
  target. Stages 2 (resident server) and 3 (MCP tool) are conditional — built
  only if the POC proves the model reads defects well enough to be worth
  automating. This keeps the first milestone small and measurable.

- **The Qwen3.6 text-only models on disk are NOT usable for this.** They have no
  vision tower; no `mmproj` can be extracted from them. The VLM is a separate
  download.

---

## Actors

- A1. **The vision-less agent** — decides a screenshot needs reading, marks the
  suspect region, invokes the local VLM, consumes the structured finding.
- A2. **The local VLM** — receives image + prompt, returns the finding.

---

## Requirements

### Model acquisition

- R1. The procedure names exactly two files to download: the model GGUF
  (`Qwen2.5-VL-7B-Instruct-IQ4_NL.gguf`) and its vision encoder
  (`mmproj-F16.gguf`), with their sizes so the downloader can sanity-check
  completion.
- R2. The procedure states that `Q4_K_M` (model) is the compatibility-safe
  fallback if the `IQ4_NL` quant is rejected by the installed `llama.cpp` build;
  the `mmproj-F16` is fixed regardless.
- R3. The procedure warns against quantizing below ~IQ3/Q3 for this task: the
  VRAM saved does not justify degraded colour/detail reading.

### POC invocation (Stage 1)

- R4. The procedure documents a one-shot PowerShell invocation of the existing
  `llama-mtmd-cli.exe` (or equivalent) that takes the screenshot path + a fixed
  analysis prompt and prints the finding to stdout.
- R5. The invocation runs in a mode that fits the GPU budget: model + mmproj +
  image tokens must not exceed ~16 GB VRAM; the procedure records the working
  `--ctx-size` / `--n-gpu-layers` values once measured.
- R6. The procedure works without a permanently running vision server — Stage 1
  is start-on-demand and exits after one read.

### Output contract

- R7. The prompt asks the model to return a structured finding with three
  fields: **what** the defect is, **where** in the image (or on which face/
  region), and **severity** (e.g. cosmetic / functional / blocker).
- R8. The output is plain text the agent can parse without code: no requirement
  is placed on JSON or a schema in Stage 1.
- R9. The procedure defines what counts as a usable result — a finding naming a
  concrete visual discrepancy with a location — versus an unusable one (empty,
  hallucinated colour that contradicts the known sticker palette, or refusal).

### Staging gate

- R10. Stage 2 (resident `llama-server --mmproj` on a second port) is triggered
  only when the POC shows repeated reads with acceptable latency make a
  persistent server worthwhile.
- R11. Stage 3 (MCP tool wrapping the local vision call) is triggered only when
  the agent needs to call vision as a first-class function during an autonomous
  run, not as a terminal subprocess.

---

## Key Flows

- F1. POC one-shot defect read
  - **Trigger:** A1 has a screenshot with a marked suspect region.
  - **Actors:** A1, A2.
  - **Steps:** A1 runs the one-shot CLI with the image path and the fixed
    finding prompt → A2 encodes the image via mmproj, generates the finding → A1
    reads stdout and turns the finding into a next action (inspect CSS, fix a
    test, confirm a hypothesis).
  - **Covered by:** R4–R9.

---

## Acceptance Examples

- AE1. **Covers R7–R9.** Given a screenshot whose marked region shows a sticker
  rendered with the wrong colour, the model returns a finding that names the
  discrepancy and its location, and the agent can act on it without re-reading
  the image itself.
- AE2. **Covers R1–R3.** Given the model or mmproj file is missing or truncated,
  the procedure fails with a message that says which file to (re)download and
  its expected size — not a cryptic GGUF load error.
- AE3. **Covers R5.** Given the VRAM budget is exceeded, the invocation either
  still completes via documented offload or fails with a clear out-of-memory
  signal; silent GPU OOM that kills the terminal is not acceptable.

---

## Scope Boundaries

- **In scope:** Stage 1 POC; model + quant selection; the fixed analysis prompt;
  the stdout finding contract.
- **Deferred for later:** Stage 2 resident vision server; Stage 3 MCP tool; any
  prompt/schema iteration beyond what the POC needs; benchmarking across
  alternative VLMs (3B, 30B) is a one-time comparison note, not an ongoing
  matrix.
- **Outside this product's identity:** training or fine-tuning a vision model;
  routing images through the text-only Qwen3.6 models on disk; using the local
  VLM for anything other than reading defect screenshots.

---

## Dependencies / Assumptions

- **Dependency:** a downloadable `Qwen2.5-VL-7B-Instruct` GGUF + mmproj from HF
  (`unsloth/Qwen2.5-VL-7B-Instruct-GGUF`, or `ggml-org/...` as fallback).
- **Dependency:** the existing `d:\llms` `llama.cpp` build with `llama-mtmd-cli`
  supporting `--mmproj` (verified present).
- **Assumption:** ~16 GB usable VRAM (the text-only Qwen is stopped while the
  VLM runs, so the full budget is available).
- **Assumption (unverified):** `IQ4_NL` is loadable by the installed build. If
  not, fall back to `Q4_K_M` per R2.
- **Assumption (unverified):** Qwen2.5-VL-7B at this quant can reliably read
  fine colour/geometry defects on cube screenshots. The POC exists to verify
  this before any investment in Stage 2/3.

---

## Outstanding Questions

- **Resolve Before Planning:** none — Stage 1 is fully specified.
- **Deferred to Planning:** the exact CLI flag set (`--ctx-size`,
  `--n-gpu-layers`, `--image` vs `--mmproj` arg shape) for the installed build;
  the concrete file layout under `d:\llms` (e.g. a `vision\` subfolder); the
  fixed analysis prompt's exact wording; whether the one-shot call wraps in a
  `.ps1` helper script.

---

## Sources / Research

- `d:\llms\models\` — installed GGUF list (all text-only; no VLM, no mmproj).
- `d:\llms\bin\llama.cpp-turboquant-mtp\` — `llama-mtmd-cli.exe`,
  `llama-qwen2vl-cli.exe`, `llama-server.exe` present.
- `d:\llms\models.ini`, `d:\llms\run-agentic.ps1` — current server presets and
  ~16 GB VRAM ctx-size findings.
- `https://huggingface.co/unsloth/Qwen2.5-VL-7B-Instruct-GGUF` — quant and
  mmproj file list + sizes (IQ4_NL 4.44 GB, mmproj-F16 1.35 GB, Q4_K_M 4.68 GB).
- `https://huggingface.co/ggml-org/Qwen2.5-VL-7B-Instruct-GGUF` — official
  fallback repo (same Q4_K_M + mmproj Q8_0).
- User-provided gist (Qwen 3.6 35B + MTP + vision) — read for context; its
  "extract mmproj from the MoE text model" claim does not match any real
  downloadable model and is corrected above.
