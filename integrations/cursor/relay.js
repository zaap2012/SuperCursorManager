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
var receivedAt = new Date().getTime();
var line = '{"schemaVersion":1,"source":{"kind":"ide.cursor"},"receivedAt":' + receivedAt + ',"payload":' + raw + "}\n";
appendUtf8(spool, line);
WScript.StdOut.WriteLine("{}");

function appendUtf8(filePath, text) {
  var adTypeText = 2;
  var adSaveCreateOverWrite = 2;
  var stm = new ActiveXObject("ADODB.Stream");
  stm.Type = adTypeText;
  stm.Charset = "UTF-8";
  stm.Open();
  if (fso.FileExists(filePath)) {
    stm.LoadFromFile(filePath);
    stm.Position = stm.Size;
  }
  stm.WriteText(text);
  stm.SaveToFile(filePath, adSaveCreateOverWrite);
  stm.Close();
}
