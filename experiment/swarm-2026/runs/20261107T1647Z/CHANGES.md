# Changes made to run this

No experiment code was changed: `experiment/swarm-2026/` and `src/lib/turnstile/collusion-sim.ts` are as committed in
28a91362.

Environment only:

- **Isolated install.** Node 22.21.1 and Ollama 0.40.15 were installed into one folder on the GPU box, not system-wide,
  so the setup can be removed in one step. Ollama listened on `127.0.0.1:11500` (`OLLAMA_URL=http://127.0.0.1:11500`)
  because the box already runs another Ollama on the default port. Only GPU 1 of 2 was used (`CUDA_VISIBLE_DEVICES=1`).
- **Context length.** This Ollama version sizes the default context to the GPU (131k tokens, 73 GB for llama3.1:8b),
  which left no room for the second model. It was set to `OLLAMA_CONTEXT_LENGTH=16384`. The prompts are far shorter
  than that, so the model's answers are not cut off.
- **Code delivery.** The box has no GitHub access. The branch was copied over as a git bundle, at the same commit.
- **Quick check.** `QUICK=1` was run first. Two copies of it started in the same minute by mistake and wrote to the
  same folder, so it was moved out of `runs/` and isn't used for any result. Every step said ok, and the LLM cartel gave
  real reasons with 0 unusable replies.
