/**
 * Electron 非编辑区选中文字右键「复制」。
 * 可编辑 input/textarea 由渲染进程 EditableContextMenu 处理（驱动 React 受控组件），此处跳过避免双菜单。
 */

import { BrowserWindow, Menu, MenuItem, type ContextMenuParams } from "electron"

export function attachEditableContextMenu(win: BrowserWindow): void {
  win.webContents.on("context-menu", (_event, params: ContextMenuParams) => {
    const { isEditable, selectionText, editFlags } = params
    const hasSelection = Boolean(selectionText && selectionText.trim())

    // 可编辑区交给 React EditableContextMenu
    if (isEditable) {
      return
    }

    if (!hasSelection) {
      return
    }

    const menu = new Menu()
    menu.append(
      new MenuItem({
        label: "复制",
        role: "copy",
        enabled: editFlags.canCopy,
      }),
    )
    menu.popup({ window: win })
  })
}
