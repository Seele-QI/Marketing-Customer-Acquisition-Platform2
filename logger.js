"use strict";
/**
 * 主进程日志（electron-log 包装）
 *
 * - 文件路径：<userData>/logs/main-YYYY-MM-DD.log
 * - 接管 console.* 自动写入
 * - 阶段 5 会再扩展：渲染进程同步 + 日志查看器
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const main_1 = __importDefault(require("electron-log/main"));
// 初始化：必须在 app ready 之前调用
main_1.default.initialize({ preload: true });
// 文件名前缀 main-
main_1.default.transports.file.fileName = 'main';
// 默认级别
main_1.default.transports.file.level = 'info';
main_1.default.transports.console.level = 'debug';
// 全局未捕获异常
main_1.default.errorHandler.startCatching({
    showDialog: false,
    onError({ error }) {
        main_1.default.error('uncaughtException', error);
    },
});
exports.default = main_1.default;
//# sourceMappingURL=logger.js.map