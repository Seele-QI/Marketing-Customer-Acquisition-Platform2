from types import SimpleNamespace

import lib.cloud_client as cloud_client


class _FakeResponse:
    status_code = 200
    text = ""

    def json(self):
        return {
            "balance": 9000,
            "cost": 1000,
            "scene": "dh_economy_video_segment",
        }


class _FakeClient:
    def __init__(self, calls, **_kwargs):
        self.calls = calls

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return None

    def post(self, url, **kwargs):
        self.calls.append((url, kwargs))
        return _FakeResponse()


def test_consume_billing_remote_uses_billing_endpoint_and_params(monkeypatch):
    calls = []
    monkeypatch.setenv("CLOUD_API_URL", "https://cloud.example")
    monkeypatch.setattr(
        cloud_client.httpx,
        "Client",
        lambda **kwargs: _FakeClient(calls, **kwargs),
    )
    consume_billing_remote = getattr(cloud_client, "consume_billing_remote", None)
    assert callable(consume_billing_remote), "dynamic cloud billing helper is missing"

    result = consume_billing_remote(
        SimpleNamespace(cookies={"session_id": "sid"}),
        billing_key="video.dh_economy_segment",
        params={"duration_seconds": 61.0, "segment_count": 4},
        ref_id="economy-61s:video",
        business_task_id="economy-61s",
        business_type="dh-video-economy",
        billing_stage="video",
    )

    assert result == (9000, 1000, "dh_economy_video_segment")
    assert calls == [
        (
            "https://cloud.example/api/credit/consume-billing",
            {
                "json": {
                    "billing_key": "video.dh_economy_segment",
                    "params": {"duration_seconds": 61.0, "segment_count": 4},
                    "ref_id": "economy-61s:video",
                    "business_task_id": "economy-61s",
                    "business_type": "dh-video-economy",
                    "billing_stage": "video",
                },
                "cookies": {"session_id": "sid"},
            },
        )
    ]
