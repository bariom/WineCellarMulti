# OpenAI model configuration

Vinaris calls the OpenAI Responses API directly from the backend. Model policy,
parameters and routing live in `app/services/ai_models.py`; the transport and the
single controlled fallback live in `app/services/openai_client.py`.

## Supported roles

| Role | Default model | Initial reasoning effort | Workloads |
| --- | --- | --- | --- |
| `legacy` | `gpt-5.5` | omitted (preserves the previous request shape) | rollback and provider fallback |
| `economy` | `gpt-6-luna` | `low` | simple extraction and short structured work |
| `balanced` | `gpt-6.1-sol` | `medium` | Sommelier, pairings and normal analysis |
| `advanced` | `gpt-6.1-sol` | `high` | cellar/portfolio analysis and multi-step planning |

`gpt-6-astra` is allowlisted for an explicit quality-first choice, but it is not
the default for a role because its standard token price is substantially higher.

The role model IDs, reasoning effort, maximum output tokens, timeout and retry
policy are configurable through the corresponding `OPENAI_*` variables shown in
`.env.example`. A maximum-token value of `0` falls back to the safe default of
32,768 output tokens; configured values are always capped at 32,768. This limit
applies to output (including reasoning), not to the input + output total shown
in the AI audit. Temperature is intentionally omitted: Vinaris did not previously send
it, and it is not needed by these reasoning workloads.

`OPENAI_ENABLE_GPT56` retains its historical name for deployment compatibility;
it now enables the allowlisted GPT-6 Luna, GPT-6.1 Sol and GPT-6 Astra set.

## GPT-6 compatibility

Vinaris already uses the Responses API, does not send `temperature`, `top_p` or
`logprobs`, and does not depend on Fast mode. GPT-6 Luna therefore remains usable
with `none`/`low` effort for short tasks, while GPT-6.1 Sol and GPT-6 Astra are
kept at `low` or higher. GPT-5.5 remains available only as a controlled rollback
and provider fallback.

## Safe rollout

The documented deployment configuration enables GPT-6 routing. The application
still defaults both compatibility flags to `false` when no environment is loaded,
so an existing deployment can stage explicit allowlisted selection before routing:

```env
OPENAI_DEFAULT_MODEL=gpt-5.5
OPENAI_ENABLE_GPT56=true
OPENAI_ENABLE_MODEL_ROUTING=false
```

After staging evaluation, enable deterministic routing:

```env
OPENAI_DEFAULT_MODEL=gpt-5.5
OPENAI_ENABLE_GPT56=true
OPENAI_ENABLE_MODEL_ROUTING=true
```

No model name supplied by an API client is passed through freely. Only the
server-side allowlist and environment-configured role models can be selected.

## Fallback and rollback

An unavailable/unauthorized model, exhausted rate-limit response, recognized
model configuration error, timeout, network error, or temporary OpenAI API error
can trigger exactly one fallback request to `OPENAI_FALLBACK_MODEL`. Validation,
security/policy, malformed prompt and malformed-response errors do not fallback.
There are never more than two provider requests for one Vinaris operation.

For an immediate rollback, set and restart the backend:

```env
OPENAI_ENABLE_GPT56=false
OPENAI_ENABLE_MODEL_ROUTING=false
OPENAI_DEFAULT_MODEL=gpt-5.5
OPENAI_FALLBACK_MODEL=gpt-5.5
```

No database migration or frontend deployment is required.

## Staging checklist

1. Run `pytest` and `ruff check .` from `backend/`.
2. Deploy with the modern model set enabled and routing disabled; verify a normal Sommelier
   request remains on GPT-5.5 and inspect the structured `openai_response` log.
3. Explicitly exercise GPT-6 Luna, GPT-6.1 Sol and GPT-6 Astra with non-sensitive test data.
4. Simulate model access and rate-limit failures and confirm one GPT-5.5 fallback.
5. Enable routing and compare representative notes, pairings, wine analysis and
   portfolio planning for response schema, latency, token usage and cost.
6. Confirm the account/project has access to every configured model before the
   production routing flag is enabled.
