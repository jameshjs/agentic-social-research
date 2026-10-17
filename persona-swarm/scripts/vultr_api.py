"""Structured chat calls on Vultr Serverless Inference for the optional live swarm path.

This has the same async call signature as run_swarm.api_json. It never executes
model-authored code and rejects a gateway response from a different model.
"""

import asyncio
import json
import os
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from run_swarm import read_env

ENDPOINT = "https://api.vultrinference.com/v1/chat/completions"
RETRYABLE = {429, 500, 502, 503, 504}


def _post(payload, key):
    request = Request(
        ENDPOINT,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        method="POST",
    )
    with urlopen(request, timeout=45) as response:
        return json.load(response)


async def vultr_json(system, prompt, schema, model="glm-5.3-flash", effort="low"):
    """Return (structured answer, usage) or (None, error) using a Vultr chat model."""
    key = os.environ.get("VULTR_INFERENCE_API_KEY") or read_env().get("VULTR_INFERENCE_API_KEY")
    if not key:
        return None, {"error": "VULTR_INFERENCE_API_KEY is not set"}
    payload = {
        "model": model,
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": prompt}],
        "response_format": {"type": "json_schema", "json_schema": {
            "name": "swarm_result", "strict": True, "schema": schema}},
        "reasoning_effort": effort,
        "max_completion_tokens": 4096,
    }
    started = time.monotonic()
    for attempt in range(3):
        try:
            response = await asyncio.to_thread(_post, payload, key)
            break
        except HTTPError as exc:
            if exc.code in RETRYABLE and attempt < 2:
                await asyncio.sleep(min(2 ** attempt, 3))
                continue
            return None, {"error": f"Vultr HTTP {exc.code}"}
        except (URLError, TimeoutError, OSError) as exc:
            if attempt < 2:
                await asyncio.sleep(min(2 ** attempt, 3))
                continue
            return None, {"error": f"Vultr connection failed: {type(exc).__name__}"}
        except (ValueError, UnicodeError):
            return None, {"error": "Vultr returned invalid response JSON"}

    if not isinstance(response, dict):
        return None, {"error": "Vultr returned a non-object response"}
    actual_model = response.get("model")
    if actual_model != model:
        return None, {"error": f"Vultr returned model {actual_model!r}, requested {model!r}"}
    choices = response.get("choices") or []
    choice = choices[0] if choices else {}
    usage = response.get("usage") or {}
    meta = {"model": actual_model, "input_tokens": usage.get("prompt_tokens"),
            "output_tokens": usage.get("completion_tokens"),
            "duration_ms": round((time.monotonic() - started) * 1000)}
    if choice.get("finish_reason") != "stop":
        return None, {**meta, "error": f"Vultr finish_reason {choice.get('finish_reason')!r}"}
    try:
        answer = json.loads(choice["message"]["content"])
    except (KeyError, TypeError, json.JSONDecodeError):
        return None, {**meta, "error": "Vultr returned invalid structured JSON"}
    if not isinstance(answer, dict):
        return None, {**meta, "error": "Vultr returned a non-object structured answer"}
    return answer, meta
