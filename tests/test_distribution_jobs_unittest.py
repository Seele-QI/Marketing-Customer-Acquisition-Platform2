import os
import tempfile
import unittest

from lib.distribution_jobs import DistributionJobStore, build_adaptations

class DistributionJobsTest(unittest.TestCase):
    def test_adapts_article_and_preserves_official_poi_disclosure(self):
        rows=build_adaptations("geo_article",{"title":"门店攻略","markdown":"# 正文\n真实攻略内容","poiName":"测试门店","cityOrDestination":"上海","poiReference":"poi-1"},["zhihu","dianping"])
        self.assertEqual([row["platform"] for row in rows],["zhihu","dianping"])
        self.assertEqual(rows[1]["contentDisclosure"],"官方攻略/笔记")

    def test_job_is_idempotent_and_requires_confirmation(self):
        with tempfile.TemporaryDirectory() as directory:
            store=DistributionJobStore(os.path.join(directory,"jobs.db"))
            preview=store.create_preview(7,"video",{"title":"测试视频","description":"测试描述","videoUrl":"/video.mp4","tags":["测试"]},["douyin","kuaishou"])
            with self.assertRaisesRegex(ValueError,"确认"):
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

if __name__ == "__main__":
    unittest.main()
