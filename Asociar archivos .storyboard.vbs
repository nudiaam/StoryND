' Makes Windows open .storyboard files with this app (double click).
' Only for your user: it writes under HKEY_CURRENT_USER, nothing system-wide.
' To undo it, run "Quitar asociacion .storyboard.vbs".
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
folder = fso.GetParentFolderName(WScript.ScriptFullName)
launcher = folder & "\Storyboard.vbs"
icon = folder & "\electron\storyboard.ico"
If Not fso.FileExists(icon) Then icon = folder & "\node_modules\electron\dist\electron.exe"

base = "HKCU\Software\Classes\"
shell.RegWrite base & ".storyboard\", "Storyboard.Proyecto", "REG_SZ"
shell.RegWrite base & "Storyboard.Proyecto\", "Proyecto de StoryND", "REG_SZ"
shell.RegWrite base & "Storyboard.Proyecto\DefaultIcon\", """" & icon & """,0", "REG_SZ"
shell.RegWrite base & "Storyboard.Proyecto\shell\open\command\", "wscript.exe """ & launcher & """ ""%1""", "REG_SZ"

MsgBox "Listo: los archivos .storyboard se abren con StoryND." & vbCrLf & _
  "Si el icono no cambia enseguida, se actualizara al reiniciar la sesion.", 64, "StoryND"
