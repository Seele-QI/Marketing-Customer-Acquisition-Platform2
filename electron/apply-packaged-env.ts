/** 主进程启动时最先执行：把打包 .env 注入 process.env */
import { applyPackagedEnvToProcess } from './services/packaged-env';

applyPackagedEnvToProcess();
