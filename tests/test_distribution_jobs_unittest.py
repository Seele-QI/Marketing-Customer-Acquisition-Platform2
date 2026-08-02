import os
import tempfile
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

from lib.distribution_jobs import DistributionJobStore, build_adaptations, run_job

class DistributionJobsTest(unittest.TestCase):
    def test_geo_distribution_uses_each_platforms_own_matrix_article(self):
        rows = build_adaptations(
            "geo_article",
            {
                "projectId": "project-a",
                "date": "2026-08-02",
                "title": "不应复用的锚点",
                "markdown": "不应复用的正文",
                "platformArticles": [
                    {"platform": "xiaohongshu", "articleId": "xhs-1", "projectId": "project-a", "date": "2026-08-02", "title": "小红书原文", "markdown": "小红书正文"},
                    {"platform": "zhihu", "articleId": "zhihu-1", "projectId": "project-a", "date": "2026-08-02", "title": "知乎原文", "markdown": "知乎正文"},
                ],
            },
            ["xiaohongshu", "zhihu"],
        )
        self.assertEqual([row["articleId"] for row in rows], ["xhs-1", "zhihu-1"])
        self.assertEqual([row["title"] for row in rows], ["小红书原文", "知乎原文"])
        self.assertNotIn("不应复用的锚点", [row["title"] for row in rows])

    def test_geo_distribution_rejects_cross_project_article_mixing(self):
        with self.assertRaisesRegex(ValueError, "\u8de8\u5185\u5bb9\u77e9\u9635\u9879\u76ee"):
            build_adaptations(
                "geo_article",
                {
                    "projectId": "project-a",
                    "date": "2026-08-02",
                    "platformArticles": [
                        {"platform": "zhihu", "articleId": "bad", "projectId": "project-b", "date": "2026-08-02", "title": "错误文章", "markdown": "错误正文"},
                    ],
                },
                ["zhihu"],
            )

    def test_adapts_article_and_preserves_official_poi_disclosure(self):
        rows=build_adaptations("geo_article",{"title":"门店攻略","markdown":"# 正文\n真实攻略内容","poiName":"测试门店","cityOrDestination":"上海","poiReference":"poi-1"},["zhihu","dianping"])
        self.assertEqual([row["platform"] for row in rows],["zhihu","dianping"])
        self.assertEqual(rows[1]["contentDisclosure"],"\u5b98\u65b9\u653b\u7565/\u7b14\u8bb0")

    def test_job_is_idempotent_and_requires_confirmation(self):
        with tempfile.TemporaryDirectory() as directory:
            store=DistributionJobStore(os.path.join(directory,"jobs.db"))
            preview=store.create_preview(7,"video",{"title":"测试视频","description":"测试描述","videoUrl":"/video.mp4","tags":["测试"]},["douyin","kuaishou"])
            with self.assertRaisesRegex(ValueError, "\u786e\u8ba4"):
                store.create_job(7,preview["previewToken"],"same-key",False)
            first=store.create_job(7,preview["previewToken"],"same-key",True)
            second=store.create_job(7,preview["previewToken"],"same-key",True)
            self.assertEqual(first["jobId"],second["jobId"])
            self.assertEqual(len(first["items"]),2)

    def test_cancel_only_cancels_queued_items(self):
        with tempfile.TemporaryDirectory() as directory:
            store=DistributionJobStore(os.path.join(directory,"jobs.db"))
            preview=store.create_preview(8,"geo_article",{"title":"测试文章","markdown":"正文内容"},["zhihu","weibo"])
            job=store.create_job(8,preview["previewToken"],"cancel-key",True)
            cancelled=store.cancel(8,job["jobId"])
            self.assertTrue(all(item["status"]=="cancelled" for item in cancelled["items"]))

class DistributionJobRuntimeTest(unittest.IsolatedAsyncioTestCase):
    async def test_live_login_page_invalidates_stale_connected_binding(self):
        class LoginRequiredResult:
            success=False
            error="平台登录已失效，请重新绑定账号"
            metadata={"state":"login_required"}
            def to_dict(self):
                return {"success":False,"error":self.error,"metadata":self.metadata}

        with tempfile.TemporaryDirectory() as directory:
            test_store=DistributionJobStore(os.path.join(directory,"jobs.db"))
            preview=test_store.create_preview(
                11,
                "geo_article",
                {"title":"测试文章","markdown":"正文内容"},
                ["xiaohongshu"],
            )
            job=test_store.create_job(11,preview["previewToken"],"expired-login",True)
            marker=MagicMock()
            with (
                patch("lib.distribution_jobs.store", test_store),
                patch("lib.publisher.article.publish_geo_article", new=AsyncMock(return_value=LoginRequiredResult())),
                patch("lib.connector_service.mark_platform_login_expired", new=marker),
            ):
                await run_job(11,job["jobId"])

            marker.assert_called_once_with(11,"xiaohongshu")
            persisted=test_store.get_job(11,job["jobId"])
            self.assertEqual(persisted["items"][0]["status"],"waiting_user")

    async def test_unexpected_publisher_error_never_leaves_job_running(self):
        with tempfile.TemporaryDirectory() as directory:
            test_store=DistributionJobStore(os.path.join(directory,"jobs.db"))
            preview=test_store.create_preview(
                9,
                "geo_article",
                {"title":"测试文章","markdown":"正文内容"},
                ["zhihu"],
            )
            job=test_store.create_job(9,preview["previewToken"],"runtime-error",True)
            with (
                patch("lib.distribution_jobs.store", test_store),
                patch(
                    "lib.publisher.article.publish_geo_article",
                    new=AsyncMock(side_effect=RuntimeError("browser crashed")),
                ),
            ):
                await run_job(9,job["jobId"])

            persisted=test_store.get_job(9,job["jobId"])
            self.assertEqual(persisted["status"],"failed")
            self.assertEqual(persisted["items"][0]["status"],"failed")
            self.assertIn("browser crashed",persisted["items"][0]["error"])

    async def test_cancelled_job_does_not_resume_remaining_platforms(self):
        class SuccessfulResult:
            success=True
            error=None
            metadata={}
            def to_dict(self):
                return {"success":True}

        with tempfile.TemporaryDirectory() as directory:
            test_store=DistributionJobStore(os.path.join(directory,"jobs.db"))
            preview=test_store.create_preview(
                10,
                "geo_article",
                {"title":"测试文章","markdown":"正文内容"},
                ["zhihu","weibo"],
            )
            job=test_store.create_job(10,preview["previewToken"],"runtime-cancel",True)

            async def publish_then_cancel(**_kwargs):
                test_store.cancel(10,job["jobId"])
                return SuccessfulResult()

            publisher=AsyncMock(side_effect=publish_then_cancel)
            with (
                patch("lib.distribution_jobs.store", test_store),
                patch("lib.publisher.article.publish_geo_article", new=publisher),
            ):
                await run_job(10,job["jobId"])

            persisted=test_store.get_job(10,job["jobId"])
            self.assertEqual(persisted["status"],"cancelled")
            self.assertEqual(publisher.await_count,1)
            self.assertEqual(
                [item["status"] for item in persisted["items"]],
                ["success","cancelled"],
            )

if __name__ == "__main__":
    unittest.main()
