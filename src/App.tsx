import { useEffect } from "react";
import { AppShell } from "./components/layout/AppShell";
import { useSettings } from "./store/settings";
import { TelemetryProvider } from "./store/telemetry";

export default function App() {
  const load = useSettings((s) => s.load);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <TelemetryProvider>
      <AppShell />
    </TelemetryProvider>
  );
}
