' Opens Storyboard without leaving a console window open.
' First time: installs what it needs. Then builds the app and starts it hidden.
' With a .storyboard file (double click in the Explorer) it opens that file
' straight away, without building again.
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
folder = fso.GetParentFolderName(WScript.ScriptFullName)
shell.CurrentDirectory = folder

If Not fso.FolderExists(folder & "\node_modules") Then
  ' 0 = hidden window, True = wait until it finishes
  shell.Run "cmd /c npm install", 0, True
End If

fileArg = ""
If WScript.Arguments.Count > 0 Then fileArg = " """ & WScript.Arguments(0) & """"

electron = folder & "\node_modules\electron\dist\electron.exe"
If fileArg <> "" And fso.FileExists(folder & "\dist\index.html") And fso.FileExists(electron) Then
  shell.Run """" & electron & """ ." & fileArg, 0, False
Else
  shell.Run "cmd /c npm start --" & fileArg, 0, False
End If
