/**
 * 激活向导窗口
 *
 * 在首次启动（无凭证）时弹出，引导用户输入激活码。
 * 激活成功后保存凭证、关闭向导、打开主窗口。
 *
 * 流程：欢迎 → 输入 → 验证中 → 成功/失败
 */

import { BrowserWindow, ipcMain } from 'electron';
import logger from '../services/logger';
import { getMachineIdShort } from '../services/machine-id';
import { activate, type ActivationResult } from '../services/activation-client';
import { saveCredentials, type CredentialData } from '../services/credential-store';

export type WizardCallback = (success: boolean) => void;

export function createWizardWindow(onDone: WizardCallback): BrowserWindow {
  const win = new BrowserWindow({
    width: 480,
    height: 580,
    resizable: false,
    frame: true,
    title: '中台助手 - 激活',
    backgroundColor: '#0f172a',
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // 内联 HTML 向导页面
  const html = getWizardHtml();
  win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

  // 注册 IPC 通道（向导窗口专用）
  ipcMain.handle('wizard:activate', async (_event, code: string) => {
    try {
      const result = await activate(code);
      if (result.ok) {
        const data: CredentialData = {
          machine_id: result.keys['machine_id'] || '',
          activation_code: code,
          expires_at: result.expires_at,
          keys: result.keys,
        };
        saveCredentials(data);
        logger.info('wizard: activation success');
        return { ok: true };
      }
      return { ok: false, error: result.error, code: result.code };
    } catch (err: any) {
      return { ok: false, error: err.message || '激活失败' };
    }
  });

  ipcMain.handle('wizard:get-machine-id', () => getMachineIdShort());

  win.once('ready-to-show', () => win.show());
  win.on('closed', () => onDone(false));

  // 将回调暴露给关闭事件
  (win as any).__wizardDone = onDone;
  return win;
}

function getWizardHtml(): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>激活向导</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font:-apple-system,BlinkMacSystemFont,sans-serif;background:#0f172a;color:#e2e8f0;display:flex;align-items:center;justify-content:center;height:100vh;overflow:hidden}
.wizard{width:400px;text-align:center}
h1{font-size:22px;margin-bottom:8px}
.sub{color:#94a3b8;font-size:13px;margin-bottom:24px}
.step{display:none}
.step.active{display:block}
input{width:100%;padding:12px 16px;border:1px solid #334155;border-radius:8px;background:#1e293b;color:#e2e8f0;font-size:16px;text-align:center;letter-spacing:2px;outline:none}
input:focus{border-color:#3b82f6}
.btn{padding:12px 32px;border:none;border-radius:8px;font-size:14px;cursor:pointer;margin-top:20px}
.btn-primary{background:#3b82f6;color:#fff}
.btn-primary:hover{background:#2563eb}
.btn-secondary{background:#334155;color:#e2e8f0;margin-left:12px}
.error{color:#f87171;font-size:13px;margin-top:12px}
.spinner{display:inline-block;width:32px;height:32px;border:3px solid #334155;border-top-color:#3b82f6;border-radius:50%;animation:spin .8s linear infinite;margin:16px}
@keyframes spin{to{transform:rotate(360deg)}}
.mid{font-size:11px;color:#64748b;margin-top:16px;font-family:monospace}
.success-icon{font-size:48px;margin-bottom:12px}
</style>
</head>
<body>
<div class="wizard">
  <div id="step-welcome" class="step active">
    <h1>🎬 欢迎使用中台助手</h1>
    <p class="sub">AI 视频创作中台 · 桌面版</p>
    <p class="sub">首次使用需要激活，请输入你的激活码</p>
    <button class="btn btn-primary" onclick="goStep('input')">开始激活</button>
  </div>

  <div id="step-input" class="step">
    <h1>输入激活码</h1>
    <p class="sub">格式：ZT-XXXX-XXXX-XXXX</p>
    <input id="code" type="text" maxlength="19" autocomplete="off"
           placeholder="ZT-____-____-____"
           oninput="formatCode(this)"
           onkeydown="if(event.key==='Enter')doActivate()">
    <p class="error" id="err"></p>
    <button class="btn btn-primary" onclick="doActivate()">激活</button>
    <button class="btn btn-secondary" onclick="goStep('welcome')">上一步</button>
  </div>

  <div id="step-verifying" class="step">
    <h1>正在激活…</h1>
    <div class="spinner"></div>
    <p class="sub">正在验证激活码，请稍候</p>
  </div>

  <div id="step-success" class="step">
    <div class="success-icon">✅</div>
    <h1>激活成功</h1>
    <p class="sub">即将进入中台助手…</p>
  </div>

  <div id="step-error" class="step">
    <div class="success-icon">❌</div>
    <h1>激活失败</h1>
    <p class="error" id="err-msg"></p>
    <button class="btn btn-primary" onclick="goStep('input')">重试</button>
    <button class="btn btn-secondary" onclick="goStep('welcome')">返回</button>
  </div>

  <p class="mid">机器码: <span id="machine-id">加载中…</span></p>
</div>
<script>
const { ipcRenderer } = require('electron');

let currentStep = 'welcome';

function goStep(step) {
  document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
  document.getElementById('step-' + step).classList.add('active');
  currentStep = step;
  if (step === 'input') document.getElementById('code').focus();
}

function formatCode(el) {
  let v = el.value.replace(/[^a-zA-Z0-9-]/g, '').toUpperCase();
  if (v.length > 4 && v[4] !== '-') v = v.slice(0,4) + '-' + v.slice(4);
  if (v.length > 9 && v[9] !== '-') v = v.slice(0,9) + '-' + v.slice(9);
  if (v.length > 14 && v[14] !== '-') v = v.slice(0,14) + '-' + v.slice(14);
  el.value = v.slice(0, 19);
}

async function doActivate() {
  const code = document.getElementById('code').value.trim();
  if (!code || code.length < 19) {
    document.getElementById('err').textContent = '请输入完整的激活码';
    return;
  }
  goStep('verifying');
  try {
    const result = await ipcRenderer.invoke('wizard:activate', code);
    if (result.ok) {
      goStep('success');
      setTimeout(() => ipcRenderer.invoke('wizard:done'), 1500);
    } else {
      document.getElementById('err-msg').textContent = result.error || '激活失败';
      document.getElementById('err').textContent = '';
      goStep('error');
    }
  } catch (e) {
    document.getElementById('err-msg').textContent = '网络错误，请重试';
    goStep('error');
  }
}

async function init() {
  try {
    const mid = await ipcRenderer.invoke('wizard:get-machine-id');
    document.getElementById('machine-id').textContent = mid || '未知';
  } catch {}
}
init();
</script>
</body>
</html>`;
}