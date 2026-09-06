import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { ClientResponseError } from "pocketbase";
import { AlertTriangle, ChevronLeft, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserAvatar } from "@/components/UserAvatar";
import {
  getLoginDirectory,
  loginDirectoryAvatarUrl,
  loginWithPassword,
  type LoginDirectoryEntry,
} from "@/data/auth.repo";
import { consumeSessionMessage } from "@/data/staleSession";

/**
 * Real login screen (§14, §16.6, CU1) — Gap-fill fix (found post-Phase-5,
 * not covered by any original SDD §35 phase task): the Phase 0 placeholder
 * ("Selección de usuario — próximamente") was never replaced by any later
 * phase. §14: user picker + password, no manual phone entry — `phone` is
 * the PocketBase identity field under the hood but the visitor never types
 * it. §16.6's accessibility rule (min 44×44px tap targets) is already
 * satisfied by `Button`'s default size (§ see `button.tsx`'s own docblock).
 *
 * Deliberately generic "credenciales incorrectas" message on any login
 * failure (§ standard practice) — never reveals whether the *user* or the
 * *password* was wrong.
 */
export function LoginScreen() {
  const navigate = useNavigate();

  const [directory, setDirectory] = useState<LoginDirectoryEntry[] | null>(
    null,
  );
  const [directoryError, setDirectoryError] = useState(false);
  const [selectedUser, setSelectedUser] = useState<LoginDirectoryEntry | null>(
    null,
  );
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // §14 gap-fill: a stale/rotated session redirects here via
  // `handleIfStaleSession` (staleSession.ts) — read once on mount so a
  // visitor who just got redirected understands why, instead of silently
  // landing back on the picker with no explanation.
  const [sessionExpiredMessage] = useState(() => consumeSessionMessage());

  useEffect(() => {
    let cancelled = false;

    getLoginDirectory()
      .then((entries) => {
        if (cancelled) {
          return;
        }
        // Defensive: a browser-level HTTP cache/StrictMode-duplicate-fetch
        // race can resolve this with a non-array value (see auth.repo.ts's
        // getLoginDirectory docblock) — treat that as a load failure instead
        // of crashing on `.map()`.
        if (Array.isArray(entries)) {
          setDirectory(entries);
        } else {
          setDirectoryError(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDirectoryError(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  function handleSelectUser(entry: LoginDirectoryEntry) {
    setSelectedUser(entry);
    setPassword("");
    setShowPassword(false);
    setLoginError(null);
  }

  function handleBackToPicker() {
    setSelectedUser(null);
    setPassword("");
    setShowPassword(false);
    setLoginError(null);
  }

  async function handleSubmit() {
    if (!selectedUser) {
      return;
    }

    setLoginError(null);
    setIsSubmitting(true);

    try {
      await loginWithPassword(selectedUser.phone, password);
      navigate("/dashboard");
    } catch (error) {
      if (error instanceof ClientResponseError && error.status === 429) {
        setLoginError(
          "Demasiados intentos. Espera un momento e intenta de nuevo.",
        );
      } else {
        // Deliberately generic — never leaks wrong-user vs wrong-password.
        setLoginError("Credenciales incorrectas.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6 text-center">
      <img src="/logo.png" alt="Insumos O2" className="size-20" />
      <h1 className="text-xl font-semibold">Insumos O2</h1>

      {sessionExpiredMessage && (
        <p className="text-destructive text-sm">{sessionExpiredMessage}</p>
      )}

      {directoryError && (
        <p className="text-destructive text-sm">
          No se pudo cargar la lista de usuarios. Intenta de nuevo.
        </p>
      )}

      {!directoryError && directory === null && (
        <p className="text-sm text-muted-foreground">Cargando usuarios…</p>
      )}

      {!directoryError && directory !== null && !selectedUser && (
        <div className="grid w-full max-w-sm grid-cols-3 gap-3">
          {directory.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => handleSelectUser(entry)}
              className="border-input hover:bg-accent flex flex-col items-center gap-2 rounded-xl border p-3"
            >
              <UserAvatar
                name={entry.name}
                avatarUrl={loginDirectoryAvatarUrl(entry)}
                shape="square"
                size={96}
              />
              <span className="text-sm font-medium">{entry.name}</span>
            </button>
          ))}
        </div>
      )}

      {selectedUser && (
        <form
          className="flex w-full max-w-sm flex-col gap-4 text-left"
          onSubmit={(event) => {
            event.preventDefault();
            void handleSubmit();
          }}
        >
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Elegir otro usuario"
              onClick={handleBackToPicker}
              disabled={isSubmitting}
            >
              <ChevronLeft aria-hidden="true" />
            </Button>
            <h2 className="text-lg font-semibold text-foreground">
              Hola, {selectedUser.name}
            </h2>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="login-password">Contraseña</Label>
            <div className="relative">
              <Input
                id="login-password"
                type={showPassword ? "text" : "password"}
                autoFocus
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="pr-10"
              />
              <button
                type="button"
                aria-label={
                  showPassword ? "Ocultar contraseña" : "Mostrar contraseña"
                }
                onClick={() => setShowPassword((value) => !value)}
                className="text-muted-foreground absolute inset-y-0 right-0 flex w-10 items-center justify-center"
              >
                {showPassword ? (
                  <EyeOff aria-hidden="true" className="size-5" />
                ) : (
                  <Eye aria-hidden="true" className="size-5" />
                )}
              </button>
            </div>
          </div>

          {loginError && (
            <div className="flex items-start gap-2 rounded-lg bg-red-100 p-3 text-sm">
              <AlertTriangle
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0 text-red-600"
              />
              <p className="text-red-600">{loginError}</p>
            </div>
          )}

          <Button type="submit" size="lg" disabled={isSubmitting}>
            Entrar
          </Button>
        </form>
      )}
    </div>
  );
}
