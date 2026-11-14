export const CSS = `
:root {
  --bg: #f3f6f5; --surface: #ffffff; --text: #1c2a26; --muted: #5d6d68; --line: #dde4e1;
  --accent: #1f5f4a; --accent-text: #ffffff; --accent-soft: #e4f0ec;
  --warn: #8a5a00; --warn-soft: #fbf1dc; --danger: #a13a2f; --danger-soft: #f9e6e3;
  --ok: #1f6b45; --ok-soft: #e1f2e8; --radius: 12px;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #111715; --surface: #1a2220; --text: #e6eeeb; --muted: #9bada7; --line: #2c3936;
    --accent: #5fc3a2; --accent-text: #0d1614; --accent-soft: #1d3029;
    --warn: #e6b960; --warn-soft: #33290f; --danger: #f08a7c; --danger-soft: #3a1c18;
    --ok: #7fd3a4; --ok-soft: #173024;
  }
}
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body {
  margin: 0; background: var(--bg); color: var(--text);
  font: 16px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
}
a { color: var(--accent); }
.wrap { max-width: 860px; margin: 0 auto; padding: 24px 16px 64px; }
.wrap.narrow { max-width: 560px; }
.topbar { display: flex; gap: 16px; align-items: center; justify-content: space-between; margin-bottom: 24px; flex-wrap: wrap; }
.topbar .brand { font-weight: 700; text-decoration: none; color: var(--text); }
.topbar nav { display: flex; gap: 16px; font-size: 14px; }
h1 { font-size: 26px; line-height: 1.25; margin: 0 0 8px; text-wrap: balance; }
h2 { font-size: 17px; margin: 32px 0 12px; }
h3 { font-size: 16px; margin: 0; }
p { margin: 0 0 12px; }
.eyebrow { font-size: 13px; color: var(--muted); margin: 0 0 4px; }
.muted { color: var(--muted); }
.small { font-size: 13px; }
.card { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: 16px; margin: 0 0 12px; }
.banner { border-radius: var(--radius); padding: 12px 16px; margin: 0 0 16px; font-size: 14px; }
.banner.warn { background: var(--warn-soft); color: var(--warn); }
.banner.danger { background: var(--danger-soft); color: var(--danger); }
.banner.ok { background: var(--ok-soft); color: var(--ok); }
.stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 12px; margin: 16px 0 8px; }
.stat { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: 12px 16px; }
.stat b { display: block; font-size: 24px; font-variant-numeric: tabular-nums; }
.stat span { font-size: 13px; color: var(--muted); }
.task-head { display: flex; gap: 12px; align-items: flex-start; justify-content: space-between; }
.badge { flex: none; font-size: 12px; font-weight: 600; padding: 3px 10px; border-radius: 999px; background: var(--line); color: var(--text); white-space: nowrap; }
.badge.ok { background: var(--ok-soft); color: var(--ok); }
.badge.warn { background: var(--warn-soft); color: var(--warn); }
.badge.danger { background: var(--danger-soft); color: var(--danger); }
.badge.wait { background: var(--accent-soft); color: var(--accent); }
.meta { font-size: 14px; margin: 8px 0; display: flex; flex-wrap: wrap; gap: 4px 20px; }
.meta b { font-weight: 600; }
.tag { font-size: 12px; color: var(--warn); background: var(--warn-soft); border-radius: 6px; padding: 1px 6px; margin-left: 4px; white-space: nowrap; }
blockquote { margin: 8px 0 0; padding: 8px 12px; border-left: 3px solid var(--line); color: var(--muted); font-size: 14px; }
.actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-top: 12px; }
.actions form { margin: 0; }
button, .button {
  font: inherit; font-weight: 600; font-size: 14px; cursor: pointer; text-decoration: none; display: inline-block;
  padding: 8px 14px; border-radius: 8px; border: 1px solid var(--line); background: var(--surface); color: var(--text);
}
button.primary, .button.primary { background: var(--accent); border-color: var(--accent); color: var(--accent-text); }
button.danger { color: var(--danger); }
button.big { width: 100%; padding: 14px 16px; font-size: 16px; }
button:focus-visible, .button:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible, summary:focus-visible, a:focus-visible {
  outline: 2px solid var(--accent); outline-offset: 2px;
}
label { display: block; font-size: 14px; font-weight: 600; margin: 0 0 4px; }
.field { margin: 0 0 16px; }
.field .hint { font-size: 13px; color: var(--muted); font-weight: 400; margin: 4px 0 0; }
input[type=text], input[type=datetime-local], input[type=time], input[type=date], select, textarea {
  width: 100%; font: inherit; padding: 9px 10px; border-radius: 8px; border: 1px solid var(--line);
  background: var(--surface); color: var(--text);
}
textarea { min-height: 96px; resize: vertical; }
textarea.tall { min-height: 260px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; }
.check { display: flex; gap: 8px; align-items: flex-start; font-weight: 400; }
.check input { margin-top: 4px; }
fieldset.days { border: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 4px 16px; }
fieldset.days legend { font-size: 14px; font-weight: 600; padding: 0; margin: 0 0 4px; }
table.list td form { margin: 0; }
.row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
@media (max-width: 560px) { .row { grid-template-columns: 1fr; } }
details.edit { margin-top: 12px; }
details.edit summary { cursor: pointer; font-size: 14px; color: var(--accent); width: fit-content; }
details.edit[open] summary { margin-bottom: 12px; }
table.list { width: 100%; border-collapse: collapse; font-size: 14px; }
table.list th, table.list td { text-align: left; padding: 10px 8px; border-bottom: 1px solid var(--line); vertical-align: top; }
table.list th { font-size: 12px; color: var(--muted); font-weight: 600; }
.scroll { overflow-x: auto; }
.done-mark { font-size: 40px; line-height: 1; margin: 0 0 12px; color: var(--ok); }
.empty { text-align: center; padding: 32px 16px; color: var(--muted); }
`;
