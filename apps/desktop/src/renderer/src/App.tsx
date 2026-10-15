import { APP_NAME } from "@newcord/shared";

function App(): React.JSX.Element {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-2 bg-zinc-950 text-zinc-100">
      <h1 className="text-4xl font-semibold tracking-tight">{APP_NAME}</h1>
      <p className="text-sm text-zinc-400">Secure desktop shell</p>
    </main>
  );
}

export default App;
