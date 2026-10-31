!macro customInstall
  SetRegView 64
  ReadRegStr $0 HKLM "SYSTEM\CurrentControlSet\Services\PawnIO" "ImagePath"
  ${If} $0 == ""
    DetailPrint "Instalando suporte oficial assinado de acesso RGB..."
    ExecWait '"$INSTDIR\resources\drivers\PawnIO_setup.exe" -install -silent' $1
    ${If} $1 == 3010
      SetRebootFlag true
    ${ElseIf} $1 != 0
      MessageBox MB_ICONSTOP "Não foi possível instalar o suporte RGB (código $1). A instalação será interrompida."
      Abort
    ${EndIf}
  ${EndIf}
!macroend

; PawnIO is shared with other hardware programs. Never remove it on uninstall.
