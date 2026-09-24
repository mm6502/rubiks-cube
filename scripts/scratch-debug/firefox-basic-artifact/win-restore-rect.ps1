# Restores the Firefox window and reports its REAL screen rectangle.
#
# WebDriver:GetWindowRect and outerWidth both returned x=-18133 y=-18133 156x26,
# and Windows confirmed why: IsIconic() was true. A minimized window has no
# meaningful rectangle, so its position cannot be recorded while iconic. The
# artifact is position-dependent, so this restores the window first, then measures.
#
# Coordinates are PHYSICAL device pixels. The page's CSS pixels are these divided
# by the display scale (measured in-page as devicePixelRatio, 1.7647 here).
#
# Usage: powershell -File win-restore-rect.ps1

Add-Type @'
using System;
using System.Collections.Generic;
using System.Text;
using System.Runtime.InteropServices;

public class WF {
  public struct RECT { public int Left, Top, Right, Bottom; }
  public delegate bool EnumProc(IntPtr h, IntPtr l);

  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr l);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsZoomed(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr h);
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);

  // All top-level windows owned by any of the given PIDs.
  public static List<IntPtr> Owned(uint[] pids) {
    var found = new List<IntPtr>();
    EnumWindows(delegate(IntPtr h, IntPtr l) {
      uint pid;
      GetWindowThreadProcessId(h, out pid);
      for (int i = 0; i < pids.Length; i++) {
        if (pids[i] == pid) { found.Add(h); break; }
      }
      return true;
    }, IntPtr.Zero);
    return found;
  }

  public static string Title(IntPtr h) {
    int n = GetWindowTextLength(h);
    if (n <= 0) return "";
    var sb = new StringBuilder(n + 2);
    GetWindowText(h, sb, sb.Capacity);
    return sb.ToString();
  }
}
'@

$pids = (Get-Process -Name firefox -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id)
if (-not $pids) { Write-Output 'no firefox processes'; exit 1 }

$handles = [WF]::Owned([uint32[]]$pids)
Write-Output "firefox top-level windows found: $($handles.Count)"
Write-Output ''

foreach ($h in $handles) {
  $title = [WF]::Title($h)
  if ($title.Length -eq 0) { continue }

  $wasIconic = [WF]::IsIconic($h)
  if ($wasIconic) {
    [void][WF]::ShowWindow($h, 9)   # SW_RESTORE
    Start-Sleep -Milliseconds 800
  }

  $r = New-Object WF+RECT
  [void][WF]::GetWindowRect($h, [ref]$r)
  $pid2 = 0
  [void][WF]::GetWindowThreadProcessId($h, [ref]$pid2)

  Write-Output "title      : $title"
  Write-Output "hwnd       : $h   pid: $pid2"
  Write-Output "wasIconic  : $wasIconic   visible: $([WF]::IsWindowVisible($h))"
  Write-Output "physical px: left=$($r.Left) top=$($r.Top) right=$($r.Right) bottom=$($r.Bottom)"
  Write-Output "size       : $($r.Right - $r.Left)x$($r.Bottom - $r.Top)"
  Write-Output "nowIconic  : $([WF]::IsIconic($h))   maximized: $([WF]::IsZoomed($h))"
  Write-Output ''
}

Add-Type -AssemblyName System.Windows.Forms
foreach ($s in [System.Windows.Forms.Screen]::AllScreens) {
  Write-Output ("screen {0} primary={1} bounds={2},{3} {4}x{5}" -f `
    $s.DeviceName, $s.Primary, $s.Bounds.X, $s.Bounds.Y, $s.Bounds.Width, $s.Bounds.Height)
}
