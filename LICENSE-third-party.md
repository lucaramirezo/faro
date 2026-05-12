# Third-party attributions

This file documents code in `faro/` adapted from third-party sources, in
addition to the npm dependencies declared in `package.json`.

## developer-hasm/claude-code-dashboard (MIT)

- **Files adapted from this project**:
  - `lib/skills/parser.ts` — skill-discovery + frontmatter logic adapted from `src/lib/scanner.ts`.
  - `lib/skills/usage.ts` — incremental jsonl ingestion + `extractSkillName` + the `processed_files` and `turns` sqlite schemas adapted from `src/lib/incremental-scanner.ts` and `src/lib/usage-db.ts`.
- **Upstream repository**: https://github.com/developer-hasm/claude-code-dashboard
- **Upstream commit referenced during the Phase 2 port**: `b620331b25034d5b1b142c7d89df69164374896e` (2026-05-11)

### MIT License

```
MIT License

Copyright (c) developer-hasm

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
