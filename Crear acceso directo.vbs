' Creates a "StoryND" shortcut on the desktop, with the app's icon, that
' opens this copy of the app (wherever it was downloaded).
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
folder = fso.GetParentFolderName(WScript.ScriptFullName)

Set link = shell.CreateShortcut(shell.SpecialFolders("Desktop") & "\StoryND.lnk")
link.TargetPath = shell.ExpandEnvironmentStrings("%WINDIR%") & "\System32\wscript.exe"
link.Arguments = """" & folder & "\Storyboard.vbs"""
link.WorkingDirectory = folder
link.IconLocation = folder & "\electron\storyboard.ico,0"
link.Description = "StoryND"
link.Save

MsgBox "Listo: tienes StoryND en el escritorio.", 64, "StoryND"
