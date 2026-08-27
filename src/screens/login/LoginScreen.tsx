import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { ClientResponseError } from "pocketbase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  getLoginDirectory,
  loginWithPassword,
  type LoginDirectoryEntry,
} from "@/data/auth.repo";

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
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    getLoginDirectory()
      .then((entries) => {
        if (!cancelled) {
          setDirectory(entries);
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
    setLoginError(null);
  }

  function handleBackToPicker() {
    setSelectedUser(null);
    setPassword("");
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

      {directoryError && (
        <p className="text-destructive text-sm">
          No se pudo cargar la lista de usuarios. Intenta de nuevo.
        </p>
      )}

      {!directoryError && directory === null && (
        <p className="text-sm text-muted-foreground">Cargando usuarios…</p>
      )}

      {!directoryError && directory !== null && !selectedUser && (
        <div className="grid w-full max-w-sm grid-cols-2 gap-3">
          {directory.map((entry) => (
            <Button
              key={entry.id}
              type="button"
              variant="outline"
              size="lg"
              onClick={() => handleSelectUser(entry)}
            >
              {entry.name}
            </Button>
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
          <p className="text-center text-sm text-muted-foreground">
            Hola, <span className="font-semibold">{selectedUser.name}</span>
          </p>

          <div className="flex flex-col gap-2">
            <Label htmlFor="login-password">Contraseña</Label>
            <Input
              id="login-password"
              type="password"
              autoFocus
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>

          {loginError && (
            <p className="text-destructive text-sm">{loginError}</p>
          )}

          <Button type="submit" size="lg" disabled={isSubmitting}>
            Entrar
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={handleBackToPicker}
            disabled={isSubmitting}
          >
            Elegir otro usuario
          </Button>
        </form>
      )}
    </div>
  );
}
