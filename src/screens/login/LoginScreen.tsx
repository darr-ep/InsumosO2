import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { ClientResponseError } from "pocketbase";
import { AlertTriangle, Check, ChevronLeft, Eye, EyeOff } from "lucide-react";
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
  // design-fidelity post-audit bugfix batch #3 (pencil ground truth: "Login ·
  // Usuarios" screenshot) — the avatar picker has its own selection state,
  // separate from `selectedUser`: tapping an avatar only stages/highlights
  // it (checkmark badge), advancing to the password step requires an
  // explicit "Continuar" tap. `stagedUser` deliberately survives a
  // "Cambiar" back-navigation so the picker re-opens with the same avatar
  // still highlighted.
  const [stagedUser, setStagedUser] = useState<LoginDirectoryEntry | null>(
    null,
  );
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

  function handlePickUser(entry: LoginDirectoryEntry) {
    setStagedUser(entry);
  }

  function handleConfirmUser() {
    if (!stagedUser) {
      return;
    }
    setSelectedUser(stagedUser);
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
        setLoginError("Contraseña incorrecta, inténtalo de nuevo.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col p-6">
      <div className="flex shrink-0 flex-col items-center gap-6 text-center">
        <img
          src="/logo.png"
          alt="Insumos O2"
          className="h-14 w-auto max-w-[220px] object-contain"
        />
        <h1 className="sr-only">Insumos O2</h1>

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
      </div>

      {!directoryError && directory !== null && !selectedUser && (
        // `overflow-y-auto` here (not on the outer container) is the fix:
        // with hundreds of seeded accounts the grid alone can exceed the
        // viewport — it now scrolls in its own region while the header
        // above and the Continuar button below stay put, instead of
        // pushing the button down past the fold.
        <div className="flex min-h-0 flex-1 flex-col gap-4">
          {/* No card background here — the gray/bordered elevation belongs
              to the fixed action bar below, not this scrollable content
              region (design-fidelity fix: was misapplied to the whole
              picker instead of just the button's bar). */}
          <div className="mx-auto flex min-h-0 w-full max-w-sm flex-1 flex-col items-center gap-6 overflow-y-auto p-4 pb-28 text-center">
            <div className="flex flex-col items-center gap-1">
              <h2 className="text-xl font-bold text-foreground">
                ¿Quién eres?
              </h2>
              <p className="text-sm text-muted-foreground">
                Selecciona tu usuario para continuar
              </p>
            </div>

            <div className="grid w-full max-w-sm grid-cols-2 gap-4">
              {directory.map((entry) => {
              const isStaged = stagedUser?.id === entry.id;
              return (
                <button
                  key={entry.id}
                  type="button"
                  aria-pressed={isStaged}
                  onClick={() => handlePickUser(entry)}
                  className={`bg-card bg-white flex flex-col items-center gap-3 rounded-2xl border-2 p-4 transition-all ${
                    isStaged ? "border-primary shadow-xs" : "border-slate-200/60"
                  }`}
                >
                  <div className="relative">
                    <UserAvatar
                      name={entry.name}
                      avatarUrl={loginDirectoryAvatarUrl(entry)}
                      shape="square"
                      size={108}
                    />
                    {isStaged && (
                      <span
                        aria-hidden="true"
                        className="bg-primary text-primary-foreground absolute -top-2 -right-2 flex size-6 items-center justify-center rounded-full shadow-xs"
                      >
                        <Check className="size-3.5" />
                      </span>
                    )}
                  </div>
                  <span className="text-sm font-semibold text-slate-800">{entry.name}</span>
                </button>
              );
              })}
            </div>
          </div>

          <div className="fixed bottom-0 left-0 right-0 z-30 flex justify-center border-t border-slate-200 bg-slate-50 p-6 shadow-xs">
            <Button
              type="button"
              size="lg"
              className="w-full max-w-sm shrink-0"
              disabled={!stagedUser}
              onClick={handleConfirmUser}
            >
              Continuar
            </Button>
          </div>
        </div>
      )}

      {selectedUser && (
        <form
          className="mx-auto flex min-h-0 w-full max-w-sm flex-1 flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void handleSubmit();
          }}
        >
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 pb-28 text-left">
            <button
              type="button"
              onClick={handleBackToPicker}
              disabled={isSubmitting}
              className="text-muted-foreground flex items-center gap-1 self-start text-sm font-medium disabled:opacity-50"
            >
              <ChevronLeft aria-hidden="true" className="size-4" />
              Cambiar
            </button>

            <div className="flex flex-col items-center gap-3 text-center">
              <div className="rounded-full border-2 border-slate-200 bg-white p-0.5 overflow-hidden">
                <UserAvatar
                  name={selectedUser.name}
                  avatarUrl={loginDirectoryAvatarUrl(selectedUser)}
                  shape="circle"
                  size={88}
                />
              </div>
              <div className="flex flex-col items-center gap-1">
                <h2 className="text-lg font-semibold text-foreground">
                  Hola, {selectedUser.name}
                </h2>
                <p className="text-sm text-muted-foreground">
                  Ingresa tu contraseña para entrar
                </p>
              </div>
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
          </div>

          <div className="fixed bottom-0 left-0 right-0 z-30 flex justify-center border-t border-slate-200 bg-slate-50 p-6 shadow-xs">
            <Button
              type="submit"
              size="lg"
              disabled={isSubmitting}
              className="w-full max-w-sm shrink-0"
            >
              {isSubmitting ? "Iniciando sesión..." : "Entrar"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
