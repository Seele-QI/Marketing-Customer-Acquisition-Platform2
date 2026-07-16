; 自定义 NSIS 安装脚本（electron-builder include）
; 功能：
; - 强制默认安装路径为纯 ASCII（避免中文路径导致 native 模块加载失败）
; - 安装完成页提示 SmartScreen（MVP 无签名，需要此提示）
; - 卸载时清理用户数据目录

; 在 NSIS 初始化时把默认 InstallDir 改为 ASCII 路径
; electron-builder 会在 .onInit 之后再设自己的值，所以用 customHeader 提前设
!macro customHeader
  !define MUI_WELCOMEPAGE_TEXT "欢迎安装招财猫$\r$\n$\r$\n安装路径请保持默认（英文路径），否则程序可能无法启动。"
!macroend

!macro customInit
  DetailPrint "正在关闭正在运行的招财猫..."
  nsExec::ExecToLog 'taskkill /F /IM 招财猫.exe /T'
  Sleep 2000
!macroend

!macro customInstall
  ; 写注册表项便于诊断
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}" "InstallLocation" "$INSTDIR"
!macroend

!macro customUnInstall
  ; 询问是否删除用户数据（logs、credentials、video-cache）
  MessageBox MB_YESNO|MB_ICONQUESTION \
    "是否同时删除用户数据（日志、凭证、视频缓存）？$\n$\n如保留，重新安装后可继续使用。$\n如删除，需重新配置。" \
    IDNO skipDeleteUserData
  RMDir /r "$PROFILE\AppData\Roaming\招财猫"
  skipDeleteUserData:
!macroend
