; 自定义 NSIS 安装脚本（electron-builder include）
; 功能：
; - 安装完成页提示 SmartScreen（MVP 无签名，需要此提示）
; - 卸载时清理用户数据目录

!macro customInstall
  ; 写注册表项便于诊断
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}" "InstallLocation" "$INSTDIR"
!macroend

!macro customUnInstall
  ; 询问是否删除用户数据（logs、credentials、video-cache）
  MessageBox MB_YESNO|MB_ICONQUESTION \
    "是否同时删除用户数据（日志、凭证、视频缓存）？$\n$\n如保留，重新安装后可继续使用。$\n如删除，需重新配置。" \
    IDNO skipDeleteUserData
  RMDir /r "$PROFILE\AppData\Roaming\AI营销获客中台"
  skipDeleteUserData:
!macroend
