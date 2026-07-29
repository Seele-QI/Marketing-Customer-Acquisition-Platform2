export const app = {
  exit() {},
  getPath() { return process.env.TEST_ELECTRON_USER_DATA || process.cwd() },
  isPackaged: false,
  on() {},
}
