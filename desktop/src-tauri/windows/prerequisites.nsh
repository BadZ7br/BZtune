; BZtune Desktop - etapa de verificacao de dependencias.
; Inserida antes das paginas padrao do Tauri. O Tauri instala WebView2
; somente se necessario, preservando atualizacoes em modo passivo.
!include "nsDialogs.nsh"
!include "LogicLib.nsh"

Var BZtunePrereqDialog

Page custom BZtunePrereqPage BZtunePrereqLeave

Function BZtunePrereqPage
  ; Atualizacoes /UPDATE e instalacoes /S ou /P nao exibem novas janelas.
  ${If} ${Silent}
    Abort
  ${EndIf}
  ${If} $PassiveMode == 1
    Abort
  ${EndIf}
  ${If} $UpdateMode == 1
    Abort
  ${EndIf}

  !insertmacro MUI_HEADER_TEXT "BZtune - Verificacao de requisitos" "Os componentes necessarios serao verificados automaticamente."
  nsDialogs::Create 1018
  Pop $BZtunePrereqDialog
  ${If} $BZtunePrereqDialog == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0u 0u 100% 28u "O BZtune inclui o backend Python/Flask e FFmpeg/FFprobe. Voce nao precisa instalar Python, Node.js, Rust ou FFmpeg."
  Pop $0

  ${NSD_CreateLabel} 0u 38u 100% 15u "Microsoft WebView2 Runtime:"
  Pop $0

  ; Mesmas chaves verificadas pelo instalador NSIS do Tauri.
  StrCpy $1 ""
  ${If} ${RunningX64}
    ReadRegStr $1 HKLM "SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" "pv"
  ${Else}
    ReadRegStr $1 HKLM "SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" "pv"
  ${EndIf}
  ${If} $1 == ""
    ReadRegStr $1 HKCU "SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" "pv"
  ${EndIf}
  ${If} $1 == ""
    ${NSD_CreateLabel} 10u 57u 100% 28u "Nao detectado. O assistente instalara o WebView2 usando o instalador oficial incluido. Internet sera necessaria."
  ${Else}
    ${NSD_CreateLabel} 10u 57u 100% 24u "Ja instalado (versao $1). Nenhum download do WebView2 sera necessario."
  ${EndIf}
  Pop $0

  ${NSD_CreateLabel} 0u 104u 100% 38u "Proximas etapas: boas-vindas, pasta de destino, atalhos, copia dos arquivos e conclusao. Sua biblioteca musical e seus backups nao serao substituidos."
  Pop $0
  nsDialogs::Show
FunctionEnd

Function BZtunePrereqLeave
  ; O Tauri faz a verificacao definitiva do WebView2 ao instalar.
FunctionEnd

!macro NSIS_HOOK_PREINSTALL
  DetailPrint "BZtune: preparando os componentes integrados..."
  DetailPrint "Python/Flask, backend.exe, FFmpeg e FFprobe incluidos no instalador."
!macroend

!macro NSIS_HOOK_POSTINSTALL
  DetailPrint "BZtune: verificando os arquivos instalados..."
  IfFileExists "$INSTDIR\bztune-backend.exe" +3 0
    MessageBox MB_ICONSTOP "O backend BZtune nao foi instalado corretamente. Reinstale o programa."
    Abort
  IfFileExists "$INSTDIR\bin\ffmpeg.exe" +3 0
    MessageBox MB_ICONSTOP "O FFmpeg nao foi instalado corretamente. Reinstale o programa."
    Abort
  IfFileExists "$INSTDIR\bin\ffprobe.exe" +3 0
    MessageBox MB_ICONSTOP "O FFprobe nao foi instalado corretamente. Reinstale o programa."
    Abort
  DetailPrint "BZtune: backend e ferramentas de audio verificados."
!macroend
