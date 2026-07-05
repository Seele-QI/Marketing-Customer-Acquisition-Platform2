/**
 * 为 BrowserWindow 挂载可编辑区域右键菜单（剪切 / 复制 / 粘贴 / 全选）。
 * Electron 默认不提供该菜单，导致文案输入框无法右键粘贴。
 */

import { BrowserWindow, Menu, MenuItem, type ContextMenuParams } from "electron"

export function attachEditableContextMenu(win: BrowserWindow): void {
  win.webContents.on("context-menu", (_event, params: ContextMenuParams) => {
    const { isEditable, selectionText, editFlags } = params
    const hasSelection = Boolean(selectionText && selectionText.trim())

    if (!isEditable && !hasSelection) {
      return
    }

    const menu = new Menu()

    if (isEditable) {
      menu.append(
        new MenuItem({
          label: "撤销",
          role: "undo",
          enabled: editFlags.canUndo,
        }),
      )
      menu.append(
        new MenuItem({
          label: "重做",
          role: "redo",
          enabled: editFlags.canRedo,
        }),
      )
      menu.append(new MenuItem({ type: "separator" }))
      menu.append(
        new MenuItem({
          label: "剪切",
          role: "cut",
          enabled: editFlags.canCut,
        }),
      )
      menu.append(
        new MenuItem({
          label: "复制",
          role: "copy",
          enabled: editFlags.canCopy,
        }),
      )
      menu.append(
        new MenuItem({
          label: "粘贴",
          role: "paste",
          enabled: editFlags.canPaste,
        }),
      )
      menu.append(
        new MenuItem({
          label: "全选",
          role: "selectAll",
          enabled: editFlags.canSelectAll,
        }),
      )
    } else if (hasSelection) {
      menu.append(
        new MenuItem({
          label: "复制",
          role: "copy",
          enabled: editFlags.canCopy,
        }),
      )
    }

    menu.popup({ window: win })
  })
}
