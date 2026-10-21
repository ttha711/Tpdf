import type { ReactNode } from "react";
import { AppShell, type AppShellProps } from "./AppShell.js";
import { DesktopShell, type DesktopShellProps } from "./DesktopShell.js";
import type { ShellLayout } from "./useContainerLayout.js";
export function ResponsivePdfShell(p:AppShellProps &
  Omit<DesktopShellProps, keyof AppShellProps|"layout"> & {layout:ShellLayout}) {
  if(p.layout==="mobile")return <AppShell {...p}/>;
  return <DesktopShell {...p} layout={p.layout}/>;
}
