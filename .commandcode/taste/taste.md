# Taste (Continuously Learned by CommandCode.ai)

# code-style
- Flatten control flow with early `return`, `continue`, `break`. Confidence: 0.90
- Avoid `switch/case` and `else` — use if guards almost always. Confidence: 0.90

# workflow
- Always use pnpm — never npm or yarn. Confidence: 0.90
- Use tsup for bundling. Confidence: 0.90
- Always start versions at `0.0.1`. Confidence: 0.85
- Dev loop order: `pnpm test` → `pnpm lint` → `pnpm typecheck` → `pnpm build` → commit. Confidence: 0.85

# cli
See [cli/taste.md](cli/taste.md)
# git
- Commit format: `<type>: <description>` with optional body. Types: feat, fix, refactor, test, docs, chore. Confidence: 0.90

# npm
- Use `npx npm-name-cli` to check name availability before `npm publish`; also check common variations. Confidence: 0.85
