"""全局 Playwright 互斥锁，避免并发启动浏览器导致失败。"""
import asyncio

playwright_lock = asyncio.Lock()
