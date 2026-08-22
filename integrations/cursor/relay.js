var fso = new ActiveXObject("Scripting.FileSystemObject");
var shell = new ActiveXObject("WScript.Shell");
var home = shell.ExpandEnvironmentStrings("%USERPROFILE%");
var dir = home + "\\.pulse";
if (!fso.FolderExists(dir)) fso.CreateFolder(dir);
var spool = dir + "\\spool.jsonl";
var raw = "{}";
try {
  if (!WScript.StdIn.AtEndOfStream) raw = WScript.StdIn.ReadAll();
} catch (e) {}
raw = String(raw).replace(/^\s+|\s+$/g, "");
if (!raw) raw = "{}";
raw = raw.replace(/[\r\n]+/g, "");
var receivedAt = (new Date()).getTime();
var line = '{"schemaVersion":1,"source":{"kind":"ide.cursor"},"receivedAt":' + receivedAt + ',"payload":' + raw + "}\r\n";
var file = fso.OpenTextFile(spool, 8, true);
file.Write(line);
file.Close();
WScript.StdOut.WriteLine("{}");
