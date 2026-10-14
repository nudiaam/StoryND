' Undoes "Asociar archivos .storyboard.vbs": Windows stops opening
' .storyboard files with this app. Your projects are not touched.
Set shell = CreateObject("WScript.Shell")
On Error Resume Next
base = "HKCU\Software\Classes\"
shell.RegDelete base & "Storyboard.Proyecto\shell\open\command\"
shell.RegDelete base & "Storyboard.Proyecto\shell\open\"
shell.RegDelete base & "Storyboard.Proyecto\shell\"
shell.RegDelete base & "Storyboard.Proyecto\DefaultIcon\"
shell.RegDelete base & "Storyboard.Proyecto\"
shell.RegDelete base & ".storyboard\"
On Error GoTo 0
MsgBox "Hecho: los archivos .storyboard ya no se abren con StoryND.", 64, "StoryND"
