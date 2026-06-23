/**
 * 與 next-themes v0.4.6 `script.ts` 邏輯一致，對應 app/layout.tsx 中
 * ThemeProvider（attribute=class, defaultTheme=light, enableSystem 等）。
 * 透過 next/script beforeInteractive 注入，避免在 React 元件樹內渲染 script 標籤（React 19 會報錯）。
 */
export const THEME_INIT_SCRIPT = `(function(){
var attribute="class";
var storageKey="theme";
var defaultTheme="light";
var forcedTheme=void 0;
var themes=["light","dark"];
var value=void 0;
var enableSystem=true;
var enableColorScheme=true;
var el=document.documentElement;
var systemThemes=["light","dark"];
function updateDOM(theme){
var attributes=Array.isArray(attribute)?attribute:[attribute];
attributes.forEach(function(attr){
var isClass=attr==="class";
var classes=isClass&&value?themes.map(function(t){return value[t]||t}):themes;
if(isClass){
el.classList.remove.apply(el.classList,classes);
el.classList.add(value&&value[theme]?value[theme]:theme);
}else{
el.setAttribute(attr,theme);
}
});
setColorScheme(theme);
}
function setColorScheme(theme){
if(enableColorScheme&&systemThemes.indexOf(theme)!==-1){
el.style.colorScheme=theme;
}
}
function getSystemTheme(){
return window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";
}
if(forcedTheme){
updateDOM(forcedTheme);
}else{
try{
var themeName=localStorage.getItem(storageKey)||defaultTheme;
var isSystem=enableSystem&&themeName==="system";
var theme=isSystem?getSystemTheme():themeName;
updateDOM(theme);
}catch(e){}
}
})();`
