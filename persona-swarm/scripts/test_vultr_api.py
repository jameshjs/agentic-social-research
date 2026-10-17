"""Offline checks for the opt-in Vultr structured-chat boundary."""

import asyncio
import os
import unittest
from unittest.mock import patch

from vultr_api import vultr_json


class VultrApiTests(unittest.TestCase):
    def call(self, response):
        with patch.dict(os.environ, {"VULTR_INFERENCE_API_KEY": "test-only"}):
            with patch("vultr_api._post", return_value=response) as post:
                result = asyncio.run(vultr_json("system", "prompt", {"type": "object"}, "glm-5.3-flash"))
        payload, key = post.call_args.args
        self.assertEqual(key, "test-only")
        self.assertEqual(payload["model"], "glm-5.3-flash")
        self.assertEqual(payload["response_format"]["type"], "json_schema")
        return result

    def test_structured_response(self):
        answer, meta = self.call({"model": "glm-5.3-flash", "choices": [
            {"finish_reason": "stop", "message": {"content": '{"stance":"support"}'}}],
            "usage": {"prompt_tokens": 18, "completion_tokens": 4}})
        self.assertEqual(answer, {"stance": "support"})
        self.assertEqual(meta["input_tokens"], 18)

    def test_gateway_model_fallback_is_rejected(self):
        answer, meta = self.call({"model": "deepseek-v4.1-flash", "choices": []})
        self.assertIsNone(answer)
        self.assertIn("returned model", meta["error"])

    def test_truncated_json_is_rejected(self):
        answer, meta = self.call({"model": "glm-5.3-flash", "choices": [
            {"finish_reason": "length", "message": {"content": "{}"}}]})
        self.assertIsNone(answer)
        self.assertIn("finish_reason", meta["error"])


if __name__ == "__main__":
    unittest.main()
